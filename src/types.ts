export const ratingLabels = ['Excellent', 'Good', 'Okay', 'Needs to Improve', 'Not rated'] as const

export type Rating = (typeof ratingLabels)[number]

export interface Facility {
  objectId: number
  recordId: string
  name: string
  programIdentifier: string
  establishmentDescription: string
  address: string
  city: string
  phone: string
  zip: string
  grade: string | null
  updatedAt: number | null
  longitude: number
  latitude: number
}

export interface Inspection {
  objectId: number
  serialNumber: string
  date: number | null
  score: number | null
  result: 'Satisfactory' | 'Unsatisfactory'
  type: string
}

export interface Violation {
  objectId: number
  type: string
  description: string
  points: number | null
}
