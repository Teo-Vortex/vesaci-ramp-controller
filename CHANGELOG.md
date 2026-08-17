# Changelog

## 0.7.0

- Automatically create the Vesaci dashboard card resource in Lovelace storage mode.
- Automatically update the resource URL on integration upgrades for reliable cache invalidation.
- Preserve all existing Lovelace resources by forcing the resource collection to load before modifying it.
- Fall back to global frontend loading when Lovelace resources are managed in YAML mode.

## 0.6.0-test.3

- Fixed dashboard cards remaining on an infinite loading spinner when the frontend module is loaded more than once.
- Added frontend cache busting tied to the integration version.

## 0.6.0-test.2

- Replace paired Quick Action templates with independent time and target selectors.
- Add one Start button for the selected quick duration/target combination.
- Keep Quick Action priority 70 in the conflict arbiter.

## 0.6.0-test.1

- Allow STOP and other buttons to update the UI immediately while focused.
- Automatically load dashboard card modules on every Home Assistant frontend refresh.
- Keep focus protection only for editable inputs and dropdowns.

## 0.6.0-test

- Add tabbed Overview, Profiles, Quick Actions, Daily Plan, and Settings interface.
- Add a central priority arbiter and activity log.
- Add editable Quick Actions and a dedicated two-row dashboard card.
- Add a visual 24-hour Daily Plan with Duration and Continuous transitions.
- Calculate ramp start times from target deadlines and durations.
- Disable profile schedules while Daily Plan is active to avoid scheduler conflicts.

## 0.5.1

- Keep dropdowns and fields open while Home Assistant state updates arrive.
- Replace native time pickers with manual 24-hour `HH:MM` fields.
- Validate scheduled times before saving a profile.

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
