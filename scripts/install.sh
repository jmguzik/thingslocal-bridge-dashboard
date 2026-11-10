#!/usr/bin/env bash
# Run on the HA SSH add-on with an extracted release directory.
# This installs files only. Configuration in HA is a separate explicit step.
set -euo pipefail
umask 077
stage=${1:?Usage: install.sh EXTRACTED_RELEASE_DIRECTORY}
component=/config/custom_components/thingslocal_dashboard
backup="/config/thingslocal-dashboard-releases/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$backup" /config/custom_components
if [[ -d "$component" ]]; then cp -a "$component" "$backup/component"; fi
if [[ -f /config/.storage/thingslocal_dashboard ]]; then cp -p /config/.storage/thingslocal_dashboard "$backup/thingslocal_dashboard.storage"; fi
restore() {
    # Keep the failed install for inspection and restore the exact old runtime.
    mv "$component" "$backup/failed-component"
    if [[ -d "$backup/previous-runtime" ]]; then
        mv "$backup/previous-runtime" "$component"
    fi
}
# A fresh directory removes stale __pycache__ entries. Release archives use
# deterministic timestamps, so same-size Python edits can otherwise reuse pyc.
next_component=$(mktemp -d /config/custom_components/.thingslocal_dashboard-install.XXXXXX)
cp -a "$stage/custom_components/thingslocal_dashboard/." "$next_component/"
if [[ -d "$component" ]]; then mv "$component" "$backup/previous-runtime"; fi
if ! mv "$next_component" "$component"; then
    if [[ -d "$backup/previous-runtime" ]]; then mv "$backup/previous-runtime" "$component"; fi
    exit 1
fi
if ! ha core check; then restore; exit 1; fi
if ! ha core restart; then restore; ha core restart || true; exit 1; fi
printf 'ThingsLocal Dashboard installed. Backup: %s\n' "$backup"
printf '%s\n' 'First install: Settings → Devices & services → Add integration → ThingsLocal Dashboard.'
printf '%s\n' 'After setup, the ThingsLocal sidebar dashboard is at /thingslocal-dashboard/overview.'
printf '%s\n' 'No device command is issued by this installer.'
