# Sources and attribution

This is the companion Home Assistant dashboard for
[ThingsLocal Bridge](https://github.com/jmguzik/thingslocal-bridge), which continues
**[LocalThings](https://codeberg.org/purplesym/localthings) by
[purplesym (Lars)](https://codeberg.org/purplesym)** and the LocalThings contributors.
Original protocol research: https://6xq.net/localthings/.

The dashboard reads the bridge's published Home Assistant entity contract. It
does not include or replace the original MQTT protocol implementation. Known
semantic roles are matched to the bridge's stable unique IDs; unknown readings
remain generic. The Home Assistant registration/lifecycle pattern and visual
style follow the maintainer's existing HA dashboard projects.

The dashboard source is AGPL-3.0-or-later; see LICENSE. Runtime dependencies are
Home Assistant's own frontend/WebSocket APIs and standard browser/Python modules.
No cloud account, appliance credential or authentication token is shipped.
