const value = process.env.LUMO_CAPACITOR_SERVER_URL?.trim();
const mode = process.env.LUMO_ANDROID_BUILD_MODE ?? (value ? "tailscale" : "on_device_ai");
if (mode === "on_device_ai") {
  if (value) {
    console.error("On-device AI builds must not set LUMO_CAPACITOR_SERVER_URL.");
    process.exit(1);
  }
  console.log("On-device AI build selected: frontend will be bundled and no server origin will be used.");
  process.exit(0);
}
if (mode !== "tailscale") {
  console.error("LUMO_ANDROID_BUILD_MODE must be on_device_ai or tailscale.");
  process.exit(1);
}
if (!value) {
  console.error(
    "Tailscale mode requires LUMO_CAPACITOR_SERVER_URL with the root HTTPS origin of the deployed LUMO app."
  );
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
if (
  url.protocol !== "https:" ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash ||
  !url.hostname.toLowerCase().replace(/\.$/, "").endsWith(".ts.net")
) {
  console.error(
    "LUMO_CAPACITOR_SERVER_URL must be a root HTTPS Tailscale *.ts.net origin without credentials, path, query, or fragment."
  );
  process.exit(1);
}

console.log(
  "Private Tailscale HTTPS origin syntax is valid; verify reachability from an enrolled device."
);
