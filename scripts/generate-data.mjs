import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const serviceRoot = 'https://services.arcgis.com/Ej0PsM5Aw677QF1W/arcgis/rest/services/EPL_BusinessPoint/FeatureServer'
const outputPath = resolve(dirname(fileURLToPath(import.meta.url)), '../public/data/facilities.json')
const fields = [
  'OBJECTID', 'Business_Record_ID', 'Business_Name', 'Business_Program_Identifier',
  'Business_Establishment_Descr', 'Business_Address', 'Business_City', 'Business_Phone',
  'Business_Location_Zip', 'Business_Grade', 'Load_DT_TM',
].join(',')

async function fetchPage(offset) {
  const parameters = new URLSearchParams({
    f: 'json', where: "Business_Status='Active'", outFields: fields, returnGeometry: 'true',
    outSR: '4326', orderByFields: 'OBJECTID ASC', resultOffset: String(offset), resultRecordCount: '2000',
  })
  const url = `${serviceRoot}/0/query?${parameters}`
  let lastError
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json()
      if (payload.error) throw new Error(payload.error.message || 'ArcGIS query failed')
      if (!Array.isArray(payload.features)) throw new Error('ArcGIS response has no feature array')
      return payload.features
    } catch (error) {
      lastError = error
      if (attempt < 3) await new Promise((resolveDelay) => setTimeout(resolveDelay, 500 * 2 ** attempt))
    }
  }
  throw new Error(`Could not fetch county facilities at offset ${offset}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

function text(value) { return value == null ? '' : String(value).trim() }
function finiteNumber(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null }

function compactFeature(feature) {
  const attributes = feature?.attributes
  const longitude = finiteNumber(feature?.geometry?.x)
  const latitude = finiteNumber(feature?.geometry?.y)
  const objectId = finiteNumber(attributes?.OBJECTID)
  const recordId = text(attributes?.Business_Record_ID)
  const name = text(attributes?.Business_Name)
  if (!attributes || objectId === null || !recordId || !name || longitude === null || latitude === null) return null
  return {
    objectId, recordId, name,
    programIdentifier: text(attributes.Business_Program_Identifier),
    establishmentDescription: text(attributes.Business_Establishment_Descr),
    address: text(attributes.Business_Address), city: text(attributes.Business_City),
    phone: text(attributes.Business_Phone), zip: text(attributes.Business_Location_Zip),
    grade: text(attributes.Business_Grade) || null,
    updatedAt: finiteNumber(attributes.Load_DT_TM), longitude, latitude,
  }
}

const facilities = []
for (let offset = 0; ; offset += 2000) {
  const page = await fetchPage(offset)
  for (const feature of page) {
    const facility = compactFeature(feature)
    if (facility) facilities.push(facility)
  }
  console.log(`Fetched ${page.length} records at offset ${offset}.`)
  if (page.length < 2000) break
}

facilities.sort((left, right) => left.objectId - right.objectId)
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(`${outputPath}.tmp`, JSON.stringify(facilities))
await rename(`${outputPath}.tmp`, outputPath)
console.log(`Wrote ${facilities.length} active facilities to ${outputPath}.`)
