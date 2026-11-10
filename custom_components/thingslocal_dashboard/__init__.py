"""Home Assistant dashboard over existing ThingsLocal Bridge entities."""
from .frontend import async_register_card, async_register_dashboard, async_remove_dashboard
from .websocket import async_register
from .const import DOMAIN


async def async_setup(hass, config):
    async_register(hass)
    return True


async def async_setup_entry(hass, entry):
    async_register(hass)
    await async_register_card(hass)
    entry.runtime_data = await async_register_dashboard(hass)
    hass.data[DOMAIN + "_active"] = True
    return True


async def async_unload_entry(hass, entry):
    async_remove_dashboard(hass, entry.runtime_data)
    hass.data[DOMAIN + "_active"] = False
    return True
