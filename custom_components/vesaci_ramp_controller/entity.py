"""Base entity for Vesaci Ramp Controller."""

from homeassistant.helpers.entity import DeviceInfo, Entity

from .const import DOMAIN


class RampEntity(Entity):
    _attr_has_entity_name = True

    def __init__(self, controller, key: str) -> None:
        self.controller = controller
        self._attr_unique_id = f"{controller.entry.entry_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, controller.entry.entry_id)},
            name=controller.entry.title,
            manufacturer="Vesaci",
            model="Ramp Controller",
        )

    async def async_added_to_hass(self):
        self.controller.entry.async_on_unload(self._remove_listener())

    def _remove_listener(self):
        listeners = self.hass.data[DOMAIN][self.controller.entry.entry_id]["listeners"]
        listeners.add(self.async_write_ha_state)

        def remove():
            listeners.discard(self.async_write_ha_state)

        return remove
