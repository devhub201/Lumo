import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  MAX_FILE_BYTES,
  MAX_READ_CHARS,
  SUPPORTED_FILE_TYPES,
  fileNameSchema,
  type FileMetadata,
  type SupportedFileType,
} from "./contracts";

const MIME: Record<SupportedFileType, string> = {
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  csv: "text/csv",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};
const extensionOf = (name: string): SupportedFileType => {
  const extension = path
    .extname(name)
    .slice(1)
    .toLowerCase() as SupportedFileType;
  if (!SUPPORTED_FILE_TYPES.includes(extension))
    throw new Error(
      "Unsupported file type. Use TXT, Markdown, JSON, CSV, PDF, or DOCX."
    );
  return extension;
};
const ownerDirectory = (ownerKey: string) =>
  createHash("sha256").update(ownerKey).digest("hex").slice(0, 32);
const root = () =>
  path.resolve(
    process.env.LUMO_FILES_ROOT || path.join(process.cwd(), ".lumo-workspaces")
  );
const workspacePath = (ownerKey: string) =>
  path.join(root(), ownerDirectory(ownerKey));
const manifestPath = (ownerKey: string) =>
  path.join(workspacePath(ownerKey), "manifest.json");
const safeId = (id: string) => /^file_[a-zA-Z0-9_-]{10,40}$/.test(id);
const now = () => new Date().toISOString();
const digest = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");

const readManifest = async (ownerKey: string): Promise<FileMetadata[]> => {
  try {
    return JSON.parse(
      await readFile(manifestPath(ownerKey), "utf8")
    ) as FileMetadata[];
  } catch {
    return [];
  }
};
const writeManifest = async (ownerKey: string, files: FileMetadata[]) => {
  await mkdir(workspacePath(ownerKey), { recursive: true });
  await writeFile(
    manifestPath(ownerKey),
    JSON.stringify(files, null, 2),
    "utf8"
  );
};
const validateContent = (content: string) => {
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES)
    throw new Error("File content exceeds the 1 MB limit.");
  if (content.includes("\u0000"))
    throw new Error("File content contains an unsafe null byte.");
};
const resolveRecord = async (ownerKey: string, fileId: string) => {
  if (!safeId(fileId)) throw new Error("File identity is invalid.");
  const record = (await readManifest(ownerKey)).find(
    file => file.id === fileId
  );
  if (!record) throw new Error("File was not found in this workspace.");
  return record;
};
const dataPath = (ownerKey: string, file: FileMetadata) =>
  path.join(workspacePath(ownerKey), `${file.id}.${file.type}`);
const isImage = (type: SupportedFileType) =>
  ["png", "jpg", "jpeg", "webp", "gif"].includes(type);

const extractDocx = (buffer: Buffer) => {
  const xml = execFileSync("unzip", ["-p", "/dev/stdin", "word/document.xml"], {
    input: buffer,
    maxBuffer: MAX_FILE_BYTES * 3,
    timeout: 5_000,
  }).toString("utf8");
  return xml
    .replace(/<w:tab\s*\/?\s*>/g, "\t")
    .replace(/<w:br\s*\/?\s*>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
};
const extractPdf = (buffer: Buffer) =>
  execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", "-", "-"], {
    input: buffer,
    maxBuffer: MAX_FILE_BYTES * 3,
    timeout: 5_000,
  })
    .toString("utf8")
    .trim();
const decodeContent = (file: FileMetadata, buffer: Buffer) => {
  if (file.type === "pdf") return extractPdf(buffer);
  if (file.type === "docx") return extractDocx(buffer);
  return buffer.toString("utf8");
};

