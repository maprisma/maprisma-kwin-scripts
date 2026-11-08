// Omarchy navigation actions KWin has no built-in action for (keys are set
// in System Settings → Shortcuts → KWin, names start with "Omarchy:").

// Dynamic desktops as on Omarchy: 1…KEEP always exist; a key for a higher
// one creates the desktops up to it; desktops above KEEP go again once they
// are empty and not shown, only from the end (numbers never shift).
var KEEP = 5;

function desktopNumber(n) {
    while (workspace.desktops.length < n) {
        var i = workspace.desktops.length;
        workspace.createDesktop(i, String(i + 1));
    }
    return workspace.desktops[n - 1];
}

function isEmpty(d) {
    return !workspace.windowList().some(function (w) {
        return w.normalWindow && !w.onAllDesktops && w.desktops.indexOf(d) >= 0;
    });
}

var trimming = false;
function trimDesktops() {
    if (trimming) return;
    trimming = true;
    try {
        for (var i = workspace.desktops.length - 1; i >= KEEP; i--) {
            var d = workspace.desktops[i];
            if (d === workspace.currentDesktop || !isEmpty(d)) break;
            workspace.removeDesktop(d);
        }
    } finally {
        trimming = false;
    }
}

function switchToDesktop(n) {
    workspace.currentDesktop = desktopNumber(n);
    trimDesktops();
}

function windowToDesktop(n, follow) {
    var w = workspace.activeWindow;
    var d = desktopNumber(n);
    if (w && w.normalWindow) w.desktops = [d];
    if (follow) {
        workspace.currentDesktop = d;
        if (w) workspace.activeWindow = w;
    }
    trimDesktops();
}

for (var i = 1; i <= 10; i++) {
    (function (n) {
        registerShortcut("Omarchy: Switch to Desktop " + n, "Omarchy: Switch to Desktop " + n, "",
                         function () { switchToDesktop(n); });
        registerShortcut("Omarchy: Window to Desktop " + n, "Omarchy: Window to Desktop " + n, "",
                         function () { windowToDesktop(n, false); });
        registerShortcut("Omarchy: Window to Desktop " + n + " and follow",
                         "Omarchy: Window to Desktop " + n + " and follow", "",
                         function () { windowToDesktop(n, true); });
    })(i);
}

// Empty high desktops go when they are left or their last window closes.
workspace.currentDesktopChanged.connect(function () { trimDesktops(); });
workspace.windowRemoved.connect(function () { trimDesktops(); });
workspace.windowAdded.connect(function (w) {
    w.desktopsChanged.connect(function () { trimDesktops(); });
});
workspace.windowList().forEach(function (w) {
    w.desktopsChanged.connect(function () { trimDesktops(); });
});

// Former (last used) desktop
var previousDesktop = null;
workspace.currentDesktopChanged.connect(function (old) {
    if (old) previousDesktop = old;
});
registerShortcut("Omarchy: Former desktop", "Omarchy: Former desktop", "", function () {
    if (previousDesktop && workspace.desktops.indexOf(previousDesktop) >= 0) workspace.currentDesktop = previousDesktop;
});

// Close every normal window
registerShortcut("Omarchy: Close all windows", "Omarchy: Close all windows", "", function () {
    workspace.windowList().forEach(function (w) {
        if (w.normalWindow && w.closeable) w.closeWindow();
    });
});

// Pop out: floating above everything, on all desktops (again: back)
registerShortcut("Omarchy: Pop window out", "Omarchy: Pop window out", "", function () {
    var w = workspace.activeWindow;
    if (!w || !w.normalWindow) return;
    var out = !(w.onAllDesktops && w.keepAbove);
    w.onAllDesktops = out;
    w.keepAbove = out;
    if (!out) w.desktops = [workspace.currentDesktop];
});

// Scratchpad: windows parked out of sight, shown on the current desktop on demand
var scratch = {};
workspace.windowRemoved.connect(function (w) { delete scratch[w.internalId]; });
function scratchWindows() {
    return workspace.windowList().filter(function (w) { return scratch[w.internalId]; });
}
registerShortcut("Omarchy: Move window to scratchpad", "Omarchy: Move window to scratchpad", "", function () {
    var w = workspace.activeWindow;
    if (!w || !w.normalWindow) return;
    scratch[w.internalId] = true;
    w.minimized = true;
});
registerShortcut("Omarchy: Toggle scratchpad", "Omarchy: Toggle scratchpad", "", function () {
    var list = scratchWindows();
    if (list.length === 0) return;
    var shown = list.some(function (w) {
        return !w.minimized && w.desktops.indexOf(workspace.currentDesktop) >= 0;
    });
    list.forEach(function (w) {
        if (shown) {
            w.minimized = true;
        } else {
            w.desktops = [workspace.currentDesktop];
            w.minimized = false;
            w.keepAbove = true;
            workspace.activeWindow = w;
        }
    });
});
