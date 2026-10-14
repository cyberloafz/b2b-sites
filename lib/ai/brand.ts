import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { put } from "@/lib/storage";
import { STYLE_PACKS, checkThemeContrast, contrastRatio, type Theme } from "@/schema/theme";

/**
 * Brand step of AI generation — done in code, not by the model:
 * 1. choose a style pack from the industry (unless the user picked one),
 * 2. take the brand colour from the logo, adjusted until text on it reaches WCAG AA,
 * 3. fall back to the pack's own colours if anything fails a contrast check.
 */

const PACK_HINTS: [Theme["stylePack"], RegExp][] = [
  ["clinical-clean", /pharma|medical|clinical|\blab(oratory)?\b|supplement|nutraceutical|diagnostic|dental|vitamin/i],
  ["natural-organic", /food|organic|natural|botanical|skin|cosmetic|beauty|soap|candle|coffee|tea|bakery|snack|sauce|spice|pet|garden|farm/i],
  ["modern-tech", /electronic|software|tech|semiconductor|pcb|sensor|robot|device|3d print|battery/i],
  ["industrial-solid", /metal|steel|machin|fabricat|industrial|plastic|mold|cnc|weld|packag|chemical|furniture|construction|auto/i],
];

export function pickStylePack(industry: string, whatYouMake = ""): Theme["stylePack"] {
  // The industry line decides first; the longer description only breaks a tie.
  return PACK_HINTS.find(([, re]) => re.test(industry))?.[0] ?? PACK_HINTS.find(([, re]) => re.test(whatYouMake))?.[0] ?? "industrial-solid";
}

const toHex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Most common clearly-coloured pixel of the logo (ignores white, black, grey and transparent areas). */
export async function dominantColor(bytes: Buffer): Promise<string | null> {
  const { data, info } = await sharp(bytes).resize(48, 48, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 40 || max < 40 || min > 225) continue; // grey, black or white
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    buckets.set(key, e);
  }
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  return best && best.n >= 8 ? toHex(best.r / best.n, best.g / best.n, best.b / best.n) : null;
}

/** Darken a colour step by step until `ink` on it reaches 4.5:1. */
function darkenFor(color: string, ink: string) {
  let [r, g, b] = fromHex(color);
  for (let i = 0; i < 30 && contrastRatio(ink, toHex(r, g, b)) < 4.5; i++) [r, g, b] = [r * 0.9, g * 0.9, b * 0.9];
  return toHex(r, g, b);
}

export function buildTheme(pack: Theme["stylePack"], logoColor: string | null): { theme: Theme; note: string } {
  const base: Theme = { stylePack: pack, ...structuredClone(STYLE_PACKS[pack]) };
  if (!logoColor) return { theme: base, note: `Style "${pack}" with its own colours (no logo colour found).` };
  const theme: Theme = structuredClone(base);
  // The logo colour becomes the brand colour (hero, header accents) with light text on it.
  theme.color.primary = darkenFor(logoColor, base.color.primaryInk);
  if (contrastRatio(base.color.primaryInk, theme.color.primary) < 4.5) theme.color.primaryInk = "#ffffff";
  const problems = checkThemeContrast(theme);
  if (problems.length) return { theme: base, note: `Logo colour ${logoColor} failed contrast (${problems[0]}); kept the "${pack}" colours.` };
  return { theme, note: `Style "${pack}"; brand colour ${theme.color.primary} taken from the logo (${logoColor}).` };
}

/**
 * Stores the logo as a PNG (SVG and other formats are rasterised, so no script can ride along),
 * at most 400 px tall. Named `logo-…` so the renderer does not look for responsive variants.
 */
export async function storeLogo(siteId: string, file: File): Promise<{ ok: true; src: string; width: number; height: number; color: string | null } | { ok: false; error: string }> {
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "The logo can be up to 5 MB." };
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return { ok: false, error: "Upload the logo as PNG, JPG, WebP or SVG." };
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const png = await sharp(input, { density: 300 }).resize({ height: 400, withoutEnlargement: true }).png().toBuffer();
    const meta = await sharp(png).metadata();
    if (!meta.width || !meta.height || meta.height < 32) return { ok: false, error: "The logo must be at least 32 pixels tall." };
    const src = await put(siteId, `logo-${randomBytes(6).toString("hex")}.png`, png);
    return { ok: true, src, width: meta.width, height: meta.height, color: await dominantColor(png) };
  } catch {
    return { ok: false, error: "The logo file could not be read." };
  }
}
