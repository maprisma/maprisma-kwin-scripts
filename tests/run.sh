#!/usr/bin/env bash
# The engine's tests in Qt's own JS engine, headless.
cd "$(dirname "$0")"
QML_XHR_ALLOW_FILE_READ=1 QT_QPA_PLATFORM=offscreen QT_FORCE_STDERR_LOGGING=1 \
  timeout 60 qml6 run.qml 2>&1 | sed -n 's/^qml: //p'
exit "${PIPESTATUS[0]}"
