import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
