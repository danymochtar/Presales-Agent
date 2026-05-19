import { describe, it, expect } from "vitest";
import { exportAzureCalculatorJson, exportAwsCalculatorCsv } from "@/lib/pricing/calculator-export";
import type { BomLineItem } from "@/lib/exporters/bom-xlsx";

const SAMPLE: BomLineItem[] = [
  { section: "workload", category: "Compute", serviceType: "Virtual Machines", customName: "VM-001 (APP)", region: "Malaysia West", description: "Standard_D4s_v5, 4 vCPU, 16 GB, PAYG, Linux", monthlyUsd: 145 },
  { section: "workload", category: "Storage", serviceType: "Managed Disks",    customName: "VM-001 disks",  region: "Malaysia West", description: "Premium SSD v2, 1 × 256 GB", monthlyUsd: 35 },
  { section: "landing_zone", category: "Networking", serviceType: "Azure Firewall", customName: "Hub firewall", region: "Malaysia West", description: "Standard SKU", monthlyUsd: 912 },
];

describe("exportAzureCalculatorJson", () => {
  it("produces a JSON file with grouped resources", () => {
    const r = exportAzureCalculatorJson(SAMPLE, { estimateName: "Acme BOM v1" });
    expect(r.filename).toBe("acme-bom-v1.azurepricing.json");
    expect(r.contentType).toBe("application/json");
    const parsed = JSON.parse(r.body);
    expect(parsed.estimateName).toBe("Acme BOM v1");
    expect(parsed.currency).toBe("USD");
    expect(parsed.resources).toHaveLength(2); // 1 VM + 1 LZ (storage line filtered out)
  });

  it("extracts the Azure SKU from the description", () => {
    const r = exportAzureCalculatorJson(SAMPLE, { estimateName: "X" });
    const body = JSON.parse(r.body) as { resources: { sku: string }[] };
    // Underscore-form ("D4s_v5") or space-form ("D4s v5") — either is fine,
    // the Azure calculator accepts both on import.
    expect(body.resources[0].sku).toMatch(/D4s[\s_]*v5/i);
  });
});

describe("exportAwsCalculatorCsv", () => {
  it("produces a CSV with header + rows", () => {
    const r = exportAwsCalculatorCsv(SAMPLE, { estimateName: "Acme BOM v1" });
    expect(r.filename).toBe("acme-bom-v1.awscalculator.csv");
    expect(r.contentType).toBe("text/csv");
    const lines = r.body.split("\n").filter((l) => l.length > 0);
    expect(lines[0]).toMatch(/Group hierarchy/);
    expect(lines).toHaveLength(1 + SAMPLE.length); // header + 3 rows
  });

  it("escapes commas + quotes in description field", () => {
    const tricky: BomLineItem[] = [
      { section: "workload", category: "Compute", serviceType: "EC2", customName: "x", region: "ap-southeast-5", description: 'note with "quotes" and, commas', monthlyUsd: 50 },
    ];
    const r = exportAwsCalculatorCsv(tricky, { estimateName: "x" });
    expect(r.body).toContain('"note with ""quotes"" and, commas"');
  });
});
