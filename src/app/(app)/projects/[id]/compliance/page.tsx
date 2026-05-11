import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ComplianceForm } from "@/components/compliance-form";
import { isApplicable, type ProjectComplianceJson } from "@/lib/compliance/bnm-rmit";

export const metadata = { title: "BNM RMiT compliance · Noventiq Multicloud Agent" };

export default async function CompliancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session!.user.id } } } },
    include: { tenant: true },
  });
  if (!project) notFound();
  if (!isApplicable(project)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>BNM RMiT — not applicable</CardTitle>
          <CardDescription>
            This project isn&apos;t classified as a Malaysian BFSI engagement, so the RMiT compliance gate doesn&apos;t apply.
            Update Customer Segment + Tenant Country on the project if that&apos;s wrong.{" "}
            <Link href={`/projects/${id}`} className="underline">← Back to project</Link>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const compliance = (project.compliance as ProjectComplianceJson | null) ?? null;
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">BNM RMiT compliance check</h1>
        <p className="text-sm text-muted-foreground">
          Bank Negara Malaysia / Risk Management in Technology — Policy Document BNM/RH/PD 028-98 (28 November 2025).
          Answer the critical-system triage + Appendix 10 control checklist before producing customer-facing SOW / Proposal artefacts.
          {" "}<Link href={`/projects/${id}`} className="underline">← Project</Link>
        </p>
      </div>
      <ComplianceForm projectId={id} initial={compliance?.rmit ?? null} />
    </div>
  );
}
