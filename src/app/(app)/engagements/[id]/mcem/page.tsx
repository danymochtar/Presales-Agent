import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { McemForm } from "@/components/mcem-form";
import { stageLabel, type Mcem } from "@/lib/mcem";

export const metadata = { title: "MCEM · Noventiq Multicloud Agent" };

export default async function McemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const engagement = await prisma.engagement.findFirst({
    where: { id, tenant: { users: { some: { id: session!.user.id } } } },
  });
  if (!engagement) notFound();
  const initial = ((engagement.mcem as Mcem | null) ?? {});
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <div className="text-sm text-muted-foreground mb-1">
          <Link href={`/engagements/${id}`} className="hover:text-foreground">← {engagement.name}</Link>
          <span> · {engagement.customer}</span>
          <span> · {stageLabel(engagement.stage)}</span>
        </div>
        <h1 className="text-xl md:text-2xl font-semibold">MCEM stage check</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Five-phase exit criteria from the Microsoft Customer Engagement Methodology — auto-aligned to your engagement&apos;s current funnel stage. Tick what&apos;s done; the dashboard surfaces the first undone item per engagement so you always know what to do next.
        </p>
      </div>
      <McemForm engagementId={id} stage={engagement.stage} initial={initial} />
    </div>
  );
}
