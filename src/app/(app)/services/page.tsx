import { ServiceMapTable } from "@/components/service-map-table";

export const metadata = { title: "Service comparison · Noventiq Multicloud Agent" };

export default function ServicesPage() {
  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Cloud service comparison</h1>
        <p className="text-sm text-muted-foreground">
          Side-by-side equivalents across Azure, AWS, and GCP — grouped by capability.
          Filter by category or search by keyword. Service names track each vendor&apos;s
          current public branding (refresh annually as renames happen).
        </p>
      </div>
      <ServiceMapTable />
    </div>
  );
}
