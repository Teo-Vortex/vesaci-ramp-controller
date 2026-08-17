"""Vesaci Ramp Controller integration."""

from __future__ import annotations

import json
from pathlib import Path
import voluptuous as vol

from homeassistant.components.http import StaticPathConfig
from homeassistant.components import panel_custom
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .config_flow import _validate_profiles
from .const import CONF_PROFILES, DOMAIN, PLATFORMS
from .engine import RampController


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    if not hass.services.has_service(DOMAIN, "start_profile"):
        _register_services(hass)
    frontend = Path(__file__).parent / "frontend" / "vesaci-ramp-controller-card.js"
    await hass.http.async_register_static_paths(
        [StaticPathConfig("/vesaci_ramp_controller/card.js", str(frontend), False)]
    )
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="vesaci-ramp-controller-panel",
        frontend_url_path="vesaci-ramp-controller",
        module_url="/vesaci_ramp_controller/card.js",
        sidebar_title="Ramp Controller",
        sidebar_icon="mdi:slope-uphill",
        config={},
        require_admin=False,
    )
    return True


async def async_setup_entry(hass, entry) -> bool:
    listeners = set()

    def notify():
        for listener in list(listeners):
            listener()

    controller = RampController(hass, entry, notify)
    hass.data[DOMAIN][entry.entry_id] = {"controller": controller, "listeners": listeners}
    controller.setup_schedules()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload_entry))
    return True


async def async_unload_entry(hass, entry) -> bool:
    controller = hass.data[DOMAIN][entry.entry_id]["controller"]
    await controller.async_shutdown()
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unloaded


async def _async_reload_entry(hass, entry):
    await hass.config_entries.async_reload(entry.entry_id)


def _controller(hass, controller_id):
    if controller_id in hass.data[DOMAIN]:
        return hass.data[DOMAIN][controller_id]["controller"]
    matches = [
        item["controller"] for item in hass.data[DOMAIN].values()
        if item["controller"].entry.title == controller_id
    ]
    if len(matches) == 1:
        return matches[0]
    raise ValueError(f"Controller not found or ambiguous: {controller_id}")


def _register_services(hass):
    async def start_profile(call: ServiceCall):
        await _controller(hass, call.data["controller_id"]).async_start_profile(
            call.data["profile"], call.data.get("direction")
        )

    async def select_profile(call: ServiceCall):
        controller = _controller(hass, call.data["controller_id"])
        controller.profile(call.data["profile"])
        controller.selected_profile = call.data["profile"]
        controller.on_change()

    async def start(call: ServiceCall):
        await _controller(hass, call.data["controller_id"]).async_start_custom(
            call.data["target"], call.data["duration"], call.data.get("curve", "linear"),
            call.data.get("steps", 20), call.data.get("direction", "auto")
        )

    async def simple(call: ServiceCall):
        await getattr(_controller(hass, call.data["controller_id"]), f"async_{call.service}")()

    async def save_profile(call: ServiceCall):
        controller = _controller(hass, call.data["controller_id"])
        profile = json.loads(call.data["profile"]) if isinstance(call.data["profile"], str) else call.data["profile"]
        profiles = [dict(item) for item in controller.profiles]
        replaced = False
        for index, current in enumerate(profiles):
            if current["id"] == profile["id"]:
                profiles[index] = profile
                replaced = True
                break
        if not replaced:
            profiles.append(profile)
        _validate_profiles(profiles)
        options = dict(controller.entry.options)
        options[CONF_PROFILES] = profiles
        hass.config_entries.async_update_entry(controller.entry, options=options)

    common = vol.Schema({vol.Required("controller_id"): cv.string})
    hass.services.async_register(DOMAIN, "start_profile", start_profile, schema=vol.Schema({
        vol.Required("controller_id"): cv.string,
        vol.Required("profile"): cv.string,
        vol.Optional("direction"): vol.In(["up", "down"]),
    }))
    hass.services.async_register(DOMAIN, "select_profile", select_profile, schema=vol.Schema({
        vol.Required("controller_id"): cv.string,
        vol.Required("profile"): cv.string,
    }))
    hass.services.async_register(DOMAIN, "start", start, schema=vol.Schema({
        vol.Required("controller_id"): cv.string,
        vol.Required("target"): vol.Coerce(float),
        vol.Required("duration"): vol.All(vol.Coerce(float), vol.Range(min=0.1)),
        vol.Optional("direction", default="auto"): vol.In(["auto", "up", "down"]),
        vol.Optional("curve", default="linear"): vol.In(["linear", "ease_in", "ease_out", "s_curve", "step", "custom"]),
        vol.Optional("steps", default=20): vol.All(vol.Coerce(int), vol.Range(min=1, max=10000)),
    }))
    for service in ("pause", "resume", "stop"):
        hass.services.async_register(DOMAIN, service, simple, schema=common)
    hass.services.async_register(DOMAIN, "save_profile", save_profile, schema=vol.Schema({
        vol.Required("controller_id"): cv.string, vol.Required("profile"): vol.Any(str, dict)
    }))
