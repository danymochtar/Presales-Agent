// Markdown → DOCX converter built on `marked` (parser) + `docx` (writer).
// Handles the elements our BOM/proposal output uses: H1-H4, paragraphs,
// bold/italic, bulleted + numbered lists, tables, code blocks, hr.
//
// Not a general-purpose converter — scoped to what our system prompts emit.
// Customer-ready quality requires a tenant-specific template (Phase 3 work);
// for now this produces clean unstyled DOCX that beats raw Markdown for
// internal review or "first draft to customer" send.

import { marked, type Tokens } from "marked";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  BorderStyle,
} from "docx";

type Inline = TextRun;

function inlineFromTokens(tokens: Tokens.Generic[] | string | undefined): Inline[] {
  if (!tokens) return [new TextRun({ text: "" })];
  if (typeof tokens === "string") return [new TextRun({ text: tokens })];
  const runs: Inline[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "text":
        runs.push(new TextRun({ text: (t as Tokens.Text).text }));
        break;
      case "strong":
        runs.push(...inlineFromTokens((t as Tokens.Strong).tokens).map((r) => withBold(r)));
        break;
      case "em":
        runs.push(...inlineFromTokens((t as Tokens.Em).tokens).map((r) => withItalic(r)));
        break;
      case "codespan":
        runs.push(new TextRun({ text: (t as Tokens.Codespan).text, font: "Consolas" }));
        break;
      case "link":
        runs.push(...inlineFromTokens((t as Tokens.Link).tokens));
        break;
      case "br":
        runs.push(new TextRun({ break: 1 }));
        break;
      case "del":
        runs.push(...inlineFromTokens((t as Tokens.Del).tokens).map((r) => withStrike(r)));
        break;
      default: {
        const maybeText = (t as unknown as { text?: unknown }).text;
        if (typeof maybeText === "string") {
          runs.push(new TextRun({ text: maybeText }));
        }
      }
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text: "" })];
}

function withBold(run: TextRun): TextRun {
  // TextRun is immutable in docx; rebuild with merged options.
  // We can't read its options back, so we wrap the original text run by
  // recreating it from stringified content. This loses nested formatting
  // but our prompts produce shallow nesting (bold OR italic, rarely both).
  const text = (run as unknown as { options?: { text?: string } }).options?.text ?? "";
  return new TextRun({ text, bold: true });
}
function withItalic(run: TextRun): TextRun {
  const text = (run as unknown as { options?: { text?: string } }).options?.text ?? "";
  return new TextRun({ text, italics: true });
}
function withStrike(run: TextRun): TextRun {
  const text = (run as unknown as { options?: { text?: string } }).options?.text ?? "";
  return new TextRun({ text, strike: true });
}

const HEADING_LEVEL: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

function blockFromToken(token: Tokens.Generic, listDepth = 0): (Paragraph | Table)[] {
  switch (token.type) {
    case "heading": {
      const h = token as Tokens.Heading;
      return [
        new Paragraph({
          heading: HEADING_LEVEL[h.depth] ?? HeadingLevel.HEADING_2,
          children: inlineFromTokens(h.tokens),
          spacing: { before: 200, after: 100 },
        }),
      ];
    }
    case "paragraph": {
      const p = token as Tokens.Paragraph;
      return [new Paragraph({ children: inlineFromTokens(p.tokens), spacing: { after: 100 } })];
    }
    case "list": {
      const l = token as Tokens.List;
      const out: Paragraph[] = [];
      l.items.forEach((item, idx) => {
        const startNum = typeof l.start === "number" ? l.start : Number(l.start) || 1;
        const prefix = l.ordered ? `${startNum + idx}. ` : "• ";
        const inlines: Inline[] = [];
        for (const it of item.tokens) {
          if (it.type === "text") {
            inlines.push(...inlineFromTokens((it as Tokens.Text).tokens ?? (it as Tokens.Text).text));
          } else if (it.type === "list") {
            // recurse via block builder
            // inline placeholder; we'll add nested list paras below
          } else if ("text" in it && typeof (it as { text?: unknown }).text === "string") {
            inlines.push(new TextRun({ text: (it as { text: string }).text }));
          }
        }
        out.push(
          new Paragraph({
            children: [new TextRun({ text: prefix, bold: false }), ...inlines],
            indent: { left: 360 + listDepth * 360 },
            spacing: { after: 60 },
          }),
        );
        // nested lists
        for (const it of item.tokens) {
          if (it.type === "list") {
            const nested = blockFromToken(it, listDepth + 1);
            for (const n of nested) if (n instanceof Paragraph) out.push(n);
          }
        }
      });
      return out;
    }
    case "code": {
      const c = token as Tokens.Code;
      return c.text.split("\n").map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line, font: "Consolas", size: 18 })],
            shading: { type: "clear", fill: "F4F4F4" },
            spacing: { after: 0 },
          }),
      );
    }
    case "table": {
      const tt = token as Tokens.Table;
      const headerRow = new TableRow({
        children: tt.header.map(
          (h) =>
            new TableCell({
              shading: { fill: "F0F0F0", type: "clear" },
              children: [
                new Paragraph({
                  children: inlineFromTokens(h.tokens).map((r) => withBold(r)),
                }),
              ],
            }),
        ),
        tableHeader: true,
      });
      const bodyRows = tt.rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [new Paragraph({ children: inlineFromTokens(cell.tokens) })],
                }),
            ),
          }),
      );
      return [
        new Table({
          rows: [headerRow, ...bodyRows],
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
            left: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
            right: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" },
            insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "DDDDDD" },
          },
        }),
        new Paragraph({ text: "", spacing: { after: 100 } }),
      ];
    }
    case "hr":
      return [
        new Paragraph({
          border: { bottom: { color: "999999", style: BorderStyle.SINGLE, size: 6, space: 1 } },
          children: [],
        }),
      ];
    case "blockquote": {
      const bq = token as Tokens.Blockquote;
      const out: Paragraph[] = [];
      for (const inner of bq.tokens) {
        const blocks = blockFromToken(inner);
        for (const b of blocks)
          if (b instanceof Paragraph)
            out.push(
              new Paragraph({
                children: (b as Paragraph & { options?: { children?: TextRun[] } }).options?.children ?? [],
                indent: { left: 360 },
                border: { left: { color: "AAAAAA", style: BorderStyle.SINGLE, size: 6, space: 4 } },
              }),
            );
      }
      return out.length > 0 ? out : [new Paragraph({ children: [new TextRun("")] })];
    }
    case "space":
      return [new Paragraph({ children: [], spacing: { after: 60 } })];
    default:
      return [];
  }
}

export async function markdownToDocxBuffer(markdown: string, title?: string): Promise<Buffer> {
  const tokens = marked.lexer(markdown, { gfm: true });

  const children: (Paragraph | Table)[] = [];
  if (title) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: title, bold: true })],
        spacing: { after: 200 },
      }),
    );
  }
  for (const token of tokens) {
    children.push(...blockFromToken(token));
  }

  const doc = new Document({
    creator: "Presales Agent",
    title: title ?? "Document",
    description: "Generated by Presales Agent",
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
    },
    sections: [{ properties: {}, children }],
  });

  return await Packer.toBuffer(doc);
}
