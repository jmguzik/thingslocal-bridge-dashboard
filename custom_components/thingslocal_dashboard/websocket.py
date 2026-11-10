"""Read-only, permission-filtered metadata for the companion UI."""
import voluptuous as vol
from homeassistant.auth.permissions.const import POLICY_CONTROL, POLICY_READ
from homeassistant.components import websocket_api
from homeassistant.core import callback
from homeassistant.helpers import area_registry as ar, device_registry as dr, entity_registry as er
from .const import DOMAIN, VERSION
from .discovery import discover


@websocket_api.websocket_command({vol.Required("type"): "thingslocal_dashboard/metadata"})
@callback
def metadata(hass, connection, message):
    if not hass.data.get(DOMAIN + "_active"):
        connection.send_error(message["id"], "not_loaded", "Add the ThingsLocal Dashboard integration first")
        return
    entities = [{key: getattr(entry, key, None) for key in (
        "entity_id", "unique_id", "platform", "device_id", "area_id", "name", "original_name",
        "disabled_by", "hidden_by", "entity_category",
    )} for entry in er.async_get(hass).entities.values()]
    devices = {device.id: {key: getattr(device, key, None) for key in (
        "id", "name", "name_by_user", "model", "area_id", "identifiers", "disabled_by",
    )} for device in dr.async_get(hass).devices.values()}
    areas = {area.id: area.name for area in ar.async_get(hass).areas.values()}
    devices = discover(entities, devices, areas,
        lambda identifier: connection.user.permissions.check_entity(identifier, POLICY_READ),
        lambda identifier: connection.user.permissions.check_entity(identifier, POLICY_CONTROL))
    connection.send_result(message["id"], {"version": VERSION, "devices": devices})


@callback
def async_register(hass):
    if not hass.data.get(DOMAIN + "_websocket"):
        websocket_api.async_register_command(hass, metadata)
        hass.data[DOMAIN + "_websocket"] = True
