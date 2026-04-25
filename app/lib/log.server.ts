type LogMeta = Record<string, unknown>;

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function writeLog(
  level: "info" | "warn" | "error",
  message: string,
  meta?: LogMeta,
  error?: unknown,
) {
  const payload = {
    level,
    timestamp: new Date().toISOString(),
    message,
    meta: meta ?? {},
    error: error ? normalizeError(error) : undefined,
  };

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export function logServerInfo(message: string, meta?: LogMeta) {
  writeLog("info", message, meta);
}

export function logServerWarn(message: string, meta?: LogMeta) {
  writeLog("warn", message, meta);
}

export function logServerError(
  message: string,
  error: unknown,
  meta?: LogMeta,
) {
  writeLog("error", message, meta, error);
}