import { createHash, randomBytes } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
  rm,
  rename,
} from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import { PermissionManager } from "../security/permissions";
import { requireSensitiveAuthorization } from "../security/safety";
import {
  codeContentSchema,
  projectNameSchema,
  relativePathSchema,
  type CodeChange,
  type Diagnostic,
  type WorkspaceProject,
  type WorkspaceSnapshot,
} from "./contracts";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const ownerHash = (v: string) => hash(v).slice(0, 20);
const root = () =>
  path.resolve(
    process.env.LUMO_CODE_ROOT ||
      path.join(process.cwd(), ".lumo-code-workspaces")
  );
const language = (file: string) =>
  ({
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
  })[path.extname(file).slice(1).toLowerCase()] || "text";
export class CodeWorkspaceManager {
  constructor(private readonly permissions: PermissionManager) {}
  private projectRoot(owner: string, id: string) {
    if (!/^project_[A-Za-z0-9_-]{8,40}$/.test(id))
      throw new Error("Invalid project identity.");
    return path.join(root(), ownerHash(owner), id);
  }
  private safe(owner: string, id: string, file: string) {
    relativePathSchema.parse(file);
    const base = this.projectRoot(owner, id);
    const target = path.resolve(base, file);
    if (target !== base && !target.startsWith(`${base}${path.sep}`))
      throw new Error("Workspace path escapes project root.");
    return target;
  }
  private async allowed(owner: string, action = "write", auth?: any) {
    if (!this.permissions.evaluate(owner, "files").allowed)
      throw new Error("Workspace file permission denied.");
    if (
      action === "delete" &&
      !requireSensitiveAuthorization(auth, "delete_workspace_file")
    )
      throw new Error("Sensitive authorization required.");
  }
  async createProject(owner: string, name: string) {
    await this.allowed(owner, "read");
    projectNameSchema.parse(name);
    const id = `project_${randomBytes(8).toString("base64url")}`;
    const project: WorkspaceProject = {
      id,
      workspaceId: `code_${ownerHash(owner)}`,
      name,
      root: id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "open",
    };
    await mkdir(this.projectRoot(owner, id), { recursive: true });
    await writeFile(
      path.join(this.projectRoot(owner, id), ".project.json"),
      JSON.stringify(project)
    );
    return project;
  }
  async openProject(owner: string, id: string) {
    await this.allowed(owner, "read");
    const value = JSON.parse(
      await readFile(
        path.join(this.projectRoot(owner, id), ".project.json"),
        "utf8"
      )
    ) as WorkspaceProject;
    return value;
  }
  async list(owner: string) {
    await this.allowed(owner, "read");
    const base = path.join(root(), ownerHash(owner));
    try {
      const entries = await readdir(base, { withFileTypes: true });
      return Promise.all(
        entries
          .filter(e => e.isDirectory())
          .map(e => this.openProject(owner, e.name))
      );
    } catch {
      return [];
    }
  }
  async listDirectory(owner: string, id: string, dir = ".") {
    await this.allowed(owner, "read");
    const target = this.safe(owner, id, dir);
    const entries = await readdir(target, { withFileTypes: true });
    return {
      path: dir,
      entries: entries.filter(e => e.name !== ".project.json").map(e => e.name),
    };
  }
  async readFile(owner: string, id: string, file: string) {
    await this.allowed(owner, "read");
    const target = this.safe(owner, id, file);
    const content = await readFile(target, "utf8");
    return {
      path: file,
      content: content.slice(0, 1_000_000),
      truncated: content.length > 1_000_000,
      hash: hash(content),
      language: language(file),
    };
  }
  async writeFile(
    owner: string,
    id: string,
    file: string,
    content: string,
    kind: CodeChange["kind"] = "edit"
  ) {
    await this.allowed(owner);
    relativePathSchema.parse(file);
    codeContentSchema.parse(content);
    const target = this.safe(owner, id, file);
    let before: string | undefined;
    try {
      before = hash(await readFile(target, "utf8"));
    } catch {}
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    return {
      operationId: nanoid(12),
      projectId: id,
      files: [file],
      kind,
      beforeHash: before,
      afterHash: hash(content),
      timestamp: Date.now(),
      diagnostics: [] as Diagnostic[],
    };
  }
  async applyPatch(
    owner: string,
    id: string,
    patch: { path: string; beforeHash?: string; content: string }
  ) {
    const current = await this.readFile(owner, id, patch.path).catch(
      () => null
    );
    if (patch.beforeHash && current?.hash !== patch.beforeHash)
      throw new Error("Patch base changed; refusing blind overwrite.");
    return this.writeFile(owner, id, patch.path, patch.content, "edit");
  }
  async deleteFile(
    owner: string,
    id: string,
    file: string,
    authorization?: any
  ) {
    await this.allowed(owner, "delete", authorization);
    await rm(this.safe(owner, id, file));
    return {
      operationId: nanoid(12),
      projectId: id,
      files: [file],
      kind: "delete" as const,
      timestamp: Date.now(),
      diagnostics: [] as Diagnostic[],
    };
  }
  async rename(owner: string, id: string, from: string, to: string) {
    await this.allowed(owner);
    const source = this.safe(owner, id, from);
    const target = this.safe(owner, id, to);
    await mkdir(path.dirname(target), { recursive: true });
    await rename(source, target);
    return {
      operationId: nanoid(12),
      projectId: id,
      files: [from, to],
      kind: "rename" as const,
      timestamp: Date.now(),
      diagnostics: [] as Diagnostic[],
    };
  }
  async makeDirectory(owner: string, id: string, dir: string) {
    await this.allowed(owner);
    await mkdir(this.safe(owner, id, dir), { recursive: true });
    return {
      operationId: nanoid(12),
      projectId: id,
      files: [dir],
      kind: "mkdir" as const,
      timestamp: Date.now(),
      diagnostics: [] as Diagnostic[],
    };
  }
  async snapshot(owner: string, id: string): Promise<WorkspaceSnapshot> {
    await this.allowed(owner, "read");
    const files: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (entry.name === ".project.json") continue;
        const relative = path.relative(
          this.projectRoot(owner, id),
          path.join(dir, entry.name)
        );
        if (entry.isDirectory()) await walk(path.join(dir, entry.name));
        else files.push(relative);
      }
    };
    await walk(this.projectRoot(owner, id));
    return {
      id: `snapshot_${nanoid(10)}`,
      projectId: id,
      files: await Promise.all(
        files.map(async file => {
          const content = (await this.readFile(owner, id, file)).content;
          return { path: file, hash: hash(content), content };
        })
      ),
      createdAt: Date.now(),
    };
  }
  async diff(owner: string, id: string, snapshot: WorkspaceSnapshot) {
    await this.allowed(owner, "read");
    const current = await this.snapshot(owner, id);
    const before = new Map(snapshot.files.map(f => [f.path, f.hash]));
    return {
      added: current.files.filter(f => !before.has(f.path)).map(f => f.path),
      changed: current.files
        .filter(f => before.get(f.path) && before.get(f.path) !== f.hash)
        .map(f => f.path),
      removed: snapshot.files
        .filter(f => !current.files.some(c => c.path === f.path))
        .map(f => f.path),
    };
  }
  async analyze(owner: string, id: string) {
    await this.allowed(owner, "read");
    const snapshot = await this.snapshot(owner, id);
    const diagnostics: Diagnostic[] = [];
    const packageFiles = snapshot.files.filter(f =>
      /^(package\.json|tsconfig\.json|pyproject\.toml|requirements\.txt|vite\.config\.|README)/i.test(
        path.basename(f.path)
      )
    );
    return {
      projectId: id,
      files: snapshot.files.map(f => f.path),
      languages: [...new Set(snapshot.files.map(f => language(f.path)))],
      packageFiles,
      entryPoints: snapshot.files.filter(f =>
        /^(src\/)?(main|index|app)\./i.test(f.path)
      ),
      diagnostics,
    };
  }
}
export const createCodeWorkspace = (permissions: PermissionManager) =>
  new CodeWorkspaceManager(permissions);
