import { describe, expect, it } from 'vitest'
import { filterAndRankFacilities, searchScore } from './search'
import type { Facility, Rating } from '../types'

const facility = (name: string, grade: string | null = 'Good', fields: Partial<Facility> = {}): Facility => ({
  objectId: 1, recordId: 'REC-1', name, programIdentifier: 'PRG-1', establishmentDescription: '',
  address: '10 Pine Street', city: 'Seattle', phone: '', zip: '98101', grade, updatedAt: null,
  longitude: -122.3, latitude: 47.6, ...fields,
})

describe('facility search', () => {
  it('ranks exact and prefix name matches above substrings and other fields', () => {
    const matches = filterAndRankFacilities([
      facility('Cafe Pine'), facility('Pine', 'Good', { objectId: 2 }),
      facility('Pineapple Cafe', 'Good', { objectId: 3 }), facility('Elsewhere', 'Good', { objectId: 4 }),
    ], 'pine', new Set<Rating>(['Good']))
    expect(matches.map(({ name }) => name)).toEqual(['Pine', 'Pineapple Cafe', 'Cafe Pine', 'Elsewhere'])
  })
  it('searches identifier, city, ZIP, and record ID', () => {
    expect(searchScore(facility('Cafe'), 'REC-1')).not.toBeNull()
    expect(searchScore(facility('Cafe'), '98101')).not.toBeNull()
  })
  it('normalizes punctuation, spacing, case, and diacritics', () => {
    expect(searchScore(facility('Cafe de l\u2019Ete', 'Good', { address: '123 Jos\u00e9-Way' }), 'cafe l ete')).not.toBeNull()
    expect(searchScore(facility('Cafe', 'Good', { recordId: 'REC-1' }), 'rec 1')).not.toBeNull()
    expect(searchScore(facility('Cafe', 'Good', { address: 'Jose Way' }), 'Jos\u00e9---Way')).not.toBeNull()
  })
  it('requires every query token while allowing tokens across fields', () => {
    expect(searchScore(facility('Pine Cafe', 'Good', { city: 'Bellevue' }), 'pine bellevue')).not.toBeNull()
    expect(searchScore(facility('Pine Cafe', 'Good', { city: 'Seattle' }), 'pine bellevue')).toBeNull()
  })
  it('ranks exact and prefix multi-word names above cross-field matches', () => {
    const matches = filterAndRankFacilities([
      facility('Market', 'Good', { objectId: 1, address: 'Lake City Way' }),
      facility('Lake City Bakery', 'Good', { objectId: 2 }),
      facility('Lake City', 'Good', { objectId: 3 }),
    ], 'lake city', new Set<Rating>(['Good']))
    expect(matches.map(({ name }) => name)).toEqual(['Lake City', 'Lake City Bakery', 'Market'])
  })
  it('filters using normalized ratings', () => {
    expect(filterAndRankFacilities([facility('A', 'excellent'), facility('B', null)], '', new Set<Rating>(['Excellent']))).toHaveLength(1)
  })
})
