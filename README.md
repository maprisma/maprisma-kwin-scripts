# Maprisma KWin scripts

KWin scripts for KDE Plasma, installed with `./install.sh`:

- **omarchy-navigation**: Omarchy window actions KWin lacks (dynamic desktops, move and follow, scratchpad).
- **maprisma-active-frame**: a frame in the theme accent around the active window, on desktops Krohnkite tiles.
  The script tracks the active window; `overlay/maprisma-active-frame` (Python, GTK 4 + gtk4-layer-shell)
  draws it on a click-through overlay, started by D-Bus activation (`org.maprisma.ActiveFrame`).
  Settings live in `[Script-maprisma-active-frame]` in kwinrc: `tilingOn` and `ignoreVDesktop`
  (mirrored from Krohnkite), `borderColor`, `borderWidth` (0 = off). Maprisma Theme writes them
  (Presets page, gaps & frame button). `main.qml` only loads `frame.qml` under a build stamp,
  because KWin caches QML files by URL until it restarts.
