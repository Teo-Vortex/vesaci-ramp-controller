# Changelog

## 0.5.0

- Make all compact-card control buttons equal width.
- Show the selected profile's minimum and maximum on the compact card.
- Show only the active step-count or interval setting.
- Add creation and persistence of multiple independent profiles.
- Fix the first custom-graph click after dragging being ignored.

## 0.4.0

- Add a compact dashboard card with controls, current value, action, and progress.
- Split profile settings into independent UP and DOWN panels.
- Map pointer positions through the SVG coordinate system for accurate dragging.
- Add custom points with an empty click and remove interior points with left or right click.
- Add a select-profile action that does not start a ramp.

## 0.3.0

- Reorganize the editor into clear control, curve, target, frequency, and schedule sections.
- Add an optional daily UP/DOWN schedule using the Home Assistant time zone.
- Render linear, ease-in, ease-out, S-curve, and step presets accurately in the graph.
- Display DOWN curves in the descending direction.
- Normalize custom points and support drag-to-edit and right-click removal.

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
