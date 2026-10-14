import { FONT_STACKS, type Theme } from "@/schema/theme";

const SPACING = { compact: "44px", standard: "68px", relaxed: "92px" } as const;

/** Turns the theme JSON (layer 1) into CSS custom properties consumed by every block. */
export function themeToCss(t: Theme): string {
  const c = t.color;
  const vars: Record<string, string> = {
    "--c-primary": c.primary,
    "--c-primary-ink": c.primaryInk,
    "--c-accent": c.accent,
    "--c-accent-ink": c.accentInk,
    "--c-secondary": c.secondary,
    "--c-surface": c.surface,
    "--c-surface-alt": c.surfaceAlt,
    "--c-text": c.text,
    "--c-muted": c.muted,
    "--c-border": c.border,
    "--f-heading": FONT_STACKS[t.font.heading],
    "--f-body": FONT_STACKS[t.font.body],
    "--heading-case": t.font.headingCase === "uppercase" ? "uppercase" : "none",
    "--radius": `${t.radius}px`,
    "--btn-radius": t.buttonStyle === "pill" ? "999px" : `${t.radius}px`,
    "--section-pad": SPACING[t.spacing],
    "--container": `${t.containerWidth}px`,
  };
  return `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(";")}}`;
}
