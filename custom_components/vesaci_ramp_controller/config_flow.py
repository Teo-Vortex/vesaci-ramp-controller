"""Config flow for Vesaci Ramp Controller."""

from __future__ import annotations

import json
import re
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers import selector

from .const import CONF_INTERRUPTION_MODE, CONF_PROFILES, CONF_TARGET_ENTITY, DEFAULT_PROFILES, DOMAIN


class VesaciRampConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            await self.async_set_unique_id(user_input[CONF_TARGET_ENTITY])
            self._abort_if_unique_id_configured()
            state = self.hass.states.get(user_input[CONF_TARGET_ENTITY])
            friendly_name = state.attributes.get("friendly_name") if state else None
            return self.async_create_entry(
                title=f"{friendly_name or user_input[CONF_TARGET_ENTITY]} Ramp",
                data={
                    CONF_TARGET_ENTITY: user_input[CONF_TARGET_ENTITY],
                    CONF_PROFILES: DEFAULT_PROFILES,
                },
            )
        schema = vol.Schema(
            {
                vol.Required(CONF_TARGET_ENTITY): selector.EntitySelector(
                    selector.EntitySelectorConfig(domain=["number", "input_number"])
                ),
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    def async_get_options_flow(config_entry):
        return VesaciRampOptionsFlow(config_entry)


class VesaciRampOptionsFlow(config_entries.OptionsFlow):
    def __init__(self, config_entry):
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        errors = {}
        profiles = self.config_entry.options.get(
            CONF_PROFILES, self.config_entry.data.get(CONF_PROFILES, DEFAULT_PROFILES)
        )
        if user_input is not None:
            try:
                parsed = json.loads(user_input["profiles_json"])
                _validate_profiles(parsed)
            except (ValueError, TypeError, json.JSONDecodeError):
                errors["base"] = "invalid_profiles"
            else:
                return self.async_create_entry(
                    title="",
                    data={
                        CONF_PROFILES: parsed,
                        CONF_INTERRUPTION_MODE: user_input[CONF_INTERRUPTION_MODE],
                    },
                )
        schema = vol.Schema(
            {
                vol.Required(
                    "profiles_json", default=json.dumps(profiles, indent=2)
                ): selector.TextSelector(
                    selector.TextSelectorConfig(multiline=True, type=selector.TextSelectorType.TEXT)
                ),
                vol.Required(
                    CONF_INTERRUPTION_MODE,
                    default=self.config_entry.options.get(CONF_INTERRUPTION_MODE, "restart"),
                ): selector.SelectSelector(
                    selector.SelectSelectorConfig(options=["restart", "queue", "ignore"])
                ),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)


def _validate_profiles(profiles):
    if not isinstance(profiles, list) or not profiles:
        raise ValueError
    ids = set()
    for profile in profiles:
        if not isinstance(profile, dict):
            raise ValueError
        for key in ("id", "name", "target", "duration", "curve"):
            if key not in profile:
                raise ValueError
        if not re.fullmatch(r"[a-z0-9_]+", profile["id"]) or profile["id"] in ids:
            raise ValueError
        ids.add(profile["id"])
        if float(profile["duration"]) <= 0:
            raise ValueError
