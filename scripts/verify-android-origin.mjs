import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const value = process.env.LUMO_CAPACITOR_SERVER_URL?.trim();
const mode =
  process.env.LUMO_ANDROID_BUILD_MODE ?? (value ? "tailscale" : "on_device_ai");
if (mode === "on_device_ai") {
  if (value) {
    console.error(
      "On-device AI builds must not set LUMO_CAPACITOR_SERVER_URL."
    );
    process.exit(1);
  }
  const configPath = fileURLToPath(
    new URL(
      "../android/app/src/main/assets/capacitor.config.json",
      import.meta.url
    )
  );
  if (!existsSync(configPath)) {
    console.error(
      "Capacitor config was not generated; run the Android sync/build first."
    );
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  if (config.server?.url) {
    console.error(
      "The on-device AI APK unexpectedly contains a remote server URL."
    );
    process.exit(1);
  }

  const webRoot = fileURLToPath(
    new URL("../android/app/src/main/assets/public/", import.meta.url)
  );
  const htmlPath = path.join(webRoot, "index.html");
  if (!existsSync(htmlPath)) {
    console.error(
      "The standalone APK is missing its bundled LUMO frontend entry page."
    );
    process.exit(1);
  }
  const html = readFileSync(htmlPath, "utf8");
  if (
    !html.includes("Good to see you") ||
    !html.includes("Your space to think")
  ) {
    console.error(
      "The standalone APK does not contain the supplied LUMO home screen."
    );
    process.exit(1);
  }
  if (
    /Peter Mode|LIVE WORKSPACE|COMMAND DECK|Ready for direction/i.test(html)
  ) {
    console.error(
      "The legacy Peter Mode screen must not be packaged in standalone mode."
    );
    process.exit(1);
  }
  if (/fonts\.googleapis\.com/i.test(html)) {
    console.error(
      "Standalone mode must not require an external font request to render."
    );
    process.exit(1);
  }
  const localAssets = [
    ...html.matchAll(/(?:src|href)="(\/(?:assets|favicon\.ico)[^\"]*)"/g),
  ];
  if (localAssets.length === 0) {
    console.error(
      "The standalone home page has no local JavaScript or style assets."
    );
    process.exit(1);
  }
  for (const [, assetUrl] of localAssets) {
    const assetPath = path.join(
      webRoot,
      decodeURIComponent(assetUrl.replace(/^\//, ""))
    );
    if (!existsSync(assetPath)) {
      console.error(`A local frontend asset is missing: ${assetUrl}`);
      process.exit(1);
    }
  }
  console.log(
    "Verified: the supplied LUMO home screen and local assets are bundled with no remote origin."
  );
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
