import type { Metadata } from "next";
import { Archivo, Architects_Daughter } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const lettering = Architects_Daughter({
  variable: "--font-lettering",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Construction",
  description: "Find out what you can build on your lot, which permits you need, and who to call.",
};

const CONTRACT = `
THESIS: The front page is the real neighborhood as a colorful floating diorama (user-pinned reference: a hero 3D object on a soft stage), refusing the SaaS hero + feature-card grid.
OWN-WORLD: Soft daylight stage (pale sky to warm sand), a round soil-edged diorama of real parcels, footprints and streets; lawn greens, cream walls, slate roofs; the proposed backyard home is the only saturated object (orange walls, teal roof); white paper chips for labels; condensed Archivo display.
STORY: A judge sees 3105 Cherrywood Rd among its real neighbors with an orange backyard home that fits, understands the product answers "what can I build here", and presses Begin building.
FIRST VIEWPORT: Diorama right of center, slow rotate, draggable. Wordmark top-left. Headline, one line and the orange Begin building button bottom-left. Parcel facts card bottom-right.
FORM: User-pinned reference direction (replaced Trace & Redline, seed key 2d1e8830).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${lettering.variable} antialiased`}>
        <div hidden dangerouslySetInnerHTML={{ __html: `<!--${CONTRACT}-->` }} />
        {children}
      </body>
    </html>
  );
}
