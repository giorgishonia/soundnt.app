/**
 * lib/log.ts — structured, secret-safe logging.
 *
 * NEVER log full tokens or the signing key. Log only `lic`, `ref`, `order id`,
 * and provider event ids (spec §11). `redactToken` keeps just enough of a token
 * to correlate without leaking it.
 */

type Fields = Record<string, unknown>;

export function redactToken(token: string | null | undefined): string {
  if (!token) return "<none>";
  const head = token.slice(0, 6);
  return `${head}…(${token.length})`;
}

function emit(level: "info" | "warn" | "error", msg: string, fields?: Fields) {
  const line = { level, msg, ...fields };
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  out(JSON.stringify(line));
}

export const log = {
  info: (msg: string, fields?: Fields) => emit("info", msg, fields),
  warn: (msg: string, fields?: Fields) => emit("warn", msg, fields),
  error: (msg: string, fields?: Fields) => emit("error", msg, fields),
};
