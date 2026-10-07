import type { ToolRegistry } from "../tools/contracts";
import type { RoutingContext } from "./contracts";

export type Candidate = {
  toolId: string;
  arguments: unknown;
  confidence: "high" | "medium";
  reason: string;
};

const unitPattern =
  "(?:mm|millimeters?|cm|centimeters?|m|meters?|km|kilometers?|in|inch(?:es)?|ft|feet?|yd|yards?|mi|miles?|mg|milligrams?|g|grams?|kg|kilograms?|oz|ounces?|lb|pounds?|c|celsius|f|fahrenheit|k|kelvin|ms|milliseconds?|s|sec(?:onds?)?|min(?:utes?)?|h|hours?|d|days?|bytes?|kb|mb|gb|tb)";

const compact = (text: string) => text.trim().replace(/\s+/g, " ");
const stripPunctuation = (text: string) =>
  text
    .trim()
    .replace(/[?!.,]+$/g, "")
    .trim();

const normalizeExpression = (text: string) =>
  stripPunctuation(text)
    .replace(/[×x]/g, "*")
    .replace(/÷/g, "/")
    .replace(/\bmultiplied by\b/gi, "*")
    .replace(/\btimes\b/gi, "*")
    .replace(/\bdivided by\b/gi, "/")
    .replace(/\bover\b/gi, "/")
    .replace(/\bplus\b/gi, "+")
    .replace(/\bminus\b/gi, "-")
    .replace(/\s+/g, " ")
    .trim();

const expressionOnly = (value: string) =>
  /^(?:\d+(?:\.\d*)?|\.\d+|sqrt\s*\([^)]*\)|[()+\-*/%^\s.]|of|e)+$/i.test(
    value
  ) &&
  /\d/.test(value) &&
  /[+\-*/%^]|\bof\b/i.test(value);

