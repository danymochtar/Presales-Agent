import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Presales Agent",
  description: "Presales agent for Azure deliverables (BOM, proposal, architecture).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased font-sans">{children}</body>
    </html>
  );
}
