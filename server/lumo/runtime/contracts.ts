import { z } from "zod";
export const runtimeCapabilitySchema = z.enum([
  "shell",
  "filesystem",
  "processes",
  "network",
  "package_management",
  "git",
]);
export type RuntimeCapability = z.infer<typeof runtimeCapabilitySchema>;
export const runtimeStatusSchema = z.enum([
  "unknown",
  "offline",
  "ready",
  "busy",
  "error",
]);
export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>;
export const runtimeTargetSchema = z.object({
  id: z.string().min(1).max(80),
  provider: z.string().min(1).max(80),
  displayName: z.string().min(1).max(120),
  connectionState: runtimeStatusSchema,
  capabilities: z.array(runtimeCapabilitySchema),
  authorized: z.boolean(),
  metadata: z.record(z.string().max(200), z.string().max(200)).default({}),
});
export type RuntimeTarget = z.infer<typeof runtimeTargetSchema>;
export const runtimeCommandSchema = z
  .object({
    kind: z.enum([
      "status",
      "pwd",
      "echo",
      "list",
      "project_test",
      "project_build",
      "project_lint",
      // Real, unrestricted shell execution inside the sandbox workspace —
      // this is what backs the Coding/Terminal screen's "full shell" access.
      "exec",
    ]),
    args: z.array(z.string().max(300)).max(4).default([]),
    // The raw shell line for the "exec" kind. Not whitelisted — Peter asked
    // for genuine terminal access, so this runs whatever is given, scoped
    // to the sandbox workspace directory rather than the Lumo server's own
    // source tree.
    command: z.string().max(4000).optional(),
    cwd: z.string().min(1).max(500).default("/workspace"),
    timeoutMs: z.number().int().min(50).max(120000).default(10000),
    maxOutputChars: z.number().int().min(100).max(20000).default(8000),
  })
  .superRefine((command, ctx) => {
    if (command.cwd.includes("..") || command.cwd.includes("\\"))
      ctx.addIssue({ code: "custom", message: "unsafe working directory" });
    if (command.kind === "echo" && command.args.length > 1)
      ctx.addIssue({ code: "custom", message: "echo accepts one argument" });
    if (command.kind === "exec" && !command.command?.trim())
      ctx.addIssue({ code: "custom", message: "exec requires a command" });
  });
export type RuntimeCommand = z.infer<typeof runtimeCommandSchema>;
export type RuntimeExecution = {
  id: string;
  targetId: string;
  command: RuntimeCommand;
  state: "running" | "completed" | "failed" | "cancelled";
  startedAt: number;
  finishedAt?: number;
};
export type RuntimeResult = {
  executionId: string;
  targetId: string;
  state: "completed" | "failed" | "cancelled";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  resourceMetadata: Record<string, string>;
};
export interface RuntimeProvider {
  status(target: RuntimeTarget): Promise<RuntimeStatus>;
  execute(
    target: RuntimeTarget,
    command: RuntimeCommand,
    input?: { signal?: AbortSignal }
  ): Promise<RuntimeResult>;
}
