import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  DELIVERABLE_PREREQS,
  DELIVERABLES_IN_LIFECYCLE_ORDER,
  GROUP_LABELS,
  NEED_LABELS,
  type Group,
  type DeliverableKind,
} from "@/lib/deliverable-prereqs";

export const metadata = { title: "Petunjuk · Noventiq Multicloud Agent" };

const NEED_ORDER: (keyof typeof NEED_LABELS)[] = [
  "customer", "scope", "inventory", "clouds", "regions", "purchaseModel", "onPremBaseline",
];

export default function HelpPage() {
  const grouped: Record<Group, DeliverableKind[]> = { discover: [], design: [], commercial: [], delivery: [] };
  for (const k of DELIVERABLES_IN_LIFECYCLE_ORDER) grouped[DELIVERABLE_PREREQS[k].group].push(k);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Petunjuk pakai</h1>
        <p className="text-sm text-muted-foreground">
          Quick reference biar nggak bingung. Skim sekali, balik ke sini kalau lupa.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mulai dari mana?</CardTitle>
          <CardDescription>Dua entry point di dashboard. Pilih sesuai ask.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border p-3 space-y-2">
            <div className="font-medium">A. Full project</div>
            <p className="text-muted-foreground">
              Upload semua doc customer (RFP, RVTools, Azure Migrate, meeting notes).
              AI klasifikasi tipe engagement + kasih flow yang disarankan, lalu lo run
              pipeline end-to-end.
            </p>
            <p className="text-xs"><strong>Pakai kalau:</strong> ngerjain deal lengkap dari Discover sampai SOW.</p>
            <Link href="/projects/new" className="inline-block text-xs underline">→ /projects/new</Link>
          </div>
          <div className="rounded-md border p-3 space-y-2">
            <div className="font-medium">B. Quick generate</div>
            <p className="text-muted-foreground">
              Pilih SATU deliverable (BOM aja kah, SOW aja kah). Kasih prereqs-nya doang,
              langsung dapat dokumen. Bikin project "Quick: …" di list buat audit trail.
            </p>
            <p className="text-xs"><strong>Pakai kalau:</strong> cuma butuh satu doc, atau testing format, atau cepet bikin proposal dari scope yang udah ada.</p>
            <Link href="/quick" className="inline-block text-xs underline">→ /quick</Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Step-by-step: Full project</CardTitle></CardHeader>
        <CardContent>
          <ol className="text-sm space-y-2 list-decimal pl-5">
            <li>Dashboard → klik <strong>Start a new engagement</strong>.</li>
            <li>Upload file (xlsx, docx, pdf, csv, txt — multi-file boleh, max 10MB per file).</li>
            <li>Klik <strong>Extract project details</strong> — AI baca isinya dan menebak: customer, industri, target cloud, region, tipe project, flow yang disarankan.</li>
            <li>Review form — chip merah/kuning di samping field artinya AI tidak yakin; cek manual. Pilih target cloud + region + purchase model.</li>
            <li>Klik <strong>Create project</strong>. Otomatis pindah ke project detail.</li>
            <li>Di project detail: klik <strong>Run pipeline</strong> buat generate semua deliverable yang disarankan, atau klik card individual buat generate satu-satu.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Step-by-step: Quick generate</CardTitle></CardHeader>
        <CardContent>
          <ol className="text-sm space-y-2 list-decimal pl-5">
            <li>Dashboard → klik <strong>Quick generate one document</strong>.</li>
            <li>Pilih deliverable dari grid — tiap card nunjukin "Needs: …".</li>
            <li>Form muncul dengan field yang dibutuhin doang (customer, scope, inventory upload, cloud, region, purchase model, on-prem baseline — sesuai deliverable yang dipilih).</li>
            <li>Klik <strong>Generate</strong> → streams realtime → redirect ke halaman deliverable saat selesai.</li>
            <li>Project "Quick: …" muncul di Projects list. Bisa di-promote jadi full project belakangan dengan tambah upload + generate deliverable lain.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tiap deliverable butuh apa?</CardTitle>
          <CardDescription>
            Dipakai oleh wizard Quick + workflow pipeline buat tau apa yang harus diminta dari user.
            Tabel ini selalu sync dengan kode (di-render dari catalog).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6">
            <table className="w-full text-xs min-w-[720px]">
              <thead className="text-muted-foreground">
                <tr className="border-b text-left">
                  <th className="py-2 pr-3">Deliverable</th>
                  <th className="pr-3">Group</th>
                  {NEED_ORDER.map((n) => (
                    <th key={n} className="pr-3 whitespace-nowrap">{NEED_LABELS[n]}</th>
                  ))}
                  <th>Best with</th>
                </tr>
              </thead>
              <tbody>
                {DELIVERABLES_IN_LIFECYCLE_ORDER.map((k) => {
                  const p = DELIVERABLE_PREREQS[k];
                  return (
                    <tr key={k} className="border-b last:border-0 align-top">
                      <td className="py-2 pr-3 font-medium whitespace-nowrap">{p.label}</td>
                      <td className="pr-3 text-muted-foreground">{GROUP_LABELS[p.group]}</td>
                      {NEED_ORDER.map((n) => (
                        <td key={n} className="pr-3 text-center">{p.needs[n] ? "✓" : ""}</td>
                      ))}
                      <td className="text-muted-foreground">
                        {p.recommendedUpstream.length > 0
                          ? p.recommendedUpstream.map((u) => DELIVERABLE_PREREQS[u].label).join(", ")
                          : "—"}
                        {p.hardUpstream.length > 0 && (
                          <span className="block text-amber-700 dark:text-amber-400 mt-0.5">
                            Hard prereq: {p.hardUpstream.map((u) => DELIVERABLE_PREREQS[u].label).join(" + ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sebelum mulai (superadmin)</CardTitle>
          <CardDescription>Output AI lebih bagus kalau ini sudah diisi.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1.5 list-disc pl-5">
            <li><Link href="/settings/rate-card" className="underline">Rate card</Link> — daily rate per role/level/lokasi. Dipakai untuk kalkulasi mandays di BOM, project plan, SOW.</li>
            <li><Link href="/settings/service-catalog" className="underline">Service catalog</Link> — default mandays per service. Bikin estimasi konsisten antar project.</li>
            <li><Link href="/admin/templates" className="underline">Templates</Link> (admin) — upload sample BOM/Proposal/Architecture/SOW. AI niru struktur + voice.</li>
            <li><Link href="/admin/users" className="underline">Users</Link> (admin) — promote presales head ke superadmin biar bisa kelola template + monitor cost.</li>
            <li><Link href="/admin/usage" className="underline">Usage</Link> (admin) — monitor token + estimasi cost AI per purpose / per user.</li>
            <li><Link href="/settings/patterns" className="underline">Learned patterns</Link> — rules yang AI pelajari dari training mode.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Tips</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1.5 list-disc pl-5">
            <li><strong>Compare mode:</strong> centang 2+ cloud di project create. BOM / Architecture / Proposal akan keluar side-by-side dengan rekomendasi cloud terakhir.</li>
            <li><strong>Purchase model:</strong> dipakai ke semua cloud dalam project (PAYG / Reserved 1-3y / Savings Plan 1-3y). Untuk fair comparison di mode compare.</li>
            <li><strong>Training mode:</strong> di project detail, toggle ke <em>training</em>. Setelah generate dan kasih feedback, AI ekstrak pattern → disimpan di learned patterns → otomatis kepake di project production berikutnya.</li>
            <li><strong>Region default:</strong> Malaysia West (Azure) + ap-southeast-5 (AWS). Dropdown punya full SEA + APAC + US/EU.</li>
            <li><strong>Customer Study harusnya pertama:</strong> deliverable downstream akan lebih kontekstual karena ada profil customer + IT landscape yang bisa direferensikan.</li>
            <li><strong>Quick project bisa di-promote:</strong> tambah upload, generate deliverable lain, jadinya full project — nggak perlu mulai dari nol.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Kalau stuck</CardTitle></CardHeader>
        <CardContent>
          <ul className="text-sm space-y-1.5 list-disc pl-5">
            <li><strong>"no workloads"</strong> saat generate BOM / Assessment / TCO: upload inventory dulu (RVTools .xlsx atau CSV dengan kolom CPU + RAM + disk + OS). Kalau parsing gagal, klik <em>extract workloads</em> di Inputs section — AI bakal coba ekstrak dari text.</li>
            <li><strong>"Stream interrupted"</strong> di tengah generate: fungsi Vercel timeout 60s. Klik Generate lagi — partial output sudah disimpan in-memory, retry akan re-stream dari awal tapi cepat karena prompt cache hit.</li>
            <li><strong>SOW butuh BOM dulu:</strong> server enforce ini. Generate BOM di project yang sama dulu (cloud yang sama), baru SOW akan compose.</li>
            <li><strong>"Load failed" (iOS Safari):</strong> network blip pas streaming. Retry. Kalau berulang, generate dari Workflow pipeline (lebih tahan reconnection).</li>
            <li><strong>Output kepanjangan / kepotong:</strong> kurangi scope (split per cloud, generate satu cloud dulu, atau pisah deliverable).</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
