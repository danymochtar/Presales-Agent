// PDF → plain text via unpdf (serverless-first wrapper around pdfjs).

import { extractText, getDocumentProxy } from "unpdf";

const MAX_CHARS = 50_000;

export async function parsePdf(buffer: ArrayBuffer): Promise<{
  text: string;
  pages: number;
  truncated: boolean;
}> {
  const u8 = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(u8);
  const pages = pdf.numPages;
  const { text } = await extractText(pdf, { mergePages: true });
  const flat = (Array.isArray(text) ? text.join("\n") : text).trim();
  if (flat.length <= MAX_CHARS) return { text: flat, pages, truncated: false };
  return { text: flat.slice(0, MAX_CHARS), pages, truncated: true };
}
