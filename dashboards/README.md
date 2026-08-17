# Dashboard cards

The integration provides an automatic sidebar panel. These files are optional examples for users who also want the editor embedded in a Lovelace dashboard.

The integration registers this module resource automatically when Home Assistant uses the default Lovelace storage mode:

```text
/vesaci_ramp_controller/card.js?v=0.7.0
```

Resource type: `JavaScript Module`. Manual registration is only needed when Lovelace resources are explicitly configured in YAML mode.

The card discovers configured Ramp Controllers automatically, so no Home Assistant entity ID is required in its YAML configuration.

Available cards:

- `full-card.yaml` — complete profile and curve editor.
- `compact-card.yaml` — profile selection, current value, action, progress, and control buttons.
- `quick-actions-card.yaml` — select a configured duration and target, then start the ramp.
