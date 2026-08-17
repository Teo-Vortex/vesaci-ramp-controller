# Changelog

## 0.2.0

- Add lower and upper targets to every profile.
- Add independent UP and DOWN durations, curves, and custom curve points.
- Add explicit UP and DOWN controls and automation direction.
- Expose step-count and time-interval control in the visual editor.
- Migrate legacy profiles in the editor without discarding existing settings.

## 0.1.1

- Keep unsaved profile edits stable while Home Assistant state updates arrive.
- Add Auto, Up, and Down ramp direction to profiles and one-time ramps.
- Prevent Up profiles from lowering and Down profiles from raising the target entity.

## 0.1.0

- Initial custom integration structure.
- Numeric target selection through config flow.
- Profile-based ramp engine and Home Assistant actions.
- Mode selector, controls, and status entities.
- Visual profile editor and optional dashboard card.
