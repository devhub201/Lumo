import { nanoid } from "nanoid";
import { normalizeFault } from "../faults/normalize";
import {
  extractCandidates,
  hasUnsupportedCapability,
  isDirectResponse,
  toolIsAvailable,
} from "./extractors";
import type {
  ClarificationDecision,
  RouteDecision,
  RouteRequest,
  RouterDependencies,
  ToolCallDecision,
  ToolPlan,
  ToolRouter,
  UnsupportedDecision,
} from "./contracts";

const emptyPlan = [] as [];
const fingerprint = (toolId: string, args: unknown) =>
  `${toolId}:${JSON.stringify(args)}`;

const baseDiagnostics = (
  requestId: string,
  status: RouteDecision["diagnostics"]["status"]
): RouteDecision["diagnostics"] => ({
  requestId,
  status,
  validation: "not_run",
  permission: "not_run",
  selectedToolId: null,
  planLength: 0,
});

const direct = (requestId: string): RouteDecision => ({
  type: "direct_response",
  confidence: "high",
  reason:
    "The request is conversational or explanatory and does not require an external capability.",
  plan: emptyPlan,
  diagnostics: baseDiagnostics(requestId, "direct"),
});

const clarification = (
  requestId: string,
  message: string,
  status: RouteDecision["diagnostics"]["status"] = "clarification"
): ClarificationDecision => ({
  type: "clarification_required",
  confidence: "low",
  reason:
    "The request is missing information needed to prepare a safe tool call.",
  clarification: message,
  plan: emptyPlan,
  diagnostics: baseDiagnostics(requestId, status),
});

const unsupported = (
  requestId: string,
  message: string,
  status: RouteDecision["diagnostics"]["status"] = "unsupported"
): UnsupportedDecision => ({
  type: "unsupported_request",
  confidence: "low",
  reason: message,
  plan: emptyPlan,
  diagnostics: baseDiagnostics(requestId, status),
});

export class DeterministicToolRouter implements ToolRouter {
  constructor(private readonly dependencies: RouterDependencies) {}

  async route(input: RouteRequest): Promise<RouteDecision> {
    try {
      return await this.routeInternal(input);
    } catch (error) {
      return safeRoutingFault(error, input.requestId);
    }
  }

  private async routeInternal(input: RouteRequest): Promise<RouteDecision> {
    const text = input.text.trim();
    if (!text)
      return clarification(input.requestId, "What would you like LUMO to do?");
    if (input.routingDepth && input.routingDepth > 0)
      return clarification(
        input.requestId,
        "I need a fresh request before planning another tool call.",
        "loop_blocked"
      );
    if (
      input.previousFingerprints?.length &&
      input.previousFingerprints.length >= 4
    )
      return clarification(
        input.requestId,
        "I stopped repeated tool planning for safety.",
        "loop_blocked"
      );
    if (isDirectResponse(text)) return direct(input.requestId);
    if (hasUnsupportedCapability(text))
      return unsupported(input.requestId, "I don't have that capability yet.");

    const candidates = extractCandidates(text, input.context);
    if (!candidates.length) {
      if (/\b(?:calculate|compute|evaluate)\b/i.test(text))
        return clarification(
          input.requestId,
          "What expression should I calculate?"
        );
      if (/\bconvert\b/i.test(text))
        return clarification(
          input.requestId,
          "Which value and target unit should I use?"
        );
      return direct(input.requestId);
    }
    const candidate = candidates[0];
    if (candidate.arguments === null) {
      const prompts: Record<string, string> = {
        calculator: "What expression should I calculate?",
        unit_converter: "Which value and target unit should I use?",
        statistics: "Which numbers and statistics operation should I use?",
        datetime_utility:
          "Which dates, timestamp, or duration should I use? Include an explicit timezone for dates.",
        web_search: "What topic should I search for?",
      };
      return clarification(
        input.requestId,
        prompts[candidate.toolId] ?? "Please provide the missing details."
      );
    }

    const tool = this.dependencies.registry.get(candidate.toolId);
    if (!tool || !toolIsAvailable(this.dependencies.registry, candidate.toolId))
      return unsupported(
        input.requestId,
        "I don't have that capability available yet.",
        "tool_unavailable"
      );

    const parsed = tool.inputSchema.safeParse(candidate.arguments);
    if (!parsed.success)
      return clarification(
        input.requestId,
        "I need a more specific value or format before I can use that tool."
      );

    const planFingerprint = fingerprint(tool.id, parsed.data);
    if (input.previousFingerprints?.includes(planFingerprint))
      return clarification(
        input.requestId,
        "I stopped a repeated tool call for safety.",
        "loop_blocked"
      );

    for (const permission of tool.permissions) {
      if (
        !(await this.dependencies.permissions.canUse(
          input.ownerKey,
          permission
        ))
      ) {
        return unsupported(
          input.requestId,
          "That capability is not permitted for this request.",
          "permission_denied"
        );
      }
    }

    const plan: ToolPlan = {
      toolId: tool.id,
      arguments: parsed.data,
      requestId: nanoid(12),
      depth: 0,
      fingerprint: planFingerprint,
    };
    const decision: ToolCallDecision = {
      type: "tool_call",
      toolId: tool.id,
      arguments: parsed.data,
      confidence: candidate.confidence,
      reason: candidate.reason,
      plan: [plan],
      diagnostics: {
        requestId: input.requestId,
        status: "prepared",
        validation: "passed",
        permission: "passed",
        selectedToolId: tool.id,
        planLength: 1,
      },
    };
    return decision;
  }
}

export const createToolRouter = (dependencies: RouterDependencies) =>
  new DeterministicToolRouter(dependencies);

export const safeRoutingFault = (error: unknown, requestId: string) => {
  const fault = normalizeFault(error, {
    requestId,
    category: "tool",
    retryable: false,
  });
  return {
    type: "unsupported_request" as const,
    confidence: "low" as const,
    reason: fault.userMessage,
    plan: emptyPlan,
    diagnostics: {
      requestId,
      status: "unsupported" as const,
      validation: "failed" as const,
      permission: "not_run" as const,
      selectedToolId: null,
      planLength: 0,
    },
  };
};
