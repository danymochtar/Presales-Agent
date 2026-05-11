import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { buildBomWorkbook, parseLineItemsFromBomMarkdown, type BomLineItem } from "@/lib/exporters/bom-xlsx";

const lzItems: BomLineItem[] = [
  { section: "landing_zone", category: "Networking", serviceType: "Application Gateway", customName: "Hub WAF v2",
    region: "Malaysia West", description: "WAF v2, 730h, 1 CU, 1k persistent conns", monthlyUsd: 317.99 },
  { section: "landing_zone", category: "Security",   serviceType: "Microsoft Defender for Cloud", customName: "CSPM + Servers P2",
    region: "Malaysia West", description: "11 Plan 2 servers × 730h, 1 SQL DB on Azure, 5 storage accounts", monthlyUsd: 245.04 },
  { section: "landing_zone", category: "Storage",    serviceType: "Storage Accounts", customName: "Diagnostics",
    region: "Malaysia West", description: "Block Blob LRS Hot, 3,185 GB, 166 × 10k W/R/L ops", monthlyUsd: 73.47 },
];

const workloadItems: BomLineItem[] = [
  { section: "workload", category: "Compute",   serviceType: "Virtual Machines", customName: "PKTSRVAD-02 (INFOR-DC3)",
    region: "Malaysia West", description: "1 D2s v5 (2 vCPU, 8 GB) 3-yr reserved, Windows", monthlyUsd: 96.33 },
  { section: "workload", category: "Databases", serviceType: "Virtual Machines", customName: "PKTINFORWMS_DB1",
    region: "Malaysia West", description: "1 E8s v5 (8 vCPU, 64 GB) 3-yr reserved, Windows, SQL Standard PAYG", monthlyUsd: 1000.45, database: "SQL Database on VM" },
  { section: "workload", category: "Databases", serviceType: "Azure SQL Database", customName: "RDS Custom DB",
    region: "Malaysia West", description: "Hyperscale Premium-series, 1-8 vCore, 3-yr reserved, 1650 GB", monthlyUsd: 1247.84, database: "Azure SQL Database" },
  { section: "workload", category: "Storage",   serviceType: "Managed Disks", customName: "PKTINFORWMS_DB1 disks",
    region: "Malaysia West", description: "Premium SSD v2, 1 × 1000 GiB, 3000 IOPS, 125 MB/s", monthlyUsd: 86.94 },
];

describe("buildBomWorkbook", () => {
  it("produces Summary + Landing Zone + Workloads sheets", () => {
    const buf = buildBomWorkbook([...lzItems, ...workloadItems], {
      cloud: "azure",
      projectName: "PKT Migration",
      customer: "PKT Logistics",
      region: "Malaysia West",
      purchaseModelLabel: "Reserved Instance (3-year)",
      fxMyrPerUsd: 4.7,
      azureFrontierCreditUsd: 33358,
    });
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames).toEqual(expect.arrayContaining(["Summary", "Landing Zone", "Workloads"]));
  });

  it("summary sheet aggregates by category and computes ACR + grand total", () => {
    const buf = buildBomWorkbook([...lzItems, ...workloadItems], {
      cloud: "azure",
      projectName: "PKT", customer: "PKT",
      region: "Malaysia West", purchaseModelLabel: "RI 3y",
    });
    const wb = XLSX.read(buf, { type: "buffer" });
    const summary = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Summary"], { header: 1, defval: null });
    const csv = JSON.stringify(summary);
    expect(csv).toContain("Grand Total");
    expect(csv).toContain("ACR per year");
    // 73.47 + 245.04 + 317.99 + 96.33 + 1000.45 + 1247.84 + 86.94 = 3068.06
    expect(csv).toContain("$3,068.06");
  });

  it("surfaces Azure Frontier credit when supplied", () => {
    const buf = buildBomWorkbook(workloadItems, {
      cloud: "azure",
      projectName: "PKT", customer: "PKT",
      region: "Malaysia West", purchaseModelLabel: "RI 3y",
      azureFrontierCreditUsd: 12000,
    });
    const wb = XLSX.read(buf, { type: "buffer" });
    const summary = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Summary"], { header: 1, defval: null });
    expect(JSON.stringify(summary)).toContain("Azure Frontier credit estimate");
  });

  it("workloads sheet includes Database column populated for DB rows", () => {
    const buf = buildBomWorkbook(workloadItems, {
      cloud: "azure",
      projectName: "PKT", customer: "PKT",
      region: "Malaysia West", purchaseModelLabel: "RI 3y",
    });
    const wb = XLSX.read(buf, { type: "buffer" });
    const detail = XLSX.utils.sheet_to_json<string[]>(wb.Sheets["Workloads"], { header: 1, defval: null });
    const csv = JSON.stringify(detail);
    expect(csv).toContain("SQL Database on VM");
    expect(csv).toContain("Azure SQL Database");
  });

  it("uses cloud-appropriate header label", () => {
    const aws = XLSX.read(buildBomWorkbook(workloadItems, {
      cloud: "aws", projectName: "X", customer: "Y", region: "ap-southeast-5", purchaseModelLabel: "RI 3y",
    }), { type: "buffer" });
    const head = XLSX.utils.sheet_to_json<string[]>(aws.Sheets["Workloads"], { header: 1, defval: null });
    expect(JSON.stringify(head)).toContain("AWS Cost Calculator Estimate");

    const gcp = XLSX.read(buildBomWorkbook(workloadItems, {
      cloud: "gcp", projectName: "X", customer: "Y", region: "asia-southeast2", purchaseModelLabel: "CUD 3y",
    }), { type: "buffer" });
    const ghead = XLSX.utils.sheet_to_json<string[]>(gcp.Sheets["Workloads"], { header: 1, defval: null });
    expect(JSON.stringify(ghead)).toContain("Google Cloud Pricing Estimate");
  });
});

describe("parseLineItemsFromBomMarkdown", () => {
  it("extracts a fenced JSON block at the end of markdown", () => {
    const md = `
# Executive summary
…

\`\`\`json
{
  "lineItems": [
    { "section": "workload", "category": "Compute", "serviceType": "Virtual Machines", "customName": "vm-01", "region": "Malaysia West", "description": "D2s v5", "monthlyUsd": 96.33 },
    { "section": "landing_zone", "category": "Networking", "serviceType": "Bastion", "customName": "Bastion (hub)", "region": "Malaysia West", "description": "Bastion standard", "monthlyUsd": 140 }
  ]
}
\`\`\`
`;
    const items = parseLineItemsFromBomMarkdown(md);
    expect(items).toHaveLength(2);
    expect(items[0].customName).toBe("vm-01");
    expect(items[1].section).toBe("landing_zone");
  });

  it("returns [] when no JSON block is present", () => {
    expect(parseLineItemsFromBomMarkdown("# just markdown, no json")).toEqual([]);
  });

  it("survives malformed blocks by trying earlier matches", () => {
    const md = "```json\n{ bad json }\n```\n\n```json\n{\"lineItems\":[{\"section\":\"workload\",\"category\":\"X\",\"serviceType\":\"Y\",\"customName\":\"Z\",\"region\":\"r\",\"description\":\"d\",\"monthlyUsd\":1}]}\n```";
    const items = parseLineItemsFromBomMarkdown(md);
    expect(items).toHaveLength(1);
  });

  it("accepts a top-level array form", () => {
    const md = '```json\n[{"section":"workload","category":"Compute","serviceType":"VM","customName":"a","region":"r","description":"d","monthlyUsd":10}]\n```';
    const items = parseLineItemsFromBomMarkdown(md);
    expect(items).toHaveLength(1);
  });
});
