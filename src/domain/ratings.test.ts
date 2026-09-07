import { describe, expect, it } from 'vitest'
import { normalizeGrade } from './ratings'

describe('normalizeGrade', () => {
  it.each([
    ['EXCELLENT', 'Excellent'], [' good ', 'Good'], ['ok', 'Okay'],
    ['Needs_Improvement', 'Needs to Improve'], [null, 'Not rated'], ['pending', 'Not rated'],
  ])('normalizes %s', (input, expected) => expect(normalizeGrade(input)).toBe(expected))
})
