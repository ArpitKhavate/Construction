import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import "./theme.css";
import "./agent-panel.css";
import "./crew-scan.css";
import "./results-cleanup.css";
import "./board.css";
import "./builders.css";
import "./map-panel.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], axes: ["wdth"] });

export const metadata: Metadata = {
  title: "Construction",
  description: "Find an Austin spot, research the site, and get the beginner permit checklist.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>{children}</body>
    </html>
  );
}
