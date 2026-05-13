// Customer-name fuzzy matcher. Used to auto-link a pipeline Opportunity to
// an Engagement when their customer fields effectively name the same company.
// Stays deliberately conservative — we'd rather miss a match than mis-link.

const LEGAL_SUFFIXES = [
  "sdn bhd", "sdn. bhd.", "sdn bhd.",
  "berhad", "bhd", "bhd.",
  "pte ltd", "pte. ltd.", "pte ltd.",
  "pvt ltd", "pvt. ltd.", "pvt ltd.",
  "private limited",
  "ltd", "ltd.", "limited",
  "llc", "l.l.c.",
  "inc", "inc.", "incorporated",
  "corp", "corp.", "corporation",
  "gmbh", "ag", "sa", "spa", "srl",
  "co", "co.", "company",
  "holdings", "group",
];

const FILLER_WORDS = ["the"];

export function normalizeCustomerName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw.toLowerCase().trim();
  // Strip parenthetical content (e.g. "(industry pattern: Banking)")
  s = s.replace(/\([^)]*\)/g, " ");
  // Strip everything after first dash separator (e.g. "Acme Bank — KL branch")
  s = s.split(/\s+[—–-]\s+/)[0];
  // Normalize whitespace
  s = s.replace(/\s+/g, " ").trim();
  // Strip legal suffixes (trailing only)
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of LEGAL_SUFFIXES) {
      const trimmed = s.replace(new RegExp(`(^|\\s)${suf.replace(/\./g, "\\.")}$`), "").trim();
      if (trimmed.length > 0 && trimmed !== s) {
        s = trimmed;
        changed = true;
      }
    }
  }
  // Drop filler leading words
  for (const f of FILLER_WORDS) {
    if (s.startsWith(`${f} `)) s = s.slice(f.length + 1);
  }
  // Collapse punctuation to spaces, then re-collapse whitespace
  s = s.replace(/[.,/&'`"]+/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

export function customerNamesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCustomerName(a);
  const nb = normalizeCustomerName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Partial: one is a strict prefix of the other AND has at least 4 chars in
  // common. Avoids "AB" matching "ABC Bank" but allows "Acme" → "Acme Bank".
  if (na.length >= 4 && nb.startsWith(`${na} `)) return true;
  if (nb.length >= 4 && na.startsWith(`${nb} `)) return true;
  return false;
}
