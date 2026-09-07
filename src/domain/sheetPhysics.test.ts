import { describe, expect, it } from 'vitest'
import { resistSheetHeight, sheetVelocity, snapSheet, unresistSheetHeight } from './sheetPhysics'

const heights = { collapsed: 100, half: 400, expanded: 700 }

describe('sheet drag physics', () => {
  it('follows the finger exactly inside the bounds', () => {
    for (const height of [100, 101, 250, 400, 699, 700]) {
      expect(resistSheetHeight(height, 100, 700)).toBe(height)
    }
  })

  it('resists both bounds continuously, with bounded and diminishing overshoot', () => {
    expect(resistSheetHeight(100 - 0.001, 100, 700)).toBeCloseTo(100, 3)
    expect(resistSheetHeight(700 + 0.001, 100, 700)).toBeCloseTo(700, 3)
    const shortPull = resistSheetHeight(760, 100, 700) - 700
    const longPull = resistSheetHeight(820, 100, 700) - 700
    expect(shortPull).toBeGreaterThan(0)
    expect(longPull).toBeGreaterThan(shortPull)
    expect(longPull).toBeLessThan(shortPull * 2)
    expect(resistSheetHeight(-10000, 100, 700)).toBeGreaterThan(58)
    expect(resistSheetHeight(10000, 100, 700)).toBeLessThan(742)
    expect(100 - resistSheetHeight(40, 100, 700)).toBeCloseTo(shortPull)
  })

  it('snaps slow releases to the nearest height, independent of the starting state', () => {
    expect(snapSheet(200, 0, heights, 'expanded')).toBe('collapsed')
    expect(snapSheet(410, 0, heights, 'collapsed')).toBe('half')
    expect(snapSheet(620, 0, heights, 'collapsed')).toBe('expanded')
  })

  it('can grab an overshooting settle without a jump on the next pointer sample', () => {
    for (const renderedHeight of [65, 99, 100, 350, 700, 701, 735]) {
      const origin = unresistSheetHeight(renderedHeight, 100, 700)
      expect(resistSheetHeight(origin, 100, 700)).toBeCloseTo(renderedHeight)
      expect(resistSheetHeight(origin + 1, 100, 700)).toBeGreaterThan(renderedHeight)
      expect(resistSheetHeight(origin - 1, 100, 700)).toBeLessThan(renderedHeight)
    }
  })

  it('projects flicks in both directions and clamps to the snap range', () => {
    expect(snapSheet(200, 1.2, heights, 'collapsed')).toBe('half')
    expect(snapSheet(400, 2, heights, 'half')).toBe('expanded')
    expect(snapSheet(600, -1.2, heights, 'expanded')).toBe('half')
    expect(snapSheet(400, -2, heights, 'half')).toBe('collapsed')
    expect(snapSheet(740, 2.5, heights, 'half')).toBe('expanded')
    expect(snapSheet(60, -2.5, heights, 'half')).toBe('collapsed')
  })

  it('uses recent motion rather than the entire gesture, including direction reversals', () => {
    expect(sheetVelocity([{ y: 700, time: 0 }, { y: 300, time: 200 }, { y: 350, time: 250 }], 250)).toBe(-1)
    expect(sheetVelocity([{ y: 400, time: 10 }, { y: 300, time: 60 }], 60)).toBe(2)
  })

  it('forgets stale flicks after a pause and handles missing or duplicate timestamps', () => {
    expect(sheetVelocity([{ y: 400, time: 0 }, { y: 300, time: 50 }, { y: 300, time: 200 }], 200)).toBe(0)
    expect(sheetVelocity([], 200)).toBe(0)
    expect(sheetVelocity([{ y: 300, time: 0 }, { y: 200, time: 0 }], 0)).toBe(0)
    expect(sheetVelocity([{ y: 300, time: 0 }, { y: 200, time: 10 }], 200)).toBe(0)
  })

  it('caps velocity from unusually short sample intervals', () => {
    expect(sheetVelocity([{ y: 400, time: 0 }, { y: 300, time: 1 }], 1)).toBe(2.5)
    expect(sheetVelocity([{ y: 300, time: 0 }, { y: 400, time: 1 }], 1)).toBe(-2.5)
  })

  it('keeps the current state at ties or coincident short-viewport heights', () => {
    expect(snapSheet(250, 0, heights, 'half')).toBe('half')
    expect(snapSheet(250, 0, heights, 'collapsed')).toBe('collapsed')
    expect(snapSheet(400, 0, { collapsed: 100, half: 400, expanded: 400 }, 'expanded')).toBe('expanded')
    expect(snapSheet(100, 0, { collapsed: 100, half: 100, expanded: 100 }, 'half')).toBe('half')
  })
})
