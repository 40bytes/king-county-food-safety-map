import type { Inspection, Violation } from '../types'

export const SERVICE_ROOT =
  'https://services.arcgis.com/Ej0PsM5Aw677QF1W/arcgis/rest/services/EPL_BusinessPoint/FeatureServer'

interface ArcGisFeature {
  attributes?: Record<string, unknown>
}

interface ArcGisResponse {
  features?: ArcGisFeature[]
  error?: { message?: string; details?: unknown }
}

export function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''")
}

export function createQueryUrl(layer: number, parameters: Record<string, string>): string {
  const search = new URLSearchParams({ f: 'json', returnGeometry: 'false', ...parameters })
  return `${SERVICE_ROOT}/${layer}/query?${search.toString()}`
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value)
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function dateValue(value: unknown): number | null {
  const numericDate = numberValue(value)
  if (numericDate !== null) return numericDate
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) ? timestamp : null
}

async function queryArcGis(url: string, signal?: AbortSignal): Promise<ArcGisFeature[]> {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error(`County service returned HTTP ${response.status}.`)
      const payload: unknown = await response.json()
      if (!payload || typeof payload !== 'object') throw new Error('County service returned an invalid response.')
      const parsed = payload as ArcGisResponse
      if (parsed.error) throw new Error(parsed.error.message || 'County service rejected the query.')
      if (!Array.isArray(parsed.features)) throw new Error('County service response did not contain features.')
      return parsed.features
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('County service request failed.')
}

export async function fetchInspections(recordId: string, signal?: AbortSignal): Promise<Inspection[]> {
  const record = escapeSqlLiteral(recordId)
  const where =
    `Business_Record_ID='${record}' AND Inspection_Type<>'Consultation/Education' ` +
    "AND Inspection_Result IN ('Satisfactory','Unsatisfactory')"
  const url = createQueryUrl(1, {
    where,
    outFields: 'OBJECTID,Inspection_Serial_Num,Inspection_Date,Inspection_Score,Inspection_Result,Inspection_Type',
    orderByFields: 'Inspection_Date DESC',
  })
  const features = await queryArcGis(url, signal)
  return features.flatMap(({ attributes }) => {
    if (!attributes) return []
    const result = stringValue(attributes.Inspection_Result)
    if (result !== 'Satisfactory' && result !== 'Unsatisfactory') return []
    const objectId = numberValue(attributes.OBJECTID)
    const serialNumber = stringValue(attributes.Inspection_Serial_Num)
    if (objectId === null || !serialNumber) return []
    return [{
      objectId,
      serialNumber,
      date: dateValue(attributes.Inspection_Date),
      score: numberValue(attributes.Inspection_Score),
      result,
      type: stringValue(attributes.Inspection_Type),
    }]
  })
}

export async function fetchViolations(serialNumber: string, signal?: AbortSignal): Promise<Violation[]> {
  const where = `Inspection_Serial_Num='${escapeSqlLiteral(serialNumber)}'`
  const url = createQueryUrl(2, {
    where,
    outFields: 'OBJECTID,Violation_Type,Violation_Descr,Violation_Points',
    orderByFields: 'OBJECTID ASC',
  })
  const features = await queryArcGis(url, signal)
  return features.flatMap(({ attributes }) => {
    if (!attributes) return []
    const objectId = numberValue(attributes.OBJECTID)
    if (objectId === null) return []
    return [{
      objectId,
      type: stringValue(attributes.Violation_Type),
      description: stringValue(attributes.Violation_Descr),
      points: numberValue(attributes.Violation_Points),
    }]
  })
}
