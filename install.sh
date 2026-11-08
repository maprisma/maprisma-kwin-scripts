#!/usr/bin/env bash
# Install or update the KWin scripts for this user and switch them on:
#   omarchy-navigation  Omarchy's window actions KWin lacks (dynamic desktops, follow, scratchpad…)
#   maprisma-tiling     Omarchy-style tiling, groups, gaps, window limits and the active
#                       window frame, set in Maprisma Theme (needs gtk4-layer-shell for its
#                       overlay helper)
# Replaces Krohnkite and the older maprisma-active-frame script: their settings move
# over, Krohnkite is saved to ~/.local/share/maprisma-tiling/krohnkite-backup.tar.gz and
# removed once Maprisma Tiling runs. maprisma-tiling-shortcuts --restore gives back the
# keys taken from other KDE actions.
set -euo pipefail
cd "$(dirname "$0")"
data="${XDG_DATA_HOME:-$HOME/.local/share}"
group=Script-maprisma-tiling
get() { kreadconfig6 --file kwinrc --group "$1" --key "$2"; }
put() { kwriteconfig6 --file kwinrc --group "$group" --key "$1" "$2"; }

stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

# --- the tiling package: tiling.qml is tiling.qml.in with the engine inside -------------
cp -r maprisma-tiling "$stage/"
python3 - "$stage/maprisma-tiling" <<'PY'
import sys, pathlib
pkg = pathlib.Path(sys.argv[1])
template = (pkg / 'tiling.qml.in').read_text()
engine = (pkg / 'engine.js').read_text()
assert template.count('//@ENGINE@') == 1
(pkg / 'contents/ui/tiling.qml').write_text(template.replace('//@ENGINE@', engine))
(pkg / 'tiling.qml.in').unlink()
(pkg / 'engine.js').unlink()
PY
build=$(sha256sum "$stage/maprisma-tiling/contents/ui/tiling.qml" | cut -c1-12)

for s in omarchy-navigation maprisma-tiling; do
  src=$s
  [[ -d "$stage/$s" ]] && src="$stage/$s"
  kpackagetool6 -t KWin/Script -u "$src" >/dev/null 2>&1 || kpackagetool6 -t KWin/Script -i "$src" >/dev/null
done

# --- the overlay helper, started by D-Bus activation ------------------------------------
install -Dm755 overlay/maprisma-tiling-overlay "$HOME/.local/bin/maprisma-tiling-overlay"
install -Dm755 tools/tiling-shortcuts "$HOME/.local/bin/maprisma-tiling-shortcuts"
mkdir -p "$data/dbus-1/services"
cat > "$data/dbus-1/services/org.maprisma.TilingOverlay.service" <<SERVICE
[D-BUS Service]
Name=org.maprisma.TilingOverlay
Exec=/usr/bin/env LD_PRELOAD=/usr/lib/libgtk4-layer-shell.so "$HOME/.local/bin/maprisma-tiling-overlay"
SERVICE
busctl --user call org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus ReloadConfig >/dev/null 2>&1 || true

# --- settings: taken over once from Krohnkite and the active-frame script ---------------
# Their kwinrc groups are saved first (they are deleted below).
mkdir -p "$data/maprisma-tiling"
python3 - "${XDG_CONFIG_HOME:-$HOME/.config}/kwinrc" "$data/maprisma-tiling" <<'PY'
import sys, pathlib, time
rc, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
keep, take = [], False
for line in rc.read_text(errors='replace').splitlines():
    if line.startswith('['):
        take = line.split(']')[0] in ('[Script-krohnkite', '[Script-maprisma-active-frame')
    if take:
        keep.append(line)
if keep:
    (out / time.strftime('kwinrc-backup-%Y%m%d-%H%M%S.ini')).write_text('\n'.join(keep) + '\n')
