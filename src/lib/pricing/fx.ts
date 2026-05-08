// FX helpers. Reference rates are tenant-managed; the fallback table below is
// only for when a tenant hasn't set its rate yet. ALWAYS prefer tenant.fxMyrPerUsd.

const FALLBACK_RATES: Record<string, number> = {
  MYR: 4.7,
  IDR: 16500,
  SGD: 1.35,
  PHP: 57.0,
  THB: 36.5,
  VND: 25000,
  USD: 1,
};

export function usdTo(amountUsd: number, target: string, rate?: number | null): number {
  const r = rate ?? FALLBACK_RATES[target.toUpperCase()] ?? 1;
  return Math.round(amountUsd * r * 100) / 100;
}

export function fxRateOrFallback(target: string, rate?: number | null): number {
  return rate ?? FALLBACK_RATES[target.toUpperCase()] ?? 1;
}
