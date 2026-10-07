import type {
  PublicToolMetadata,
  ToolDefinition,
  ToolRegistry,
} from "./contracts";

const assertToolId = (toolId: string) => {
  if (!/^[a-z][a-z0-9._-]{1,80}$/.test(toolId)) {
    throw new Error(
      "Tool IDs must be lowercase and use only letters, numbers, dots, underscores, or hyphens."
    );
  }
};

const toPublicMetadata = (tool: ToolDefinition): PublicToolMetadata => ({
  id: tool.id,
  name: tool.name,
  description: tool.description,
  category: tool.category,
  permissions: [...tool.permissions],
  enabled: tool.enabled,
});

export class InMemoryToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>) {
    assertToolId(tool.id);
    if (!tool.name.trim() || !tool.description.trim()) {
      throw new Error("Tools must have a name and description.");
    }
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool ${tool.id} is already registered.`);
    }
    this.tools.set(tool.id, {
      ...(tool as ToolDefinition),
      permissions: [...tool.permissions],
    });
  }

  get(toolId: string) {
    return this.tools.get(toolId);
  }

  list() {
    return [...this.tools.values()];
  }

  listPublic() {
    return this.list().map(toPublicMetadata);
  }

  setEnabled(toolId: string, enabled: boolean) {
    const tool = this.tools.get(toolId);
    if (!tool) throw new Error(`Tool ${toolId} is not registered.`);
    tool.enabled = enabled;
  }
}
