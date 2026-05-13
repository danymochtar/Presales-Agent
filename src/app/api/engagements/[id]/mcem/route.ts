import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MCEM_ITEMS, getItem, type Mcem, type McemItemKey } from "@/lib/mcem";
import { syncEngagementToPipeline } from "@/lib/pipeline/sync";

export const runtime = "nodejs";

const ItemKeyEnum = z.enum(MCEM_ITEMS.map((i) => i.key) as [McemItemKey, ...McemItemKey[]]);

// Per-item toggle: caller PATCHes { key, done? | note? } for one criterion at
// a time. The form does optimistic UI; the server only mutates the matching
// JSON sub-key so we don't clobber concurrent updates from other items.
const Body = z.object({
  key: ItemKeyEnum,
  done: z.boolean().optional(),
  note: z.string().nullable().optional(),
  owner: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const engagement = await prisma.engagement.findFirst({
    where: { id, tenant: { users: { some: { id: session.user.id } } } },
  });
  if (!engagement) return NextResponse.json({ error: "not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { key, done, note, owner } = parsed.data;
  const prev = (engagement.mcem as Mcem | null) ?? {};
  const before = prev[key] ?? { done: false };
  const now = new Date().toISOString();

  const next: Mcem = {
    ...prev,
    [key]: {
      done: done ?? before.done ?? false,
      note: note !== undefined ? note : before.note ?? null,
      owner: owner !== undefined ? owner : before.owner ?? null,
      completedAt:
        done === true && !before.done ? now :
        done === false ? null :
        before.completedAt ?? null,
    },
  };

  await prisma.engagement.update({
    where: { id },
    data: { mcem: next as object },
  });

  // When a checklist item flips from undone → done (or back), stamp every
  // matched pipeline opportunity with what changed. Skip note-only edits to
  // avoid noisy sync traffic.
  if (done !== undefined && done !== (before.done ?? false)) {
    const label = getItem(key)?.label ?? key;
    const activity = done ? `MCEM ✓ ${label}` : `MCEM unchecked ${label}`;
    void syncEngagementToPipeline(id, activity).catch(() => undefined);
  }

  return NextResponse.json({ mcem: next });
}
