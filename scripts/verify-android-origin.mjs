const value = process.env.LUMO_CAPACITOR_SERVER_URL?.trim();
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
