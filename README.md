# Vesaci Ramp Controller

A universal, profile-based ramp controller for Home Assistant. It gradually changes a numeric entity using linear, eased, stepped, or custom curves while limiting service calls and Recorder traffic.

## Current support

- `number` and `input_number` targets
- Multiple named profiles per controller
- Lower and upper targets with explicit Up and Down controls
- Independent duration and curve for each direction
- Step count or time interval update control
- Linear, ease-in, ease-out, S-curve, step, and custom point curves
- Fixed step count or fixed update interval
- Start, pause, resume, stop, and restart/queue/ignore interruption behavior
- Profile dropdown and status/progress/target/remaining entities
- Sidebar profile editor with a visual curve graph
- Home Assistant actions for automations
- Bulgarian and English setup translations

Only the target entity is selected during setup. All ramp configuration is owned by the integration.

## Installation with HACS

1. In HACS, open **Integrations**.
2. Add this GitHub repository as a custom repository of type **Integration**.
3. Install **Vesaci Ramp Controller** and restart Home Assistant.
4. Go to **Settings → Devices & services → Add integration**.
5. Search for **Vesaci Ramp Controller** and select the target entity.

The integration creates a **Ramp Controller** sidebar panel automatically. No dashboard resource is required for the panel.

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

## Optional dashboard card

The sidebar panel requires no manual setup. YAML examples for embedding the same UI in a dashboard are in [`dashboards/`](dashboards/). A dashboard resource is only needed when using the optional embedded custom card.

## Safety

The controller clamps commands to the target entity's reported minimum and maximum and rounds to its supported step. Commands that would repeat the current value are skipped.

## License

MIT
