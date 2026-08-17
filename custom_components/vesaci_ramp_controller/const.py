"""Constants for Vesaci Ramp Controller."""

DOMAIN = "vesaci_ramp_controller"
PLATFORMS = ["sensor", "select", "button"]

CONF_TARGET_ENTITY = "target_entity"
CONF_PROFILES = "profiles"
CONF_INTERRUPTION_MODE = "interruption_mode"
CONF_SELECTED_PROFILE = "selected_profile"
CONF_QUICK_ACTIONS = "quick_actions"
CONF_DAILY_PLAN = "daily_plan"
CONF_CONFLICT_POLICY = "conflict_policy"

DEFAULT_QUICK_ACTIONS = [
    {"id": "quick_1", "name": "Quick 1", "minutes": 5, "target": 100.0, "curve": "linear"},
    {"id": "quick_2", "name": "Quick 2", "minutes": 15, "target": 200.0, "curve": "linear"},
    {"id": "quick_3", "name": "Quick 3", "minutes": 30, "target": 300.0, "curve": "s_curve"},
    {"id": "quick_4", "name": "Quick 4", "minutes": 60, "target": 500.0, "curve": "s_curve"},
]

DEFAULT_DAILY_PLAN = {
    "enabled": False,
    "points": [],
}

DEFAULT_PROFILES = [
    {
        "id": "default",
        "name": "Default",
        "direction": "auto",
        "lower_target": 0.0,
        "upper_target": 100.0,
        "up_duration": 60.0,
        "down_duration": 60.0,
        "up_curve": "linear",
        "down_curve": "linear",
        "step_mode": "count",
        "steps": 20,
        "interval": 5.0,
        "schedule_enabled": False,
        "up_time": "19:20",
        "down_time": "23:10",
        "up_points": [[0.0, 0.0], [1.0, 1.0]],
        "down_points": [[0.0, 0.0], [1.0, 1.0]],
    }
]

CURVES = ("linear", "ease_in", "ease_out", "s_curve", "step", "custom")
INTERRUPTION_MODES = ("restart", "queue", "ignore")
