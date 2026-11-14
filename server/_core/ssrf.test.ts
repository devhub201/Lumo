import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SsrfBlockedError,
  assertPublicHttpUrl,
  isBlockedIp,
  safeFetch,
} from "./ssrf";

describe("isBlockedIp", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "2002:7f00:1::1",
    "64:ff9b::7f00:1",
    "2001:db8::1",
    "not-an-ip",
  ])("blocks %s", address => {
    expect(isBlockedIp(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "172.15.255.255",
    "172.32.0.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])("allows public address %s", address => {
    expect(isBlockedIp(address)).toBe(false);
  });
});

describe("assertPublicHttpUrl", () => {
  it.each([
    "file:///etc/passwd",
    "ftp://example.com/",
    "gopher://example.com/",
    "javascript:alert(1)",
    "http://localhost/",
    "http://LOCALHOST:3000/",
    "http://localhost./",
    "http://app.localhost/",
    "http://printer.local/",
    "http://metadata.google.internal/",
    "http://127.0.0.1/",
    "http://127.1/",
    "http://2130706433/",
    "http://0x7f.0.0.1/",
    "http://0177.0.0.1/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5:8080/admin",
    "http://user:pass@example.com/",
    "not a url",
  ])("rejects %s", raw => {
    expect(() => assertPublicHttpUrl(raw)).toThrow(SsrfBlockedError);
  });

  it("accepts ordinary public URLs", () => {
    expect(assertPublicHttpUrl("https://example.com/a?b=1").hostname).toBe(
      "example.com"
    );
    expect(assertPublicHttpUrl("http://8.8.8.8/").hostname).toBe("8.8.8.8");
  });
});

describe("safeFetch", () => {
  let server: http.Server;
  let port = 0;
  let hits = 0;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits += 1;
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "http://127.0.0.1/secret" });
        res.end();
        return;
      }
      if (req.url === "/big") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("x".repeat(100_000));
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("hello");
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  it("never connects to a loopback literal address", async () => {
    hits = 0;
    await expect(safeFetch(`http://127.0.0.1:${port}/`)).rejects.toThrow(
      SsrfBlockedError
    );
    expect(hits).toBe(0);
  });

  it("blocks a hostname that resolves to a private address (DNS rebinding)", async () => {
    hits = 0;
    await expect(
      safeFetch(`http://rebind.example.test:${port}/`, {
        lookupImpl: (_host, _opts, callback) =>
          callback(null, [{ address: "127.0.0.1", family: 4 }]),
      })
    ).rejects.toThrow(/Blocked destination/);
    expect(hits).toBe(0);
  });

  it("blocks when any resolved address is private", async () => {
    hits = 0;
    await expect(
      safeFetch(`http://mixed.example.test:${port}/`, {
        lookupImpl: (_host, _opts, callback) =>
          callback(null, [
            { address: "93.184.216.34", family: 4 },
            { address: "10.0.0.1", family: 4 },
          ]),
      })
    ).rejects.toThrow(/Blocked destination/);
    expect(hits).toBe(0);
  });

  // The next tests use the private-network test seam so they can talk to the
  // local test server. Application code never sets that option.
  it("returns the body and truncates at maxBytes", async () => {
    const result = await safeFetch(`http://127.0.0.1:${port}/big`, {
      maxBytes: 1000,
      __unsafeAllowPrivateNetworkForTests: true,
    });
    expect(result.status).toBe(200);
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBeLessThanOrEqual(1000);
  });

  it("does not follow redirects", async () => {
    hits = 0;
    const result = await safeFetch(`http://127.0.0.1:${port}/redirect`, {
      __unsafeAllowPrivateNetworkForTests: true,
    });
    expect(result.status).toBe(302);
    expect(result.headers.location).toBe("http://127.0.0.1/secret");
    expect(hits).toBe(1);
  });
});
