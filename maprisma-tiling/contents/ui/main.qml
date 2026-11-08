/*
 * Loads tiling.qml (built by install.sh from tiling.qml.in and engine.js).
 * KWin keeps one QML engine for all scripts and caches each file by its URL
 * until it restarts, so this file never changes and loads the real code
 * under a URL with the build stamp install.sh writes.
 */
import QtQuick
import org.kde.kwin

Loader {
    source: Qt.resolvedUrl("tiling.qml") + "?build=" + KWin.readConfig("build", "0")
}
