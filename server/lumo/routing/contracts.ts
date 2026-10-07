import type { ToolPermissionChecker, ToolRegistry } from "../tools/contracts";

export type RoutingDecisionType =
  | "direct_response"
  | "tool_call"
  | "clarification_required"
  | "unsupported_request";

export type RoutingConfidence = "high" | "medium" | "low";
export type RoutingStatus =
  | "direct"
  | "prepared"
  | "clarification"
  | "unsupported"
  | "tool_unavailable"
  | "permission_denied"
  | "loop_blocked";

export type RoutingDiagnostics = {
  requestId: string;
  status: RoutingStatus;
  validation: "not_run" | "passed" | "failed";
  permission: "not_run" | "passed" | "denied";
  selectedToolId: string | null;
  planLength: number;
};

export type RoutingContext = {
  recentMessages?: Array<{ role: string; content: string }>;
  summary?: string | null;
};

export type ToolPlan = {
  toolId: string;
  arguments: unknown;
  requestId: string;
  depth: 0;
  fingerprint: string;
};

export type RouteRequest = {
  text: string;
  ownerKey: string;
  requestId: string;
  context?: RoutingContext;
  routingDepth?: number;
  previousFingerprints?: string[];
};

type BaseDecision = {
  type: RoutingDecisionType;
  confidence: RoutingConfidence;
  reason: string;
  diagnostics: RoutingDiagnostics;
};

export type DirectResponseDecision = BaseDecision & {
  type: "direct_response";
  plan: [];
};

export type ToolCallDecision = BaseDecision & {
  type: "tool_call";
  toolId: string;
  arguments: unknown;
  plan: ToolPlan[];
};

export type ClarificationDecision = BaseDecision & {
  type: "clarification_required";
  clarification: string;
  plan: [];
};

export type UnsupportedDecision = BaseDecision & {
  type: "unsupported_request";
  plan: [];
};

export type RouteDecision =
  | DirectResponseDecision
  | ToolCallDecision
  | ClarificationDecision
  | UnsupportedDecision;

export interface ToolRouter {
  route(input: RouteRequest): Promise<RouteDecision>;
}

export type RouterDependencies = {
  registry: ToolRegistry;
  permissions: ToolPermissionChecker;
};
