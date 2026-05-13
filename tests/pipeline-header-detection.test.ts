import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { readWorkbookPreview, readWorkbookRows, detectSheetShape } from "@/lib/pipeline/field-mapping";

function aoaBuffer(aoa: unknown[][], sheetName = "Sheet1"): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("detectSheetShape — header row detection", () => {
  it("picks row 0 for a clean Excel with headers on the first row", () => {
    const aoa = [
      ["Customer", "Opportunity", "Stage", "TCV USD", "Close Date"],
      ["Acme", "Acme Cloud", "Commit", 100000, "2026-09-30"],
      ["Beta", "Beta Modernize", "Upside", 45000, "2026-12-15"],
    ];
    const { headers, sampleRows, headerRowIndex } = detectSheetShape(aoa, 5);
    expect(headerRowIndex).toBe(0);
    expect(headers).toEqual(["Customer", "Opportunity", "Stage", "TCV USD", "Close Date"]);
    expect(sampleRows).toHaveLength(2);
    expect(sampleRows[0]).toEqual({
      Customer: "Acme",
      Opportunity: "Acme Cloud",
      Stage: "Commit",
      "TCV USD": 100000,
      "Close Date": "2026-09-30",
    });
  });

  it("skips a title row + blank row + branding row", () => {
    const aoa = [
      ["FY27 Sales Plan — Confidential", null, null, null, null],
      [null, null, null, null, null],
      ["Prepared by Dany Mochtar", null, null, null, null],
      [null, null, null, null, null],
      ["Customer", "Opportunity", "Stage", "TCV USD", "Close Date"],
      ["Acme", "Acme Cloud", "Commit", 100000, "2026-09-30"],
      ["Beta", "Beta Cloud", "Upside", 45000, "2026-12-15"],
      ["Gamma", "Gamma SOW", "At Risk", 12000, "2027-02-10"],
    ];
    const { headers, headerRowIndex, dataRowCount } = detectSheetShape(aoa, 5);
    expect(headerRowIndex).toBe(4);
    expect(headers).toEqual(["Customer", "Opportunity", "Stage", "TCV USD", "Close Date"]);
    expect(dataRowCount).toBe(3);
  });

  it("does NOT name columns '__EMPTY_N' when row 0 is blank", () => {
    const aoa = [
      [null, null, null, null],
      ["Account", "Stage", "Amount", "Close"],
      ["Acme", "Commit", 100, "2026-09-30"],
    ];
    const { headers } = detectSheetShape(aoa, 5);
    expect(headers).toEqual(["Account", "Stage", "Amount", "Close"]);
    expect(headers.some((h) => h.startsWith("__EMPTY"))).toBe(false);
  });

  it("replaces blank header cells with 'Column N'", () => {
    const aoa = [
      ["Customer", "", "TCV USD", null, "Notes"],
      ["Acme", "X", 100, null, "ok"],
      ["Beta", "Y", 200, null, "follow up"],
    ];
    const { headers } = detectSheetShape(aoa, 5);
    expect(headers[0]).toBe("Customer");
    expect(headers[1]).toBe("Column 2");
    expect(headers[2]).toBe("TCV USD");
    expect(headers[3]).toBe("Column 4");
    expect(headers[4]).toBe("Notes");
  });

  it("dedupes repeated header labels", () => {
    const aoa = [
      ["Customer", "Customer", "Stage", "Customer"],
      ["Acme", "Acme1", "Commit", "Acme2"],
    ];
    const { headers } = detectSheetShape(aoa, 5);
    expect(headers).toEqual(["Customer", "Customer (2)", "Stage", "Customer (3)"]);
  });

  it("returns empty when sheet has no data", () => {
    const { headers, dataRowCount } = detectSheetShape([], 5);
    expect(headers).toEqual([]);
    expect(dataRowCount).toBe(0);
  });
});

describe("readWorkbookPreview", () => {
  it("picks the sheet with the most data first", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Cover page"], [null]]), "Cover");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Customer", "Stage"],
        ["Acme", "Commit"],
        ["Beta", "Upside"],
        ["Gamma", "Lost"],
      ]),
      "Pipeline",
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const previews = readWorkbookPreview(buf, 5);
    expect(previews[0].sheet).toBe("Pipeline");
    expect(previews[0].headers).toEqual(["Customer", "Stage"]);
  });

  it("handles the real-world 'FY27 plan with title row' shape", () => {
    const buf = aoaBuffer(
      [
        ["MY FY27 Plan", null, null, null, null],
        [null, null, null, null, null],
        ["Account", "Opportunity", "Owner", "TCV (USD)", "Forecast Date"],
        ["Maybank", "Cloud Migration Wave 2", "Dany", 250000, "2026-09-15"],
        ["Petronas", "Data Modernization", "Sarah", 480000, "2026-11-01"],
      ],
      "Rachel",
    );
    const previews = readWorkbookPreview(buf, 5);
    expect(previews[0].headers).toEqual(["Account", "Opportunity", "Owner", "TCV (USD)", "Forecast Date"]);
    expect(previews[0].sampleRows[0]).toMatchObject({
      Account: "Maybank",
      Opportunity: "Cloud Migration Wave 2",
      Owner: "Dany",
      "TCV (USD)": 250000,
    });
  });
});

describe("readWorkbookRows", () => {
  it("uses the same header detection so import + preview stay aligned", () => {
    const buf = aoaBuffer([
      ["Title", null, null],
      [null, null, null],
      ["Customer", "Stage", "TCV"],
      ["Acme", "Commit", 100],
      ["Beta", "Upside", 50],
    ]);
    const { rows } = readWorkbookRows(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Customer: "Acme", Stage: "Commit", TCV: 100 });
  });

  it("auto-picks the sheet with the most data when none specified", () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["About"]]), "Cover");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["Customer", "Stage"], ["Acme", "Commit"]]),
      "Pipeline",
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const { sheet, rows } = readWorkbookRows(buf);
    expect(sheet).toBe("Pipeline");
    expect(rows).toEqual([{ Customer: "Acme", Stage: "Commit" }]);
  });
});
