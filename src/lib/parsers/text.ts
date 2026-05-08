// Plain text / Markdown parser. Trivial passthrough with a cap to keep
// downstream LLM context bounded.

const MAX_CHARS = 50_000;

export function parseText(buffer: ArrayBuffer): { text: string; truncated: boolean } {
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const raw = decoder.decode(buffer).trim();
  if (raw.length <= MAX_CHARS) return { text: raw, truncated: false };
  return { text: raw.slice(0, MAX_CHARS), truncated: true };
}
