import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeliverableWorkspace } from "@/components/deliverable-workspace";

export default async function ProposalPage({
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
      deliverables: { orderBy: [{ type: "asc" }, { version: "desc" }] },
    },
  });
  if (!project) notFound();

  const proposals = project.deliverables.filter((d) => d.type === "proposal");
  const latestBom = project.deliverables.find((d) => d.type === "bom");
  const selected = v ? proposals.find((d) => d.version === Number(v)) : proposals[0];

  return (
    <DeliverableWorkspace
      projectId={project.id}
      projectName={project.name}
      deliverableType="proposal"
      generatePath={`/api/projects/${project.id}/proposal/generate`}
      canGenerate={!!latestBom}
      prerequisiteMessage={latestBom ? null : "Generate a BOM first — the proposal references it for pricing."}
      versions={proposals.map((d) => ({ id: d.id, version: d.version, status: d.status, createdAt: d.createdAt.toISOString() }))}
      selectedContent={selected?.contentMd ?? null}
      selectedVersion={selected?.version ?? null}
      selectedDeliverableId={selected?.id ?? null}
    />
  );
}
