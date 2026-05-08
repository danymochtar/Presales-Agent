import { ServiceMapTable } from "@/components/service-map-table";

export const metadata = { title: "Services mapping · Noventiq Multicloud Agent" };

export default function ServicesPage() {
  return (
    <div className="space-y-4 max-w-6xl">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Services mapping</h1>
        <p className="text-sm text-muted-foreground">
          Side-by-side equivalents across Azure, AWS, and GCP — grouped by capability.
          Filter by category or search by keyword. The notes column flags real gaps
          where one cloud has no first-party offering. Service names track each vendor&apos;s
          current public branding (refresh quarterly as renames + retirements happen).
        </p>
      </div>
      <ServiceMapTable />
    </div>
  );
}
