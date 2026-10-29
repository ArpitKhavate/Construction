import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Construction",
  description: "Find an Austin spot, research the site, and get the beginner permit checklist.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
