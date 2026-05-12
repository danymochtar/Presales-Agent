import { NewTrackerWizard } from "@/components/pipeline/new-tracker-wizard";

export default function NewTrackerPage() {
  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Add tracker</h1>
        <p className="text-sm text-muted-foreground">
          Upload your source Excel. We&apos;ll detect column headers and suggest a mapping onto the canonical opportunity shape — review, then import.
        </p>
      </div>
      <NewTrackerWizard />
    </div>
  );
}
