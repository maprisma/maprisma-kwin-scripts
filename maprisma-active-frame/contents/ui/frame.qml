/*
 * Maprisma Active Frame: a frame in the theme's accent along the inside edge
 * of the active window, on desktops Krohnkite tiles. Drawn by the
 * maprisma-active-frame helper on a layer-shell overlay that lets input
 * through, so the windows stay usable.
 *
 * Settings come from this script's own kwinrc group, written by Maprisma
 * Theme: tilingOn, ignoreVDesktop (mirrored from Krohnkite), borderColor,
 * borderWidth (0 = no frame), edgeInset (a side on the screen edge moves in
 * by this many pixels; TVs cut off the outermost ones). Re-read every 2 s, so changes apply live.
 */
import QtQuick
import org.kde.kwin
import org.kde.plasma.workspace.dbus as DBus

Item {
    id: root

    property var win: Workspace.activeWindow
    property bool tiledDesktop: false
    property int bw: 3
    property int inset: 6
    property color colour: "#3daee9"

    function check() {
        const on = String(KWin.readConfig("tilingOn", false)) === "true";
        const ignored = String(KWin.readConfig("ignoreVDesktop", "")).split(",").map(s => s.trim()).filter(s => s.length);
        bw = Math.max(0, Math.min(16, Number(KWin.readConfig("borderWidth", 3)) || 0));
        const ins = Number(KWin.readConfig("edgeInset", 6));
        inset = Math.max(0, Math.min(32, isNaN(ins) ? 6 : ins));
        const c = String(KWin.readConfig("borderColor", "#3daee9"));
        if (/^#[0-9a-fA-F]{6}$/.test(c)) colour = c;
        const desk = Workspace.currentDesktop;
        tiledDesktop = on && !!desk && ignored.indexOf(String(desk.name).trim()) < 0;
        win = Workspace.activeWindow;
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
    readonly property bool shown: bw > 0 && tiledDesktop && !!win && win.normalWindow && !win.fullScreen
        && !win.minimized && (win.onAllDesktops || onCurrent(win))

    // Kept current while the window moves or is resized.
    property rect g: win ? win.frameGeometry : Qt.rect(0, 0, 0, 0)
    Connections {
        target: root.win
        ignoreUnknownSignals: true
        function onFrameGeometryChanged() { root.g = root.win.frameGeometry; }
    }
    onWinChanged: g = win ? win.frameGeometry : Qt.rect(0, 0, 0, 0)

    // KWin scripts cannot draw correctly scaled windows of their own, so the
    // frame goes to the maprisma-active-frame helper (a layer-shell overlay,
    // started by D-Bus activation), sent at most every 16 ms.
    property string sent: ""
    function send() {
        const f = shown
            ? { shown: true, x: g.x, y: g.y, w: g.width, h: g.height, width: bw, colour: String(colour), inset: inset }
            : { shown: false };
        const text = JSON.stringify(f);
        if (text === sent) return;
        sent = text;
        DBus.SessionBus.asyncCall({
            service: "org.maprisma.ActiveFrame",
            path: "/org/maprisma/ActiveFrame",
            iface: "org.maprisma.ActiveFrame",
            member: "Set",
            arguments: [text],
            signature: "(s)",
        });
    }
    Timer { id: soon; interval: 16; onTriggered: root.send() }
    // Again every 10 s, so a restarted helper gets the frame back.
    Timer { interval: 10000; running: true; repeat: true; onTriggered: { root.sent = ""; root.send(); } }
    onShownChanged: soon.restart()
    onGChanged: soon.restart()
    onBwChanged: soon.restart()
    onInsetChanged: soon.restart()
    onColourChanged: soon.restart()
    Component.onCompleted: soon.restart()
}
