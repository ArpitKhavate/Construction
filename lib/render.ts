import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const RENDER_DIR = path.join(process.cwd(), ".data", "renders");

function tileFloat(lng: number, lat: number, zoom: number) {
  const scale = 2 ** zoom;
  const x = ((lng + 180) / 360) * scale;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale;
  return { x, y };
}

async function fetchTile(zoom: number, x: number, y: number) {
  const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Aerial tile ${zoom}/${x}/${y} returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function roofCount(units: number) {
  if (units <= 2) return 1;
  if (units <= 4) return 2;
  if (units <= 8) return 3;
  return 4;
}

function massingSvg(size: number, units: number) {
  const count = roofCount(units);
  const roofW = 34;
  const roofH = 24;
  const gap = 8;
  const totalW = count * roofW + (count - 1) * gap;
  const originX = size / 2 - totalW / 2;
  const originY = size / 2 - roofH / 2;
  const shapes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const x = originX + index * (roofW + gap);
    const y = originY + (index % 2 === 0 ? 0 : 10);
    shapes.push(
      `<rect x="${x + 5}" y="${y + 5}" width="${roofW}" height="${roofH}" rx="1" fill="rgba(20,24,22,0.35)"/>`,
      `<rect x="${x}" y="${y}" width="${roofW}" height="${roofH}" rx="1" fill="#c5bfb4" stroke="#5c564c" stroke-width="1.5"/>`,
      `<line x1="${x + 3}" y1="${y + roofH / 2}" x2="${x + roofW - 3}" y2="${y + roofH / 2}" stroke="#8a8176" stroke-width="1"/>`,
    );
  }
  return Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${shapes.join("")}</svg>`,
  );
}

export async function renderSpot(id: string, lng: number, lat: number, units: number) {
  const zoom = 18;
  const point = tileFloat(lng, lat, zoom);
  const tileX = Math.floor(point.x);
  const tileY = Math.floor(point.y);
  const tiles = await Promise.all(
    [-1, 0, 1].flatMap((row) =>
      [-1, 0, 1].map(async (col) => ({
        left: (col + 1) * 256,
        top: (row + 1) * 256,
        buffer: await fetchTile(zoom, tileX + col, tileY + row),
      })),
    ),
  );

  const stitched = sharp({
    create: { width: 768, height: 768, channels: 3, background: "#222" },
  });
  const base = await stitched
    .composite(tiles.map((tile) => ({ input: tile.buffer, left: tile.left, top: tile.top })))
    .jpeg({ quality: 90 })
    .toBuffer();

  const pixelX = (point.x - (tileX - 1)) * 256;
  const pixelY = (point.y - (tileY - 1)) * 256;
  const crop = 640;
  const left = Math.max(0, Math.min(768 - crop, Math.round(pixelX - crop / 2)));
  const top = Math.max(0, Math.min(768 - crop, Math.round(pixelY - crop / 2)));
  const before = await sharp(base).extract({ left, top, width: crop, height: crop }).jpeg({ quality: 86 }).toBuffer();

  const enhanced = await sharp(before)
    .modulate({ brightness: 1.05, saturation: 1.1 })
    .linear(1.08, -6)
    .sharpen({ sigma: 0.8 })
    .jpeg({ quality: 88 })
    .toBuffer();

  const after = await sharp(enhanced)
    .composite([{ input: massingSvg(crop, units), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();

  await mkdir(RENDER_DIR, { recursive: true });
  const beforeName = `${id}-before.jpg`;
  const afterName = `${id}-after.jpg`;
  await sharp(before).toFile(path.join(RENDER_DIR, beforeName));
  await sharp(after).toFile(path.join(RENDER_DIR, afterName));

  return {
    before: beforeName,
    after: afterName,
    changes: [
      { step: "Aerial", note: "Stitched Esri World Imagery tiles at zoom 18, cropped on the map point." },
      { step: "Tone", note: "Brightness 1.05, linear contrast 1.08 with a -6 offset." },
      { step: "Color", note: "Saturation 1.10. No objects were added by a generative model." },
      { step: "Sharpen", note: "Unsharp pass with sigma 0.8." },
      {
        step: "Massing",
        note: `${roofCount(units)} house-scale roof plate${roofCount(units) > 1 ? "s" : ""} and a shadow were drawn on the enhanced aerial. This is a diagram, not a photograph of a building and not a permit drawing.`,
      },
    ],
  };
}

export async function readRender(name: string) {
  if (!/^[\w.-]+$/.test(name)) return null;
  try {
    return await readFile(path.join(RENDER_DIR, name));
  } catch {
    return null;
  }
}
