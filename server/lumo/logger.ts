export type LumoLogger = {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
};

const safeFields = (fields: Record<string, unknown> = {}) => {
  const clone = { ...fields };
  for (const key of Object.keys(clone)) {
    if (/key|secret|token|prompt|content|authorization/i.test(key)) {
      delete clone[key];
    }
  }
  return clone;
};

const write = (
  level: "info" | "warn" | "error",
  event: string,
  fields?: Record<string, unknown>
) => {
  const record = {
    ts: new Date().toISOString(),
    scope: "lumo",
    level,
    event,
    ...safeFields(fields),
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

export const lumoLogger: LumoLogger = {
  info: (event, fields) => write("info", event, fields),
  warn: (event, fields) => write("warn", event, fields),
  error: (event, fields) => write("error", event, fields),
};
