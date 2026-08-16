"""Control buttons."""

from homeassistant.components.button import ButtonEntity

from .const import DOMAIN
from .entity import RampEntity


async def async_setup_entry(hass, entry, async_add_entities):
    controller = hass.data[DOMAIN][entry.entry_id]["controller"]
    async_add_entities([
        StartButton(controller), PauseButton(controller), ResumeButton(controller), StopButton(controller)
    ])


class StartButton(RampEntity, ButtonEntity):
    _attr_name = "Start"
    _attr_icon = "mdi:play"

    def __init__(self, controller): super().__init__(controller, "start")
    async def async_press(self): await self.controller.async_start_profile(self.controller.selected_profile)


class PauseButton(RampEntity, ButtonEntity):
    _attr_name = "Pause"
    _attr_icon = "mdi:pause"

    def __init__(self, controller): super().__init__(controller, "pause")
    async def async_press(self): await self.controller.async_pause()


class ResumeButton(RampEntity, ButtonEntity):
    _attr_name = "Resume"
    _attr_icon = "mdi:play-pause"

    def __init__(self, controller): super().__init__(controller, "resume")
    async def async_press(self): await self.controller.async_resume()


class StopButton(RampEntity, ButtonEntity):
    _attr_name = "Stop"
    _attr_icon = "mdi:stop"

    def __init__(self, controller): super().__init__(controller, "stop")
    async def async_press(self): await self.controller.async_stop()
