import syntheticFacilities from './synthetic-facilities.json'
import type { Facility } from '../types'

function isFacility(value: unknown): value is Facility {
  if (!value || typeof value !== 'object') return false
  const facility = value as Record<string, unknown>
  return (
    typeof facility.objectId === 'number' &&
    typeof facility.recordId === 'string' &&
    typeof facility.name === 'string' &&
    typeof facility.programIdentifier === 'string' &&
    typeof facility.address === 'string' &&
    typeof facility.city === 'string' &&
    typeof facility.zip === 'string' &&
    typeof facility.longitude === 'number' && Number.isFinite(facility.longitude) &&
    typeof facility.latitude === 'number' && Number.isFinite(facility.latitude)
  )
}

export interface FacilitySnapshot {
  facilities: Facility[]
  isSynthetic: boolean
}

export async function loadFacilities(): Promise<FacilitySnapshot> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/facilities.json`)
    if (!response.ok) throw new Error(`Snapshot unavailable (${response.status})`)
    const payload: unknown = await response.json()
    if (!Array.isArray(payload)) throw new Error('Snapshot is not an array')
    const facilities = payload.filter(isFacility)
    if (facilities.length === 0) throw new Error('Snapshot contains no valid facilities')
    return { facilities, isSynthetic: false }
  } catch (error) {
    console.warn('Using the synthetic facility fixture:', error)
    return { facilities: syntheticFacilities as Facility[], isSynthetic: true }
  }
}
