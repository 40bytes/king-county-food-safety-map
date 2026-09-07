import { describe, expect, it } from 'vitest'
import { facilityNameSize, groupFacilities, SMALL_GROUP_LIMIT, stackOffset } from './overlap'
import { filterAndRankFacilities } from './search'
import type { Facility } from '../types'

const facility = (recordId: string, northMetres = 0, eastMetres = 0): Facility => ({
  objectId: 1, recordId, name: recordId, programIdentifier: '', establishmentDescription: '',
  address: '', city: 'Seattle', phone: '', zip: '', grade: 'Good', updatedAt: null,
  longitude: -122.3 + eastMetres / (111_320 * Math.cos(47.6 * Math.PI / 180)),
  latitude: 47.6 + northMetres / 111_320,
})

describe('co-located facility groups', () => {
  it('groups exact points with stable membership/order without mutating records', () => {
    const facilities = [facility('C'), facility('A'), facility('B')]
    const original = structuredClone(facilities)
    expect(groupFacilities(facilities).map((group) => [group.id, group.facilities.map(({ recordId }) => recordId)]))
      .toEqual([['A', ['A', 'B', 'C']]])
    expect(groupFacilities([...facilities].reverse())).toEqual(groupFacilities(facilities))
    expect(facilities).toEqual(original)
  })

  it('absorbs sub-metre rounding across spatial cells but not neighbouring storefronts', () => {
    expect(groupFacilities([facility('A'), facility('B', 0.6, 0.6)]).map((group) => group.facilities.length)).toEqual([2])
    expect(groupFacilities([facility('A'), facility('B', 0.8, 0.8), facility('C', 5)])).toEqual([])
    expect(groupFacilities([facility('A'), facility('B', -0.6, -0.6)])).toHaveLength(1)
  })

  it('does not merge chains of nearby coordinates beyond the fixed anchor tolerance', () => {
    const groups = groupFacilities([facility('A'), facility('B', 0.75), facility('C', 1.5)])
    expect(groups[0]?.facilities.map(({ recordId }) => recordId)).toEqual(['A', 'B'])
  })

  it('recalculates large, small and singleton groups from filtered facilities', () => {
    const facilities = Array.from({ length: SMALL_GROUP_LIMIT + 1 }, (_, index) => facility(`Cafe ${index}`))
    expect(groupFacilities(facilities)[0]?.facilities).toHaveLength(5)
    const filtered = filterAndRankFacilities(facilities.map((entry, index) => ({ ...entry, grade: index ? 'Good' : 'Okay' })), '', new Set(['Good']))
    expect(groupFacilities(filtered)[0]?.facilities).toHaveLength(SMALL_GROUP_LIMIT)
    expect(groupFacilities(filterAndRankFacilities(facilities, 'Cafe 1', new Set(['Good'])))).toEqual([])
    expect(groupFacilities([])).toEqual([])
  })
})

describe('screen-space stack layout', () => {
  it.each([2, 3, 4])('centres %i rows with fixed touch-friendly spacing', (count) => {
    const offsets = Array.from({ length: count }, (_, index) => stackOffset(index, count))
    expect(offsets.reduce((sum, offset) => sum + offset.y, 0)).toBe(0)
    expect(offsets.every(({ x }) => x === 36)).toBe(true)
    for (let index = 1; index < offsets.length; index++) {
      expect((offsets[index]?.y ?? 0) - (offsets[index - 1]?.y ?? 0)).toBe(48)
    }
  })

  it('preserves name sizing at zoom 14–18, including fractional zoom', () => {
    expect([12, 14, 15, 16, 18, 20].map(facilityNameSize)).toEqual([10, 10, 11.5, 13, 16, 16])
    expect(facilityNameSize(14.5)).toBe(10.75)
  })
})
