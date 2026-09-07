import { describe, expect, it, vi } from 'vitest'
import { createQueryUrl, escapeSqlLiteral, fetchInspections } from './arcgis'

describe('ArcGIS query helpers', () => {
  it('escapes apostrophes in SQL literals', () => expect(escapeSqlLiteral("O'Malley''s")).toBe("O''Malley''''s"))
  it('creates an encoded URL with fixed JSON and geometry parameters', () => {
    const url = new URL(createQueryUrl(1, { where: "name='A&B'", outFields: 'OBJECTID' }))
    expect(url.pathname).toContain('/FeatureServer/1/query')
    expect(url.searchParams.get('where')).toBe("name='A&B'")
    expect(url.searchParams.get('f')).toBe('json')
    expect(url.searchParams.get('returnGeometry')).toBe('false')
  })

  it('excludes consultation and education inspections using the county value', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ features: [] })))

    await fetchInspections('PFE-PR-123')

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.searchParams.get('where')).toContain("Inspection_Type<>'Consultation/Education'")
    fetchMock.mockRestore()
  })
})
