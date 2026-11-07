/** Offset (cents) at which colours are fully saturated towards blue or red. */
export const COLOUR_RANGE_CENTS = 50

const GREEN_HUE = 150
const SHARP_HUE = 255 // blue
const FLAT_HUE = 25 // red (via yellow/orange)

/** OKLCH hue for an offset: green when in tune, bluer when sharp, redder when flat. */
export function centsToHue(cents: number): number {
  const t = Math.max(-1, Math.min(1, cents / COLOUR_RANGE_CENTS))
  return t >= 0 ? GREEN_HUE + t * (SHARP_HUE - GREEN_HUE) : GREEN_HUE + t * (GREEN_HUE - FLAT_HUE)
}

/** CSS colour for an offset in cents. Interpolated in OKLCH so lightness stays even. */
export function centsToColour(cents: number, alpha = 1): string {
  return `oklch(0.68 0.16 ${centsToHue(cents).toFixed(1)} / ${alpha})`
}

/** CSS gradient spanning the full colour scale, flat (left) to sharp (right). */
export function colourScaleGradient(): string {
  const stops = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1].map(
    (t, i, all) => `${centsToColour(t * COLOUR_RANGE_CENTS)} ${(i / (all.length - 1)) * 100}%`,
  )
  return `linear-gradient(to right, ${stops.join(', ')})`
}

/** "+12¢" / "−8¢" with a real minus sign. */
export function formatCents(cents: number): string {
  const rounded = Math.round(cents)
  if (rounded === 0) return '0¢'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}¢`
}
