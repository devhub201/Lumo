const value = process.env.LUMO_CAPACITOR_SERVER_URL?.trim();
if (!value) {
  console.error(
    "LUMO_CAPACITOR_SERVER_URL is required for the Android endpoint check."
  );
  process.exit(1);
}

let base;
try {
  base = new URL(value);
} catch {
  console.error(
    "LUMO_CAPACITOR_SERVER_URL must be a valid absolute HTTPS URL."
  );
  process.exit(1);
}
if (
  base.protocol !== "https:" ||
  base.username ||
  base.password ||
  base.pathname !== "/" ||
  base.search ||
  base.hash
) {
  console.error("Provide only the root HTTPS origin of the deployed LUMO app.");
  process.exit(1);
}

async function fetchWithRetries(url) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json,text/html" },
      });
    } catch (error) {
      lastError = error;
      if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 2_000));
    }
  }
  throw lastError ?? new Error("Public endpoint did not respond.");
}

try {
  const healthResponse = await fetchWithRetries(new URL("/api/health", base));
  if (!healthResponse.ok)
    throw new Error(`API health returned HTTP ${healthResponse.status}.`);
  const health = await healthResponse.json();
  if (health?.status !== "ok")
    throw new Error("API health did not report status=ok.");

  const appResponse = await fetchWithRetries(new URL("/", base));
  if (!appResponse.ok)
    throw new Error(`App root returned HTTP ${appResponse.status}.`);
  const contentType = appResponse.headers.get("content-type") ?? "";
  const html = await appResponse.text();
  if (
    !contentType.includes("text/html") ||
    !/<html[\s>]/i.test(html) ||
    !/LUMO/i.test(html)
  ) {
    throw new Error("App root did not return the expected LUMO HTML page.");
  }
  console.log(
    "Public HTTPS LUMO origin responds with a healthy API and LUMO HTML page."
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Unable to verify public LUMO endpoint."
  );
  process.exit(1);
}
