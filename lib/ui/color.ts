export type Rgb = readonly [r: number, g: number, b: number];
export type Oklch = { l: number; c: number; h: number; alpha: number };

const OKLCH =
  /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/;

export function parseOklch(value: string): Oklch {
  const match = OKLCH.exec(value.trim());
  if (!match) throw new Error(`not an oklch() colour: ${value}`);
  const [, l, c, h, alpha, percent] = match;
  return {
    l: Number(l),
    c: Number(c),
    h: Number(h),
    alpha:
      alpha === undefined ? 1 : Number(alpha) / (percent === "%" ? 100 : 1),
  };
}

/** Linear-light sRGB. A channel outside 0 to 1 is outside the sRGB gamut. */
export function oklchToLinearSrgb({ l, c, h }: Oklch): Rgb {
  const hue = (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

export function inSrgbGamut(rgb: Rgb, tolerance = 0.002): boolean {
  return rgb.every((v) => v >= -tolerance && v <= 1 + tolerance);
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/** WCAG 2.2 relative luminance of a linear-light sRGB colour. */
export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(clamp) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** `over` drawn with its alpha on the opaque colour `under`. */
export function composite(over: Rgb, alpha: number, under: Rgb): Rgb {
  // Browsers blend the gamma-encoded values, so the blend happens there.
  const blend = (o: number, u: number) =>
    decode(encode(clamp(o)) * alpha + encode(clamp(u)) * (1 - alpha));
  return [
    blend(over[0], under[0]),
    blend(over[1], under[1]),
    blend(over[2], under[2]),
  ];
}

function encode(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function decode(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.2 contrast ratio of two opaque linear-light sRGB colours, 1 to 21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}
