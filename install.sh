#!/usr/bin/env bash
# Install or update the KWin scripts for this user and switch them on:
#   omarchy-navigation     Omarchy's window actions KWin lacks (dynamic desktops, follow, scratchpad…)
#   maprisma-active-frame  a theme-coloured frame on the active window where Krohnkite tiles
#                          (needs gtk4-layer-shell for its overlay helper)
set -euo pipefail
cd "$(dirname "$0")"
for s in omarchy-navigation maprisma-active-frame; do
  kpackagetool6 -t KWin/Script -u "$s" >/dev/null 2>&1 || kpackagetool6 -t KWin/Script -i "$s" >/dev/null
  kwriteconfig6 --file kwinrc --group Plugins --key "${s}Enabled" true
done
# The frame's overlay helper, started by D-Bus activation on the script's first call.
install -Dm755 overlay/maprisma-active-frame "$HOME/.local/bin/maprisma-active-frame"
mkdir -p "$HOME/.local/share/dbus-1/services"
cat > "$HOME/.local/share/dbus-1/services/org.maprisma.ActiveFrame.service" <<SERVICE
[D-BUS Service]
Name=org.maprisma.ActiveFrame
Exec=/usr/bin/env LD_PRELOAD=/usr/lib/libgtk4-layer-shell.so "$HOME/.local/bin/maprisma-active-frame"
SERVICE
# Krohnkite's state for the frame (Maprisma Theme keeps it current when tiling changes).
kwriteconfig6 --file kwinrc --group Script-maprisma-active-frame --key tilingOn "$(kreadconfig6 --file kwinrc --group Plugins --key krohnkiteEnabled --default false)"
kwriteconfig6 --file kwinrc --group Script-maprisma-active-frame --key ignoreVDesktop "$(kreadconfig6 --file kwinrc --group Script-krohnkite --key ignoreVDesktop)"
# The frame colour: the colour scheme's focus colour (Maprisma Theme's accent; it rewrites it per theme).
focus=$(kreadconfig6 --file kdeglobals --group Colors:View --key DecorationFocus)
if [[ $focus =~ ^([0-9]+),([0-9]+),([0-9]+) ]]; then
  kwriteconfig6 --file kwinrc --group Script-maprisma-active-frame --key borderColor \
    "$(printf '#%02x%02x%02x' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}")"
fi
# A new build stamp makes main.qml load frame.qml afresh (KWin caches QML by URL).
kwriteconfig6 --file kwinrc --group Script-maprisma-active-frame --key build "$(sha256sum maprisma-active-frame/contents/ui/frame.qml | cut -c1-12)"
# Declarative scripts are read when they load: off and on again.
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript maprisma-active-frame >/dev/null || true
qdbus6 org.kde.KWin /KWin reconfigure
echo "Installed and enabled."
