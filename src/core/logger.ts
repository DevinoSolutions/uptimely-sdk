/**
 * Optional debug logging with MANDATORY secret redaction (open-api D9):
 * credentials never reach a logger, whatever the caller plugs in. Request and
 * response BODIES are never logged at all — only method/url/status/timing
 * metadata.
 */

export interface SdkLogger {
  debug(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/** Header names whose values must never reach a logger. */
const SECRET_HEADERS = new Set(["authorization"]);

export function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const redacted: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    redacted[name] = SECRET_HEADERS.has(name.toLowerCase())
      ? "[REDACTED]"
      : value;
  }
  return redacted;
}

/** No-op logger used when the caller does not provide one. */
export const noopLogger: SdkLogger = {
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
