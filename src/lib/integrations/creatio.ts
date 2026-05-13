// Minimal Creatio CRM connector. Creatio (formerly bpm'online) uses
// cookie-based forms auth + OData / DataService endpoints. This module
// implements the subset we need to pull Opportunities into the pipeline
// tracker:
//
//   1. POST  /ServiceModel/AuthService.svc/Login     — auth, captures session cookies
//   2. GET   /0/odata/Opportunity?$select=...        — list opportunities (OData v4)
//
// Reference:
//   https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/architecture/integration/web-services/odata
//   https://academy.creatio.com/docs/8.x/dev/development-on-creatio-platform/architecture/integration/web-services/authentication
//
// Credentials are stored on `Tenant.integrations.creatio` (see schema). For
// the pilot they're unencrypted JSON — production should wrap with KMS
// envelope encryption before going wide.

export type CreatioCredentials = {
  baseUrl: string;      // e.g. https://yourcompany.creatio.com
  username: string;
  password: string;
  lastSyncAt?: string | null;
};

export type CreatioOpportunity = {
  Id: string;
  Title: string | null;
  AccountId?: string | null;
  Account?: { Name?: string | null } | null;
  ContactId?: string | null;
  Amount: number | null;
  DueDate: string | null;     // ISO
  StageId?: string | null;
  Stage?: { Name?: string | null } | null;
  OwnerId?: string | null;
  Owner?: { Name?: string | null } | null;
};

export type CreatioSyncRow = {
  externalId: string;
  customer: string;
  name: string;
  rawStatus: string | null;
  valueUsd: number | null;
  closeDate: Date | null;
  ownerName: string | null;
  raw: Record<string, unknown>;
};

export class CreatioError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

// Auth response contains a "Code" field; 0 = success. Session cookies sit
// on Set-Cookie. We forward the cookie string back into subsequent calls.
async function login(creds: CreatioCredentials): Promise<{ cookie: string }> {
  const url = `${creds.baseUrl.replace(/\/$/, "")}/ServiceModel/AuthService.svc/Login`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "ForceUseSession": "true" },
    body: JSON.stringify({ UserName: creds.username, UserPassword: creds.password }),
  });
  if (!res.ok) {
    throw new CreatioError(`Login failed: HTTP ${res.status}`, res.status);
  }
  const body = (await res.json().catch(() => ({}))) as { Code?: number; Message?: string };
  if (body.Code !== 0) {
    throw new CreatioError(body.Message || `Login failed (Code ${body.Code})`, 401);
  }
  // Pull every Set-Cookie line into a single Cookie header for follow-ups.
  const cookieHeader = res.headers.get("set-cookie") ?? "";
  if (!cookieHeader) {
    throw new CreatioError("Login succeeded but no session cookie returned", 500);
  }
  const cookie = cookieHeader.split(/,(?=[^ ;]+=)/g).map((c) => c.split(";")[0]).join("; ");
  return { cookie };
}

/**
 * Quick credential check used by the Test connection button. Calls Login
 * and discards the session. Returns user-friendly success/failure.
 */
export async function testConnection(creds: CreatioCredentials): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await login(creds);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown error" };
  }
}

/**
 * Pull up to `take` opportunities from Creatio + normalize into our row
 * shape so the importer can upsert straight onto Opportunity rows.
 *
 * Excluding Lost / Cancelled stages by default — those don't belong in the
 * live pipe. Caller can pass `includeClosed = true` to bring everything.
 */
export async function fetchOpportunities(
  creds: CreatioCredentials,
  opts: { take?: number; includeClosed?: boolean } = {},
): Promise<CreatioSyncRow[]> {
  const take = opts.take ?? 500;
  const { cookie } = await login(creds);
  const baseUrl = creds.baseUrl.replace(/\/$/, "");
  // OData v4 — expand Account, Stage, Owner so we don't need extra round-trips.
  const params = new URLSearchParams({
    "$select": "Id,Title,AccountId,Amount,DueDate,StageId,OwnerId",
    "$expand": "Account($select=Name),Stage($select=Name),Owner($select=Name)",
    "$top": String(take),
  });
  if (!opts.includeClosed) {
    // Creatio stage names vary by tenant; this is a heuristic excluding
    // anything starting with "Closed" or "Cancelled" via $filter on Stage.
    params.set("$filter", "not (startswith(Stage/Name,'Closed') or startswith(Stage/Name,'Cancel'))");
  }
  const url = `${baseUrl}/0/odata/Opportunity?${params.toString()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "Cookie": cookie, "Accept": "application/json;odata.metadata=minimal", "ForceUseSession": "true" },
  });
  if (!res.ok) {
    throw new CreatioError(`Fetch opportunities failed: HTTP ${res.status}`, res.status);
  }
  const body = (await res.json().catch(() => ({}))) as { value?: CreatioOpportunity[] };
  const opps = body.value ?? [];

  return opps.map((o) => ({
    externalId: o.Id,
    customer: o.Account?.Name?.trim() || "(no account)",
    name: o.Title?.trim() || "(untitled)",
    rawStatus: o.Stage?.Name ?? null,
    valueUsd: typeof o.Amount === "number" ? o.Amount : null,
    closeDate: o.DueDate ? new Date(o.DueDate) : null,
    ownerName: o.Owner?.Name ?? null,
    raw: o as unknown as Record<string, unknown>,
  }));
}
