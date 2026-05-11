// Wave-plan post-check that enforces IBM-style migration wave limits:
// ≤ 20 apps, ≤ 150 servers, ≤ 30 databases per wave, 4–8 week duration.
//
// Used by the project-plan generate route AFTER the LLM streams its draft.
// Parses the wave table out of the markdown, runs limit checks, and returns
// a warnings block to append below the deliverable so reviewers see the
// rule violation explicitly. Greedy splitter is provided as a pure function
// for the unit-test side; the route only attaches advisory warnings —
// rewriting the LLM output is left to the human reviewer.

export const WAVE_LIMITS = {
  maxApps: 20,
  maxServers: 150,
  maxDatabases: 30,
  minDurationWeeks: 4,
  maxDurationWeeks: 8,
};

export type WaveCounts = {
  wave: string;       // e.g. "Wave 1"
  apps?: number;
  servers?: number;
  databases?: number;
  durationWeeks?: number;
  raw: string;        // original markdown row for the warning citation
};

export type WaveWarning = {
  wave: string;
  rule: string;
  observed: number;
  limit: number;
};

// Loose markdown-table parser. Handles `| Wave 1 | apps | servers | dbs | weeks |`
// shapes; tolerates extra columns and reorderings as long as headers contain
// recognizable keywords.
export function parseWaveTable(markdown: string): WaveCounts[] {
  const lines = markdown.split("\n");
  let headerIdx = -1;
  let cols: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*\|/.test(line)) continue;
    const header = line.toLowerCase();
    if (header.includes("wave") && (header.includes("app") || header.includes("server") || header.includes("workload"))) {
      headerIdx = i;
      cols = line.split("|").map((c) => c.trim().toLowerCase());
      break;
    }
  }
  if (headerIdx < 0) return [];

  const colIndex = (...needles: string[]): number => {
    for (let i = 0; i < cols.length; i++) {
      if (needles.some((n) => cols[i].includes(n))) return i;
    }
    return -1;
  };
  const idx = {
    wave:     colIndex("wave"),
    apps:     colIndex("app", "workload"),
    servers:  colIndex("server", "vm"),
    dbs:      colIndex("database", "db"),
    duration: colIndex("week", "duration"),
  };
  if (idx.wave < 0) return [];

  const out: WaveCounts[] = [];
  // Skip the separator row (|---|---|).
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*\|/.test(line)) break;
    const cells = line.split("|").map((c) => c.trim());
    const wave = cells[idx.wave];
    if (!wave || /^[-:\s]+$/.test(wave)) continue;
    out.push({
      wave,
      apps:          idx.apps >= 0     ? extractNumber(cells[idx.apps])     : undefined,
      servers:       idx.servers >= 0  ? extractNumber(cells[idx.servers])  : undefined,
      databases:     idx.dbs >= 0      ? extractNumber(cells[idx.dbs])      : undefined,
      durationWeeks: idx.duration >= 0 ? extractNumber(cells[idx.duration]) : undefined,
      raw: line,
    });
  }
  return out;
}

function extractNumber(cell: string | undefined): number | undefined {
  if (!cell) return undefined;
  const m = cell.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
}

export function checkWaveLimits(waves: WaveCounts[]): WaveWarning[] {
  const warnings: WaveWarning[] = [];
  for (const w of waves) {
    if (typeof w.apps === "number" && w.apps > WAVE_LIMITS.maxApps) {
      warnings.push({ wave: w.wave, rule: "apps per wave", observed: w.apps, limit: WAVE_LIMITS.maxApps });
    }
    if (typeof w.servers === "number" && w.servers > WAVE_LIMITS.maxServers) {
      warnings.push({ wave: w.wave, rule: "servers per wave", observed: w.servers, limit: WAVE_LIMITS.maxServers });
    }
    if (typeof w.databases === "number" && w.databases > WAVE_LIMITS.maxDatabases) {
      warnings.push({ wave: w.wave, rule: "databases per wave", observed: w.databases, limit: WAVE_LIMITS.maxDatabases });
    }
    if (typeof w.durationWeeks === "number") {
      if (w.durationWeeks < WAVE_LIMITS.minDurationWeeks) {
        warnings.push({ wave: w.wave, rule: "duration too short (weeks)", observed: w.durationWeeks, limit: WAVE_LIMITS.minDurationWeeks });
      }
      if (w.durationWeeks > WAVE_LIMITS.maxDurationWeeks) {
        warnings.push({ wave: w.wave, rule: "duration too long (weeks)", observed: w.durationWeeks, limit: WAVE_LIMITS.maxDurationWeeks });
      }
    }
  }
  return warnings;
}

export function formatWaveWarnings(warnings: WaveWarning[]): string {
  if (warnings.length === 0) return "";
  const rows = warnings.map((w) =>
    `- **${w.wave}** — ${w.rule}: observed ${w.observed}, limit ${w.limit} (IBM wave methodology)`
  ).join("\n");
  return `\n\n---\n\n## ⚠ Wave-plan rule violations (auto-checked)\n\n${rows}\n\n*Recommend splitting the flagged wave(s) and re-sequencing by application dependency. Limits derived from IBM published guidance: ${WAVE_LIMITS.maxApps} apps / ${WAVE_LIMITS.maxServers} servers / ${WAVE_LIMITS.maxDatabases} databases per wave, ${WAVE_LIMITS.minDurationWeeks}–${WAVE_LIMITS.maxDurationWeeks} weeks.*\n`;
}

// Greedy bin-packing for use in tests + future automated splitter.
// Input: a single oversize wave's totals. Output: how many sub-waves needed
// so each respects all three limits.
export function splitsRequired(totals: { apps?: number; servers?: number; databases?: number }): number {
  const byApps = totals.apps    ? Math.ceil(totals.apps / WAVE_LIMITS.maxApps)         : 1;
  const bySrv  = totals.servers ? Math.ceil(totals.servers / WAVE_LIMITS.maxServers)   : 1;
  const byDb   = totals.databases ? Math.ceil(totals.databases / WAVE_LIMITS.maxDatabases) : 1;
  return Math.max(byApps, bySrv, byDb, 1);
}
