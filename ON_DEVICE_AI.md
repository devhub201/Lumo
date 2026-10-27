# LUMO Android: local AI and Spotify

This APK bundles the LUMO frontend and runs Qwen3-0.6B through Google's LiteRT-LM runtime on the phone. It does not need the LUMO VPS, MariaDB, a LUMO/Google account, or an OpenAI API key for chat.

## Start the local AI

Install the APK, open **Settings → On-device AI**, and tap **Download model** while connected to Wi-Fi. The pinned Qwen3-0.6B mixed-INT4 model is about 475 MiB. LUMO checks the downloaded file's SHA-256 before use. Keep about 650 MB free and leave the app open until the download finishes.

When Settings shows **Installed**, return to Chat and send a text message. You can then turn off Wi-Fi and mobile data to check that the model answers offline. If Chat says to download the model, it is not installed yet; use **Set up on-device AI** or open Settings and start the download. If the download fails, check the connection, free space, and model status in Settings, then retry. The first answer may take longer while the model initializes. This small model is less capable than a large cloud model, can make mistakes, and cannot browse the web. It supports text chat only in this build; file and image analysis, voice transcription, and complex AI tool use are not connected to the local model.

The target phone is a Vivo Y39 5G with Snapdragon 4 Gen 2 and 8 GB physical RAM. Its additional advertised 8 GB is storage-backed extended memory, not extra physical RAM. The 0.6B model is selected for mid-range hardware, but speed, heat, battery use, and stability still depend on the phone. CI verifies the APK build; it cannot certify performance on a physical handset.

## Connect Spotify

Spotify is separate from the local AI. Spotify playback needs an internet connection even when LUMO chat is offline. Create a Spotify app from the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard). In its settings, add this exact value under **Redirect URIs**:

```text
com.devhub201.lumo://spotify-callback
```

The Android package ID `com.devhub201.lumo` is already built into the APK; Spotify setup needs the redirect URI, not a Client Secret. If the app is in Development Mode, add your Spotify account under **Users and Access**. Spotify's [Development Mode rules](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) require the app owner to have Premium and allow up to five authenticated users, each of whom must be allowlisted. Copy the app's **Client ID**—not its Client Secret—into **LUMO → Settings → Connected integrations → Spotify Developer app Client ID**, save it, and tap **Connect Spotify**. LUMO opens authorization in the system browser and returns through the Android callback using PKCE. Spotify's [PKCE guide](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow) recommends PKCE for mobile apps, and its [redirect security announcement](https://developer.spotify.com/blog/2025-02-12-increasing-the-security-requirements-for-integrating-with-spotify) confirms custom URI schemes remain supported.

After consent, open the Spotify app or another active playback device. In Chat, explicit commands such as “play Midnight City,” “pause music,” “resume,” “next song,” “shuffle off,” or “Arijit ka gaana chalao” route to Spotify. Spotify's [Start/Resume Playback API](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback) requires Premium and an active device; Spotify may reject a command if those requirements are not met. An OpenAI API key does not connect Spotify. Spotify needs its own Client ID and your Spotify authorization. This APK does not send chat prompts to OpenAI or use an OpenAI key.

## Privacy and billing

LUMO chat prompts and answers are processed on-device. The first model download contacts Hugging Face; the prompts are not part of that download. Spotify sign-in and playback send the required authorization and playback requests directly to Spotify, not to a LUMO server. The Client ID is public app configuration. Spotify tokens and the Client ID are kept in the Android app's private local storage; this storage is protected by Android's app sandbox but is not separately encrypted by LUMO. Android cloud and device-transfer backups are disabled for the app. **Disconnect** clears LUMO's locally stored Spotify tokens; to revoke the Spotify grant itself, also remove the app from [Spotify's connected apps](https://www.spotify.com/account/apps/).

There is no per-token AI API charge in the local-AI build. Spotify account features and playback remain subject to Spotify's own plan, account, and developer-mode rules.
