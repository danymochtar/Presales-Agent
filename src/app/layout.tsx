import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noventiq Multicloud Agent",
  description:
    "Consultant-grade AI assistant for cloud presales — BOM, architecture, proposal, assessment, TCO, project plan, SOW, and managed services across Azure, AWS, and GCP.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased font-sans">{children}</body>
    </html>
  );
}
