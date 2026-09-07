export const sheetStates = ['collapsed', 'half', 'expanded'] as const
export type SheetState = typeof sheetStates[number]
export type SheetHeights = Record<SheetState, number>
export interface DragSample { y: number; time: number }

export function resistSheetHeight(height: number, minimum: number, maximum: number): number {
  const bound = Math.max(minimum, Math.min(maximum, height))
  const overflow = height - bound
  return bound + overflow * 0.35 / (1 + Math.abs(overflow) / 120)
}

// Recover the finger-space origin when grabbing a settle still outside the bounds.
export function unresistSheetHeight(height: number, minimum: number, maximum: number): number {
  const bound = Math.max(minimum, Math.min(maximum, height))
  const overflow = height - bound
  return bound + overflow / Math.max(0.001, 0.35 - Math.abs(overflow) / 120)
}

// Only the last 100ms influence release: holding still must cancel an earlier flick.
export function sheetVelocity(samples: readonly DragSample[], now: number): number {
  const recent = samples.filter((sample) => now - sample.time <= 100)
  const first = recent[0]
  const last = recent[recent.length - 1]
  if (!first || !last || last.time <= first.time) return 0
  return Math.max(-2.5, Math.min(2.5, (first.y - last.y) / (last.time - first.time)))
}

export function snapSheet(height: number, velocity: number, heights: SheetHeights, current: SheetState): SheetState {
  const projected = Math.max(heights.collapsed, Math.min(heights.expanded, height + velocity * 180))
  // Prefer the current state for tied/identical snap heights on short viewports.
  return sheetStates.reduce((closest, state) =>
    Math.abs(heights[state] - projected) < Math.abs(heights[closest] - projected) ? state : closest, current)
}
