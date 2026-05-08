import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeliverableWorkspace } from "@/components/deliverable-workspace";

export default async function CustomerStudyPage({
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
      deliverables: { where: { type: "customer_study" }, orderBy: { version: "desc" } },
    },
  });
  if (!project) notFound();

  const selected = v ? project.deliverables.find((d) => d.version === Number(v)) : project.deliverables[0];

  return (
    <DeliverableWorkspace
      projectId={project.id}
      projectName={project.name}
      projectMode={project.mode as "production" | "training"}
      deliverableType="customer_study"
      generatePath={`/api/projects/${project.id}/customer-study/generate`}
      canGenerate={true}
      prerequisiteMessage={null}
      versions={project.deliverables.map((d) => ({ id: d.id, version: d.version, status: d.status, createdAt: d.createdAt.toISOString() }))}
      selectedContent={selected?.contentMd ?? null}
      selectedVersion={selected?.version ?? null}
      selectedDeliverableId={selected?.id ?? null}
    />
  );
}
