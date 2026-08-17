"""Ramp execution engine."""

from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass
import math
import time
from typing import Any, Callable

from homeassistant.core import HomeAssistant


@dataclass
class RampState:
    status: str = "idle"
    profile_id: str | None = None
    start_value: float | None = None
    target_value: float | None = None
    progress: float = 0.0
    remaining: float = 0.0
    error: str | None = None


class RampController:
    """Run profiles against one numeric entity."""

    def __init__(self, hass: HomeAssistant, entry, on_change: Callable[[], None]) -> None:
        self.hass = hass
        self.entry = entry
        self.target_entity = entry.data["target_entity"]
        self.on_change = on_change
        self.state = RampState()
        self.selected_profile = self.profiles[0]["id"] if self.profiles else None
        self._task: asyncio.Task | None = None
        self._pause_event = asyncio.Event()
        self._pause_event.set()
        self._queue: deque[str] = deque()

    @property
    def profiles(self) -> list[dict[str, Any]]:
        return self.entry.options.get("profiles", self.entry.data.get("profiles", []))

    def profile(self, profile_id: str) -> dict[str, Any]:
        for profile in self.profiles:
            if profile["id"] == profile_id:
                return profile
        raise ValueError(f"Unknown profile: {profile_id}")

    async def async_start_profile(self, profile_id: str) -> None:
        profile = self.profile(profile_id)
        self.selected_profile = profile_id
        mode = self.entry.options.get("interruption_mode", "restart")
        if self._task and not self._task.done():
            if mode == "ignore":
                return
            if mode == "queue":
                self._queue.append(profile_id)
                self.on_change()
                return
            await self.async_stop()
        self._task = self.hass.async_create_task(
            self._async_run(profile), f"ramp_{self.entry.entry_id}_{profile_id}"
        )

    async def async_start_custom(
        self,
        target: float,
        duration: float,
        curve: str = "linear",
        steps: int = 20,
        direction: str = "auto",
    ) -> None:
        await self.async_stop()
        profile = {
            "id": "custom",
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
            self._async_run(profile), f"ramp_{self.entry.entry_id}_custom"
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

    async def _async_run(self, profile: dict[str, Any]) -> None:
        try:
            start = self.current_value()
            target = float(profile["target"])
            direction = profile.get("direction", "auto")
            duration = max(0.1, float(profile["duration"]))
            if (direction == "up" and target <= start) or (
                direction == "down" and target >= start
            ):
                self.state = RampState(
                    "complete", profile["id"], start, target, 1.0, 0.0
                )
                return
            if profile.get("step_mode") == "interval":
                interval = max(1.0, float(profile.get("interval", 5)))
            else:
                interval = duration / max(1, int(profile.get("steps", 20)))
                interval = max(1.0, interval)
            started = time.monotonic()
            paused_total = 0.0
            self.state = RampState("running", profile["id"], start, target, 0, duration)
            self.on_change()
            while True:
                if not self._pause_event.is_set():
                    pause_started = time.monotonic()
                    await self._pause_event.wait()
                    paused_total += time.monotonic() - pause_started
                elapsed = time.monotonic() - started - paused_total
                progress = min(1.0, elapsed / duration)
                shaped = curve_value(progress, profile.get("curve", "linear"), profile.get("points"))
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
        except asyncio.CancelledError:
            raise
        except Exception as err:  # surfaced as entity state
            self.state.status = "error"
            self.state.error = str(err)
        finally:
            self.on_change()
            self._task = None
            if self._queue:
                next_profile = self._queue.popleft()
                await self.async_start_profile(next_profile)


def _same_number(current: str, new: float) -> bool:
    try:
        return math.isclose(float(current), new, rel_tol=0, abs_tol=1e-9)
    except (TypeError, ValueError):
        return False


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
