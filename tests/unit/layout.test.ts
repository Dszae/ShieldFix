import { describe, expect, it } from 'vitest';
import { colorAlpha } from '../../src/detection/layout';

describe('colorAlpha', () => {
  it.each([
    ['rgba(0, 0, 0, 0.6)', 0.6],
    ['rgb(0 0 0 / 50%)', 0.5],
    ['rgb(0, 0, 0)', 1],
    ['transparent', 0],
    ['rgba(0, 0, 0, 0)', 0],
  ])('reads %s', (color, alpha) => expect(colorAlpha(color)).toBeCloseTo(alpha));

  // Browsers report computed colors in the space they were written or mixed
  // in. Tailwind v4 compiles bg-black/50 to color-mix(in oklab, ...), which
  // Chrome reports as oklab(0 0 0 / 0.5).
  it.each([
    ['oklab(0 0 0 / 0.5)', 0.5],
    ['oklch(0.21 0.034 264.665 / 80%)', 0.8],
    ['color(srgb 0 0 0 / 0.4)', 0.4],
    ['lab(0 0 0 / 0.3)', 0.3],
    ['hsl(0 0% 0% / 0.25)', 0.25],
    ['hsla(0, 0%, 0%, 0.25)', 0.25],
    ['oklch(0.5 0.1 30)', 1],
    ['color(display-p3 1 0 0)', 1],
  ])('reads modern color syntax %s', (color, alpha) =>
    expect(colorAlpha(color)).toBeCloseTo(alpha),
  );
});
