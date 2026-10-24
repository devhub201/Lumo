import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "dist", "public");
const value = process.env.LUMO_CAPACITOR_SERVER_URL;
if (!value) throw new Error("Run validate-android-origin.mjs before staging the Capacitor fallback.");
const url = new URL(value);
const retryUrl = url.toString().replace(/[&<>"']/g, (character) => {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return entities[character];
});

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
  "utf8",
);
console.log("Staged an online-only offline fallback for Capacitor.");
