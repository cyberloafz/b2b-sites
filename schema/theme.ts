import { z } from "zod";

/**
 * Layer 1 — design tokens.
 * One theme object per site. Every block reads its styling from these tokens
 * (exposed as CSS variables), so swapping a theme never touches content.
 */

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, e.g. #1f4d3a");

export const FONT_STACKS = {
  "classic-serif": '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif',
  "modern-sans": 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  "humanist-sans": '"Avenir Next", Avenir, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  "industrial-mono": 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
} as const;

export const ThemeSchema = z.object({
  stylePack: z
    .enum(["natural-organic", "industrial-solid", "clinical-clean", "modern-tech"])
    .describe("Preset the AI picked; individual tokens below may override it"),
  color: z.object({
    primary: hex.describe("Brand colour: hero background, key accents"),
    primaryInk: hex.describe("Text colour on top of primary (must reach 4.5:1)"),
    accent: hex.describe("Primary buttons"),
    accentInk: hex.describe("Text on accent buttons (must reach 4.5:1)"),
    secondary: hex.describe("Secondary buttons, tags"),
    surface: hex.describe("Page background"),
    surfaceAlt: hex.describe("Alternating section background"),
    text: hex.describe("Body text (must reach 4.5:1 on surface)"),
    muted: hex.describe("Secondary text"),
    border: hex,
  }),
  font: z.object({
    heading: z.enum(Object.keys(FONT_STACKS) as [keyof typeof FONT_STACKS, ...(keyof typeof FONT_STACKS)[]]),
    body: z.enum(Object.keys(FONT_STACKS) as [keyof typeof FONT_STACKS, ...(keyof typeof FONT_STACKS)[]]),
    headingCase: z.enum(["normal", "uppercase"]).default("normal"),
  }),
  radius: z.enum(["0", "4", "8", "16"]).describe("Corner radius in px"),
  spacing: z.enum(["compact", "standard", "relaxed"]),
  containerWidth: z.enum(["1200", "1300", "1440"]),
  buttonStyle: z.enum(["solid", "outline", "pill"]),
});

export type Theme = z.infer<typeof ThemeSchema>;

/** WCAG relative-luminance contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) =>
      v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    );
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Contrast checks the platform runs on every theme save (WCAG 2.1 AA, normal text). */
export function checkThemeContrast(t: Theme): string[] {
  const pairs: [string, string, string][] = [
    ["text on surface", t.color.text, t.color.surface],
    ["text on surfaceAlt", t.color.text, t.color.surfaceAlt],
    ["primaryInk on primary", t.color.primaryInk, t.color.primary],
    ["accentInk on accent", t.color.accentInk, t.color.accent],
    ["muted on surface", t.color.muted, t.color.surface],
  ];
  return pairs
    .map(([name, fg, bg]) => [name, contrastRatio(fg, bg)] as const)
    .filter(([, r]) => r < 4.5)
    .map(([name, r]) => `${name} contrast ${r.toFixed(2)}:1 is below 4.5:1`);
}

/** Starting points the AI chooses from before tuning colours to the logo. */
export const STYLE_PACKS: Record<Theme["stylePack"], Omit<Theme, "stylePack" | "color"> & { color: Theme["color"] }> = {
  "natural-organic": {
    color: {
      primary: "#2f4a3a", primaryInk: "#f6f3ea", accent: "#c9dfa8", accentInk: "#18241c",
      secondary: "#e7dfcb", surface: "#fbfaf6", surfaceAlt: "#f1eee4", text: "#22282a", muted: "#5a6460", border: "#dcd6c6",
    },
    font: { heading: "classic-serif", body: "modern-sans", headingCase: "normal" },
    radius: "8", spacing: "standard", containerWidth: "1300", buttonStyle: "solid",
  },
  "industrial-solid": {
    color: {
      primary: "#1d2733", primaryInk: "#ffffff", accent: "#f2a33a", accentInk: "#1d2733",
      secondary: "#dfe4ea", surface: "#ffffff", surfaceAlt: "#f2f4f7", text: "#1b2129", muted: "#556070", border: "#d5dbe3",
    },
    font: { heading: "modern-sans", body: "modern-sans", headingCase: "uppercase" },
    radius: "4", spacing: "compact", containerWidth: "1300", buttonStyle: "solid",
  },
  "clinical-clean": {
    color: {
      primary: "#e8f1f6", primaryInk: "#11303f", accent: "#1d5f7f", accentInk: "#ffffff",
      secondary: "#d7e8f0", surface: "#ffffff", surfaceAlt: "#f5f9fb", text: "#1a2730", muted: "#52626c", border: "#d9e4ea",
    },
    font: { heading: "humanist-sans", body: "humanist-sans", headingCase: "normal" },
    radius: "8", spacing: "relaxed", containerWidth: "1200", buttonStyle: "pill",
  },
  "modern-tech": {
    color: {
      primary: "#141629", primaryInk: "#f3f4ff", accent: "#4f46e5", accentInk: "#ffffff",
      secondary: "#e6e7ff", surface: "#ffffff", surfaceAlt: "#f5f6fb", text: "#16182a", muted: "#575b72", border: "#e1e3ee",
    },
    font: { heading: "modern-sans", body: "modern-sans", headingCase: "normal" },
    radius: "16", spacing: "relaxed", containerWidth: "1440", buttonStyle: "pill",
  },
};
