import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeliverableWorkspace } from "@/components/deliverable-workspace";

export default async function BomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { id } = await params;
  const { v } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session!.user.id } } } },
    include: {
      inputs: { orderBy: { createdAt: "desc" }, take: 1 },
      deliverables: { where: { type: "bom" }, orderBy: { version: "desc" } },
    },
  });
  if (!project) notFound();

  const selected = v ? project.deliverables.find((d) => d.version === Number(v)) : project.deliverables[0];
  const hasInput = project.inputs.length > 0;

  return (
    <DeliverableWorkspace
      projectId={project.id}
      projectName={project.name}
      projectMode={project.mode as "production" | "training"}
      deliverableType="bom"
      generatePath={`/api/projects/${project.id}/bom/generate`}
      canGenerate={hasInput}
      prerequisiteMessage={hasInput ? null : "Upload an inventory (RVTools / Azure Migrate) first — BOM is built from workloads."}
      versions={project.deliverables.map((d) => ({ id: d.id, version: d.version, status: d.status, createdAt: d.createdAt.toISOString() }))}
      selectedContent={selected?.contentMd ?? null}
      selectedVersion={selected?.version ?? null}
      selectedDeliverableId={selected?.id ?? null}
    />
  );
}
