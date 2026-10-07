import {
  unitConverterInputSchema,
  unitConverterOutputSchema,
  type UnitConverterInput,
  type UnitConverterOutput,
} from "./contracts";

type LinearUnit = {
  category: "length" | "mass" | "time" | "data";
  canonical: string;
  factor: number;
};
type TemperatureUnit = { category: "temperature"; canonical: string };
type Unit = LinearUnit | TemperatureUnit;

class ConversionFault extends Error {
  readonly code = "validation_error";
  readonly retryable = false;
}

const units: Record<string, Unit> = {
  mm: { category: "length", canonical: "mm", factor: 0.001 },
  millimeter: { category: "length", canonical: "mm", factor: 0.001 },
  millimeters: { category: "length", canonical: "mm", factor: 0.001 },
  cm: { category: "length", canonical: "cm", factor: 0.01 },
  centimeter: { category: "length", canonical: "cm", factor: 0.01 },
  m: { category: "length", canonical: "m", factor: 1 },
  meter: { category: "length", canonical: "m", factor: 1 },
  meters: { category: "length", canonical: "m", factor: 1 },
  km: { category: "length", canonical: "km", factor: 1000 },
  kilometer: { category: "length", canonical: "km", factor: 1000 },
  kilometers: { category: "length", canonical: "km", factor: 1000 },
  inch: { category: "length", canonical: "inch", factor: 0.0254 },
  inches: { category: "length", canonical: "inch", factor: 0.0254 },
  in: { category: "length", canonical: "inch", factor: 0.0254 },
  ft: { category: "length", canonical: "ft", factor: 0.3048 },
  foot: { category: "length", canonical: "ft", factor: 0.3048 },
  feet: { category: "length", canonical: "ft", factor: 0.3048 },
  yd: { category: "length", canonical: "yd", factor: 0.9144 },
  yard: { category: "length", canonical: "yd", factor: 0.9144 },
  mile: { category: "length", canonical: "mile", factor: 1609.344 },
  miles: { category: "length", canonical: "mile", factor: 1609.344 },
  mi: { category: "length", canonical: "mile", factor: 1609.344 },
  mg: { category: "mass", canonical: "mg", factor: 0.000001 },
  g: { category: "mass", canonical: "g", factor: 0.001 },
  gram: { category: "mass", canonical: "g", factor: 0.001 },
  grams: { category: "mass", canonical: "g", factor: 0.001 },
  kg: { category: "mass", canonical: "kg", factor: 1 },
  kilogram: { category: "mass", canonical: "kg", factor: 1 },
  kilograms: { category: "mass", canonical: "kg", factor: 1 },
  oz: { category: "mass", canonical: "oz", factor: 0.028349523125 },
  ounce: { category: "mass", canonical: "oz", factor: 0.028349523125 },
  ounces: { category: "mass", canonical: "oz", factor: 0.028349523125 },
  lb: { category: "mass", canonical: "lb", factor: 0.45359237 },
  pound: { category: "mass", canonical: "lb", factor: 0.45359237 },
  pounds: { category: "mass", canonical: "lb", factor: 0.45359237 },
  c: { category: "temperature", canonical: "celsius" },
  celcius: { category: "temperature", canonical: "celsius" },
  celsius: { category: "temperature", canonical: "celsius" },
  f: { category: "temperature", canonical: "fahrenheit" },
  fahrenheit: { category: "temperature", canonical: "fahrenheit" },
  k: { category: "temperature", canonical: "kelvin" },
  kelvin: { category: "temperature", canonical: "kelvin" },
  ms: { category: "time", canonical: "ms", factor: 0.001 },
  millisecond: { category: "time", canonical: "ms", factor: 0.001 },
  milliseconds: { category: "time", canonical: "ms", factor: 0.001 },
  s: { category: "time", canonical: "seconds", factor: 1 },
  sec: { category: "time", canonical: "seconds", factor: 1 },
  second: { category: "time", canonical: "seconds", factor: 1 },
  seconds: { category: "time", canonical: "seconds", factor: 1 },
  min: { category: "time", canonical: "minutes", factor: 60 },
  minute: { category: "time", canonical: "minutes", factor: 60 },
  minutes: { category: "time", canonical: "minutes", factor: 60 },
  h: { category: "time", canonical: "hours", factor: 3600 },
  hr: { category: "time", canonical: "hours", factor: 3600 },
  hour: { category: "time", canonical: "hours", factor: 3600 },
  hours: { category: "time", canonical: "hours", factor: 3600 },
  d: { category: "time", canonical: "days", factor: 86400 },
  day: { category: "time", canonical: "days", factor: 86400 },
  days: { category: "time", canonical: "days", factor: 86400 },
  byte: { category: "data", canonical: "bytes", factor: 1 },
  bytes: { category: "data", canonical: "bytes", factor: 1 },
  kb: { category: "data", canonical: "KB", factor: 1024 },
  mb: { category: "data", canonical: "MB", factor: 1024 ** 2 },
  gb: { category: "data", canonical: "GB", factor: 1024 ** 3 },
  tb: { category: "data", canonical: "TB", factor: 1024 ** 4 },
};

const fail = (message: string): never => {
  throw new ConversionFault(message);
};

const resolveUnit = (value: string) => {
  const unit = units[value.trim().toLowerCase()];
  if (!unit) fail(`Unsupported unit: ${value}`);
  return unit;
};

const temperatureToCelsius = (value: number, unit: string) => {
  if (unit === "celsius") return value;
  if (unit === "fahrenheit") return (value - 32) * (5 / 9);
  if (unit === "kelvin") return value - 273.15;
  return fail("Unsupported temperature unit.");
};

const celsiusToTemperature = (value: number, unit: string) => {
  if (unit === "celsius") return value;
  if (unit === "fahrenheit") return value * (9 / 5) + 32;
  if (unit === "kelvin") return value + 273.15;
  return fail("Unsupported temperature unit.");
};

export const convertUnits = (
  input: UnitConverterInput
): UnitConverterOutput => {
  const parsed = unitConverterInputSchema.parse(input);
  const from = resolveUnit(parsed.from);
  const to = resolveUnit(parsed.to);
  if (from.category !== to.category)
    fail("The units belong to different conversion categories.");
  let convertedValue: number;
  if (from.category === "temperature" && to.category === "temperature") {
    convertedValue = celsiusToTemperature(
      temperatureToCelsius(parsed.value, from.canonical),
      to.canonical
    );
  } else {
    if (!("factor" in from) || !("factor" in to))
      fail("The conversion rule is unsupported.");
    convertedValue =
      (parsed.value * (from as LinearUnit).factor) / (to as LinearUnit).factor;
  }
  if (!Number.isFinite(convertedValue))
    fail("The conversion exceeded the supported numeric range.");
  return unitConverterOutputSchema.parse({
    value: parsed.value,
    from: from.canonical,
    convertedValue,
    to: to.canonical,
    category: from.category,
  });
};
