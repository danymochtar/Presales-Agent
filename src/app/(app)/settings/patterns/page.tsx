import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LearnedPatternsList } from "@/components/learned-patterns-list";

export default async function PatternsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const patterns = await prisma.learnedPattern.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ deliverableType: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Custom rules</h1>
        <Link href="/settings" className="text-sm underline">← Back to settings</Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Rules extracted from training feedback</CardTitle>
          <CardDescription>
            Active patterns are applied to every new generation of the matching deliverable type. Disable to
            silence a rule without losing it; delete to remove permanently.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LearnedPatternsList
            initial={patterns.map((p) => ({
              id: p.id,
              deliverableType: p.deliverableType,
              pattern: p.pattern,
              scope: p.scope,
              conditions: p.conditions,
              confidence: p.confidence,
              rationale: p.rationale,
              active: p.active,
              createdAt: p.createdAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
