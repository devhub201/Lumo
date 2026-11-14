import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicPlatformScript } from "./publicConfig";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import {
  originGuard,
  rateLimitMiddleware,
  securityHeaders,
} from "./httpGuards";
import { FixedWindowRateLimiter, rateLimitConfig } from "./rateLimit";

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  // Behind a reverse proxy set LUMO_TRUST_PROXY to the number of proxy hops so
  // rate limiting sees real client IPs; unset means "do not trust forwarded headers".
  const trustProxy = Number(process.env.LUMO_TRUST_PROXY ?? "0");
  if (Number.isInteger(trustProxy) && trustProxy > 0)
    app.set("trust proxy", trustProxy);
  app.use(securityHeaders);
  // Largest legitimate payload is a vision image data URL (<= 7 MB, see
  // vision/contracts.ts). Everything else is far smaller. Was 50 MB.
  const bodyLimit = process.env.LUMO_BODY_LIMIT || "10mb";
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  const limits = rateLimitConfig();
  const apiLimiter = new FixedWindowRateLimiter({
    windowMs: 60_000,
    max: limits.ipPerMinute,
  });
  const authLimiter = new FixedWindowRateLimiter({
    windowMs: 60_000,
    max: limits.authPerMinute,
  });
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/platform/config.js", (_req, res) => {
    res.set("Cache-Control", "no-store").type("application/javascript").send(publicPlatformScript());
  });
  app.use("/api/oauth", rateLimitMiddleware(authLimiter, "oauth"));
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    rateLimitMiddleware(apiLimiter, "api"),
    originGuard,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number(process.env.PORT || "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  server.on("error", error => { console.error("Server failed:", error.message); process.exit(1); });
  server.listen(port, "0.0.0.0", () => console.log(`Server listening on port ${port}`));
}

startServer().catch(error => { console.error(error); process.exit(1); });
