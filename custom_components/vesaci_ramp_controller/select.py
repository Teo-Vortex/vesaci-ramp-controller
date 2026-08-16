"""Profile selector."""

from homeassistant.components.select import SelectEntity

from .const import DOMAIN
from .entity import RampEntity


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([RampProfileSelect(hass.data[DOMAIN][entry.entry_id]["controller"])])


class RampProfileSelect(RampEntity, SelectEntity):
    _attr_name = "Mode"
    _attr_icon = "mdi:format-list-bulleted"

    def __init__(self, controller):
        super().__init__(controller, "mode")

    @property
    def options(self):
        return [profile["name"] for profile in self.controller.profiles]

    @property
    def current_option(self):
        try:
            return self.controller.profile(self.controller.selected_profile)["name"]
        except (ValueError, TypeError):
            return None

    async def async_select_option(self, option: str):
        profile = next(p for p in self.controller.profiles if p["name"] == option)
        self.controller.selected_profile = profile["id"]
        self.controller.on_change()
