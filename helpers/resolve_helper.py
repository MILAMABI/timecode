# Playhead · © 2026 MILAMABI. Все права защищены. Проприетарное ПО — см. LICENSE.
"""Помощник для Playhead: раз в 2 секунды сообщает страницу и проект DaVinci Resolve.
Печатает JSON-строки: {"page": "color", "project": "Клип"} или {"error": "..."}.
"""
import json
import os
import sys
import time

if sys.platform == "darwin":
    MODULES = "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Developer/Scripting/Modules/"
    LIB = "/Applications/DaVinci Resolve/DaVinci Resolve.app/Contents/Libraries/Fusion/fusionscript.so"
elif sys.platform.startswith("win"):
    MODULES = os.path.expandvars(r"%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules")
    LIB = r"C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript.dll"
else:
    MODULES, LIB = "", ""


def say(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


os.environ.setdefault("RESOLVE_SCRIPT_API", os.path.dirname(MODULES.rstrip("/\\")))
os.environ.setdefault("RESOLVE_SCRIPT_LIB", LIB)
sys.path.append(MODULES)
try:
    import DaVinciResolveScript as dvr  # noqa: E402
except Exception:
    say({"error": "no_api"})
    sys.exit(0)

resolve = None
lost_since = time.time()
while True:
    try:
        if resolve is None:
            resolve = dvr.scriptapp("Resolve")
        if resolve is None:
            raise RuntimeError("no_connect")
        page = resolve.GetCurrentPage() or ""
        pm = resolve.GetProjectManager()
        proj = pm.GetCurrentProject() if pm else None
        say({"page": page, "project": proj.GetName() if proj else ""})
        lost_since = time.time()
    except Exception:
        resolve = None
        say({"error": "no_connect"})
        if time.time() - lost_since > 120:
            sys.exit(0)
    time.sleep(2)
