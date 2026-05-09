/**
 * Accent color presets.
 *
 * All entries share the same lightness/chroma envelope so that
 * `--color-accent-fg` (a fixed near-black) keeps adequate contrast on top
 * of any chosen accent. We only sweep the hue to give the user variety
 * without breaking the design system.
 *
 * Stored on `user_settings.accent_color` as the preset *key* (e.g. "plum"),
 * not the literal oklch string, so we can evolve the palette later without
 * stranded values in the DB.
 */
export const ACCENT_PRESETS = {
  plum: { label: "Plum", oklch: "0.78 0.18 305" },
  violet: { label: "Violet", oklch: "0.78 0.18 285" },
  indigo: { label: "Indigo", oklch: "0.78 0.16 265" },
  blue: { label: "Blue", oklch: "0.78 0.17 240" },
  teal: { label: "Teal", oklch: "0.78 0.13 200" },
  mint: { label: "Mint", oklch: "0.82 0.14 165" },
  green: { label: "Green", oklch: "0.8 0.16 145" },
  amber: { label: "Amber", oklch: "0.84 0.16 75" },
  coral: { label: "Coral", oklch: "0.78 0.18 35" },
  rose: { label: "Rose", oklch: "0.78 0.2 10" },
} as const;

export type AccentKey = keyof typeof ACCENT_PRESETS;

export const ACCENT_KEYS = Object.keys(ACCENT_PRESETS) as readonly AccentKey[];

export const DEFAULT_ACCENT: AccentKey = "plum";

export function isAccentKey(value: unknown): value is AccentKey {
  return typeof value === "string" && value in ACCENT_PRESETS;
}

export function accentOklch(key: AccentKey | null | undefined): string {
  return ACCENT_PRESETS[key && isAccentKey(key) ? key : DEFAULT_ACCENT].oklch;
}

/**
 * CSS string suitable for inlining into a <style> tag to override the
 * accent CSS variable globally. Returns null when the user has chosen the
 * default — in that case we don't emit anything and the `globals.css` value
 * wins, avoiding pointless markup.
 */
export function accentCss(key: AccentKey | null | undefined): string | null {
  if (!key || key === DEFAULT_ACCENT) return null;
  if (!isAccentKey(key)) return null;
  return `:root{--color-accent:oklch(${ACCENT_PRESETS[key].oklch});}`;
}
