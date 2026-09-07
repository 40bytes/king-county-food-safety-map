import type { Facility } from '../types'

export const OVERLAP_ZOOM = 14
export const SMALL_GROUP_LIMIT = 4
// One metre absorbs geocoder rounding, not separate neighbouring storefronts.
const TOLERANCE_METRES = 1
const METRES_PER_DEGREE = 111_320
const LONGITUDE_SCALE = METRES_PER_DEGREE * Math.cos(47.6 * Math.PI / 180)

export interface FacilityGroup {
  id: string
  facilities: Facility[]
}

export function groupFacilities(facilities: readonly Facility[]): FacilityGroup[] {
  const groups: FacilityGroup[] = []
  const cells = new Map<string, { group: FacilityGroup; x: number; y: number }[]>()
  // Stable anchors/order even when search ranking or input order changes.
  for (const facility of [...facilities].sort((a, b) => a.recordId.localeCompare(b.recordId))) {
    const x = facility.longitude * LONGITUDE_SCALE
    const y = facility.latitude * METRES_PER_DEGREE
    const cellX = Math.floor(x / TOLERANCE_METRES)
    const cellY = Math.floor(y / TOLERANCE_METRES)
    let match: FacilityGroup | undefined
    for (let dx = -1; dx <= 1 && !match; dx++) {
      for (let dy = -1; dy <= 1 && !match; dy++) {
        match = cells.get(`${cellX + dx},${cellY + dy}`)?.find((anchor) =>
          Math.hypot(x - anchor.x, y - anchor.y) <= TOLERANCE_METRES,
        )?.group
      }
    }
    if (match) match.facilities.push(facility)
    else {
      const group = { id: facility.recordId, facilities: [facility] }
      groups.push(group)
      const key = `${cellX},${cellY}`
      const anchors = cells.get(key) ?? []
      anchors.push({ group, x, y })
      cells.set(key, anchors)
    }
  }
  // Compare to a fixed anchor, not transitive neighbours: no long chains.
  return groups.filter((group) => group.facilities.length > 1)
}

export function stackOffset(index: number, count: number): { x: number; y: number } {
  return { x: 36, y: (index - (count - 1) / 2) * 48 }
}

export function facilityNameSize(zoom: number): number {
  return 10 + (Math.min(18, Math.max(14, zoom)) - 14) * 1.5
}
