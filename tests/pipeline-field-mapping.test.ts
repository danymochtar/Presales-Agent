import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { suggestMapping, applyMapping, readWorkbookPreview, readWorkbookRows } from "@/lib/pipeline/field-mapping";

describe("suggestMapping", () => {
  it("matches Microsoft biweekly-style headers", () => {
    const headers = ["Opportunity ID", "Account", "Opportunity Name", "Stage", "TCV (USD)", "Expected Close Date", "Owner", "Notes"];
    const m = suggestMapping(headers);
    expect(m.externalId).toBe("Opportunity ID");
    expect(m.customer).toBe("Account");
    expect(m.name).toBe("Opportunity Name");
    expect(m.status).toBe("Stage");
    expect(m.valueUsd).toBe("TCV (USD)");
    expect(m.closeDate).toBe("Expected Close Date");
    expect(m.ownerName).toBe("Owner");
    expect(m.notes).toBe("Notes");
  });

  it("matches SMB / SMC-style headers with different vocabulary", () => {
    const headers = ["Customer", "Deal", "Forecast Category", "Amount", "Close", "AM"];
    const m = suggestMapping(headers);
    expect(m.customer).toBe("Customer");
    expect(m.name).toBe("Deal");
    expect(m.status).toBe("Forecast Category");
    expect(m.valueUsd).toBe("Amount");
    expect(m.closeDate).toBe("Close");
    expect(m.ownerName).toBe("AM");
  });

  it("matches ENT/PS-style headers", () => {
    const headers = ["Client", "Project Name", "Phase", "Value RM", "Target Close", "Architect", "Remarks"];
    const m = suggestMapping(headers);
    expect(m.customer).toBe("Client");
    expect(m.name).toBe("Project Name");
    expect(m.status).toBe("Phase");
    expect(m.valueMyr).toBe("Value RM");
    expect(m.closeDate).toBe("Target Close");
    expect(m.ownerName).toBe("Architect");
    expect(m.notes).toBe("Remarks");
  });

  it("matches funding-tracker headers", () => {
    const headers = ["Program", "Customer", "Consent Status", "Valid Until", "Funding Amount USD", "PSM"];
    const m = suggestMapping(headers);
    expect(m.fundingProgram).toBe("Program");
    expect(m.customer).toBe("Customer");
    expect(m.fundingExpiresAt).toBe("Valid Until");
    expect(m.valueUsd).toBe("Funding Amount USD");
    expect(m.ownerName).toBe("PSM");
  });
});

describe("applyMapping", () => {
  const headers = ["Account", "Opp Name", "Stage", "TCV USD", "Close Date", "Owner", "Notes"];
  const rows = [
    { "Account": "Acme Corp", "Opp Name": "Acme Cloud Migration", "Stage": "Commit", "TCV USD": 250000, "Close Date": "2026-06-30", "Owner": "Alice", "Notes": "PO expected" },
    { "Account": "Beta Sdn Bhd", "Opp Name": "DR Setup", "Stage": "At Risk", "TCV USD": "$45,000", "Close Date": new Date("2026-05-15"), "Owner": "Bob", "Notes": "" },
    { "Account": null, "Opp Name": null, "Stage": "Lost", "TCV USD": 0, "Close Date": null, "Owner": null, "Notes": null }, // dropped
  ];

  it("normalizes rows into the canonical shape", () => {
    const m = suggestMapping(headers);
    const out = applyMapping(rows, m);
    expect(out).toHaveLength(2);
    expect(out[0].customer).toBe("Acme Corp");
    expect(out[0].status).toBe("committed");
    expect(out[0].valueUsd).toBe(250000);
    expect(out[0].closeDate?.toISOString().slice(0, 10)).toBe("2026-06-30");
    expect(out[1].status).toBe("at_risk");
    expect(out[1].valueUsd).toBe(45000);
  });

  it("derives MYR via fx when valueUsd present but valueMyr missing", () => {
    const m = suggestMapping(headers);
    const out = applyMapping(rows, m, { fxMyrPerUsd: 4.7 });
    expect(out[0].valueMyr).toBe(+(250000 * 4.7).toFixed(2));
  });

  it("respects tracker statusMapping override", () => {
    const headers2 = ["Customer", "Forecast", "Amount"];
    const rows2 = [{ "Customer": "Gamma", "Forecast": "Forecast", "Amount": 10000 }];
    const m = suggestMapping(headers2);
    const out = applyMapping(rows2, m, { statusMapping: { "Forecast": "committed" } });
    expect(out[0].status).toBe("committed");
  });
});

describe("readWorkbookPreview / readWorkbookRows", () => {
  it("round-trips a tiny in-memory workbook", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Account", "Stage", "TCV USD"],
      ["Acme", "Commit", 1000],
      ["Beta", "Lost", 50],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pipe");
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const preview = readWorkbookPreview(buf);
    expect(preview[0].sheet).toBe("Pipe");
    expect(preview[0].headers).toEqual(["Account", "Stage", "TCV USD"]);
    expect(preview[0].sampleRows).toHaveLength(2);

    const { rows } = readWorkbookRows(buf);
    expect(rows[0].Account).toBe("Acme");
    expect(rows[1].TCV).toBeUndefined();
  });
});
