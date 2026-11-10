"""Permission-scoped registry discovery; no addresses, model guessing or writes."""
from hashlib import sha256
import re

IDENTIFIER = re.compile(r"thingslocal_[a-f0-9]{12}_[a-f0-9]{12}\Z")
DIRECT = {
    "heating": "heating", "certificate_expiry": "certificate_expiry",
    "washing_program": "program_select", "program_selection_result": "command_result",
    "dishwasher_attention": "attention", "dishwasher_alarm_codes": "messages",
    "dishwasher_cleaning_due": "cleaning_due", "dishwasher_cleaning_count": "cleaning_count",
    "dishwasher_cleaning_threshold": "cleaning_threshold", "notification_event": "notification_event",
    "notification_ack": "notification_ack",
}
MAIN = [
    ("switch", "switch", "power"),
    ("custom.cooktopOperatingState", "cooktopOperatingState", "operating_state"),
    ("samsungce.kidsLockControl", "lockState", "panel_lock"),
    ("samsungce.dishwasherOperation", "operatingState", "operating_state"),
    ("samsungce.dishwasherJobState", "dishwasherJobState", "job_state"),
    ("dishwasherOperatingState", "dishwasherJobState", "job_state"),
    ("dishwasherOperatingState", "machineState", "machine_state"),
    ("samsungce.dishwasherWashingCourse", "washingCourse", "program"),
    ("samsungce.dishwasherOperation", "progressPercentage", "progress"),
    ("dishwasherOperatingState", "progress", "progress"),
    ("samsungce.dishwasherOperation", "remainingTime", "remaining_time"),
    ("samsungce.dishwasherOperation", "remainingTimeStr", "remaining_display"),
    ("samsungce.dishwasherOperation", "operationTime", "operation_time"),
    ("samsungce.dishwasherOperation", "timeLeftToStart", "start_delay"),
    ("dishwasherOperatingState", "completionTime", "completion_time"),
    ("temperatureMeasurement", "temperature", "temperature"),
    ("relativeHumidityMeasurement", "humidity", "humidity"),
    ("battery", "battery", "battery"), ("contactSensor", "contact", "contact"),
    ("powerMeter", "power", "power_consumption"), ("energyMeter", "energy", "energy"),
]
ZONES = [
    ("samsungce.cooktopHeatingPower", "manualLevel", "zone_level"),
    ("samsungce.cooktopHeatingPower", "heatingMode", "zone_mode"),
    ("samsungce.surfaceResidualHeat", "surfaceResidualHeat", "zone_residual"),
    ("samsungce.countDownTimer", "currentValue", "zone_timer"),
]


def field_key(component, capability, attribute):
    return "f_" + sha256("/".join((component, capability, attribute)).encode()).hexdigest()[:16]


FIELDS = {field_key("main", cap, attr): (role, "main") for cap, attr, role in MAIN}
for component in ["main", "hood"] + [f"burner-{number:02}" for number in range(1, 65)]:
    for capability, attribute, role in ZONES:
        FIELDS[field_key(component, capability, attribute)] = role, component


def discover(entities, devices, areas, can_read, can_control):
    """Only aggregate a device/area after at least one entity passes access checks."""
    groups = {}
    for entry in entities:
        entity_id = entry.get("entity_id", "")
        if (entry.get("platform") != "mqtt" or entry.get("disabled_by") or entry.get("hidden_by")
                or not can_read(entity_id)): continue
        device = devices.get(entry.get("device_id"))
        if not device or device.get("disabled_by"): continue
        identifiers = [value for domain, value in device.get("identifiers", [])
                       if domain == "mqtt" and isinstance(value, str) and IDENTIFIER.fullmatch(value)]
        unique_id = entry.get("unique_id", "")
        if not isinstance(unique_id, str): continue
        matching = [identifier for identifier in identifiers if unique_id.startswith(identifier + "_")]
        if len(matching) != 1: continue
        identifier = matching[0]; suffix = unique_id[len(identifier) + 1:]
        role, component = FIELDS.get(suffix, (DIRECT.get(suffix, "generic"), "main"))
        domain = entity_id.split(".", 1)[0]
        if role == "program_select" and domain != "select": role = "generic"
        area_id = entry.get("area_id") or device.get("area_id")
        group = groups.setdefault(device["id"], {
            "id": device["id"], "name": device.get("name_by_user") or device.get("name") or "ThingsLocal",
            "model": device.get("model") or "", "area": areas.get(area_id, ""),
            "profile": "generic", "entities": [],
        })
        group["entities"].append({
            "entity_id": entity_id, "name": entry.get("name") or entry.get("original_name") or entity_id,
            "custom_name": bool(entry.get("name")),
            "role": role, "component": component, "domain": domain,
            "diagnostic": entry.get("entity_category") == "diagnostic",
            "can_control": role == "program_select" and domain == "select" and can_control(entity_id),
        })
    for group in groups.values():
        roles = {entry["role"] for entry in group["entities"]}
        if roles & {"zone_level", "heating"}: group["profile"] = "cooktop"
        elif roles & {"program", "program_select", "job_state", "cleaning_due", "cleaning_count"}: group["profile"] = "dishwasher"
        group["entities"].sort(key=lambda entry: (entry["component"], entry["role"], entry["entity_id"]))
    return sorted(groups.values(), key=lambda group: (group["area"].casefold(), group["name"].casefold(), group["id"]))
