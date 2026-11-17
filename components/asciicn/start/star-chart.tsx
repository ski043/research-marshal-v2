"use client";

import { useRef } from "react";
import { useStartBoxes } from "@/components/asciicn/start/use-boxes";
import { AsciiShader } from "@/lib/ascii/shader";

// A star chart of sources: declination arcs and hour lines around a pole beyond the
// upper right corner, stars on a jittered grid, and constellation lines that link each
// star to a neighbour. A pulse of light travels along the links, the way a run reads from
// one source to the next. Lines are measured in samples, so they stay one Braille dot
// wide at every size.
const CHART = `
const float CHART_GRID = 0.105;

float chartHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// The star of grid square id: its place, and its size from 0 (none) to 1.
vec3 chartStar(vec2 id) {
  vec2 jitter = vec2(chartHash(id + 3.1), chartHash(id + 17.7));
  float size = chartHash(id + 41.3);
  return vec3((id + 0.18 + 0.64 * jitter) * CHART_GRID, size);
}

float chartSegment(vec2 p, vec2 a, vec2 b, out float along) {
  vec2 ab = b - a;
  along = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * along);
}

// x: the links, y: the stars, z: the grid of rings and hour lines, w: warmth.
vec4 chartLayers(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  float px = 1.0 / res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 pole = vec2(chartPole.x * aspect, chartPole.y);
  vec2 q = p - pole;
  float r = length(q);
  float angle = atan(q.y, q.x);

  // Arcs every 0.18 and hour lines every 10 degrees. The hour lines are dashed.
  float ringAt = abs(fract(r / 0.18 + 0.5) - 0.5) * 0.18;
  float ring = 1.0 - smoothstep(0.5 * px, 1.2 * px, ringAt);
  float hourAt = abs(fract(angle / 0.17453 + 0.5) - 0.5) * 0.17453 * r;
  float hour = 1.0 - smoothstep(0.5 * px, 1.2 * px, hourAt);
  hour *= step(0.5, fract(r / 0.024));
  float grid = max(ring, hour);

  vec2 home = floor(p / CHART_GRID);
  float stars = 0.0;
  float links = 0.0;
  float warmth = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 id = home + vec2(float(i), float(j));
      vec3 star = chartStar(id);
      float seen = step(0.34, star.z);
      float radius = mix(0.75, 2.3, pow(star.z, 4.0)) * px;
      float d = length(p - star.xy);
      float disc = (1.0 - smoothstep(radius - 0.6 * px, radius + 0.6 * px, d)) * seen;
      // The brightest stars carry four short rays.
      vec2 arm = abs(p - star.xy);
      float rays = (1.0 - smoothstep(0.4 * px, 1.1 * px, min(arm.x, arm.y))) * step(max(arm.x, arm.y), 6.0 * px * smoothstep(0.8, 1.0, star.z));
      disc = max(disc, rays * seen);
      float twinkle = 0.85 + 0.15 * sin(t * 0.8 + star.z * 40.0);
      stars = max(stars, disc * twinkle);
      float warm = step(0.86, chartHash(id + 71.9));
      warmth = max(warmth, warm * (1.0 - smoothstep(radius, radius + 5.0 * px, d)) * seen);

      // A link to one neighbour (right, above or on a diagonal) for half the stars.
      float pick = chartHash(id + 5.5) * 8.0;
      vec2 next = id + (pick < 1.0 ? vec2(1.0, 0.0) : pick < 2.0 ? vec2(0.0, 1.0) : pick < 3.0 ? vec2(1.0, 1.0) : vec2(1.0, -1.0));
      vec3 other = chartStar(next);
      if (pick < 4.0 && seen > 0.5 && other.z >= 0.34) {
        float along;
        float dl = chartSegment(p, star.xy, other.xy, along);
        float line = 1.0 - smoothstep(0.5 * px, 1.3 * px, dl);
        // The link stops short of both stars.
        line *= smoothstep(0.04, 0.16, along) * smoothstep(0.96, 0.84, along);
        // The pulse: a bright stretch that runs the link, at its own time.
        float phase = fract(t * 0.11 + chartHash(id + 9.9));
        float pulse = exp(-pow((along - phase * 1.6 + 0.3) / 0.16, 2.0));
        links = max(links, line * (0.55 + 0.45 * pulse));
        warmth = max(warmth, line * pulse * step(0.75, chartHash(id + 88.8)));
      }
    }
  }
  // Star dust: single dots, thick along a band that crosses the chart like
  // the Milky Way and thin elsewhere.
  vec2 speck = floor(uv * ascii_samples);
  float band = exp(-pow((p.y - 0.62 * p.x + 0.12) / 0.17, 2.0));
  float dust = step(1.0 - 0.005 - 0.045 * band * fbm(p * 5.0), chartHash(speck + 0.5));
  stars = max(stars, dust * 0.5);
  return vec4(links, stars, grid, warmth);
}

// The chart is quiet where text sits and fades in over chartCalm.z cells.
float chartClear(vec2 uv) {
  vec2 away = (abs(uv - chartCalmBox.xy - chartCalmBox.zw * 0.5) - chartCalmBox.zw * 0.5) * ascii_samples;
  float d = length(max(away - chartCalm.y, 0.0));
  return 1.0 - chartCalm.x * (1.0 - smoothstep(0.0, max(chartCalm.z, 1.0), d));
}
`;

const FIELD = `${CHART}
float field(vec2 uv, vec2 res, float t) {
  vec4 layers = chartLayers(uv, res, t);
  float tone = max(max(layers.x, layers.y), layers.z * 0.9);
  return tone * chartClear(uv);
}
`;

// Stars take the ink, links a paler ink, the grid the faintest; warm stars and the
// pulses of some links take the accent.
const COLOR_FIELD = `${CHART}
vec4 colorField(vec2 uv, vec2 res, float t) {
  vec4 layers = chartLayers(uv, res, t);
  vec3 ink = paletteColor(1.0).rgb;
  vec3 soft = paletteColor(0.5).rgb;
  vec3 faint = paletteColor(0.0).rgb;
  vec3 col = mix(mix(faint, soft, 0.3), soft, step(0.01, layers.x));
  col = mix(col, mix(soft, ink, 0.4), step(0.3, layers.y));
  col = mix(col, ink, step(0.7, layers.y));
  col = mix(col, chartWarm, clamp(layers.w, 0.0, 1.0));
  float strength = max(max(layers.y, layers.x * 0.9), layers.z * 0.7);
  return vec4(col, clamp(strength, 0.0, 1.0));
}
`;

const CELL = 12;

export function StarChartGround() {
  const canvas = useRef<HTMLDivElement>(null);
  const { column } = useStartBoxes(canvas);
  return (
    <AsciiShader
      ref={canvas}
      className="absolute inset-0"
      field={FIELD}
      colorField={COLOR_FIELD}
      uniforms={{
        chartCalm: [column[2] > 0 ? 1 : 0, -12 / CELL, 140 / CELL],
        chartCalmBox: [...column],
        chartPole: [1.1, 1.3],
        chartWarm: [1, 0.72, 0.36],
      }}
      palette={[
        "--ascii-paper",
        "--border",
        "--ascii-color-blue",
        "--ascii-ink",
      ]}
      charset="braille"
      colorMode="truecolor"
      cell={CELL}
      fps={20}
      stillTime={3}
    />
  );
}
