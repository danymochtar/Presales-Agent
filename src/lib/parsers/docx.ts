// .docx → plain text via mammoth. Drops images, simplifies tables to
// tab-separated rows. Sufficient for RFP/notes/requirements extraction.

import mammoth from "mammoth";

const MAX_CHARS = 50_000;

export async function parseDocx(buffer: ArrayBuffer): Promise<{ text: string; truncated: boolean }> {
  // mammoth wants Node Buffer
  const nodeBuf = Buffer.from(buffer);
  const { value } = await mammoth.extractRawText({ buffer: nodeBuf });
  const text = value.trim();
  if (text.length <= MAX_CHARS) return { text, truncated: false };
  return { text: text.slice(0, MAX_CHARS), truncated: true };
}