export const extractCalculator = (text: string): Candidate | null => {
  const normalized = compact(text)
    .replace(/^lumo[:,]?\s*/i, "")
    .replace(/^(?:please\s+)?(?:calculate|compute|evaluate)\s+/i, "")
    .replace(/^(?:what(?:'s| is)|how much is)\s+/i, "");
  const expression = normalizeExpression(normalized);
  if (!expressionOnly(expression)) return null;
  return {
    toolId: "calculator",
    arguments: { expression },
    confidence: "high",
    reason: "The request contains a bounded arithmetic expression.",
  };
};

export const extractUnitConversion = (
  text: string,
  context?: RoutingContext
): Candidate | null => {
  const sourceText = compact(text);
  const match = sourceText.match(
    new RegExp(
      `(-?\\d+(?:\\.\\d+)?)\\s*(${unitPattern})\\s+(?:to|in|into)\\s+(${unitPattern})\\b`,
      "i"
    )
  );
  if (!match && /\b(?:that|it)\b/i.test(sourceText)) {
    const target = sourceText.match(
      new RegExp(`\\b(?:to|in|into)\\s+(${unitPattern})\\b`, "i")
    );
    const prior = recentContext(context).match(
      new RegExp(`(-?\\d+(?:\\.\\d+)?)\\s*(${unitPattern})\\b`, "i")
    );
    if (target && prior) {
      return {
        toolId: "unit_converter",
        arguments: { value: Number(prior[1]), from: prior[2], to: target[1] },
        confidence: "medium",
        reason:
          "The source value was resolved from the selected recent conversation context.",
      };
    }
  }
  if (!match) return null;
  return {
    toolId: "unit_converter",
    arguments: { value: Number(match[1]), from: match[2], to: match[3] },
    confidence: "high",
    reason:
      "The request contains a numeric value and an explicit source and target unit.",
  };
};

const numbersIn = (text: string) =>
  (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);

export const extractStatistics = (text: string): Candidate | null => {
  const lower = text.toLowerCase();
  const operation = lower.match(
    /\b(average|mean|median|minimum|min|max(?:imum)?|sum|count)\b/
  )?.[1];
  if (
    !operation ||
    !/(?:of|from|numbers|values|these|what(?:'s| is)|calculate|compute)/i.test(
      text
    )
  )
    return null;
  const values = numbersIn(text);
  if (!values.length)
    return {
      toolId: "statistics",
      arguments: null,
      confidence: "medium",
      reason:
        "A statistics operation was requested but its numeric values are missing.",
    };
  const canonical =
    operation === "average"
      ? "mean"
      : operation === "minimum"
        ? "min"
        : operation === "maximum"
          ? "max"
          : operation;
  return {
    toolId: "statistics",
    arguments: { operation: canonical, values },
    confidence: "high",
    reason:
      "The request names a statistics operation and provides finite numeric values.",
  };
};

const isoDate = "\\d{4}-\\d{2}-\\d{2}(?:T[^\\s,]+)?";

export const extractDatetime = (text: string): Candidate | null => {
  const lower = text.toLowerCase();
  const dates = text.match(new RegExp(isoDate, "g")) ?? [];
  if (
    /\b(?:how many days|days)\s+between\b|\bdifference between\b/i.test(text)
  ) {
    if (dates.length < 2)
      return {
        toolId: "datetime_utility",
        arguments: null,
        confidence: "medium",
        reason: "A date difference was requested but two dates are missing.",
      };
    return {
      toolId: "datetime_utility",
      arguments: { operation: "difference", start: dates[0], end: dates[1] },
      confidence: "high",
      reason: "The request asks for the difference between two dates.",
    };
  }
  const add = lower.match(
    /\b(?:add|subtract)\s+(-?\d+(?:\.\d+)?)\s+days?\s+(?:to|from)\s+/i
  );
  if (add && dates[0]) {
    const days = Number(add[1]) * (lower.includes("subtract") ? -1 : 1);
    return {
      toolId: "datetime_utility",
      arguments: { operation: "add_days", date: dates[0], days },
      confidence: "high",
      reason: "The request asks for bounded day arithmetic.",
    };
  }
  if (/\b(?:timestamp|unix time|epoch)\b/i.test(text)) {
    const timestamp = numbersIn(text)[0];
    if (timestamp === undefined)
      return {
        toolId: "datetime_utility",
        arguments: null,
        confidence: "medium",
        reason:
          "A timestamp conversion was requested but its value is missing.",
      };
    return {
      toolId: "datetime_utility",
      arguments: { operation: "timestamp", timestamp },
      confidence: "high",
      reason: "The request asks for timestamp conversion.",
    };
  }
  if (/\bduration\b/i.test(text)) {
    const seconds = numbersIn(text)[0];
    if (seconds === undefined)
      return {
        toolId: "datetime_utility",
        arguments: null,
        confidence: "medium",
        reason:
          "A duration calculation was requested but its value is missing.",
      };
    return {
      toolId: "datetime_utility",
      arguments: { operation: "duration", seconds },
      confidence: "medium",
      reason: "The request asks for a duration calculation.",
    };
  }
  return null;
};

const recentContext = (context?: RoutingContext) =>
  (context?.recentMessages ?? [])
    .slice(-4)
    .map(message => message.content)
    .join(" ")
    .trim();

export const extractWebSearch = (
  text: string,
  context?: RoutingContext
): Candidate | null => {
  const lower = text.toLowerCase();
  const explicit = /\b(search|browse|look up|find online|internet|web)\b/i.test(
    text
  );
  const current = /\b(latest|current|today|recent|news|happened)\b/i.test(text);
  if (!explicit && !current) return null;
  if (
    /\b(?:what is|what does|explain)\s+(?:web search|searching|the internet)\b/i.test(
      text
    )
  )
    return null;
  let query = compact(text)
    .replace(/^lumo[:,]?\s*/i, "")
    .replace(
      /^(?:please\s+)?(?:search|browse|look up|find online)\s*(?:the internet|online|the web)?\s*(?:for|about)?\s*/i,
      ""
    )
    .replace(/[?!.,]+$/g, "")
    .trim();
  query = stripPunctuation(query);
  if (!query || /^(?:this|that|it)$/i.test(query))
    query = recentContext(context);
  if (!query || /^(?:this|that|it)$/i.test(query))
    return {
      toolId: "web_search",
      arguments: null,
      confidence: "medium",
      reason: "A search was requested without a searchable subject.",
    };
  return {
    toolId: "web_search",
    arguments: {
      query,
      freshness: current ? (lower.includes("today") ? "today" : "week") : "any",
      limit: 5,
    },
    confidence: explicit ? "high" : "medium",
    reason: "The request asks for current or external information.",
  };
};

const fileIdIn = (text: string) =>
  text.match(/\bfile_[a-zA-Z0-9_-]{10,40}\b/)?.[0];

export const extractVisionRequest = (text: string): Candidate | null => {
  const camera = /\b(?:camera|webcam)\b/i.test(text);
  const visual =
    /\b(?:image|photo|picture|diagram|visual|ocr|image mein|photo mein)\b/i.test(
      text
    );
  if (!camera && !visual) return null;
  if (camera)
    return {
      toolId: "camera_capture",
      arguments: null,
      confidence: "high",
      reason: "Camera analysis requires an explicit user-captured frame.",
    };
  const fileId = fileIdIn(text);
  return {
    toolId: "vision_analyze",
    arguments: fileId
      ? { source: { kind: "managed_file", fileId }, mode: "understand" }
      : null,
    confidence: fileId ? "high" : "medium",
    reason: fileId
      ? "The request names a managed image identity."
      : "The request asks for visual analysis but needs an image input.",
  };
};

export const extractBlueprintRequest = (text: string): Candidate | null => {
  if (
    !/\b(?:blueprint|architecture diagram|system diagram|flowchart|mind map)\b/i.test(
      text
    )
  )
    return null;
  return {
    toolId: "blueprint_create",
    arguments: null,
    confidence: "medium",
    reason: "The request explicitly asks for an informational blueprint.",
  };
};

export const extractFileRequest = (text: string): Candidate | null => {
  const fileId = fileIdIn(text);
  if (/\b(?:list|show)\b.*\b(?:files|documents)\b/i.test(text))
    return {
      toolId: "file_list",
      arguments: { limit: 50 },
      confidence: "high",
      reason: "The request asks for the owner-scoped managed file list.",
    };
  if (/\b(?:search|find)\b.*\b(?:files|documents)\b/i.test(text)) {
    const query = text
      .replace(
        /^.*?\b(?:files|documents)\b\s*(?:for|about|containing)?\s*/i,
        ""
      )
      .replace(/[?!.,]+$/g, "")
      .trim();
    return {
      toolId: "file_search",
      arguments: query ? { query, limit: 10 } : null,
      confidence: "medium",
      reason: "The request asks for bounded search across managed documents.",
    };
  }
  if (
    fileId &&
    /\b(?:read|open|extract|summari[sz]e|summarise)\b/i.test(text)
  ) {
    const toolId = /summari[sz]e|summarise/i.test(text)
      ? "document_summarize"
      : /extract/i.test(text)
        ? "document_extract"
        : "file_read";
    return {
      toolId,
      arguments: { fileId },
      confidence: "high",
      reason: "The request names a stable managed file identity.",
    };
  }
  return null;
};

export const extractCandidates = (
  text: string,
  context?: RoutingContext
): Candidate[] => {
  const candidates = [
    extractCalculator(text),
    extractUnitConversion(text, context),
    extractStatistics(text),
    extractDatetime(text),
    extractVisionRequest(text),
    extractBlueprintRequest(text),
    extractFileRequest(text),
    extractWebSearch(text, context),
  ].filter((candidate): candidate is Candidate => Boolean(candidate));
  return candidates;
};

export const hasUnsupportedCapability = (text: string) =>
  /\b(?:send an? email|play spotify|run (?:a )?command|terminal|control my computer)\b/i.test(
    text
  );

export const isDirectResponse = (text: string) =>
  /^(?:lumo[:,]?\s*)?(?:hello|hi|hey|good morning|good evening)\b/i.test(
    text
  ) ||
  /\b(?:explain|tell me)\s+(?:what\s+)?(?:a )?(?:calculator|web search|photosynthesis)\b/i.test(
    text
  ) ||
  /\b(?:explain|what is|what does)\s+(?:a )?(?:calculator|web search|photosynthesis)\b/i.test(
    text
  ) ||
  /^(?:help me study|tell me about|why is)\b/i.test(text);

export const toolIsAvailable = (registry: ToolRegistry, toolId: string) => {
  const tool = registry.get(toolId);
  return Boolean(tool?.enabled);
};
