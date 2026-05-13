import { NewTrackerWizard } from "@/components/pipeline/new-tracker-wizard";

export default function NewTrackerPage() {
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Add tracker(s)</h1>
        <p className="text-sm text-muted-foreground">
          Drop one or many source Excels at once. For each file the agent runs AI mapping — it reads the column
          headers + a handful of sample rows and proposes the canonical-field mapping, tracker name, source, and
          purpose. Review per file, then import all at once.
        </p>
      </div>
      <NewTrackerWizard />
    </div>
  );
}