PY
migrate() {  # new-key old-group old-key
  local v
  if [[ -z "$(get "$group" "$1")" ]]; then
    v=$(get "$2" "$3")
    [[ -n "$v" ]] && put "$1" "$v"
  fi
  return 0
}
migrate gapTop Script-krohnkite screenGapTop
migrate gapRight Script-krohnkite screenGapRight
migrate gapBottom Script-krohnkite screenGapBottom
migrate gapLeft Script-krohnkite screenGapLeft
migrate gapBetween Script-krohnkite screenGapBetween
migrate floatingClasses Script-krohnkite floatingClass
# Krohnkite left desktops untiled by name; Maprisma Tiling by index.
if [[ -z "$(get "$group" untiledDesktops)" ]]; then
  ignored=$(get Script-krohnkite ignoreVDesktop)
  if [[ -n "$ignored" ]]; then
    indices=()
    IFS=',' read -ra names <<< "$ignored"
    for i in $(seq 1 "$(kreadconfig6 --file kwinrc --group Desktops --key Number --default 1)"); do
      name=$(kreadconfig6 --file kwinrc --group Desktops --key "Name_$i")
      for n in "${names[@]}"; do [[ -n "$name" && "$(echo "$n" | xargs)" == "$name" ]] && indices+=("$i"); done
    done
    [[ ${#indices[@]} -gt 0 ]] && put untiledDesktops "$(IFS=,; echo "${indices[*]}")"
  fi
fi
migrate borderWidth Script-maprisma-active-frame borderWidth
migrate borderColor Script-maprisma-active-frame borderColor
migrate cornerRadius Script-maprisma-active-frame cornerRadius
if [[ -z "$(get "$group" borderColor)" ]]; then
  # The colour scheme's focus colour (Maprisma Theme's accent; it rewrites it per theme).
  focus=$(kreadconfig6 --file kdeglobals --group Colors:View --key DecorationFocus)
  if [[ $focus =~ ^([0-9]+),([0-9]+),([0-9]+) ]]; then
    put borderColor "$(printf '#%02x%02x%02x' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}")"
  fi
fi

# --- switch on; the old scripts off ----------------------------------------------------
put build "$build"
kwriteconfig6 --file kwinrc --group Plugins --key omarchy-navigationEnabled true
kwriteconfig6 --file kwinrc --group Plugins --key maprisma-tilingEnabled true
kwriteconfig6 --file kwinrc --group Plugins --key krohnkiteEnabled false
kwriteconfig6 --file kwinrc --group Plugins --key maprisma-active-frameEnabled false
qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.unloadScript maprisma-tiling >/dev/null 2>&1 || true
qdbus6 org.kde.KWin /KWin reconfigure
loaded() { [[ $(qdbus6 org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded maprisma-tiling) == true ]]; }
for _ in $(seq 20); do loaded && break; sleep 0.5; done
if ! loaded; then
  echo "Maprisma Tiling did not load; Krohnkite stays installed (switch it on again in System Settings)." >&2
  exit 1
fi
sleep 1  # its shortcuts register as it starts
"$HOME/.local/bin/maprisma-tiling-shortcuts"

# --- remove what it replaces -----------------------------------------------------------
if [[ -d "$data/kwin/scripts/krohnkite" ]]; then
  mkdir -p "$data/maprisma-tiling"
  tar -czf "$data/maprisma-tiling/krohnkite-backup.tar.gz" -C "$data/kwin/scripts" krohnkite
  kpackagetool6 -t KWin/Script -r krohnkite >/dev/null 2>&1 || true
  echo "Krohnkite removed (saved in $data/maprisma-tiling/krohnkite-backup.tar.gz)."
fi
if [[ -d "$data/kwin/scripts/maprisma-active-frame" ]]; then
  kpackagetool6 -t KWin/Script -r maprisma-active-frame >/dev/null 2>&1 || true
fi
kwriteconfig6 --file kwinrc --group Plugins --key maprisma-active-frameEnabled --delete
kwriteconfig6 --file kwinrc --group Plugins --key krohnkiteEnabled --delete
for k in floatingClass screenGapBetween screenGapBottom screenGapLeft screenGapRight screenGapTop ignoreVDesktop; do
  kwriteconfig6 --file kwinrc --group Script-krohnkite --key "$k" --delete
done
for k in borderColor borderWidth cornerRadius build tilingOn ignoreVDesktop edgeInset; do
  kwriteconfig6 --file kwinrc --group Script-maprisma-active-frame --key "$k" --delete
done
rm -f "$HOME/.local/bin/maprisma-active-frame" "$data/dbus-1/services/org.maprisma.ActiveFrame.service"
stop() {  # a D-Bus service's running process (an older build)
  local pid
  pid=$(busctl --user status "$1" 2>/dev/null | awk -F= '/^PID=/{print $2}' || true)
  [[ -n "$pid" ]] && kill "$pid" 2>/dev/null
  return 0
}
stop org.maprisma.ActiveFrame
stop org.maprisma.TilingOverlay
qdbus6 org.kde.KWin /KWin reconfigure
echo "Installed and enabled (build $build)."
