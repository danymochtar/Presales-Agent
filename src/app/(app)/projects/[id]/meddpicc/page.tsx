import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MeddpiccForm } from "@/components/meddpicc-form";
import { emptyMeddpicc, type Meddpicc } from "@/lib/meddpicc";

export const metadata = { title: "MEDDPICC · Noventiq Multicloud Agent" };

export default async function MeddpiccPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const project = await prisma.project.findFirst({
    where: { id, tenant: { users: { some: { id: session!.user.id } } } },
  });
  if (!project) notFound();
  const initial = ((project.meddpicc as Meddpicc | null) ?? emptyMeddpicc());
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">MEDDPICC — {project.name}</h1>
        <p className="text-sm text-muted-foreground">
          Eight-field qualification rubric. Score weights shift with deal stage; fields stale &gt; 30 days lose half their score.
          {" "}<Link href={`/projects/${id}`} className="underline">← Project</Link>
        </p>
      </div>
      <MeddpiccForm projectId={id} stage={project.stage} initial={initial} />
    </div>
  );
}
