import { QuickGenerateWizard } from "@/components/quick-generate-wizard";

export const metadata = { title: "Quick generate · Noventiq Multicloud Agent" };

export default function QuickPage() {
  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Quick generate</h1>
        <p className="text-sm text-muted-foreground">
          Pick one deliverable, supply just its prerequisites, and get the document. Use this when you don&apos;t need
          the full pipeline — for example when you have a BOM-only ask, or want a SOW from an existing proposal.
          For end-to-end engagements, use <a href="/engagements/new" className="underline">+ New project</a> instead.{" "}
          <a href="/help" className="underline">How it works</a>.
        </p>
      </div>
      <QuickGenerateWizard />
    </div>
  );
}
