import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrackerCard } from "@/components/pipeline/tracker-card";

export default async function TrackersIndexPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const trackers = await prisma.tracker.findMany({
    where: { tenantId: tenant.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { opportunities: true } } },
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-semibold">Trackers</h1>
        <Button asChild size="sm">
          <Link href="/pipeline/trackers/new">Add tracker</Link>
        </Button>
      </div>
      {trackers.length === 0 ? (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">No trackers</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Upload your first source Excel to start consolidating.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {trackers.map((t) => (
            <TrackerCard
              key={t.id}
              id={t.id}
              name={t.name}
              source={t.source}
              count={t._count.opportunities}
              lastSyncAt={t.lastSyncAt ? t.lastSyncAt.toISOString() : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
