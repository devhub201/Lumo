# LUMO on-device AI (no VPS)

This Android build runs the language model on the phone with Google's LiteRT-LM Android runtime. It does not need the LUMO VPS, MariaDB, a Google/LUMO account, or an OpenAI API key. Chat prompts are passed to the native Android runtime and are not sent to a chat server.

## First use

Install the LUMO APK, open **Settings → On-device AI**, and tap **Download model** while connected to Wi-Fi. LUMO downloads the public Qwen3-0.6B mixed-INT4 LiteRT-LM model from Hugging Face. The file is about 475 MiB. LUMO verifies the pinned SHA-256 before making the model available and rechecks the model before first inference after an app restart. Allow several minutes depending on the connection. Keep at least 650 MB of free phone storage during the download.

After the model is installed, turn off Wi-Fi and mobile data and send a chat message to confirm offline operation. The model stays in the app's private storage. Settings can remove it to reclaim roughly 475 MiB; it can be downloaded again later.

## Device and model expectations

The target test device is the Vivo Y39 5G with Snapdragon 4 Gen 2 and 8 GB physical RAM. The advertised extra 8 GB is storage-backed extended memory, not additional physical RAM. The selected 0.6B-parameter model is deliberately small for a mid-range phone. Actual speed, heat, battery use, and stability depend on the phone's available memory and temperature; the APK build itself cannot certify performance on the physical device.

This model is much smaller and less capable than cloud AI. It can make factual errors, cannot browse the internet, and only supports text chat in this build. File attachments, image understanding, voice transcription, and cloud integrations are not connected to local inference. Current events require an internet-connected source, which this offline model does not have. Native generation cannot currently be interrupted mid-response; while it is generating, LUMO disables the Stop control and indicates that it is still working.

## Privacy and billing

Prompts and responses are processed on-device. The initial model download contacts Hugging Face, but chat prompts are not part of that download. Once the model is installed, inference itself works without internet. No OpenAI API key is included or requested, and there is no per-token AI API bill. Android Auto Backup and device-transfer backup are disabled for this app. Android local app storage contains conversation history; it is stored on the phone and is not encrypted by LUMO beyond Android's app sandbox. Use the phone's screen lock and delete conversations you no longer want to keep.

The selected model is distributed under Apache-2.0: [Qwen3-0.6B LiteRT-LM model card](https://huggingface.co/litert-community/Qwen3-0.6B). The runtime is Google's LiteRT-LM Android library: [official Android guide](https://developers.google.com/edge/litert-lm/android).
