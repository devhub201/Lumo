import { lumoLogger } from "../logger";
import { ToolExecutor } from "./executor";
import { AllowlistToolPermissions } from "./permissions";
import { InMemoryToolRegistry } from "./registry";
import type { ToolSystem } from "./contracts";
import type { ToolDefinition } from "./contracts";
import { createToolRouter } from "../routing";
import { utilityTools } from "./utility";
import { createWebSearchTool } from "./web-search";
import { fileTools } from "../files";
import { visionTools } from "../vision";

export const lumoToolRegistry = new InMemoryToolRegistry();
export const lumoToolPermissions = new AllowlistToolPermissions([
  "network",
  "files",
  "vision",
  "camera",
]);
lumoToolRegistry.register(createWebSearchTool());
for (const tool of utilityTools)
  lumoToolRegistry.register(tool as ToolDefinition);
for (const tool of fileTools) lumoToolRegistry.register(tool as ToolDefinition);
for (const tool of visionTools)
  lumoToolRegistry.register(tool as ToolDefinition);
export const lumoToolExecutor = new ToolExecutor(
  lumoToolRegistry,
  lumoToolPermissions,
  lumoLogger
);

export const lumoToolRouter = createToolRouter({
  registry: lumoToolRegistry,
  permissions: lumoToolPermissions,
});

export const lumoToolSystem: ToolSystem = {
  execute: input => lumoToolExecutor.execute(input),
  listTools: () => lumoToolRegistry.listPublic(),
};
