import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
  it("connects every LUMO workspace screen", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    for (const path of [
      "/chat",
      "/voice",
      "/vision",
      "/tools",
      "/settings",
      "/auth",
      "/workspaces/code",
      "/workspaces/browser",
      "/workspaces/files",
      "/workspaces/study",
    ]) {
      expect(router.matchRoutes(path).at(-1)?.routeId).toBe(path);
    }
    expect(router.matchRoutes("/workspaces").at(-1)?.routeId).toBe("/workspaces/");
  });
});
