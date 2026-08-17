# Dashboard cards

The integration provides an automatic sidebar panel. These files are optional examples for users who also want the editor embedded in a Lovelace dashboard.

For the embedded card only, register this module resource:

```text
/vesaci_ramp_controller/card.js
```

Resource type: `JavaScript Module`.

The card discovers configured Ramp Controllers automatically, so no Home Assistant entity ID is required in its YAML configuration.

Available cards:

- `full-card.yaml` — complete profile and curve editor.
- `compact-card.yaml` — profile selection, current value, action, progress, and control buttons.
