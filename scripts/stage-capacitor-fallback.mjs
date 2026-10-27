import { cp, mkdir, rm, writeFile, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "dist", "public");
const value = process.env.LUMO_CAPACITOR_SERVER_URL?.trim();
const mode =
  process.env.LUMO_ANDROID_BUILD_MODE ?? (value ? "tailscale" : "on_device_ai");

async function getAvailablePort() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  if (!address || typeof address === "string")
    throw new Error("Could not reserve an SSR port.");
  await new Promise((resolve, reject) =>
    probe.close(error => (error ? reject(error) : resolve()))
  );
  return address.port;
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise(resolve => child.once("exit", resolve)),
    delay(1500),
  ]);
  if (child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL");
}

async function stageOnDeviceFrontend() {
  const frontendPublic = path.join(root, "frontend", ".output", "public");
  const serverEntry = path.join(
    root,
    "frontend",
    ".output",
    "server",
    "index.mjs"
  );
  await access(frontendPublic);
  await access(serverEntry);

  // Remove the legacy root-Vite UI and its API artifacts before copying the intended frontend.
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await cp(frontendPublic, outputDir, { recursive: true, force: true });

  const port = await getAvailablePort();
  const child = spawn(process.execPath, [serverEntry], {
    cwd: path.dirname(serverEntry),
    stdio: "ignore",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      NITRO_HOST: "127.0.0.1",
      NITRO_PORT: String(port),
      LUMO_ANDROID_BUILD_MODE: "on_device_ai",
      VITE_LUMO_ANDROID_BUILD_MODE: "on_device_ai",
      LUMO_TAILSCALE_ONLY: "false",
    },
  });

  let html;
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (child.exitCode !== null)
        throw new Error("The built LUMO frontend SSR process exited early.");
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, {
          signal: AbortSignal.timeout(1200),
        });
        if (response.ok) {
          html = await response.text();
          break;
        }
      } catch {
        // The local SSR process may need another moment to bind its loopback port.
      }
      await delay(200);
    }
  } finally {
    await stopServer(child);
  }

  if (!html)
    throw new Error(
      "The built LUMO frontend did not render its home page for Android."
    );
  if (
    !html.includes("Good to see you") ||
    !html.includes("Your space to think")
  ) {
    throw new Error(
      "Android staging did not render the supplied LUMO home screen."
    );
  }
  if (
    /Peter Mode|LIVE WORKSPACE|COMMAND DECK|Ready for direction/i.test(html)
  ) {
    throw new Error(
      "Android staging detected legacy Peter Mode UI instead of the supplied LUMO frontend."
    );
  }

  const assetReferences = [
    ...html.matchAll(/(?:src|href)="(\/(?:assets|favicon\.ico)[^\"]*)"/g),
  ];
  for (const [, assetUrl] of assetReferences) {
    const assetPath = path.join(
      outputDir,
      decodeURIComponent(assetUrl.replace(/^\//, ""))
    );
    await access(assetPath).catch(() => {
      throw new Error(
        `A rendered LUMO asset was not staged for Android: ${assetUrl}`
      );
    });
  }
  await writeFile(path.join(outputDir, "index.html"), html, "utf8");
  console.log(
    "Staged the supplied TanStack LUMO frontend and rendered home screen for standalone Android."
  );
}

if (mode === "on_device_ai") {
  if (value)
    throw new Error(
      "On-device AI builds must not set LUMO_CAPACITOR_SERVER_URL."
    );
  await stageOnDeviceFrontend();
  process.exit(0);
}
if (mode !== "tailscale" || !value) {
  throw new Error(
    "Set a valid Android build mode and run validate-android-origin.mjs first."
  );
}

const url = new URL(value);
const retryUrl = url.toString().replace(/[&<>"']/g, character => {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return entities[character];
});

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, "index.html"),
  `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>LUMO — connection required</title>
  <style>
    :root{color-scheme:dark;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#101113;color:#f6f5f2}
    body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;box-sizing:border-box}
    main{max-width:420px;text-align:center}h1{font-size:2rem;letter-spacing:.18em;margin:0 0 1rem}
    p{line-height:1.65;color:#babac0}a{display:inline-block;margin-top:1rem;padding:.8rem 1.2rem;border-radius:999px;background:#e6e2d9;color:#171717;text-decoration:none;font-weight:650}
  </style>
</head>
<body><main><h1>LUMO</h1><p>LUMO needs an internet connection to reach your private server. Reconnect and try again.</p><a href="${retryUrl}">Retry connection</a></main></body>
</html>
`,
  "utf8"
);
console.log(
  "Staged a connection-required fallback for the Tailscale-hosted Android build."
);
