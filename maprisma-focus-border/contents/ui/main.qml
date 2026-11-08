/*
 * Maprisma Focus Border: a frame in the colour scheme's focus colour (the
 * theme's accent) along the inside edge of the active window, on desktops
 * Krohnkite tiles. Four thin output-only strips (clicks go through), so the
 * window under them stays usable. Krohnkite's state comes from this script's
 * own config, which Maprisma Theme mirrors (tilingOn, ignoreVDesktop).
 */
import QtQuick
import org.kde.kwin
import org.kde.plasma.core as PlasmaCore
import org.kde.kirigami as Kirigami

Item {
    id: root

    property var win: Workspace.activeWindow
    property bool tiledDesktop: false
    property int bw: 3
    readonly property color colour: Kirigami.Theme.focusColor

    function check() {
        const on = KWin.readConfig("tilingOn", false);
        const ignored = String(KWin.readConfig("ignoreVDesktop", "")).split(",").map(s => s.trim()).filter(s => s.length);
        bw = Math.max(1, Math.min(12, KWin.readConfig("borderWidth", 3)));
        const desk = Workspace.currentDesktop;
        tiledDesktop = on && !!desk && ignored.indexOf(desk.name) < 0;
    }
    Timer { interval: 2000; running: true; repeat: true; triggeredOnStart: true; onTriggered: root.check() }
    Connections {
        target: Workspace
        function onCurrentDesktopChanged() { root.check(); }
        function onWindowActivated() { root.win = Workspace.activeWindow; }
    }

    function onCurrent(w) {
        const list = w.desktops;
        for (let i = 0; i < list.length; i++)
            if (list[i] === Workspace.currentDesktop)
                return true;
        return false;
    }
    readonly property bool shown: tiledDesktop && !!win && win.normalWindow && !win.fullScreen && !win.minimized
        && (win.onAllDesktops || onCurrent(win))
    // Kept current while the window moves or is resized.
    property rect g: win ? win.frameGeometry : Qt.rect(0, 0, 0, 0)
    Connections {
        target: root.win
        ignoreUnknownSignals: true
        function onFrameGeometryChanged() { root.g = root.win.frameGeometry; }
    }
    onWinChanged: g = win ? win.frameGeometry : Qt.rect(0, 0, 0, 0)

    component Strip: PlasmaCore.Dialog {
        property real sx
        property real sy
        property real sw
        property real sh
        type: PlasmaCore.Dialog.OnScreenDisplay
        flags: Qt.WindowStaysOnTopHint | Qt.FramelessWindowHint | Qt.WindowDoesNotAcceptFocus
        location: PlasmaCore.Types.Floating
        backgroundHints: PlasmaCore.Dialog.NoBackground
        outputOnly: true
        visible: root.shown && sw > 0 && sh > 0
        x: Math.round(sx)
        y: Math.round(sy)
        mainItem: Rectangle {
            width: Math.max(1, Math.round(sw))
            height: Math.max(1, Math.round(sh))
            color: root.colour
        }
    }

    Strip { sx: root.g.x; sy: root.g.y; sw: root.g.width; sh: root.bw }                                    // top
    Strip { sx: root.g.x; sy: root.g.y + root.g.height - root.bw; sw: root.g.width; sh: root.bw }          // bottom
    Strip { sx: root.g.x; sy: root.g.y + root.bw; sw: root.bw; sh: root.g.height - 2 * root.bw }           // left
    Strip { sx: root.g.x + root.g.width - root.bw; sy: root.g.y + root.bw; sw: root.bw; sh: root.g.height - 2 * root.bw } // right
}
