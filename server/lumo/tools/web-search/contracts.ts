import { z } from "zod";

export const searchFreshnessSchema = z.enum(["any", "today", "week", "month"]);
export type SearchFreshness = z.infer<typeof searchFreshnessSchema>;

export const webSearchInputSchema = z.object({
  query: z.string().trim().min(1).max(500),
  freshness: searchFreshnessSchema.optional().default("any"),
  limit: z.number().int().min(1).max(10).optional().default(5),
});
export type WebSearchInput = z.infer<typeof webSearchInputSchema>;

export const searchResultSchema = z.object({
  title: z.string().min(1).max(500),
  url: z
    .string()
    .url()
    .refine(value => /^https?:\/\//i.test(value)),
  domain: z.string().min(1).max(253),
  snippet: z.string().max(2000),
  publicationDate: z.string().datetime().nullable(),
  source: z.object({
    provider: z.string().min(1).max(120),
    attributionUrl: z.string().url(),
  }),
});
export type SearchResult = z.infer<typeof searchResultSchema>;

export const webSearchOutputSchema = z.object({
  query: z.string(),
  results: z.array(searchResultSchema).max(10),
  total: z.number().int().min(0).max(10),
  freshness: z.object({
    requested: searchFreshnessSchema,
    applied: searchFreshnessSchema,
    guaranteed: z.boolean(),
    limitation: z.string().nullable(),
  }),
  provider: z.string().min(1).max(120),
});
export type WebSearchOutput = z.infer<typeof webSearchOutputSchema>;

export type SearchProviderRequest = WebSearchInput;

export interface SearchProvider {
  readonly name: string;
  search(request: SearchProviderRequest): Promise<WebSearchOutput>;
}
