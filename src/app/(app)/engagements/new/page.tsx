import Link from "next/link";
import { ProjectCreateWizard } from "@/components/project-create-wizard";

export default function NewProjectPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">New project</h1>
        <p className="text-sm text-muted-foreground">
          Upload customer documents — the agent classifies the engagement and walks you through the
          recommended deliverable flow. Need just one document?{" "}
          <Link href="/quick" className="underline">Quick generate</Link>.{" "}
          <Link href="/help" className="underline">How it works</Link>.
        </p>
      </div>
      <ProjectCreateWizard />
    </div>
  );
}
