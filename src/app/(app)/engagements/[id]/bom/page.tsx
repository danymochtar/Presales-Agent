import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeliverableWorkspace } from "@/components/deliverable-workspace";

const CLOUD_LABELS: Record<string, string> = {
  azure: "Azure",
  aws: "AWS",
  gcp: "GCP",
  compare: "Compare",
};

export default async function BomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string; cloud?: string }>;
}) {
  const { id } = await params;
  const { v, cloud } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  const project = await prisma.engagement.findFirst({
    where: { id, tenant: { users: { some: { id: session!.user.id } } } },
    include: {
      inputs: { orderBy: { createdAt: "desc" }, take: 1 },
      deliverables: { where: { type: "bom" }, orderBy: { version: "desc" } },
    },
  });
  if (!project) notFound();

  const targetClouds = (project.targetClouds as string[]) ?? ["azure"];
  const tabClouds = targetClouds.filter((c) => c !== "gcp");

  const tabs: { id: string; label: string }[] = tabClouds.map((c) => ({ id: c, label: CLOUD_LABELS[c] ?? c }));
  if (tabClouds.length >= 2) tabs.push({ id: "compare", label: "Compare" });

  const activeCloud = cloud && tabs.some((t) => t.id === cloud) ? cloud : tabs[0]?.id ?? "azure";

  // Filter versions for the active cloud. Treat legacy null cloudProvider rows
  // as Azure (they were generated before MVP 2 introduced the field).
  const versionsForCloud = project.deliverables.filter((d) => {
    if (activeCloud === "azure") return d.cloudProvider === "azure" || d.cloudProvider === null;
    return d.cloudProvider === activeCloud;
  });
  const selected = v ? versionsForCloud.find((d) => d.version === Number(v)) : versionsForCloud[0];
  const hasInput = project.inputs.length > 0;

  return (
    <DeliverableWorkspace
      projectId={project.id}
      projectName={project.name}
      projectMode={project.mode as "production" | "training"}
      deliverableType="bom"
      generatePath={`/api/engagements/${project.id}/bom/generate?cloud=${activeCloud}`}
      canGenerate={hasInput}
      prerequisiteMessage={hasInput ? null : "Upload an inventory (RVTools / Azure Migrate / generic CSV) first — BOM is built from workloads."}
      versions={versionsForCloud.map((d) => ({ id: d.id, version: d.version, status: d.status, createdAt: d.createdAt.toISOString() }))}
      selectedContent={selected?.contentMd ?? null}
      selectedVersion={selected?.version ?? null}
      selectedDeliverableId={selected?.id ?? null}
      cloudTabs={tabs}
      activeCloud={activeCloud}
      basePath={`/engagements/${project.id}/bom`}
    />
  );
}
