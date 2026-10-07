import {
  statisticsInputSchema,
  statisticsOutputSchema,
  type StatisticsInput,
  type StatisticsOutput,
} from "./contracts";

class StatisticsFault extends Error {
  readonly code = "validation_error";
  readonly retryable = false;
}

export const calculateStatistics = (
  input: StatisticsInput
): StatisticsOutput => {
  const parsed = statisticsInputSchema.parse(input);
  const values = parsed.values;
  const sum = values.reduce((total, value) => total + value, 0);
  if (!Number.isFinite(sum))
    throw new StatisticsFault("The values exceed the supported numeric range.");
  let result: number;
  switch (parsed.operation) {
    case "sum":
      result = sum;
      break;
    case "mean":
    case "average":
      result = sum / values.length;
      break;
    case "min":
      result = Math.min(...values);
      break;
    case "max":
      result = Math.max(...values);
      break;
    case "median": {
      const sorted = [...values].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      result =
        sorted.length % 2
          ? sorted[middle]
          : (sorted[middle - 1] + sorted[middle]) / 2;
      break;
    }
    case "count":
      result = values.length;
      break;
  }
  return statisticsOutputSchema.parse({
    operation: parsed.operation,
    count: values.length,
    result,
  });
};
