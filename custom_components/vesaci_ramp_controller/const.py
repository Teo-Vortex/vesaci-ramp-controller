"""Constants for Vesaci Ramp Controller."""

DOMAIN = "vesaci_ramp_controller"
PLATFORMS = ["sensor", "select", "button"]

CONF_TARGET_ENTITY = "target_entity"
CONF_PROFILES = "profiles"
CONF_INTERRUPTION_MODE = "interruption_mode"

DEFAULT_PROFILES = [
    {
        "id": "default",
        "name": "Default",
        "direction": "auto",
        "target": 100.0,
        "duration": 60.0,
        "curve": "linear",
        "step_mode": "count",
        "steps": 20,
        "interval": 5.0,
        "points": [[0.0, 0.0], [1.0, 1.0]],
    }
]

CURVES = ("linear", "ease_in", "ease_out", "s_curve", "step", "custom")
INTERRUPTION_MODES = ("restart", "queue", "ignore")
