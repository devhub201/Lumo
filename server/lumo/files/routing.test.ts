import { describe, expect, it } from "vitest";
import { DeterministicToolRouter } from "../routing/router";
import { AllowlistToolPermissions } from "../tools/permissions";
import { InMemoryToolRegistry } from "../tools/registry";
import { fileTools } from "./tools";

describe("Phase 11 deterministic file routing", () => {
  const makeRouter = () => {
    const registry = new InMemoryToolRegistry();
    for (const tool of fileTools) registry.register(tool as never);
    return new DeterministicToolRouter({
      registry,
      permissions: new AllowlistToolPermissions(["files"]),
    });
  };
  it("routes bounded file list, search, read, extract, and summarize requests", async () => {
    const router = makeRouter();
    expect(
      (
        await router.route({
          text: "List my files",
          ownerKey: "peter",
          requestId: "r1",
        })
      ).toolId
    ).toBe("file_list");
    expect(
      (
        await router.route({
          text: "Search files for roadmap",
          ownerKey: "peter",
          requestId: "r2",
        })
      ).toolId
    ).toBe("file_search");
    expect(
      (
        await router.route({
          text: "Read file file_1234567890",
          ownerKey: "peter",
          requestId: "r3",
        })
      ).toolId
    ).toBe("file_read");
    expect(
      (
        await router.route({
          text: "Extract file file_1234567890",
          ownerKey: "peter",
          requestId: "r4",
        })
      ).toolId
    ).toBe("document_extract");
    expect(
      (
        await router.route({
          text: "Summarize file file_1234567890",
          ownerKey: "peter",
          requestId: "r5",
        })
      ).toolId
    ).toBe("document_summarize");
    expect(
      (
        await router.route({
          text: "Extract key information from file file_1234567890",
          ownerKey: "peter",
          requestId: "r6",
        })
      ).toolId
    ).toBe("document_key_info");
    expect(
      (
        await router.route({
          text: "What is the renewal date in file file_1234567890?",
          ownerKey: "peter",
          requestId: "r7",
        })
      ).toolId
    ).toBe("document_question");
  });
  it("does not route a missing file search query by guessing", async () => {
    expect(
      await makeRouter().route({
        text: "Search files",
        ownerKey: "peter",
        requestId: "r8",
      })
    ).toMatchObject({ type: "clarification_required" });
  });
});
