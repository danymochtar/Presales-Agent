import { ProjectCreateWizard } from "@/components/project-create-wizard";

export default function NewProjectPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">New project</h1>
      <ProjectCreateWizard />
    </div>
  );
}
