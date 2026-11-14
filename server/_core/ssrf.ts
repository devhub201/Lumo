/**
 * SSRF protection for every server-side fetch of a user- or model-supplied URL.
 *
 * Design:
 *  - Only http/https, no embedded credentials, no `localhost`-style names.
 *  - The destination IP is validated at connect time through a custom `lookup`
 *    function, so the address that is actually connected to is the address that
 *    was checked (no DNS-rebinding window between "check" and "use").
 *  - Redirects are never followed here; the caller sees the 3xx status and
 *    decides (the browser workspace requires explicit navigation).
 *  - Response size and total time are bounded.
 *
 * Uses only Node built-ins so it adds no dependency.
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

export class SsrfBlockedError extends Error {
  readonly code = "ssrf_blocked";
  constructor(reason: string) {
    super(`Blocked destination: ${reason}`);
    this.name = "SsrfBlockedError";
  }
}

const ipv4ToInt = (address: string): number | null => {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value;
};

// [network, prefixLength] — every range that is not public unicast.
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

const isBlockedV4 = (address: string): boolean => {
  const value = ipv4ToInt(address);
  if (value === null) return true; // unparsable => refuse
  return BLOCKED_V4.some(([network, prefix]) => {
    const base = ipv4ToInt(network) as number;
    const size = 2 ** (32 - prefix);
    return value >= base && value < base + size;
  });
};

/** Parses an IPv6 literal into eight 16-bit groups, or null if invalid. */
const parseIpv6 = (input: string): number[] | null => {
  let address = input;
  const zone = address.indexOf("%");
  if (zone !== -1) address = address.slice(0, zone);
  if (!net.isIPv6(address)) return null;

  // Convert an embedded dotted IPv4 tail (::ffff:1.2.3.4) into two groups.
  const lastColon = address.lastIndexOf(":");
  const tail = address.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = ipv4ToInt(tail);
    if (v4 === null) return null;
    const hi = ((v4 >>> 16) & 0xffff).toString(16);
    const lo = (v4 & 0xffff).toString(16);
    address = `${address.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = [
    ...head,
    ...(halves.length === 2 ? Array(missing).fill("0") : []),
    ...rest,
  ];
  if (groups.length !== 8) return null;
  const numbers = groups.map(group => parseInt(group, 16));
  return numbers.some(n => !Number.isInteger(n) || n < 0 || n > 0xffff)
    ? null
    : numbers;
};

const v4FromGroups = (hi: number, lo: number) =>
  `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;

const isBlockedV6 = (address: string): boolean => {
  const g = parseIpv6(address);
  if (!g) return true;
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d
  if (g.slice(0, 5).every(n => n === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return isBlockedV4(v4FromGroups(g[6], g[7]));
  }
  // NAT64 well-known prefix 64:ff9b::/96 embeds an IPv4 address.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(n => n === 0)) {
    return isBlockedV4(v4FromGroups(g[6], g[7]));
  }
  // 6to4 2002::/16 embeds an IPv4 address in groups 1-2.
  if (g[0] === 0x2002) return isBlockedV4(v4FromGroups(g[1], g[2]));
  // Only global unicast 2000::/3 is allowed beyond this point.
  if ((g[0] & 0xe000) !== 0x2000) return true;
  // Teredo 2001::/32 and documentation 2001:db8::/32.
  if (g[0] === 0x2001 && (g[1] === 0x0000 || g[1] === 0x0db8)) return true;
  return false;
};

/** True when the address is anything other than public unicast. */
export const isBlockedIp = (address: string): boolean => {
  if (net.isIPv4(address)) return isBlockedV4(address);
  if (net.isIPv6(address.split("%")[0])) return isBlockedV6(address);
  return true;
};

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".home.arpa",
];

/**
 * Validates syntax and literal-address destinations. Hostnames that resolve to
 * a blocked address are rejected later, at connect time (see safeFetch).
 */
