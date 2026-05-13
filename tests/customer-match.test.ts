import { describe, it, expect } from "vitest";
import { normalizeCustomerName, customerNamesMatch } from "@/lib/pipeline/customer-match";

describe("normalizeCustomerName", () => {
  it("lowercases + trims", () => {
    expect(normalizeCustomerName("  Acme Bank  ")).toBe("acme bank");
  });

  it("strips Malaysian legal suffixes", () => {
    expect(normalizeCustomerName("Acme Sdn Bhd")).toBe("acme");
    expect(normalizeCustomerName("PKT Logistics Berhad")).toBe("pkt logistics");
    expect(normalizeCustomerName("PKT Logistics Bhd.")).toBe("pkt logistics");
  });

  it("strips international suffixes", () => {
    expect(normalizeCustomerName("Acme Corp.")).toBe("acme");
    expect(normalizeCustomerName("Acme Inc")).toBe("acme");
    expect(normalizeCustomerName("Acme Pte Ltd")).toBe("acme");
    expect(normalizeCustomerName("Acme LLC")).toBe("acme");
  });

  it("strips parenthetical hints", () => {
    expect(normalizeCustomerName("(industry pattern: Banking)")).toBe("");
    expect(normalizeCustomerName("Acme Bank (industry pattern)")).toBe("acme bank");
  });

  it("returns empty for null/undefined", () => {
    expect(normalizeCustomerName(null)).toBe("");
    expect(normalizeCustomerName(undefined)).toBe("");
    expect(normalizeCustomerName("")).toBe("");
  });

  it("drops branch suffix after dash", () => {
    expect(normalizeCustomerName("Acme Bank — KL Branch")).toBe("acme bank");
  });
});

describe("customerNamesMatch", () => {
  it("matches exact after normalization", () => {
    expect(customerNamesMatch("Acme Sdn Bhd", "Acme Berhad")).toBe(true);
    expect(customerNamesMatch("PKT Logistics Bhd", "pkt logistics")).toBe(true);
  });

  it("matches prefix when length >= 4", () => {
    expect(customerNamesMatch("Acme", "Acme Bank")).toBe(true);
    expect(customerNamesMatch("Acme Bank Berhad", "Acme")).toBe(true);
  });

  it("rejects too-short prefixes", () => {
    expect(customerNamesMatch("AB", "ABC Bank")).toBe(false);
  });

  it("rejects unrelated names", () => {
    expect(customerNamesMatch("Acme Bank", "Maybank")).toBe(false);
  });

  it("rejects when either side is empty", () => {
    expect(customerNamesMatch("", "Acme Bank")).toBe(false);
    expect(customerNamesMatch(null, "Acme Bank")).toBe(false);
  });
});
