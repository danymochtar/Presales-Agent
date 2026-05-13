import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateUploadForm } from "@/components/template-upload-form";
import { TemplateList } from "@/components/template-list";

export default async function LibraryPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const templates = await prisma.template.findMany({
    where: { tenantId: tenant.id },
    orderBy: [{ status: "asc" }, { type: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Reference library</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a reference deliverable for every doc type you produce — BOM, Proposal, SOW, Assessment, Architecture, TCO, Project plan, Managed services offering, Letterhead. The agent uses these as house-style anchors when generating new deliverables, so the output matches your team&apos;s format, voice, and section ordering. Filter by cloud + engagement type so the right template applies in the right context.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload a reference</CardTitle>
          <CardDescription>
            Drop a sample of how a deliverable should look — house-style BOM, gold-standard architecture
            doc, BFSI-tone proposal. Per-doc-type repos below show what&apos;s already in the library.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateUploadForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Library ({templates.length})</CardTitle>
          <CardDescription>
            Grouped per doc type. Active templates feed into generation. Archive (without deleting) to pause without losing the reference.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateList
            initial={templates.map((t) => ({
              id: t.id,
              type: t.type,
              cloudProvider: t.cloudProvider,
              engagementType: t.engagementType,
              name: t.name,
              description: t.description,
              originalName: t.originalName,
              textContent: t.textContent,
              status: t.status,
              createdAt: t.createdAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
