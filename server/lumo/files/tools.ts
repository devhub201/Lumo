import { z } from "zod";
import type { ToolExecutionContext } from "../tools/contracts";
import { managedFileWorkspace } from "./workspace";
import {
  documentCreateInputSchema,
  documentExtractInputSchema,
  documentSummarizeInputSchema,
  fileListInputSchema,
  fileMetadataInputSchema,
  fileReadInputSchema,
  fileSaveInputSchema,
  fileSearchInputSchema,
  type DocumentExtractOutput,
  type DocumentSummaryOutput,
  type FileListOutput,
  type FileReadOutput,
  type FileSearchOutput,
  type FileMetadata,
} from "./contracts";

const metadataSchema = z.object({
  id: z.string(),
  ownerKey: z.string(),
  name: z.string(),
  type: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  contentHash: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const listOutputSchema = z.object({
  files: z.array(metadataSchema),
  total: z.number(),
});
const readOutputSchema = metadataSchema.extend({
  content: z.string(),
  truncated: z.boolean(),
  contentTrust: z.literal("untrusted_document_data"),
});
const searchOutputSchema = z.object({
  query: z.string(),
  results: z.array(
    z.object({
      file: metadataSchema,
      matches: z.array(z.object({ line: z.number(), excerpt: z.string() })),
    })
  ),
  truncated: z.boolean(),
});
const summaryOutputSchema = metadataSchema.extend({
  summary: z.string(),
  sourceCharacters: z.number(),
  contentTrust: z.literal("untrusted_document_data"),
});
const createOutputSchema = metadataSchema;

const summarize = (content: string, maxChars: number) => {
  const sentences = content
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const selected: string[] = [];
  for (const sentence of sentences) {
    if ((selected.join(" ") + " " + sentence).trim().length > maxChars) break;
    selected.push(sentence);
  }
  return (
    selected.join(" ") || content.replace(/\s+/g, " ").trim().slice(0, maxChars)
  ).trim();
};

export const fileTools = [
  {
    id: "file_list",
    name: "File List",
    description: "List files in the owner-scoped managed document workspace.",
    category: "data",
    inputSchema: fileListInputSchema,
    outputSchema: listOutputSchema,
    permissions: ["files"],
    enabled: true,
    handler: (
      input: z.infer<typeof fileListInputSchema>,
      context: ToolExecutionContext
    ) => managedFileWorkspace.list(context.ownerKey, input),
  },
  {
    id: "file_read",
    name: "File Read",
    description:
      "Read a bounded, owner-scoped document as untrusted document data.",
    category: "data",
    inputSchema: fileReadInputSchema,
    outputSchema: readOutputSchema,
    permissions: ["files"],
    enabled: true,
    handler: (
      input: z.infer<typeof fileReadInputSchema>,
      context: ToolExecutionContext
    ) =>
      managedFileWorkspace.read(context.ownerKey, input.fileId, input.maxChars),
  },
  {
    id: "file_search",
    name: "File Search",
    description:
      "Search bounded document text within the owner-scoped workspace.",
    category: "data",
    inputSchema: fileSearchInputSchema,
    outputSchema: searchOutputSchema,
    permissions: ["files"],
    enabled: true,
    handler: (
      input: z.infer<typeof fileSearchInputSchema>,
      context: ToolExecutionContext
    ) => managedFileWorkspace.search(context.ownerKey, input.query, input),
  },
  {
    id: "document_summarize",
    name: "Document Summarize",
    description:
      "Create a bounded deterministic summary of untrusted document content.",
    category: "data",
    inputSchema: documentSummarizeInputSchema,
    outputSchema: summaryOutputSchema,
    permissions: ["files"],
    enabled: true,
    handler: async (
      input: z.infer<typeof documentSummarizeInputSchema>,
      context: ToolExecutionContext
    ) => {
      const read = await managedFileWorkspace.read(
        context.ownerKey,
        input.fileId,
        20_000
      );
      return {
        ...read,
        summary: summarize(read.content, input.maxChars),
        sourceCharacters: read.content.length,
      };
    },
  },
  {
    id: "document_extract",
    name: "Document Extract",
    description:
      "Extract bounded text from TXT, Markdown, JSON, CSV, PDF, or DOCX documents.",
    category: "data",
    inputSchema: documentExtractInputSchema,
    outputSchema: readOutputSchema.extend({
      format: z.enum(["txt", "md", "json", "csv", "pdf", "docx"]),
    }),
    permissions: ["files"],
    enabled: true,
    handler: async (
      input: z.infer<typeof documentExtractInputSchema>,
      context: ToolExecutionContext
    ) => {
      const read = await managedFileWorkspace.read(
        context.ownerKey,
        input.fileId,
        input.maxChars
      );
      return { ...read, format: read.type };
    },
  },
  {
    id: "document_create",
    name: "Document Create",
    description:
      "Create a validated document in the owner-scoped managed workspace.",
    category: "data",
    inputSchema: documentCreateInputSchema,
    outputSchema: createOutputSchema,
    permissions: ["files"],
    enabled: true,
    handler: (
      input: z.infer<typeof documentCreateInputSchema>,
      context: ToolExecutionContext
    ) => managedFileWorkspace.create(context.ownerKey, input),
  },
  {
    id: "file_save",
    name: "File Save",
    description:
      "Save or update validated document content in the owner-scoped managed workspace.",
    category: "data",
    inputSchema: fileSaveInputSchema,
    outputSchema: createOutputSchema,
    permissions: ["files"],
    enabled: true,
    handler: (
      input: z.infer<typeof fileSaveInputSchema>,
      context: ToolExecutionContext
    ) => managedFileWorkspace.save(context.ownerKey, input),
  },
  {
    id: "file_metadata",
    name: "File Metadata",
    description:
      "Return stable identity and safe metadata for an owner-scoped file.",
    category: "data",
    inputSchema: fileMetadataInputSchema,
    outputSchema: metadataSchema,
    permissions: ["files"],
    enabled: true,
    handler: (
      input: z.infer<typeof fileMetadataInputSchema>,
      context: ToolExecutionContext
    ) => managedFileWorkspace.metadata(context.ownerKey, input.fileId),
  },
];

export type {
  DocumentExtractOutput,
  DocumentSummaryOutput,
  FileListOutput,
  FileReadOutput,
  FileSearchOutput,
  FileMetadata,
};
