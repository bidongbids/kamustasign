// The contrast rules from docs/design/design_handoff_classroom_theming README
// §2.3, checked on every palette, including the tokens derived for Ocean,
// Forest and Sunset (theme.ts derive()).
import { darkColors, lightColors, mixHex, palettes, SCHEMES, type ThemeColors } from "../theme/theme";

function luminance(c: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const TEXT: (keyof ThemeColors)[] = [
  "textPrimary", "textSecondary", "textTertiary", "primaryText", "primaryTealText", "accentText", "accentCoralText", "successText", "dangerText",
];
const GROUNDS: (keyof ThemeColors)[] = ["background", "surface", "well"];
// Raised tiles carry the sign, its name and the accent, not small grey print
// (Graphite dark's textTertiary is 4.1:1 there and stays as it was).
const ON_RAISED: (keyof ThemeColors)[] = ["textPrimary", "textSecondary", "primaryText", "accentText", "successText"];
const LABELS: [keyof ThemeColors, keyof ThemeColors][] = [
  ["onPrimary", "primaryFill"],
  ["textOnPrimary", "actionPrimaryFill"],
  ["onAccent", "accent"],
  ["textOnAccent", "accentCoral"],
  ["onStatus", "successText"],
];
const MARKS: (keyof ThemeColors)[] = ["primary", "star", "success", "danger", "focusRing"];

const all = SCHEMES.flatMap((s) => (["dark", "light"] as const).map((m) => [`${s.key} ${m}`, palettes[s.key][m]] as const));

describe.each(all)("%s", (_name, p) => {
  it("text is 4.5:1 on every ground", () => {
    const bad = TEXT.flatMap((t) => GROUNDS.filter((g) => contrast(p[t], p[g]) < 4.5).map((g) => `${t} on ${g}: ${contrast(p[t], p[g]).toFixed(2)}`));
    expect(bad).toEqual([]);
  });
  it("tile text is 4.5:1 on raised tiles", () => {
    const bad = ON_RAISED.filter((t) => contrast(p[t], p.surfaceRaised) < 4.5).map((t) => `${t}: ${contrast(p[t], p.surfaceRaised).toFixed(2)}`);
    expect(bad).toEqual([]);
  });
  it("labels are 4.5:1 on their fills", () => {
    const bad = LABELS.filter(([t, f]) => contrast(p[t], p[f]) < 4.5).map(([t, f]) => `${t} on ${f}: ${contrast(p[t], p[f]).toFixed(2)}`);
    expect(bad).toEqual([]);
  });
  it("marks are 3:1 on the card", () => {
    const bad = MARKS.filter((t) => contrast(p[t], p.surface) < 3).map((t) => `${t}: ${contrast(p[t], p.surface).toFixed(2)}`);
    expect(bad).toEqual([]);
  });
});

describe("palettes", () => {
  it("keeps Graphite as the original palettes", () => {
    expect(palettes.graphite.dark).toBe(darkColors);
    expect(palettes.graphite.light).toBe(lightColors);
  });
  it("gives every scheme every token", () => {
    const keys = Object.keys(darkColors).sort();
    for (const [, p] of all) expect(Object.keys(p).sort()).toEqual(keys);
  });
  it("mixes hex colours", () => {
    expect(mixHex("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mixHex("#123456", "#ABCDEF", 0)).toBe("#123456");
  });
});
