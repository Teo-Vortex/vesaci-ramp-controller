# Vesaci Ramp Controller

A universal, profile-based ramp controller for Home Assistant. It gradually changes a numeric entity using linear, eased, stepped, or custom curves while limiting service calls and Recorder traffic.

## Current support

- `number` and `input_number` targets
- Multiple named profiles per controller
- Create additional profiles directly from the visual editor
- Lower and upper targets with explicit Up and Down controls
- Independent duration and curve for each direction
- Step count or time interval update control
- Optional daily UP and DOWN start times in the Home Assistant time zone
- Manual 24-hour schedule entry using `HH:MM`
- Linear, ease-in, ease-out, S-curve, step, and custom point curves
- Fixed step count or fixed update interval
- Start, pause, resume, stop, and restart/queue/ignore interruption behavior
- Profile dropdown and status/progress/target/remaining entities
- Sidebar profile editor with a visual curve graph
- Compact dashboard card for normal operation
- Tabbed management panel with Overview, Profiles, Quick Actions, Daily Plan, and Settings
- Priority-based conflict arbitration with an activity log
- Quick Action card with independent time and target selectors
- Visual 24-hour Daily Plan with deadline-based and continuous transitions
- Home Assistant actions for automations
- Bulgarian and English setup translations

Only the target entity is selected during setup. All ramp configuration is owned by the integration.

## Installation with HACS

1. In HACS, open **Integrations**.
2. Add this GitHub repository as a custom repository of type **Integration**.
3. Install **Vesaci Ramp Controller** and restart Home Assistant.
4. Go to **Settings → Devices & services → Add integration**.
5. Search for **Vesaci Ramp Controller** and select the target entity.

The integration creates a **Ramp Controller** sidebar panel and registers its dashboard cards automatically. No manual dashboard resource is required when Lovelace resources use the default storage mode.

## Automations

Use the config entry ID shown in the status sensor's `controller_id` attribute:

```yaml
actions:
  - action: vesaci_ramp_controller.start_profile
    data:
      controller_id: 01J_EXAMPLE_ENTRY_ID
      profile: default
```

One-time ramp:

```yaml
actions:
  - action: vesaci_ramp_controller.start
    data:
      controller_id: 01J_EXAMPLE_ENTRY_ID
      target: 300
      duration: 600
      curve: s_curve
      steps: 30
```

## Dashboard cards

YAML examples are in [`dashboards/`](dashboards/). The card resource is installed and versioned automatically. Users who explicitly manage Lovelace resources in YAML mode must add `/vesaci_ramp_controller/card.js?v=0.7.0` as a module resource themselves.

## Safety

The controller clamps commands to the target entity's reported minimum and maximum and rounds to its supported step. Commands that would repeat the current value are skipped.

## Conflict priorities

Only one ramp runs at a time. Stop has the highest priority, followed by manual controls, Quick Actions, HA automations, Daily Plan, and profile schedules. When Daily Plan is enabled, profile schedules are not registered.

## License

MIT
