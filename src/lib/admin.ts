// Server-side superadmin gate. Throws (or returns null) if the caller isn't a
// superadmin in the tenant. Use at the top of /admin/* pages and
// /api/admin/* routes.

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { requireSessionAndTenant } from "./tenant";

export type SuperadminContext = {
  userId: string;
  tenantId: string;
  user: { id: string; email: string; name: string; role: string };
};

export async function requireSuperadmin(): Promise<SuperadminContext | NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user, tenant } = await requireSessionAndTenant(session.user.id);
  if (user.role !== "superadmin") {
    return NextResponse.json({ error: "forbidden — superadmin only" }, { status: 403 });
  }
  return {
    userId: user.id,
    tenantId: tenant.id,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  };
}

// Page-flavour helper: returns user/tenant if superadmin, else null. The page
// component handles the redirect/notFound itself.
export async function getSuperadminContextForPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, include: { tenant: true } });
  if (!user) return null;
  if (user.role !== "superadmin") return null;
  if (!user.tenant) return null;
  return { user, tenant: user.tenant };
}

export function isContextResponse(c: SuperadminContext | NextResponse): c is NextResponse {
  return c instanceof NextResponse;
}
