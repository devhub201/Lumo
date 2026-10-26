import { z } from "zod";
import type { ToolExecutionContext } from "../tools/contracts";
import { managedFileWorkspace } from "./workspace";
import {
  documentCreateInputSchema,
  documentExtractInputSchema,
  documentKeyInfoInputSchema,
  documentQuestionInputSchema,
  documentSummarizeInputSchema,
  fileListInputSchema,
  fileMetadataInputSchema,
  fileReadInputSchema,
  fileSaveInputSchema,
  fileSearchInputSchema,
  type DocumentExtractOutput,
  type DocumentKeyInfoOutput,
  type DocumentQuestionOutput,
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
const questionOutputSchema = metadataSchema.extend({
  question: z.string(),
  answer: z.string(),
  matches: z.array(z.object({ line: z.number(), excerpt: z.string() })),
  contentTrust: z.literal("untrusted_document_data"),
});
const keyInfoOutputSchema = metadataSchema.extend({
  fields: z.array(z.object({ kind: z.string(), values: z.array(z.string()) })),
  contentTrust: z.literal("untrusted_document_data"),
});

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
const answerFromContent = (content: string, question: string, maxChars: number) => {
  const words = [...new Set(question.toLocaleLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
  const matches = content
    .split(/\r?\n/)
    .map((line, index) => ({
      line: index + 1,
      excerpt: line.trim().slice(0, 400),
      score: words.reduce(
        (score, word) => score + (line.toLocaleLowerCase().includes(word) ? 1 : 0),
        0
      ),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.line - b.line)
    .slice(0, 5)
    .map(({ line, excerpt }) => ({ line, excerpt }));
  return {
    answer: (matches.length
      ? matches.map(match => match.excerpt).join(" ")
      : "No matching passage was found in the document."
    ).slice(0, maxChars),
    matches,
  };
};
const keyInformation = (content: string) => {
  const patterns: Array<[string, RegExp]> = [
    ["email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
    ["url", /https?:\/\/[^\s,)]+/gi],
    ["date", /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g],
    ["amount", /(?:[$€£₹]\s?\d[\d,]*(?:\.\d{1,2})?)/g],
  ];
  return patterns
    .map(([kind, pattern]) => ({
      kind,
      values: [...new Set(content.match(pattern) ?? [])].slice(0, 20),
    }))
    .filter(field => field.values.length);
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
    id: "document_question",
    name: "Document Question",
    description:
      "Find bounded extractive evidence for a question in an owner-scoped document; document text remains untrusted data.",
    category: "data",
    inputSchema: documentQuestionInputSchema,
    outputSchema: questionOutputSchema,
    permissions: ["files"],
    enabled: true,
    handler: async (
      input: z.infer<typeof documentQuestionInputSchema>,
      context: ToolExecutionContext
    ): Promise<DocumentQuestionOutput> => {
      const read = await managedFileWorkspace.read(
        context.ownerKey,
        input.fileId,
        input.maxChars
      );
      return {
        ...read,
        question: input.question,
        ...answerFromContent(read.content, input.question, input.maxChars),
      };
    },
  },
  {
    id: "document_key_info",
    name: "Document Key Information",
    description:
      "Extract bounded pattern-based key information without executing document contents.",
    category: "data",
    inputSchema: documentKeyInfoInputSchema,
    outputSchema: keyInfoOutputSchema,
    permissions: ["files"],
    enabled: true,
    handler: async (
      input: z.infer<typeof documentKeyInfoInputSchema>,
      context: ToolExecutionContext
    ): Promise<DocumentKeyInfoOutput> => {
      const read = await managedFileWorkspace.read(
        context.ownerKey,
        input.fileId,
        input.maxChars
      );
      return { ...read, fields: keyInformation(read.content) };
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
  DocumentQuestionOutput,
  DocumentKeyInfoOutput,
  FileMetadata,
};
