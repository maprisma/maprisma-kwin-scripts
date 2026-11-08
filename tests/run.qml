// Runs engine_test.js against ../maprisma-tiling/engine.js in a plain QML
// engine (no KWin):  tests/run.sh
import QtQuick

Item {
    function load(path) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", Qt.resolvedUrl(path), false);
        xhr.send();
        return xhr.responseText;
    }
    Component.onCompleted: {
        var failures = 0, count = 0;
        var t = {
            eq: function (a, b, what) {
                count++;
                var sa = JSON.stringify(a), sb = JSON.stringify(b);
                if (sa !== sb) { failures++; console.warn("FAIL", what, "\n  got:      " + sa + "\n  expected: " + sb); }
            },
            ok: function (v, what) { count++; if (!v) { failures++; console.warn("FAIL", what); } },
        };
        try {
            new Function("t", load("../maprisma-tiling/engine.js") + "\n" + load("engine_test.js"))(t);
        } catch (e) {
            failures++;
            console.warn("ERROR", e, e.stack);
        }
        console.warn(failures ? "FAILED " + failures + " of " + count : "OK " + count + " checks");
        Qt.exit(failures ? 1 : 0);
    }
}