export class ManagedFileWorkspace {
  async list(
    ownerKey: string,
    filters: { prefix?: string; type?: SupportedFileType; limit: number }
  ) {
    const files = (await readManifest(ownerKey)).filter(
      file =>
        (!filters.prefix || file.name.startsWith(filters.prefix)) &&
        (!filters.type || file.type === filters.type)
    );
    return { files: files.slice(0, filters.limit), total: files.length };
  }
  async metadata(ownerKey: string, fileId: string) {
    return resolveRecord(ownerKey, fileId);
  }
  async read(ownerKey: string, fileId: string, maxChars = MAX_READ_CHARS) {
    const file = await resolveRecord(ownerKey, fileId);
    if (isImage(file.type))
      throw new Error(
        "Image files must be passed through the vision input adapter."
      );
    const content = decodeContent(
      file,
      await readFile(dataPath(ownerKey, file))
    );
    return {
      ...file,
      content: content.slice(0, maxChars),
      truncated: content.length > maxChars,
      contentTrust: "untrusted_document_data" as const,
    };
  }
  async readBinary(ownerKey: string, fileId: string) {
    const file = await resolveRecord(ownerKey, fileId);
    if (!isImage(file.type))
      throw new Error("The managed file is not an image.");
    const bytes = await readFile(dataPath(ownerKey, file));
    if (bytes.length > MAX_FILE_BYTES)
      throw new Error("Managed image exceeds the 1 MB workspace limit.");
    return { file, bytes };
  }
  async search(
    ownerKey: string,
    query: string,
    filters: { type?: SupportedFileType; limit: number }
  ) {
    const files = (await readManifest(ownerKey)).filter(
      file => !filters.type || file.type === filters.type
    );
    const needle = query.toLocaleLowerCase();
    const results = [] as Array<{
      file: FileMetadata;
      matches: Array<{ line: number; excerpt: string }>;
    }>;
    for (const file of files) {
      const content = decodeContent(
        file,
        await readFile(dataPath(ownerKey, file))
      );
      const matches = content
        .split(/\r?\n/)
        .map((line, index) => ({
          line: index + 1,
          excerpt: line.trim().slice(0, 400),
        }))
        .filter(item => item.excerpt.toLocaleLowerCase().includes(needle))
        .slice(0, 10);
      if (matches.length) results.push({ file, matches });
      if (results.length >= filters.limit) break;
    }
    return { query, results, truncated: results.length >= filters.limit };
  }
  async save(
    ownerKey: string,
    input: {
      fileId?: string;
      name?: string;
      content: string;
      overwrite: boolean;
    }
  ) {
    validateContent(input.content);
    let files = await readManifest(ownerKey);
    const existing = input.fileId
      ? await resolveRecord(ownerKey, input.fileId)
      : input.name
        ? files.find(file => file.name === input.name)
        : undefined;
    if (existing && !input.overwrite && !input.fileId)
      throw new Error(
        "A file with this name already exists; set overwrite to true."
      );
    const name = input.name || existing?.name;
    if (!name) throw new Error("A file name is required when creating a file.");
    fileNameSchema.parse(name);
    const type = extensionOf(name);
    if (isImage(type))
      throw new Error(
        "Binary image content must use the controlled image upload adapter."
      );
    if (existing && existing.type !== type)
      throw new Error("File type cannot change during an update.");
    const file: FileMetadata = existing
      ? {
          ...existing,
          sizeBytes: Buffer.byteLength(input.content, "utf8"),
          contentHash: digest(input.content),
          updatedAt: now(),
        }
      : {
          id: `file_${randomBytes(12).toString("base64url")}`,
          ownerKey,
          name,
          type,
          mimeType: MIME[type],
          sizeBytes: Buffer.byteLength(input.content, "utf8"),
          contentHash: digest(input.content),
          createdAt: now(),
          updatedAt: now(),
        };
    await mkdir(workspacePath(ownerKey), { recursive: true });
    await writeFile(dataPath(ownerKey, file), input.content, "utf8");
    files = existing
      ? files.map(item => (item.id === file.id ? file : item))
      : [file, ...files];
    await writeManifest(ownerKey, files);
    return file;
  }
  async saveBinary(
    ownerKey: string,
    input: { name: string; bytes: Buffer; overwrite: boolean }
  ) {
    if (input.bytes.length > MAX_FILE_BYTES)
      throw new Error("File content exceeds the 1 MB limit.");
    fileNameSchema.parse(input.name);
    const type = extensionOf(input.name);
    if (!isImage(type))
      throw new Error("Binary upload is limited to image files.");
    const files = await readManifest(ownerKey);
    const existing = files.find(file => file.name === input.name);
    if (existing && !input.overwrite)
      throw new Error(
        "A file with this name already exists; set overwrite to true."
      );
    const file: FileMetadata = existing
      ? {
          ...existing,
          sizeBytes: input.bytes.length,
          contentHash: digest(input.bytes),
          updatedAt: now(),
        }
      : {
          id: `file_${randomBytes(12).toString("base64url")}`,
          ownerKey,
          name: input.name,
          type,
          mimeType: MIME[type],
          sizeBytes: input.bytes.length,
          contentHash: digest(input.bytes),
          createdAt: now(),
          updatedAt: now(),
        };
    await mkdir(workspacePath(ownerKey), { recursive: true });
    await writeFile(dataPath(ownerKey, file), input.bytes);
    await writeManifest(
      ownerKey,
      existing
        ? files.map(item => (item.id === file.id ? file : item))
        : [file, ...files]
    );
    return file;
  }
  async create(
    ownerKey: string,
    input: { name: string; content: string; overwrite: boolean }
  ) {
    return this.save(ownerKey, input);
  }
}

export const managedFileWorkspace = new ManagedFileWorkspace();
