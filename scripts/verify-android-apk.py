#!/usr/bin/env python3
"""Verify the standalone APK contains the intended LUMO frontend, not just a valid signature."""

import json
import os
import re
import sys
import zipfile
from urllib.parse import unquote

LEGACY_UI = re.compile(r"Peter Mode|LIVE WORKSPACE|COMMAND DECK|Ready for direction", re.I)
REQUIRED_JS_MARKERS = (
    "Download model",
    "Spotify Developer app Client ID",
    "LumoLocalAi",
)
REQUIRED_NATIVE_AI_MARKERS = (
    "Previous conversation (for context only):",
    "Respond to this latest user message:",
    "/no_think",
)


def fail(message: str) -> None:
    print(f"APK verification failed: {message}", file=sys.stderr)
    raise SystemExit(1)


apk_path = sys.argv[1] if len(sys.argv) > 1 else "android/app/build/outputs/apk/debug/app-debug.apk"
mode = os.environ.get("LUMO_ANDROID_BUILD_MODE", "on_device_ai")
if mode != "on_device_ai":
    print("Standalone UI content check skipped for the remote Tailscale-hosted APK.")
    raise SystemExit(0)

try:
    archive = zipfile.ZipFile(apk_path)
except (OSError, zipfile.BadZipFile) as exc:
    fail(f"cannot open APK archive ({type(exc).__name__})")

with archive:
    names = set(archive.namelist())
    config_name = "assets/capacitor.config.json"
    index_name = "assets/public/index.html"
    if config_name not in names:
        fail("Capacitor config is missing")
    if index_name not in names:
        fail("bundled frontend index.html is missing")

    try:
        config = json.loads(archive.read(config_name))
        html = archive.read(index_name).decode("utf-8")
    except (ValueError, UnicodeDecodeError):
        fail("APK config or frontend HTML is invalid")
    if (config.get("server") or {}).get("url"):
        fail("standalone APK contains a remote server URL")
    if "Good to see you" not in html or "Your space to think" not in html:
        fail("the uploaded LUMO home-screen markers were not found")
    if LEGACY_UI.search(html):
        fail("legacy Peter Mode UI is present")
    if "fonts.googleapis.com" in html.lower():
        fail("standalone HTML still requests an external Google Font")

    refs = re.findall(r"(?:src|href)=\"(\/(?:assets|favicon\.ico)[^\"]*)\"", html)
    if not refs:
        fail("no local script or stylesheet references found")
    for ref in refs:
        packaged = "assets/public/" + unquote(ref.lstrip("/"))
        if packaged not in names:
            fail(f"referenced frontend asset is not in APK: {ref}")

    web_scripts = [
        name
        for name in names
        if name.startswith("assets/public/") and name.endswith(".js")
    ]
    if not web_scripts:
        fail("no JavaScript frontend bundles were packaged")
    js_text = "\n".join(archive.read(name).decode("utf-8", "ignore") for name in web_scripts)
    if LEGACY_UI.search(js_text):
        fail("legacy Peter Mode copy remains in the packaged frontend scripts")
    for marker in REQUIRED_JS_MARKERS:
        if marker.lower() not in js_text.lower():
            fail(f"expected on-device/Spotify feature missing from APK: {marker}")

    dex_files = [name for name in names if re.fullmatch(r"classes(?:\d+)?\.dex", name)]
    if not dex_files:
        fail("compiled Android DEX files are missing")
    dex_text = b"\n".join(archive.read(name) for name in dex_files)
    if b"LumoLocalAiPlugin" not in dex_text:
        fail("compiled native on-device AI plugin is missing from APK DEX")
    for marker in REQUIRED_NATIVE_AI_MARKERS:
        if marker.encode("utf-8") not in dex_text:
            fail(f"corrected native chat prompt path is missing from APK DEX: {marker}")

print("Verified APK: supplied LUMO UI, local AI, Spotify, native bridge, local assets, and no Peter Mode UI or remote origin.")
