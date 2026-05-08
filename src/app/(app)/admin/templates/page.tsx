import { prisma } from "@/lib/prisma";
import { getSuperadminContextForPage } from "@/lib/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TemplateUploadForm } from "@/components/template-upload-form";
import { TemplateList } from "@/components/template-list";

export default async function TemplatesPage() {
  const ctx = (await getSuperadminContextForPage())!;
  const templates = await prisma.template.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: [{ status: "asc" }, { type: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload reference template</CardTitle>
          <CardDescription>
            Drop a sample of how a deliverable should look — house-style BOM, gold-standard architecture
            doc, BFSI-tone proposal. The agent uses these as few-shot references when generating matching
            deliverables. Filter by cloud + project type so the right template applies in the right
            context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateUploadForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All templates ({templates.length})</CardTitle>
          <CardDescription>Active templates feed into generation. Archive without deleting if you want to pause without losing the reference.</CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateList
            initial={templates.map((t) => ({
              id: t.id,
              type: t.type,
              cloudProvider: t.cloudProvider,
              projectType: t.projectType,
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
