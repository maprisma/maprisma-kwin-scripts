# Maprisma KWin scripts

KWin scripts for KDE Plasma 6, installed with `./install.sh`:

- **omarchy-navigation**: Omarchy window actions KWin lacks (dynamic desktops, move and follow, scratchpad, pop out).
- **maprisma-tiling**: Omarchy (Hyprland) style tiling, replacing Krohnkite:
  - layouts dwindle (default), master, columns, monocle (Super+L / Super+Alt+L)
  - focus and swap by direction (Super / Super+Shift + arrows), drag a tile onto another to swap,
    resize tiles with the mouse or Super(+Shift/Alt/Ctrl) + ß / ´
  - floating (Super+T), tiled full screen (Super+Ctrl+F), pseudo-tile (Super+P),
    toggle split (Super+J), save/restore width (Super+Alt+Home / Super+Home)
  - groups with a tab bar (Super+G, Super+Alt+G, Super+Alt+arrows, Super+Alt+Tab, Super+Ctrl+←/→, Super+Alt+1…5)
  - gaps, the active window frame in the theme accent, window limits per desktop
  - settings in kwinrc `[Script-maprisma-tiling]`, written by Maprisma Theme (Presets page)

Layout logic: `maprisma-tiling/engine.js` (tests: `tests/run.sh`, headless with qml6).
KWin side: `maprisma-tiling/tiling.qml.in`; `install.sh` puts the engine into it as
`contents/ui/tiling.qml`, which `main.qml` loads under a build stamp (KWin caches QML by URL).
The frame and tab bars are drawn by `overlay/maprisma-tiling-overlay` (Python, GTK 4 +
gtk4-layer-shell), started by D-Bus activation (`org.maprisma.TilingOverlay`).
`tools/tiling-shortcuts` sets the keys and takes them from other KDE actions
(`maprisma-tiling-shortcuts --restore` gives them back).
