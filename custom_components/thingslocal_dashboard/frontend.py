"""Versioned frontend resource and a separate, non-destructive sidebar panel."""
from pathlib import Path
from urllib.parse import urlsplit
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.const import LOVELACE_DATA
from .const import CARD_PATH, CARD_URL, DASHBOARD_PATH, DOMAIN, STATIC_PATH


def is_our_resource(item):
    parsed = urlsplit(item.get("url", ""))
    return not parsed.scheme and not parsed.netloc and parsed.path == CARD_PATH


async def async_register_card(hass):
    if not hass.data.get(DOMAIN + "_static"):
        await hass.http.async_register_static_paths([
            StaticPathConfig(STATIC_PATH, str(Path(__file__).parent / "www"), False)
        ])
        hass.data[DOMAIN + "_static"] = True
    resources = hass.data[LOVELACE_DATA].resources
    await resources.async_get_info()
    existing = [item for item in resources.async_items() if is_our_resource(item)]
    if callable(getattr(resources, "async_create_item", None)):
        if existing:
            await resources.async_update_item(existing[0]["id"], {"url": CARD_URL, "res_type": "module"})
            for duplicate in existing[1:]: await resources.async_delete_item(duplicate["id"])
        else: await resources.async_create_item({"url": CARD_URL, "res_type": "module"})
    else:
        resources.data[:] = [item for item in resources.async_items() if not is_our_resource(item)]
        resources.data.append({"url": CARD_URL, "type": "module"})


async def async_register_dashboard(hass):
    from homeassistant.components import frontend
    from homeassistant.components.lovelace.dashboard import LovelaceYAML
    from homeassistant.exceptions import HomeAssistantError
    lovelace = hass.data[LOVELACE_DATA]
    if DASHBOARD_PATH in lovelace.dashboards or frontend.async_panel_exists(hass, DASHBOARD_PATH):
        raise HomeAssistantError("Dashboard path /thingslocal-dashboard is already in use")
    config = {"mode": "yaml", "title": "ThingsLocal", "icon": "mdi:devices",
        "show_in_sidebar": True, "require_admin": False,
        "filename": str(Path(__file__).parent / "dashboard.yaml")}
    dashboard = LovelaceYAML(hass, DASHBOARD_PATH, config)
    await dashboard.async_load(False)
    frontend.async_register_built_in_panel(hass, "lovelace", frontend_url_path=DASHBOARD_PATH,
        sidebar_title="ThingsLocal", sidebar_icon="mdi:devices", require_admin=False, config={"mode": "yaml"})
    lovelace.dashboards[DASHBOARD_PATH] = dashboard; lovelace.yaml_dashboards[DASHBOARD_PATH] = config
    return dashboard


def async_remove_dashboard(hass, dashboard):
    from homeassistant.components import frontend
    lovelace = hass.data[LOVELACE_DATA]
    if lovelace.dashboards.get(DASHBOARD_PATH) is dashboard:
        frontend.async_remove_panel(hass, DASHBOARD_PATH)
        lovelace.dashboards.pop(DASHBOARD_PATH, None); lovelace.yaml_dashboards.pop(DASHBOARD_PATH, None)
