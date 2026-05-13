import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markdownToDocxBuffer } from "@/lib/render/markdown-to-docx";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("unauthorized", { status: 401 });
  const { id } = await ctx.params;

  const deliverable = await prisma.deliverable.findFirst({
    where: { id, engagement: { tenant: { users: { some: { id: session.user.id } } } } },
    include: { engagement: true },
  });
  if (!deliverable) return new Response("not found", { status: 404 });

  const title = `${deliverable.engagement.name} — ${deliverable.type.toUpperCase()} v${deliverable.version}`;
  const buf = await markdownToDocxBuffer(deliverable.contentMd, title);
  const filename = `${deliverable.engagement.customer.replace(/[^a-zA-Z0-9]+/g, "-")}-${deliverable.type}-v${deliverable.version}.docx`;

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buf.length),
    },
  });
}
