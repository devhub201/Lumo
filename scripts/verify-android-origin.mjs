import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const value = process.env.LUMO_CAPACITOR_SERVER_URL?.trim();
const mode = process.env.LUMO_ANDROID_BUILD_MODE ?? (value ? "tailscale" : "on_device_ai");
if (mode === "on_device_ai") {
  if (value) {
    console.error("On-device AI builds must not set LUMO_CAPACITOR_SERVER_URL.");
    process.exit(1);
  }
  const configPath = fileURLToPath(new URL("../android/app/src/main/assets/capacitor.config.json", import.meta.url));
  if (!existsSync(configPath)) {
    console.error("Capacitor config was not generated; run the Android sync/build first.");
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (config.server?.url) {
    console.error("The on-device AI APK unexpectedly contains a remote server URL.");
    process.exit(1);
  }
  console.log("Verified: local frontend assets are bundled and no remote server origin is configured.");
  process.exit(0);
}
if (!value) {
  console.error("LUMO_CAPACITOR_SERVER_URL is required for the Android build.");
  process.exit(1);
}

let url;
try {
  url = new URL(value);
} catch {
  console.error(
    "LUMO_CAPACITOR_SERVER_URL must be a valid absolute HTTPS URL."
  );
  process.exit(1);
}

const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
if (
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash ||
  !hostname.endsWith(".ts.net")
) {
  console.error(
    "Provide only the root HTTPS Tailscale *.ts.net origin of the private LUMO app."
  );
  process.exit(1);
}

console.log(
  "Private Tailscale origin is syntactically valid. GitHub Actions cannot verify a tailnet-only endpoint; test it from the enrolled Android device."
);
