import type { ToolDefinition } from "../contracts";
import { calculate } from "./calculator";
import { convertUnits } from "./converter";
import { calculateDatetime } from "./datetime";
import { calculateStatistics } from "./statistics";
import {
  calculatorInputSchema,
  calculatorOutputSchema,
  datetimeInputSchema,
  datetimeOutputSchema,
  statisticsInputSchema,
  statisticsOutputSchema,
  unitConverterInputSchema,
  unitConverterOutputSchema,
  type CalculatorInput,
  type CalculatorOutput,
  type DatetimeInput,
  type DatetimeOutput,
  type StatisticsInput,
  type StatisticsOutput,
  type UnitConverterInput,
  type UnitConverterOutput,
} from "./contracts";

export const calculatorTool: ToolDefinition<CalculatorInput, CalculatorOutput> =
  {
    id: "calculator",
    name: "Calculator",
    description:
      "Evaluate a bounded mathematical expression deterministically without code execution or network access.",
    category: "productivity",
    inputSchema: calculatorInputSchema,
    outputSchema: calculatorOutputSchema,
    permissions: [],
    enabled: true,
    handler: input => calculate(input),
  };

export const unitConverterTool: ToolDefinition<
  UnitConverterInput,
  UnitConverterOutput
> = {
  id: "unit_converter",
  name: "Unit Converter",
  description:
    "Convert compatible length, mass, temperature, time, or data units using explicit deterministic rules.",
  category: "productivity",
  inputSchema: unitConverterInputSchema,
  outputSchema: unitConverterOutputSchema,
  permissions: [],
  enabled: true,
  handler: input => convertUnits(input),
};

export const statisticsTool: ToolDefinition<StatisticsInput, StatisticsOutput> =
  {
    id: "statistics",
    name: "Statistics",
    description:
      "Calculate deterministic sum, mean, minimum, maximum, median, or count over finite numbers.",
    category: "data",
    inputSchema: statisticsInputSchema,
    outputSchema: statisticsOutputSchema,
    permissions: [],
    enabled: true,
    handler: input => calculateStatistics(input),
  };

export const datetimeUtilityTool: ToolDefinition<
  DatetimeInput,
  DatetimeOutput
> = {
  id: "datetime_utility",
  name: "Date and Time Utility",
  description:
    "Perform bounded timezone-explicit date differences, day arithmetic, timestamp conversion, and duration calculations.",
  category: "productivity",
  inputSchema: datetimeInputSchema,
  outputSchema: datetimeOutputSchema,
  permissions: [],
  enabled: true,
  handler: input => calculateDatetime(input),
};

export const utilityTools = [
  calculatorTool,
  unitConverterTool,
  statisticsTool,
  datetimeUtilityTool,
] as const;
