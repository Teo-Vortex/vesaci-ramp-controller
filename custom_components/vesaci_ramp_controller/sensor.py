"""Sensors for Vesaci Ramp Controller."""

from homeassistant.components.sensor import SensorEntity

from .const import DOMAIN
from .entity import RampEntity


async def async_setup_entry(hass, entry, async_add_entities):
    controller = hass.data[DOMAIN][entry.entry_id]["controller"]
    async_add_entities([
        RampStatusSensor(controller),
        RampProgressSensor(controller),
        RampTargetSensor(controller),
        RampRemainingSensor(controller),
    ])


class RampStatusSensor(RampEntity, SensorEntity):
    _attr_name = "Status"
    _attr_icon = "mdi:slope-uphill"

    def __init__(self, controller):
        super().__init__(controller, "status")

    @property
    def native_value(self):
        return self.controller.state.status

    @property
    def extra_state_attributes(self):
        return {
            "controller_id": self.controller.entry.entry_id,
            "profile": self.controller.state.profile_id,
            "selected_profile": self.controller.selected_profile,
            "target_entity": self.controller.target_entity,
            "profiles": self.controller.profiles,
            "error": self.controller.state.error,
        }


class RampProgressSensor(RampEntity, SensorEntity):
    _attr_name = "Progress"
    _attr_native_unit_of_measurement = "%"
    _attr_icon = "mdi:progress-clock"

    def __init__(self, controller):
        super().__init__(controller, "progress")

    @property
    def native_value(self):
        return round(self.controller.state.progress * 100, 1)


class RampTargetSensor(RampEntity, SensorEntity):
    _attr_name = "Target"
    _attr_icon = "mdi:target"

    def __init__(self, controller):
        super().__init__(controller, "target")

    @property
    def native_value(self):
        return self.controller.state.target_value


class RampRemainingSensor(RampEntity, SensorEntity):
    _attr_name = "Remaining"
    _attr_native_unit_of_measurement = "s"
    _attr_icon = "mdi:timer-sand"

    def __init__(self, controller):
        super().__init__(controller, "remaining")

    @property
    def native_value(self):
        return round(self.controller.state.remaining, 1)
