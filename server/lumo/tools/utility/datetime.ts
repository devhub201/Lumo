import {
  datetimeInputSchema,
  datetimeOutputSchema,
  type DatetimeInput,
  type DatetimeOutput,
} from "./contracts";

class DatetimeFault extends Error {
  readonly code = "validation_error";
  readonly retryable = false;
}

const fail = (message: string): never => {
  throw new DatetimeFault(message);
};

const parseDate = (value: string | undefined, field: string) => {
  if (!value) fail(`${field} is required.`);
  const dateValue = value as string;
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(dateValue)) {
    fail(
      `${field} must include an explicit timezone offset, such as Z or +05:30.`
    );
  }
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) fail(`${field} is not a valid date.`);
  return date;
};

const finite = (value: number | undefined, field: string) => {
  if (value === undefined || !Number.isFinite(value))
    fail(`${field} is required and must be finite.`);
  return value as number;
};

export const calculateDatetime = (input: DatetimeInput): DatetimeOutput => {
  const parsed = datetimeInputSchema.parse(input);
  switch (parsed.operation) {
    case "difference": {
      const start = parseDate(parsed.start, "start");
      const end = parseDate(parsed.end, "end");
      const milliseconds = end.getTime() - start.getTime();
      return datetimeOutputSchema.parse({
        operation: parsed.operation,
        result: {
          milliseconds,
          seconds: milliseconds / 1000,
          minutes: milliseconds / 60_000,
          hours: milliseconds / 3_600_000,
          days: milliseconds / 86_400_000,
        },
        timezone: parsed.timezone ?? null,
      });
    }
    case "add_days": {
      const date = parseDate(parsed.date, "date");
      const days = finite(parsed.days, "days");
      const timestamp = date.getTime() + days * 86_400_000;
      if (!Number.isFinite(timestamp))
        fail("The date calculation exceeded the supported range.");
      return datetimeOutputSchema.parse({
        operation: parsed.operation,
        result: { iso: new Date(timestamp).toISOString(), days },
        timezone: parsed.timezone ?? null,
      });
    }
    case "timestamp": {
      const timestamp = finite(parsed.timestamp, "timestamp");
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) fail("The timestamp is invalid.");
      return datetimeOutputSchema.parse({
        operation: parsed.operation,
        result: { iso: date.toISOString(), timestamp },
        timezone: parsed.timezone ?? "UTC",
      });
    }
    case "duration": {
      const seconds = finite(parsed.seconds, "seconds");
      return datetimeOutputSchema.parse({
        operation: parsed.operation,
        result: {
          seconds,
          minutes: seconds / 60,
          hours: seconds / 3600,
          days: seconds / 86400,
        },
        timezone: parsed.timezone ?? null,
      });
    }
  }
};
