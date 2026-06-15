export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e instanceof Response) {
    return `Request failed (${e.status} ${e.statusText})`.trim();
  }
  if (typeof e === "object" && e !== null) {
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === "string" && msg) return msg;
  }
  const s = String(e);
  return s === "[object Response]" ? "Request failed" : s;
}
