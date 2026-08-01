type RGB = { r: number; g: number; b: number };

function parseHex(color: string): RGB {
  const normalized = color.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: RGB) {
  return `#${[r, g, b]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mix(color: RGB, target: RGB, amount: number) {
  return toHex({
    r: color.r + (target.r - color.r) * amount,
    g: color.g + (target.g - color.g) * amount,
    b: color.b + (target.b - color.b) * amount,
  });
}

function luminance({ r, g, b }: RGB) {
  const channels = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function createTheme(background: string) {
  const base = parseHex(background);
  const dark = luminance(base) < 0.38;
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };

  return {
    "--viewer-background": background,
    "--panel-background": mix(base, dark ? black : white, dark ? 0.12 : 0.28),
    "--surface-background": mix(base, white, dark ? 0.09 : 0.68),
    "--surface-raised": mix(base, white, dark ? 0.15 : 0.86),
    "--theme-border": dark ? "rgba(255, 255, 255, 0.12)" : "rgba(27, 36, 49, 0.13)",
    "--theme-text": dark ? "#f1f4f8" : "#252b35",
    "--theme-muted": dark ? "#aab4c2" : "#667180",
    "--theme-subtle": dark ? "#7f8a99" : "#89919c",
    "--theme-input-text": dark ? "#f4f6f9" : "#2f3742",
    "--theme-shadow": dark ? "rgba(0, 0, 0, 0.24)" : "rgba(31, 38, 49, 0.12)",
  };
}
