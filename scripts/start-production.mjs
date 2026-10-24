import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.join(root, "frontend");
const apiEntry = path.join(root, "dist", "index.js");
const webEntry = path.join(frontendDir, ".output", "server", "index.mjs");
const publicPort = Number(process.env.PORT || "3000");
const defaultApiPort = Number.isInteger(publicPort) && publicPort < 65535 ? publicPort + 1 : 3100;
const apiPort = Number(process.env.LUMO_API_PORT || String(defaultApiPort));

for (const [name, value] of [["PORT", publicPort], ["LUMO_API_PORT", apiPort]]) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
}
if (publicPort === apiPort) {
  throw new Error("PORT and LUMO_API_PORT must be different");
}

const api = spawn(process.execPath, [apiEntry], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(apiPort),
    LUMO_INTERNAL_ONLY: "true",
  },
  stdio: "inherit",
});
let web;
let shuttingDown = false;

function stop(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  if (web && web.exitCode === null) web.kill(signal);
  if (api.exitCode === null) api.kill(signal);
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
api.on("error", (error) => {
  console.error("Failed to start LUMO API:", error.message);
  stop();
  process.exitCode = 1;
});
api.on("exit", (code, signal) => {
  if (!shuttingDown) {
    console.error(`LUMO API exited unexpectedly (code=${code}, signal=${signal ?? "none"})`);
    stop();
    process.exitCode = code ?? 1;
  }
});

async function waitForApi() {
  const deadline = Date.now() + 30_000;
  const healthUrl = `http://127.0.0.1:${apiPort}/api/health`;
  while (Date.now() < deadline) {
    if (api.exitCode !== null) throw new Error("LUMO API stopped before becoming healthy");
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The API is still starting; retry until the bounded readiness deadline.
    }
    await delay(300);
  }
  throw new Error("LUMO API did not become healthy within 30 seconds");
}

try {
  await waitForApi();
  if (shuttingDown) process.exit(1);
  web = spawn(process.execPath, [webEntry], {
    cwd: frontendDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(publicPort),
      HOST: "0.0.0.0",
      NITRO_PORT: String(publicPort),
      NITRO_HOST: "0.0.0.0",
      LUMO_API_INTERNAL_ORIGIN: `http://127.0.0.1:${apiPort}`,
    },
    stdio: "inherit",
  });
  web.on("error", (error) => {
    console.error("Failed to start LUMO frontend:", error.message);
    stop();
    process.exitCode = 1;
  });
  web.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`LUMO frontend exited (code=${code}, signal=${signal ?? "none"})`);
      stop();
      process.exitCode = code ?? 1;
    }
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "LUMO startup failed");
  stop();
  process.exitCode = 1;
}
