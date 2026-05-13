import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DeliverableWorkspace } from "@/components/deliverable-workspace";

const CLOUD_LABELS: Record<string, string> = { azure: "Azure", aws: "AWS", gcp: "GCP" };

export default async function SowPage({
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
      deliverables: { orderBy: { version: "desc" } },
    },
  });
  if (!project) notFound();

  const targetClouds = (project.targetClouds as string[]) ?? ["azure"];
  // SOW is post-decision — no Compare tab. Single cloud only.
  const tabClouds = targetClouds.filter((c) => c !== "gcp");
  const tabs: { id: string; label: string }[] = tabClouds.map((c) => ({ id: c, label: CLOUD_LABELS[c] ?? c }));

  const activeCloud = cloud && tabs.some((t) => t.id === cloud) ? cloud : project.primaryCloud ?? tabs[0]?.id ?? "azure";

  const sows = project.deliverables.filter((d) => d.type === "sow");
  const versionsForCloud = sows.filter((d) => {
    if (activeCloud === "azure") return d.cloudProvider === "azure" || d.cloudProvider === null;
    return d.cloudProvider === activeCloud;
  });
  const selected = v ? versionsForCloud.find((d) => d.version === Number(v)) : versionsForCloud[0];

  const haveBom = project.deliverables.some((d) => d.type === "bom");

  return (
    <DeliverableWorkspace
      projectId={project.id}
      projectName={project.name}
      projectMode={project.mode as "production" | "training"}
      deliverableType="sow"
      generatePath={`/api/engagements/${project.id}/sow/generate?cloud=${activeCloud}`}
      canGenerate={haveBom}
      prerequisiteMessage={
        haveBom
          ? null
          : "SOW commits to specific commercial terms — generate at least a BOM first. Ideally also have Architecture, Project Plan, and an approved Proposal in place."
      }
      versions={versionsForCloud.map((d) => ({ id: d.id, version: d.version, status: d.status, createdAt: d.createdAt.toISOString() }))}
      selectedContent={selected?.contentMd ?? null}
      selectedVersion={selected?.version ?? null}
      selectedDeliverableId={selected?.id ?? null}
      cloudTabs={tabs}
      activeCloud={activeCloud}
      basePath={`/engagements/${project.id}/sow`}
    />
  );
}
