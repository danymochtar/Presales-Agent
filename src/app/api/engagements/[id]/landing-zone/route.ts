import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { EngagementLandingZoneJson } from "@/lib/landing-zone/picker";

export const runtime = "nodejs";

const ArchetypeEnum = z.enum(["infra", "platform", "data_ai"]);
const CloudEnum = z.enum(["azure", "aws", "gcp"]);

const Body = z.object({
  archetypes: z.array(ArchetypeEnum).min(1),
  selectionsByCloud: z.record(CloudEnum, z.array(z.string())),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const own = await prisma.engagement.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    select: { id: true },
  });
  if (!own) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const lz: EngagementLandingZoneJson = {
    archetypes: parsed.data.archetypes,
    selectionsByCloud: parsed.data.selectionsByCloud,
    updatedAt: new Date().toISOString(),
  };

  await prisma.engagement.update({
    where: { id },
    data: { landingZone: lz as object },
  });
  return NextResponse.json({ ok: true, landingZone: lz });
}
