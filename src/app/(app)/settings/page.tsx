import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireSessionAndTenant } from "@/lib/tenant";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TenantEditor } from "@/components/tenant-editor";
import { BrandingForm } from "@/components/settings/branding-form";
import { VocabularyEditor, type VocabularySection } from "@/components/settings/vocabulary-editor";
import { ThresholdsForm } from "@/components/settings/thresholds-form";
import { tenantBranding, tenantThresholds, tenantLabel } from "@/lib/tenant-settings";
import { STATUS_LABELS, PIPELINE_STATUSES } from "@/lib/pipeline/status";
import { ORIGIN_LABELS, OPPORTUNITY_ORIGINS } from "@/lib/pipeline/origin";
import { PURPOSE_LABELS, TRACKER_PURPOSES } from "@/lib/pipeline/purpose";
import { PHASE_LABELS, MCEM_PHASES } from "@/lib/mcem";
import { ROLE_LABELS, PERSONNEL_ROLES } from "@/lib/team/roles";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const { tenant } = await requireSessionAndTenant(session!.user.id);
  const [rateCount, catalogCount, patternCount] = await Promise.all([
    prisma.rateCardItem.count({ where: { tenantId: tenant.id } }),
    prisma.serviceCatalogItem.count({ where: { tenantId: tenant.id } }),
    prisma.learnedPattern.count({ where: { tenantId: tenant.id, active: true } }),
  ]);

  // Build vocabulary sections — every label key the user might want to rename.
  const buildSection = (
    title: string,
    description: string,
    namespace: string,
    keys: string[],
    fallbacks: Record<string, string>,
  ): VocabularySection => ({
    title,
    description,
    entries: keys.map((k) => {
      const key = `${namespace}.${k}`;
      const fallback = fallbacks[k] ?? k;
      return { key, label: tenantLabel(tenant, key, fallback), defaultLabel: fallback };
    }),
  });

  const vocabularySections: VocabularySection[] = [
    buildSection("Pipeline status", "Status pills shown across the pipeline tracker. Keyword detection still uses the canonical key — overrides only change display.", "status", [...PIPELINE_STATUSES], STATUS_LABELS),
    buildSection("Opportunity origin", "How opportunities are bucketed for FY planning (carry-over / target / existing / net-new).", "origin", [...OPPORTUNITY_ORIGINS], ORIGIN_LABELS),
    buildSection("Tracker purpose", "What kind of data a tracker holds — historical / target / current / funding.", "purpose", [...TRACKER_PURPOSES], PURPOSE_LABELS),
    buildSection("MCEM phase", "Names for the five Microsoft Customer Engagement Methodology phases.", "phase", [...MCEM_PHASES], PHASE_LABELS),
    buildSection("Team role", "How team members are categorized — SA / Sales / AM / etc.", "role", [...PERSONNEL_ROLES], ROLE_LABELS),
  ];

  const branding = tenantBranding(tenant);
  const thresholds = tenantThresholds(tenant);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Everything configurable per tenant — workspace identity, brand, vocabulary, operational thresholds, and the
          operational catalogs (rate card / services / custom rules). Changes apply on the next page reload.
        </p>
      </div>

      <Card id="general">
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Tenant identity, currency, FX. Used everywhere a number gets converted USD ↔ MYR.</CardDescription>
        </CardHeader>
        <CardContent>
          <TenantEditor
            tenant={{
              id: tenant.id,
              name: tenant.name,
              country: tenant.country,
              locale: tenant.locale,
              currency: tenant.currency,
              fxMyrPerUsd: tenant.fxMyrPerUsd,
            }}
          />
        </CardContent>
      </Card>

      <Card id="branding">
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Workspace display name, logo letter, accent + cloud-chip colors. Curated swatches keep contrast readable in light + dark mode.</CardDescription>
        </CardHeader>
        <CardContent>
          <BrandingForm initial={branding} />
        </CardContent>
      </Card>

      <Card id="vocabulary">
        <CardHeader>
          <CardTitle>Vocabulary</CardTitle>
          <CardDescription>Rename any label across the platform — pipeline status, opportunity origin, tracker purpose, MCEM phase, team role. Empty override falls back to default.</CardDescription>
        </CardHeader>
        <CardContent>
          <VocabularyEditor sections={vocabularySections} />
        </CardContent>
      </Card>

      <Card id="thresholds">
        <CardHeader>
          <CardTitle>Thresholds</CardTitle>
          <CardDescription>Operational cutoffs — MCEM health bands, upload size cap, dashboard window sizes. Defaults match the Microsoft co-sell partner motion.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThresholdsForm initial={thresholds} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardDescription>Rate card</CardDescription>
            <CardTitle className="text-3xl">{rateCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/settings/rate-card" className="text-sm underline">Edit rate card</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Service catalog</CardDescription>
            <CardTitle className="text-3xl">{catalogCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/settings/service-catalog" className="text-sm underline">Edit catalog</Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Custom rules</CardDescription>
            <CardTitle className="text-3xl">{patternCount}</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/settings/patterns" className="text-sm underline">Manage rules</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
