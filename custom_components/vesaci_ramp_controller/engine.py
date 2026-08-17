"""Ramp execution engine."""

from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass
import math
import time
from typing import Any, Callable

from homeassistant.core import HomeAssistant
from homeassistant.helpers.event import async_track_time_change

from .const import (
    CONF_DAILY_PLAN,
    CONF_QUICK_ACTIONS,
    CONF_SELECTED_PROFILE,
    DEFAULT_DAILY_PLAN,
    DEFAULT_QUICK_ACTIONS,
)


@dataclass
class RampState:
    status: str = "idle"
    profile_id: str | None = None
    start_value: float | None = None
    target_value: float | None = None
    progress: float = 0.0
    remaining: float = 0.0
    error: str | None = None
    direction: str | None = None
    source: str | None = None
    priority: int = 0


class RampController:
    """Run profiles against one numeric entity."""

    def __init__(self, hass: HomeAssistant, entry, on_change: Callable[[], None]) -> None:
        self.hass = hass
        self.entry = entry
        self.target_entity = entry.data["target_entity"]
        self.on_change = on_change
        self.state = RampState()
        saved_profile = entry.options.get(CONF_SELECTED_PROFILE)
        profile_ids = {profile["id"] for profile in self.profiles}
        self.selected_profile = (
            saved_profile if saved_profile in profile_ids
            else self.profiles[0]["id"] if self.profiles else None
        )
        self._task: asyncio.Task | None = None
        self._pause_event = asyncio.Event()
        self._pause_event.set()
        self._queue: deque[tuple[str, str | None]] = deque()
        self._schedule_unsubs: list[Callable[[], None]] = []
        self._active_priority = 0
        self.activity_log: deque[dict[str, Any]] = deque(maxlen=20)

    def setup_schedules(self) -> None:
        """Register daily UP and DOWN profile schedules in HA local time."""
        for unsubscribe in self._schedule_unsubs:
            unsubscribe()
        self._schedule_unsubs.clear()
        if self.daily_plan.get("enabled") and self.daily_plan.get("points"):
            self._setup_daily_plan()
            return
        for profile in self.profiles:
            if not profile.get("schedule_enabled", False):
                continue
            for direction, key in (("up", "up_time"), ("down", "down_time")):
                value = profile.get(key)
                if not value:
                    continue
                hour, minute = (int(part) for part in value.split(":"))

                async def scheduled_start(now, profile_id=profile["id"], run_direction=direction):
                    await self.async_start_profile(
                        profile_id, run_direction, source="profile_schedule", priority=30
                    )

                self._schedule_unsubs.append(
                    async_track_time_change(
                        self.hass,
                        scheduled_start,
                        hour=hour,
                        minute=minute,
                        second=0,
                    )
                )

    def _setup_daily_plan(self) -> None:
        points = sorted(
            self.daily_plan.get("points", []), key=lambda point: point["time"]
        )
        for index, point in enumerate(points):
            target_minute = _time_to_minute(point["time"])
            if point.get("transition", "duration") == "continuous" and len(points) > 1:
                previous = points[index - 1]
                start_minute = _time_to_minute(previous["time"])
                duration_minutes = (target_minute - start_minute) % 1440
            else:
                duration_minutes = max(1.0, float(point.get("duration", 30)))
                start_minute = int((target_minute - duration_minutes) % 1440)
            hour, minute = divmod(int(start_minute), 60)

            async def start_daily(now, plan_point=dict(point), minutes=duration_minutes):
                await self.async_start_custom(
                    float(plan_point["target"]),
                    float(minutes) * 60,
                    plan_point.get("curve", "linear"),
                    int(plan_point.get("steps", 20)),
                    "auto",
                    source="daily_plan",
                    priority=40,
                    action_id=plan_point["id"],
                )

            self._schedule_unsubs.append(
                async_track_time_change(
                    self.hass, start_daily, hour=hour, minute=minute, second=0
                )
            )

    async def async_shutdown(self) -> None:
        """Stop execution and remove schedule listeners."""
        for unsubscribe in self._schedule_unsubs:
            unsubscribe()
        self._schedule_unsubs.clear()
        await self.async_stop()

    @property
    def profiles(self) -> list[dict[str, Any]]:
        return self.entry.options.get("profiles", self.entry.data.get("profiles", []))

    @property
    def quick_actions(self) -> list[dict[str, Any]]:
        return self.entry.options.get(CONF_QUICK_ACTIONS, DEFAULT_QUICK_ACTIONS)

    @property
    def daily_plan(self) -> dict[str, Any]:
        return self.entry.options.get(CONF_DAILY_PLAN, DEFAULT_DAILY_PLAN)

    def profile(self, profile_id: str) -> dict[str, Any]:
        for profile in self.profiles:
            if profile["id"] == profile_id:
                return profile
        raise ValueError(f"Unknown profile: {profile_id}")

    async def async_start_profile(
        self,
        profile_id: str,
        direction: str | None = None,
        source: str = "manual",
        priority: int = 80,
    ) -> None:
        profile = self.profile(profile_id)
        profile = dict(profile)
        if direction is not None:
            profile["direction"] = direction
        self.selected_profile = profile_id
        mode = self.entry.options.get("interruption_mode", "restart")
        if self._task and not self._task.done():
            if priority < self._active_priority:
                self._log("ignored", source, profile_id, "lower_priority")
                return
            if mode == "ignore":
                return
            if mode == "queue":
                self._queue.append((profile_id, direction))
                self.on_change()
                return
            await self.async_stop()
        self._task = self.hass.async_create_task(
            self._async_run(profile, source, priority),
            f"ramp_{self.entry.entry_id}_{profile_id}",
        )
        self._active_priority = priority

    async def async_start_custom(
        self,
        target: float,
        duration: float,
        curve: str = "linear",
        steps: int = 20,
        direction: str = "auto",
        source: str = "automation",
        priority: int = 60,
        action_id: str = "custom",
    ) -> None:
        if self._task and not self._task.done() and priority < self._active_priority:
            self._log("ignored", source, action_id, "lower_priority")
            return
        await self.async_stop()
        profile = {
            "id": action_id,
            "name": "Custom",
            "direction": direction,
            "target": target,
            "duration": duration,
            "curve": curve,
            "step_mode": "count",
            "steps": steps,
            "interval": 5.0,
            "points": [[0.0, 0.0], [1.0, 1.0]],
        }
        self._task = self.hass.async_create_task(
            self._async_run(profile, source, priority),
            f"ramp_{self.entry.entry_id}_{action_id}",
        )
        self._active_priority = priority

    async def async_execute_quick(self, action_id: str) -> None:
        action = next(
            (item for item in self.quick_actions if item["id"] == action_id), None
        )
        if action is None:
            raise ValueError(f"Unknown quick action: {action_id}")
        await self.async_start_custom(
            float(action["target"]),
            float(action["minutes"]) * 60,
            action.get("curve", "linear"),
            int(action.get("steps", 20)),
            "auto",
            source="quick_action",
            priority=70,
            action_id=action_id,
        )

    async def async_pause(self) -> None:
        if self._task and not self._task.done():
            self._pause_event.clear()
            self.state.status = "paused"
            self.on_change()

    async def async_resume(self) -> None:
        if self._task and not self._task.done():
            self._pause_event.set()
            self.state.status = "running"
            self.on_change()

    async def async_stop(self) -> None:
        task, self._task = self._task, None
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._pause_event.set()
        self._queue.clear()
        self.state.status = "idle"
        self.state.remaining = 0
        self.state.direction = None
        self.state.source = None
        self.state.priority = 0
        self._active_priority = 0
        self.on_change()

    def current_value(self) -> float:
        state = self.hass.states.get(self.target_entity)
        if state is None or state.state in ("unknown", "unavailable"):
            raise ValueError(f"Target {self.target_entity} is unavailable")
        return float(state.state)

    async def _async_set_value(self, value: float) -> None:
        domain = self.target_entity.split(".", 1)[0]
        if domain not in ("number", "input_number"):
            raise ValueError(f"Unsupported target domain: {domain}")
        state = self.hass.states.get(self.target_entity)
        attrs = state.attributes if state else {}
        minimum = float(attrs.get("min", value))
        maximum = float(attrs.get("max", value))
        step = float(attrs.get("step", 0) or 0)
        value = min(max(value, minimum), maximum)
        if step > 0:
            value = minimum + round((value - minimum) / step) * step
            decimals = max(0, -int(math.floor(math.log10(step)))) if step < 1 else 0
            value = round(value, decimals)
        if state and _same_number(state.state, value):
            return
        await self.hass.services.async_call(
            domain,
            "set_value",
            {"entity_id": self.target_entity, "value": value},
            blocking=True,
        )

    async def _async_run(
        self, profile: dict[str, Any], source: str, priority: int
    ) -> None:
        try:
            start = self.current_value()
            direction = profile.get("direction", "auto")
            legacy_target = float(profile.get("target", start))
            lower_target = float(profile.get("lower_target", legacy_target))
            upper_target = float(profile.get("upper_target", legacy_target))
            if direction == "auto":
                direction = "up" if start < upper_target else "down"
            if direction == "up":
                target = upper_target
                duration = max(
                    0.1, float(profile.get("up_duration", profile.get("duration", 60)))
                )
                selected_curve = profile.get("up_curve", profile.get("curve", "linear"))
                selected_points = profile.get("up_points", profile.get("points"))
            else:
                target = lower_target
                duration = max(
                    0.1, float(profile.get("down_duration", profile.get("duration", 60)))
                )
                selected_curve = profile.get("down_curve", profile.get("curve", "linear"))
                selected_points = profile.get("down_points", profile.get("points"))
            if (direction == "up" and target <= start) or (
                direction == "down" and target >= start
            ):
                self.state = RampState(
                    "complete", profile["id"], start, target, 1.0, 0.0
                )
                self.state.direction = direction
                self.state.source = source
                self.state.priority = priority
                self._log("completed", source, profile["id"], "already_at_target")
                return
            if profile.get("step_mode") == "interval":
                interval = max(1.0, float(profile.get("interval", 5)))
            else:
                interval = duration / max(1, int(profile.get("steps", 20)))
                interval = max(1.0, interval)
            started = time.monotonic()
            paused_total = 0.0
            self.state = RampState("running", profile["id"], start, target, 0, duration)
            self.state.direction = direction
            self.state.source = source
            self.state.priority = priority
            self._log("started", source, profile["id"], direction)
            self.on_change()
            while True:
                if not self._pause_event.is_set():
                    pause_started = time.monotonic()
                    await self._pause_event.wait()
                    paused_total += time.monotonic() - pause_started
                elapsed = time.monotonic() - started - paused_total
                progress = min(1.0, elapsed / duration)
                shaped = curve_value(progress, selected_curve, selected_points)
                await self._async_set_value(start + (target - start) * shaped)
                self.state.progress = progress
                self.state.remaining = max(0.0, duration - elapsed)
                self.on_change()
                if progress >= 1:
                    break
                await asyncio.sleep(min(interval, duration - elapsed))
            await self._async_set_value(target)
            self.state.status = "complete"
            self.state.progress = 1.0
            self.state.remaining = 0.0
            self._log("completed", source, profile["id"], direction)
        except asyncio.CancelledError:
            raise
        except Exception as err:  # surfaced as entity state
            self.state.status = "error"
            self.state.error = str(err)
        finally:
            self.on_change()
            self._task = None
            self._active_priority = 0
            if self._queue:
                next_profile, next_direction = self._queue.popleft()
                await self.async_start_profile(next_profile, next_direction)

    def _log(self, event: str, source: str, action: str, detail: str) -> None:
        self.activity_log.appendleft(
            {"event": event, "source": source, "action": action, "detail": detail}
        )


def _same_number(current: str, new: float) -> bool:
    try:
        return math.isclose(float(current), new, rel_tol=0, abs_tol=1e-9)
    except (TypeError, ValueError):
        return False


def _time_to_minute(value: str) -> int:
    hour, minute = (int(part) for part in value.split(":"))
    return hour * 60 + minute


def curve_value(progress: float, curve: str, points=None) -> float:
    """Map linear progress to a curve in the normalized 0..1 range."""
    p = min(1.0, max(0.0, progress))
    if curve == "ease_in":
        return p * p
    if curve == "ease_out":
        return 1 - (1 - p) ** 2
    if curve == "s_curve":
        return p * p * (3 - 2 * p)
    if curve == "step":
        return 0.0 if p < 1.0 else 1.0
    if curve == "custom" and points:
        ordered = sorted((float(x), float(y)) for x, y in points)
        if p <= ordered[0][0]:
            return ordered[0][1]
        for (x1, y1), (x2, y2) in zip(ordered, ordered[1:]):
            if p <= x2:
                ratio = (p - x1) / max(1e-9, x2 - x1)
                return y1 + (y2 - y1) * ratio
        return ordered[-1][1]
    return p
