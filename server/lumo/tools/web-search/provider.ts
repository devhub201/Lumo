import { z } from "zod";
import { normalizeFault } from "../../faults/normalize";
import {
  searchResultSchema,
  type SearchProvider,
  type SearchProviderRequest,
  type SearchResult,
  type WebSearchOutput,
} from "./contracts";

const DEFAULT_ENDPOINT = "https://lite.duckduckgo.com/lite/";
const DEFAULT_TIMEOUT_MS = 12_000;
const ATTRIBUTION_URL = "https://duckduckgo.com/";

const decodeHtml = (value: string) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/\s+/g, " ")
    .trim();

const freshnessParam = (freshness: SearchProviderRequest["freshness"]) => {
  if (freshness === "today") return "d";
  if (freshness === "week") return "w";
  if (freshness === "month") return "m";
  return undefined;
};

const safeUrl = (value: string): URL | null => {
  try {
    const parsed = new URL(value, "https://duckduckgo.com");
    if (parsed.pathname === "/l/" && parsed.searchParams.has("uddg")) {
      return safeUrl(parsed.searchParams.get("uddg") ?? "");
    }
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const parseDate = (value: string | undefined) => {
  if (!value) return null;
  const timestamp = Date.parse(value.trim());
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
};

const parseResults = (html: string, limit: number): SearchResult[] => {
  const results: SearchResult[] = [];
  const anchorPattern =
    /<a\b([^>]*class=['"]result-link['"][^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while (results.length < limit && (match = anchorPattern.exec(html))) {
    const hrefMatch = match[1].match(/href=['"]([^'"]+)['"]/i);
    const url = hrefMatch ? safeUrl(hrefMatch[1]) : null;
    const title = decodeHtml(match[2]);
    if (!url || !title) continue;
    const following = html.slice(
      match.index + match[0].length,
      match.index + match[0].length + 1800
    );
    const snippetMatch = following.match(
      /class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/i
    );
    const timestampMatch = following.match(
      /class=['"]timestamp['"][^>]*>([\s\S]*?)<\/span>/i
    );
    const snippet = snippetMatch ? decodeHtml(snippetMatch[1]) : "";
    const candidate = {
      title: title.slice(0, 500),
      url: url.toString(),
      domain: url.hostname.toLowerCase().replace(/^www\./, ""),
      snippet: snippet.slice(0, 2000),
      publicationDate: parseDate(timestampMatch?.[1]),
      source: { provider: "DuckDuckGo Lite", attributionUrl: ATTRIBUTION_URL },
    };
    const parsed = searchResultSchema.safeParse(candidate);
    if (parsed.success) results.push(parsed.data);
  }
  return results;
};

export class DuckDuckGoLiteProvider implements SearchProvider {
  readonly name = "DuckDuckGo Lite";

  constructor(
    private readonly options: { endpoint?: string; timeoutMs?: number } = {}
  ) {}

  async search(request: SearchProviderRequest): Promise<WebSearchOutput> {
    const parsedRequest = {
      ...request,
      query: request.query.trim(),
      freshness: request.freshness ?? "any",
      limit: request.limit ?? 5,
    };
    if (!parsedRequest.query) {
      throw Object.assign(new Error("search query is empty"), {
        code: "validation_error",
        retryable: false,
      });
    }
    const url = new URL(this.options.endpoint ?? DEFAULT_ENDPOINT);
    url.searchParams.set("q", parsedRequest.query);
    const applied = parsedRequest.freshness;
    const df = freshnessParam(applied);
    if (df) url.searchParams.set("df", df);

    const controller = new AbortController();
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await Promise.race([
        fetch(url, {
          headers: {
            accept: "text/html",
            "user-agent": "LUMO/8.0 web search",
          },
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                Object.assign(new Error("search provider timed out"), {
                  name: "AbortError",
                })
              ),
            timeoutMs
          )
        ),
      ]);
      if (!response.ok) {
        throw Object.assign(
          new Error(`search provider returned HTTP ${response.status}`),
          {
            code:
              response.status === 429 ? "rate_limit_error" : "provider_error",
            retryable: response.status >= 500 || response.status === 429,
            status: response.status,
          }
        );
      }
      const html = await response.text();
      if (!html || !html.includes("result-link")) {
        if (/no results|no relevant results|did not match/i.test(html)) {
          return {
            query: parsedRequest.query,
            results: [],
            total: 0,
            freshness: {
              requested: parsedRequest.freshness,
              applied,
              guaranteed: false,
              limitation:
                applied === "any"
                  ? null
                  : "The provider applies a recency filter, but LUMO cannot guarantee publication recency for every result.",
            },
            provider: this.name,
          };
        }
        throw Object.assign(
          new Error("search provider returned malformed results"),
          {
            code: "provider_error",
            retryable: true,
          }
        );
      }
      const results = parseResults(html, parsedRequest.limit);
      return {
        query: parsedRequest.query,
        results,
        total: results.length,
        freshness: {
          requested: parsedRequest.freshness,
          applied,
          guaranteed: false,
          limitation:
            applied === "any"
              ? null
              : "The provider applies a recency filter, but LUMO cannot guarantee publication recency for every result.",
        },
        provider: this.name,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw Object.assign(new Error("search provider timed out"), {
          code: "timeout_error",
          retryable: true,
        });
      }
      const fault = normalizeFault(error, { category: "network" });
      throw Object.assign(new Error(fault.internalMessage), {
        code: fault.code === "unexpected" ? "network_error" : fault.code,
        retryable: fault.retryable,
        status: (error as { status?: number })?.status,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
