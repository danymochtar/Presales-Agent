import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Meddpicc } from "@/lib/meddpicc";

const Entry = z.object({
  value: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
});

const Body = z.object({
  metrics:          Entry,
  economicBuyer:    Entry,
  decisionCriteria: Entry,
  decisionProcess:  Entry,
  paperProcess:     Entry,
  identifyPain:     Entry,
  champion:         Entry,
  competition:      Entry,
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const project = await prisma.engagement.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const prev = (project.meddpicc as Meddpicc | null) ?? null;
  const now = new Date().toISOString();
  const next: Meddpicc = Object.fromEntries(
    Object.entries(parsed.data).map(([k, v]) => {
      const before = prev?.[k as keyof Meddpicc];
      const valueChanged = (before?.value ?? null) !== (v.value ?? null) || before?.confidence !== v.confidence;
      return [k, {
        value: v.value,
        confidence: v.confidence,
        lastUpdated: valueChanged ? now : before?.lastUpdated ?? now,
      }];
    }),
  ) as Meddpicc;

  await prisma.engagement.update({
    where: { id },
    data: { meddpicc: next as object },
  });
  return NextResponse.json({ meddpicc: next });
}
