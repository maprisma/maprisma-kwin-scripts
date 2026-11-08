#!/usr/bin/env bash
# Install or update the KWin scripts for this user and switch them on:
#   omarchy-navigation     Omarchy's window actions KWin lacks (dynamic desktops, follow, scratchpad…)
#   maprisma-focus-border  a theme-coloured frame on the active window where Krohnkite tiles
set -euo pipefail
cd "$(dirname "$0")"
for s in omarchy-navigation maprisma-focus-border; do
  kpackagetool6 -t KWin/Script -u "$s" >/dev/null 2>&1 || kpackagetool6 -t KWin/Script -i "$s" >/dev/null
  kwriteconfig6 --file kwinrc --group Plugins --key "${s}Enabled" true
done
# Krohnkite's state for the frame (Maprisma Theme keeps it current when tiling changes).
kwriteconfig6 --file kwinrc --group Script-maprisma-focus-border --key tilingOn "$(kreadconfig6 --file kwinrc --group Plugins --key krohnkiteEnabled --default false)"
kwriteconfig6 --file kwinrc --group Script-maprisma-focus-border --key ignoreVDesktop "$(kreadconfig6 --file kwinrc --group Script-krohnkite --key ignoreVDesktop)"
qdbus6 org.kde.KWin /KWin reconfigure
echo "Installed and enabled."
