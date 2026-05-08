import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const Patch = z.object({
  name: z.string().min(2).optional(),
  customer: z.string().min(2).optional(),
  industry: z.string().optional().nullable(),
  scopeSummary: z.string().optional().nullable(),
  primaryRegion: z.string().optional(),
  drRegion: z.string().optional(),
  stage: z.enum(["draft", "won", "lost", "pending", "graduated"]).optional(),
  mode: z.enum(["production", "training"]).optional(),
});

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
    include: {
      inputs: { orderBy: { createdAt: "desc" } },
      deliverables: { orderBy: [{ type: "asc" }, { version: "desc" }] },
    },
  });
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const own = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
  });
  if (!own) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json();
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const project = await prisma.project.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ project });
}
