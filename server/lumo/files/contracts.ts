import { z } from "zod";

export const SUPPORTED_FILE_TYPES = [
  "txt",
  "md",
  "json",
  "csv",
  "pdf",
  "docx",
] as const;
export type SupportedFileType = (typeof SUPPORTED_FILE_TYPES)[number];

export const MAX_FILE_BYTES = 1_000_000;
export const MAX_READ_CHARS = 12_000;
export const MAX_SEARCH_RESULTS = 20;
export const MAX_SEARCH_QUERY = 200;
export const FILE_TOOL_IDS = [
  "file_list",
  "file_read",
  "file_search",
  "document_summarize",
  "document_extract",
  "document_create",
  "file_save",
  "file_metadata",
] as const;

export const fileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine(
    name => !name.includes("/") && !name.includes("\\"),
    "File names may not contain path separators."
  )
  .refine(
    name => !name.startsWith(".") && !/[\u0000-\u001f]/.test(name),
    "File name is not safe."
  );

export const fileTypeSchema = z.enum(SUPPORTED_FILE_TYPES);

export const fileIdSchema = z.string().regex(/^file_[a-zA-Z0-9_-]{10,40}$/);

export type FileMetadata = {
  id: string;
  ownerKey: string;
  name: string;
  type: SupportedFileType;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
};

export type FileListOutput = { files: FileMetadata[]; total: number };
export type FileReadOutput = FileMetadata & {
  content: string;
  truncated: boolean;
  contentTrust: "untrusted_document_data";
};
export type FileSearchMatch = {
  file: FileMetadata;
  matches: Array<{ line: number; excerpt: string }>;
};
export type FileSearchOutput = {
  query: string;
  results: FileSearchMatch[];
  truncated: boolean;
};
export type DocumentSummaryOutput = FileMetadata & {
  summary: string;
  sourceCharacters: number;
  contentTrust: "untrusted_document_data";
};
export type DocumentExtractOutput = FileReadOutput & {
  format: SupportedFileType;
};

export const fileListInputSchema = z.object({
  prefix: z.string().trim().max(80).optional(),
  type: fileTypeSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const fileReadInputSchema = z.object({
  fileId: fileIdSchema,
  maxChars: z.number().int().min(1).max(MAX_READ_CHARS).default(MAX_READ_CHARS),
});
export const fileSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(MAX_SEARCH_QUERY),
  type: fileTypeSchema.optional(),
  limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).default(10),
});
export const documentSummarizeInputSchema = z.object({
  fileId: fileIdSchema,
  maxChars: z.number().int().min(500).max(4_000).default(2_000),
});
export const documentExtractInputSchema = z.object({
  fileId: fileIdSchema,
  maxChars: z.number().int().min(1).max(MAX_READ_CHARS).default(MAX_READ_CHARS),
});
export const documentCreateInputSchema = z.object({
  name: fileNameSchema,
  content: z.string().max(MAX_FILE_BYTES),
  overwrite: z.boolean().default(false),
});
export const fileSaveInputSchema = z
  .object({
    fileId: fileIdSchema.optional(),
    name: fileNameSchema.optional(),
    content: z.string().max(MAX_FILE_BYTES),
    overwrite: z.boolean().default(false),
  })
  .refine(
    input => Boolean(input.fileId || input.name),
    "fileId or name is required"
  );
export const fileMetadataInputSchema = z.object({ fileId: fileIdSchema });
