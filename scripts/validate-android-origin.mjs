const value = process.env.LUMO_CAPACITOR_SERVER_URL?.trim();
if (!value) {
  console.error(
    "LUMO_CAPACITOR_SERVER_URL is required; provide the root HTTPS origin of the deployed LUMO app."
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
