import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function masked(v: string | undefined): string {
  if (!v) return "MISSING";
  if (v.length < 8) return `len=${v.length} (too short)`;
  return `${v.slice(0, 6)}...${v.slice(-4)} len=${v.length}`;
}

function hostFromUrl(url: string | undefined): string {
  if (!url) return "unset";
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username ? "<user>:<pwd>@" : ""}${u.hostname}:${u.port}${u.pathname}${u.search}`;
  } catch {
    return "invalid";
  }
}

export async function GET() {
  const env = {
    DATABASE_URL_set: !!process.env.DATABASE_URL,
    DATABASE_URL_shape: hostFromUrl(process.env.DATABASE_URL),
    BETTER_AUTH_SECRET: masked(process.env.BETTER_AUTH_SECRET),
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "(unset — relying on auto-detect)",
    AI_GATEWAY_API_KEY: masked(process.env.AI_GATEWAY_API_KEY),
    VERCEL_URL: process.env.VERCEL_URL ?? "unset",
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "unset",
    VERCEL_ENV: process.env.VERCEL_ENV ?? "unset",
    NODE_ENV: process.env.NODE_ENV,
  };

  const db: Record<string, unknown> = { connected: false };
  const start = Date.now();
  try {
    const ping = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`;
    db.connected = true;
    db.ping_ms = Date.now() - start;
    db.ping_result = ping[0];

    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    db.tables = tables.map((t) => t.table_name);
    db.has_auth_user_table = tables.some((t) => t.table_name === "auth_user");
    db.has_tenant_table = tables.some((t) => t.table_name === "Tenant");

    if (db.has_auth_user_table) {
      const userCount = await prisma.user.count();
      db.user_count = userCount;
    }
  } catch (e) {
    db.error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    const code = (e as { code?: string })?.code;
    if (code) db.error_code = code;
  }

  return NextResponse.json({ timestamp: new Date().toISOString(), env, db }, { status: 200 });
}
