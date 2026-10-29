import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PermitForm } from "@/lib/types";

export async function renderPermitPdf(form: PermitForm) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const ink = rgb(0.09, 0.13, 0.11);
  const muted = rgb(0.36, 0.33, 0.3);
  const line = rgb(0.8, 0.76, 0.7);
  const copper = rgb(0.55, 0.24, 0.08);

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const newPage = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  };

  const ensure = (height: number) => {
    if (y - height < margin) newPage();
  };

  const wrap = (text: string, size: number, maxWidth: number, face: typeof font) => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (face.widthOfTextAtSize(next, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };

  const write = (text: string, size: number, face: typeof font, color = ink, indent = 0) => {
    const lines = wrap(text, size, pageWidth - margin * 2 - indent, face);
    for (const row of lines) {
      ensure(size + 4);
      page.drawText(row, { x: margin + indent, y: y - size, size, font: face, color });
      y -= size + 4;
    }
  };

  write("CITY OF AUSTIN DEVELOPMENT SERVICES", 9, bold, copper);
  write("DRAFT — not submitted", 9, bold, copper);
  y -= 6;
  write(form.title, 16, bold);
  y -= 4;
  write(form.intro, 9, font, muted);
  write(`Source: ${form.sourceUrl}`, 8, font, muted);
  y -= 8;

  for (const section of form.sections) {
    ensure(28);
    page.drawRectangle({
      x: margin,
      y: y - 16,
      width: pageWidth - margin * 2,
      height: 18,
      color: rgb(0.95, 0.93, 0.88),
    });
    page.drawText(section.title.toUpperCase(), { x: margin + 6, y: y - 12, size: 9, font: bold, color: ink });
    y -= 26;
    for (const item of section.fields) {
      ensure(36);
      page.drawText(item.label, { x: margin, y: y - 10, size: 9, font: bold, color: muted });
      y -= 14;
      const valueLines = wrap(item.value, 11, pageWidth - margin * 2 - 16, font);
      for (const row of valueLines) {
        ensure(16);
        page.drawText(row, { x: margin + 8, y: y - 11, size: 11, font, color: ink });
        y -= 14;
      }
      page.drawLine({
        start: { x: margin, y: y - 2 },
        end: { x: pageWidth - margin, y: y - 2 },
        thickness: 0.4,
        color: line,
      });
      y -= 10;
    }
    y -= 6;
  }

  ensure(28);
  write("Generated from City of Austin map layers and the published application. Blank lines stay with the applicant.", 8, font, muted);

  return doc.save();
}
