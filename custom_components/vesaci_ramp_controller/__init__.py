"""Vesaci Ramp Controller integration."""

from __future__ import annotations

import json
import logging
from pathlib import Path
import voluptuous as vol

from homeassistant.components.http import StaticPathConfig
from homeassistant.components import frontend, panel_custom
from homeassistant.components.lovelace.const import MODE_STORAGE
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .config_flow import _validate_profiles
from .const import (
    CONF_DAILY_PLAN,
    CONF_PROFILES,
    CONF_QUICK_ACTIONS,
    CONF_SELECTED_PROFILE,
    DOMAIN,
    PLATFORMS,
)
from .engine import RampController

FRONTEND_VERSION = "0.7.0"
FRONTEND_PATH = "/vesaci_ramp_controller/card.js"
_LOGGER = logging.getLogger(__name__)


async def _async_register_lovelace_resource(hass: HomeAssistant, url: str) -> None:
    """Create or update the dashboard module resource in storage mode."""
    lovelace_data = hass.data.get("lovelace")
    if lovelace_data is None:
        _LOGGER.warning("Lovelace is unavailable; dashboard cards were not registered")
        return

    resource_mode = getattr(lovelace_data, "resource_mode", None)
    resources = getattr(lovelace_data, "resources", None)
    if isinstance(lovelace_data, dict):
        resource_mode = lovelace_data.get("resource_mode", lovelace_data.get("mode"))
        resources = lovelace_data.get("resources")

    if resource_mode != MODE_STORAGE or resources is None:
        _LOGGER.warning(
            "Lovelace resources use YAML mode; add %s as a module resource", url
        )
        frontend.add_extra_js_url(hass, url)
        return

    # async_get_info() safely triggers the lazy storage load on both old and
    # new Home Assistant releases. Never create an item before this completes.
    await resources.async_get_info()
    base_url = f"{FRONTEND_PATH}?"
    existing = next(
        (
            item
            for item in resources.async_items()
            if item.get("url") == FRONTEND_PATH
            or str(item.get("url", "")).startswith(base_url)
        ),
        None,
    )
    if existing is None:
        await resources.async_create_item({"url": url, "res_type": "module"})
    elif existing.get("url") != url or existing.get("type") != "module":
        await resources.async_update_item(
            existing["id"], {"url": url, "res_type": "module"}
        )


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    if not hass.services.has_service(DOMAIN, "start_profile"):
        _register_services(hass)
    frontend_file = Path(__file__).parent / "frontend" / "vesaci-ramp-controller-card.js"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(FRONTEND_PATH, str(frontend_file), False)]
    )
    frontend_url = f"{FRONTEND_PATH}?v={FRONTEND_VERSION}"
    await _async_register_lovelace_resource(hass, frontend_url)
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="vesaci-ramp-controller-panel",
        frontend_url_path="vesaci-ramp-controller",
        module_url=frontend_url,
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
            call.data["profile"],
            call.data.get("direction"),
            source=call.data.get("source", "automation"),
            priority=80 if call.data.get("source") == "manual" else 60,
        )

    async def select_profile(call: ServiceCall):
        controller = _controller(hass, call.data["controller_id"])
        controller.profile(call.data["profile"])
        controller.selected_profile = call.data["profile"]
        controller.on_change()
        options = dict(controller.entry.options)
        options[CONF_SELECTED_PROFILE] = call.data["profile"]
        hass.config_entries.async_update_entry(controller.entry, options=options)

    async def start(call: ServiceCall):
        await _controller(hass, call.data["controller_id"]).async_start_custom(
            call.data["target"], call.data["duration"], call.data.get("curve", "linear"),
            call.data.get("steps", 20), call.data.get("direction", "auto")
        )

    async def execute_quick(call: ServiceCall):
        await _controller(hass, call.data["controller_id"]).async_execute_quick(
            call.data["action_id"]
        )

    async def start_quick(call: ServiceCall):
        await _controller(hass, call.data["controller_id"]).async_start_custom(
            float(call.data["target"]),
            float(call.data["minutes"]) * 60,
            "s_curve",
            20,
            "auto",
            source="quick_action",
            priority=70,
            action_id="quick_custom",
        )

    async def save_quick_actions(call: ServiceCall):
        controller = _controller(hass, call.data["controller_id"])
        actions = json.loads(call.data["actions"]) if isinstance(call.data["actions"], str) else call.data["actions"]
        _validate_quick_actions(actions)
        options = dict(controller.entry.options)
        options[CONF_QUICK_ACTIONS] = actions
        hass.config_entries.async_update_entry(controller.entry, options=options)

    async def save_daily_plan(call: ServiceCall):
        controller = _controller(hass, call.data["controller_id"])
        plan = json.loads(call.data["plan"]) if isinstance(call.data["plan"], str) else call.data["plan"]
        _validate_daily_plan(plan)
        options = dict(controller.entry.options)
        options[CONF_DAILY_PLAN] = plan
        hass.config_entries.async_update_entry(controller.entry, options=options)

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
        options[CONF_SELECTED_PROFILE] = profile["id"]
        hass.config_entries.async_update_entry(controller.entry, options=options)

    common = vol.Schema({vol.Required("controller_id"): cv.string})
    hass.services.async_register(DOMAIN, "start_profile", start_profile, schema=vol.Schema({
        vol.Required("controller_id"): cv.string,
        vol.Required("profile"): cv.string,
        vol.Optional("direction"): vol.In(["up", "down"]),
        vol.Optional("source"): vol.In(["manual", "automation"]),
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
    hass.services.async_register(DOMAIN, "execute_quick", execute_quick, schema=vol.Schema({
        vol.Required("controller_id"): cv.string,
        vol.Required("action_id"): cv.string,
    }))
    hass.services.async_register(DOMAIN, "start_quick", start_quick, schema=vol.Schema({
        vol.Required("controller_id"): cv.string,
        vol.Required("minutes"): vol.All(vol.Coerce(float), vol.Range(min=0.1)),
        vol.Required("target"): vol.Coerce(float),
    }))
    hass.services.async_register(DOMAIN, "save_quick_actions", save_quick_actions, schema=vol.Schema({
        vol.Required("controller_id"): cv.string,
        vol.Required("actions"): vol.Any(str, list),
    }))
    hass.services.async_register(DOMAIN, "save_daily_plan", save_daily_plan, schema=vol.Schema({
        vol.Required("controller_id"): cv.string,
        vol.Required("plan"): vol.Any(str, dict),
    }))
    for service in ("pause", "resume", "stop"):
        hass.services.async_register(DOMAIN, service, simple, schema=common)
    hass.services.async_register(DOMAIN, "save_profile", save_profile, schema=vol.Schema({
        vol.Required("controller_id"): cv.string, vol.Required("profile"): vol.Any(str, dict)
    }))


def _validate_quick_actions(actions):
    if not isinstance(actions, list) or not actions:
        raise ValueError("At least one quick action is required")
    for action in actions:
        if not all(key in action for key in ("id", "name", "minutes", "target")):
            raise ValueError("Invalid quick action")
        if float(action["minutes"]) <= 0:
            raise ValueError("Quick action duration must be positive")


def _validate_daily_plan(plan):
    if not isinstance(plan, dict) or not isinstance(plan.get("points", []), list):
        raise ValueError("Invalid daily plan")
    seen_times = set()
    for point in plan.get("points", []):
        if not all(key in point for key in ("id", "time", "target")):
            raise ValueError("Invalid daily point")
        if point["time"] in seen_times:
            raise ValueError("Daily point times must be unique")
        seen_times.add(point["time"])
