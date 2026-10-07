import { z } from "zod";

export const calculatorInputSchema = z.object({
  expression: z.string().trim().min(1).max(300),
});
export const calculatorOutputSchema = z.object({
  expression: z.string(),
  value: z.number().finite(),
});
export type CalculatorInput = z.infer<typeof calculatorInputSchema>;
export type CalculatorOutput = z.infer<typeof calculatorOutputSchema>;

export const unitConverterInputSchema = z.object({
  value: z.number().finite(),
  from: z.string().trim().min(1).max(20),
  to: z.string().trim().min(1).max(20),
});
export const unitConverterOutputSchema = z.object({
  value: z.number().finite(),
  from: z.string(),
  convertedValue: z.number().finite(),
  to: z.string(),
  category: z.enum(["length", "mass", "temperature", "time", "data"]),
});
export type UnitConverterInput = z.infer<typeof unitConverterInputSchema>;
export type UnitConverterOutput = z.infer<typeof unitConverterOutputSchema>;

export const statisticsInputSchema = z.object({
  operation: z.enum([
    "sum",
    "mean",
    "average",
    "min",
    "max",
    "median",
    "count",
  ]),
  values: z.array(z.number().finite()).min(1).max(10_000),
});
export const statisticsOutputSchema = z.object({
  operation: z.string(),
  count: z.number().int().nonnegative(),
  result: z.number().finite(),
});
export type StatisticsInput = z.infer<typeof statisticsInputSchema>;
export type StatisticsOutput = z.infer<typeof statisticsOutputSchema>;

export const datetimeInputSchema = z.object({
  operation: z.enum(["difference", "add_days", "timestamp", "duration"]),
  start: z.string().trim().max(100).optional(),
  end: z.string().trim().max(100).optional(),
  date: z.string().trim().max(100).optional(),
  days: z.number().finite().optional(),
  timestamp: z.number().finite().optional(),
  seconds: z.number().finite().optional(),
  timezone: z.string().trim().max(80).optional(),
});
export const datetimeOutputSchema = z.object({
  operation: z.string(),
  result: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  timezone: z.string().nullable(),
});
export type DatetimeInput = z.infer<typeof datetimeInputSchema>;
export type DatetimeOutput = z.infer<typeof datetimeOutputSchema>;

export const UTILITY_TOOL_IDS = [
  "calculator",
  "unit_converter",
  "statistics",
  "datetime_utility",
] as const;
export type UtilityToolId = (typeof UTILITY_TOOL_IDS)[number];
