# LUMO v2 (native Android)

Native Kotlin + Jetpack Compose. No WebView, Capacitor, Flutter or React Native. Separate from the legacy Capacitor app in `../android` (different applicationId `com.devhub201.lumo.v2`, installs side by side).

## Principles
- AI runs on-device (LiteRT-LM). No backend required.
- A workspace is marked **Working** only when real code exists. Everything else is a plainly labelled "Not built yet" screen naming its roadmap phase.
- The orb reflects real state only (generating, downloading, error).

## Milestone 1 (this build)
Working: Home, Chat (offline, local history), Settings (download / SHA-256 verify / delete model).
Planned: Study, Coding, Browser, Tasks, Files, Vision, Images, Blueprint, Voice, Toolkit.

## Build
CI builds the APK: `.github/workflows/native-android.yml` (unit tests, assembleDebug, aapt/apksigner checks). Locally: `cd native-android && ./gradlew testDebugUnitTest assembleDebug`.

## Verification status
CI-verified: compiles, unit tests pass (see the workflow run). Not verified until installed on a phone: model download, load time, reply quality and speed, Hindi/Hinglish quality, orb performance.