export const assertPublicHttpUrl = (raw: string): URL => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfBlockedError("invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new SsrfBlockedError("only http and https are allowed");
  if (url.username || url.password)
    throw new SsrfBlockedError("credentials in URL are not allowed");
  // WHATWG URL already normalises decimal/octal/hex IPv4 forms to dotted form.
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host) throw new SsrfBlockedError("missing host");
  if (net.isIP(host)) {
    if (isBlockedIp(host)) throw new SsrfBlockedError("non-public IP address");
    return url;
  }
  const bare = host.endsWith(".") ? host.slice(0, -1) : host;
  if (
    bare === "localhost" ||
    BLOCKED_HOST_SUFFIXES.some(suffix => bare.endsWith(suffix))
  )
    throw new SsrfBlockedError("internal hostname");
  return url;
};

type LookupImpl = (
  hostname: string,
  options: { all: true },
  callback: (
    error: NodeJS.ErrnoException | null,
    addresses: dns.LookupAddress[]
  ) => void
) => void;

export type SafeFetchOptions = {
  maxBytes?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Test seam: replaces dns.lookup. The result is still validated. */
  lookupImpl?: LookupImpl;
  /** Test seam only. Never set from application code. */
  __unsafeAllowPrivateNetworkForTests?: boolean;
};

export type SafeFetchResult = {
  status: number;
  body: string;
  truncated: boolean;
  headers: Record<string, string>;
};

export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const allowPrivate = options.__unsafeAllowPrivateNetworkForTests === true;
  const url = allowPrivate ? new URL(rawUrl) : assertPublicHttpUrl(rawUrl);
  const maxBytes = Math.max(1, Math.min(options.maxBytes ?? 200_000, 5_000_000));
  const timeoutMs = Math.max(500, Math.min(options.timeoutMs ?? 15_000, 60_000));
  const resolve: LookupImpl =
    options.lookupImpl ??
    ((hostname, opts, callback) => dns.lookup(hostname, opts, callback));

  // Called by net.connect for the real connection, so the validated address is
  // the address used.
  const guardedLookup = ((
    hostname: string,
    lookupOptions: { all?: boolean; family?: number },
    callback: (...args: unknown[]) => void
  ) => {
    resolve(hostname, { all: true }, (error, addresses) => {
      if (error) return callback(error);
      if (!addresses.length) return callback(new Error("no address found"));
      if (!allowPrivate && addresses.some(entry => isBlockedIp(entry.address)))
        return callback(new SsrfBlockedError("resolves to a non-public IP"));
      if (lookupOptions && lookupOptions.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  }) as unknown as net.LookupFunction;

  const client = url.protocol === "https:" ? https : http;

  return await new Promise<SafeFetchResult>((resolvePromise, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const request = client.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        headers: {
          "user-agent": "LUMO-Browser/1.0",
          accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
          "accept-encoding": "identity",
          ...(options.headers ?? {}),
        },
      },
      response => {
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        response.on("data", (chunk: Buffer) => {
          if (truncated) return;
          const remaining = maxBytes - size;
          if (chunk.length >= remaining) {
            chunks.push(chunk.subarray(0, remaining));
            size = maxBytes;
            truncated = true;
            response.destroy();
            return;
          }
          chunks.push(chunk);
          size += chunk.length;
        });
        const done = () =>
          finish(() =>
            resolvePromise({
              status: response.statusCode ?? 0,
              body: Buffer.concat(chunks).toString("utf8"),
              truncated,
              headers: Object.fromEntries(
                Object.entries(response.headers).map(([key, value]) => [
                  key,
                  Array.isArray(value) ? value.join(", ") : String(value ?? ""),
                ])
              ),
            })
          );
        response.on("end", done);
        response.on("close", done);
        response.on("error", error => {
          // Destroying the stream after the size cap can surface as an abort.
          if (truncated) return done();
          finish(() => reject(error));
        });
      }
    );
    const timer = setTimeout(() => {
      request.destroy(new Error("Request timed out"));
    }, timeoutMs);
    request.on("error", error => finish(() => reject(error)));
    request.end();
  });
}
