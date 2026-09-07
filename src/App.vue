<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
import { fetchInspections, fetchViolations } from './api/arcgis'
import { loadFacilities } from './data/loadFacilities'
import { filterAndRankFacilities } from './domain/search'
import { normalizeGrade, ratingClass } from './domain/ratings'
import { useSheetDrag } from './composables/useSheetDrag'
import { ratingLabels, type Facility, type Inspection, type Rating, type Violation } from './types'

const RESULT_LIMIT = 150
const mapElement = ref<HTMLDivElement>()
const searchInput = ref<HTMLInputElement>()
const query = ref('')
const debouncedQuery = ref('')
const facilities = ref<Facility[]>([])
const selectedRecordId = ref<string | null>(null)
const enabledRatings = ref(new Set<Rating>(ratingLabels))
const loading = ref(true)
const loadError = ref('')
const synthetic = ref(false)
const shareStatus = ref('')
const { sheetElement, sheetState, startSheetDrag, moveSheetDrag, endSheetDrag, cancelSheetDrag, activateSheet } = useSheetDrag()
const filterMenuOpen = ref(false)
let map: MapLibreMap | undefined
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let inspectionController: AbortController | undefined

interface InspectionState { status: 'idle' | 'loading' | 'loaded' | 'error'; inspections: Inspection[]; error: string }
interface ViolationState { status: 'loading' | 'loaded' | 'error'; violations: Violation[]; error: string }
const inspectionStates = reactive<Record<string, InspectionState>>({})
const violationStates = reactive<Record<string, ViolationState>>({})

const selectedFacility = computed(() => facilities.value.find(({ recordId }) => recordId === selectedRecordId.value) ?? null)
const rankedFacilities = computed(() => filterAndRankFacilities(facilities.value, debouncedQuery.value, enabledRatings.value))
const visibleFacilities = computed(() => rankedFacilities.value.slice(0, RESULT_LIMIT))
const ratingCounts = computed(() => Object.fromEntries(ratingLabels.map((rating) => [
  rating, facilities.value.filter((facility) => normalizeGrade(facility.grade) === rating).length,
])) as Record<Rating, number>)
const selectedInspections = computed(() => selectedRecordId.value ? inspectionStates[selectedRecordId.value] : undefined)

watch(query, (value) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => { debouncedQuery.value = value }, 120)
})

watch(rankedFacilities, updateMapData)
watch(selectedFacility, updateSelectedMapData)

function facilityGeoJson() {
  return {
    type: 'FeatureCollection' as const,
    features: rankedFacilities.value.map((facility) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [facility.longitude, facility.latitude] },
      properties: {
        recordId: facility.recordId,
        rating: normalizeGrade(facility.grade),
        symbol: normalizeGrade(facility.grade) === 'Needs to Improve' ? '!' : normalizeGrade(facility.grade).charAt(0),
      },
    })),
  }
}

function updateMapData(): void {
  const source = map?.getSource('facilities') as GeoJSONSource | undefined
  source?.setData(facilityGeoJson())
}

function updateSelectedMapData(): void {
  const source = map?.getSource('selected-facility') as GeoJSONSource | undefined
  const facility = selectedFacility.value
  source?.setData({
    type: 'FeatureCollection',
    features: facility ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [facility.longitude, facility.latitude] }, properties: {} }] : [],
  })
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function initializeMap(): void {
  if (!mapElement.value) return
  map = new maplibregl.Map({
    container: mapElement.value,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [-122.17, 47.48], zoom: 8.7,
    attributionControl: { compact: true },
  })
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: false,
  }), 'top-right')
  map.on('load', () => {
    map?.getCanvas().setAttribute('aria-label', 'Interactive map of King County food facilities. Use arrow keys to pan and plus or minus to zoom.')
    map?.addSource('facilities', { type: 'geojson', data: facilityGeoJson(), cluster: true, clusterRadius: 45, clusterMaxZoom: 13 })
    map?.addSource('selected-facility', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map?.addLayer({
      id: 'clusters', type: 'circle', source: 'facilities', filter: ['has', 'point_count'],
      paint: { 'circle-color': '#173f43', 'circle-radius': ['step', ['get', 'point_count'], 19, 50, 24, 250, 30], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 },
    })
    map?.addLayer({
      id: 'cluster-count', type: 'symbol', source: 'facilities', filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 }, paint: { 'text-color': '#fff' },
    })
    map?.addLayer({
      id: 'facility-points', type: 'circle', source: 'facilities', filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['match', ['get', 'rating'], 'Excellent', '#087f5b', 'Good', '#1971c2', 'Okay', '#e67700', 'Needs to Improve', '#c92a2a', '#687076'],
        'circle-radius': 10, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
      },
    })
    map?.addLayer({
      id: 'facility-symbols', type: 'symbol', source: 'facilities', filter: ['!', ['has', 'point_count']],
      layout: { 'text-field': ['get', 'symbol'], 'text-size': 10, 'text-font': ['Noto Sans Bold'] }, paint: { 'text-color': '#fff' },
    })
    map?.addLayer({
      id: 'selected-halo', type: 'circle', source: 'selected-facility',
      paint: { 'circle-radius': 18, 'circle-color': '#fff', 'circle-opacity': 0.9, 'circle-stroke-color': '#102a2e', 'circle-stroke-width': 4 },
    })
    map?.addLayer({ id: 'selected-center', type: 'circle', source: 'selected-facility', paint: { 'circle-radius': 7, 'circle-color': '#e85d3f' } })
    updateSelectedMapData()
    map?.on('click', 'clusters', async (event) => {
      const feature = map?.queryRenderedFeatures(event.point, { layers: ['clusters'] })[0]
      const clusterId = feature?.properties?.cluster_id
      if (typeof clusterId !== 'number' || feature?.geometry.type !== 'Point') return
      const source = map?.getSource('facilities') as GeoJSONSource | undefined
      const zoom = await source?.getClusterExpansionZoom(clusterId)
      if (zoom !== undefined) map?.easeTo({ center: feature.geometry.coordinates as [number, number], zoom, duration: reducedMotion() ? 0 : 500 })
    })
    map?.on('click', 'facility-points', (event) => selectFromMap(event.features?.[0]?.properties?.recordId))
    for (const layer of ['clusters', 'facility-points', 'facility-symbols']) {
      map?.on('mouseenter', layer, () => { if (map) map.getCanvas().style.cursor = 'pointer' })
      map?.on('mouseleave', layer, () => { if (map) map.getCanvas().style.cursor = '' })
    }
    flyToSelected(false)
  })
}

function selectFromMap(recordId: unknown): void {
  if (typeof recordId === 'string') selectFacility(recordId)
}

function selectFacility(recordId: string, updateHistory = true): void {
  if (!facilities.value.some((facility) => facility.recordId === recordId)) return
  selectedRecordId.value = recordId
  sheetState.value = 'expanded'
  shareStatus.value = ''
  if (updateHistory) setUrlFacility(recordId)
  void loadInspections(recordId)
  flyToSelected()
}

function closeDetails(updateHistory = true): void {
  selectedRecordId.value = null
  sheetState.value = 'collapsed'
  inspectionController?.abort()
  if (updateHistory) setUrlFacility(null)
}

function setUrlFacility(recordId: string | null): void {
  const url = new URL(window.location.href)
  if (recordId) url.searchParams.set('facility', recordId)
  else url.searchParams.delete('facility')
  window.history.pushState({}, '', url)
}

function restoreFromUrl(): void {
  const recordId = new URL(window.location.href).searchParams.get('facility')
  if (recordId && facilities.value.some((facility) => facility.recordId === recordId)) selectFacility(recordId, false)
  else closeDetails(false)
}

function flyToSelected(animate = true): void {
  if (!selectedFacility.value || !map?.loaded()) return
  map.easeTo({ center: [selectedFacility.value.longitude, selectedFacility.value.latitude], zoom: Math.max(map.getZoom(), 14), duration: animate && !reducedMotion() ? 650 : 0, padding: window.innerWidth < 760 ? { bottom: 320, top: 160, left: 0, right: 0 } : { left: 430, top: 0, bottom: 0, right: 0 } })
}

function clearSearch(): void {
  query.value = ''
  debouncedQuery.value = ''
  searchInput.value?.focus()
}

async function loadInspections(recordId: string): Promise<void> {
  const current = inspectionStates[recordId]
  if (current?.status === 'loaded' || current?.status === 'loading') return
  inspectionController?.abort()
  const controller = new AbortController()
  inspectionController = controller
  inspectionStates[recordId] = { status: 'loading', inspections: [], error: '' }
  try {
    const inspections = await fetchInspections(recordId, controller.signal)
    inspectionStates[recordId] = { status: 'loaded', inspections, error: '' }
  } catch (error) {
    if (controller.signal.aborted) {
      delete inspectionStates[recordId]
      return
    }
    inspectionStates[recordId] = { status: 'error', inspections: [], error: error instanceof Error ? error.message : 'Could not load inspections.' }
  }
}

async function loadViolationDetails(inspection: Inspection): Promise<void> {
  const current = violationStates[inspection.serialNumber]
  if (current?.status === 'loaded' || current?.status === 'loading') return
  violationStates[inspection.serialNumber] = { status: 'loading', violations: [], error: '' }
  try {
    const violations = await fetchViolations(inspection.serialNumber)
    violationStates[inspection.serialNumber] = { status: 'loaded', violations, error: '' }
  } catch (error) {
    violationStates[inspection.serialNumber] = { status: 'error', violations: [], error: error instanceof Error ? error.message : 'Could not load violations.' }
  }
}

function toggleRating(rating: Rating): void {
  const next = new Set(enabledRatings.value)
  if (next.has(rating)) next.delete(rating); else next.add(rating)
  enabledRatings.value = next
}

function focusFirstResult(): void {
  sheetState.value = 'expanded'
  void nextTick(() => document.querySelector<HTMLButtonElement>('[data-result]')?.focus())
}

function formatDate(timestamp: number | null): string {
  return timestamp === null ? 'Date unavailable' : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(timestamp)
}

function addressOf(facility: Facility): string { return [facility.address, facility.city, 'WA', facility.zip].filter(Boolean).join(', ') }

async function shareFacility(): Promise<void> {
  const url = window.location.href
  const canUseNativeShare = typeof navigator.share === 'function'
  try {
    if (canUseNativeShare) await navigator.share({ title: selectedFacility.value?.name, url })
    else await navigator.clipboard.writeText(url)
    shareStatus.value = canUseNativeShare ? 'Shared.' : 'Link copied.'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    shareStatus.value = 'Copy the link from your address bar.'
  }
}

onMounted(async () => {
  initializeMap()
  window.addEventListener('popstate', restoreFromUrl)
  try {
    const snapshot = await loadFacilities()
    facilities.value = snapshot.facilities
    synthetic.value = snapshot.isSynthetic
    restoreFromUrl()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Facilities could not be loaded.'
  } finally { loading.value = false }
})

onBeforeUnmount(() => {
  clearTimeout(debounceTimer)
  inspectionController?.abort()
  window.removeEventListener('popstate', restoreFromUrl)
  map?.remove()
})
</script>

<template>
  <main class="app-shell">
    <section class="map-panel" aria-label="Interactive facility map"><div ref="mapElement" class="map" /></section>
    <section class="sidebar" :class="{ 'has-details': selectedFacility }" aria-label="Food facility explorer">
      <header class="masthead">
        <div><p class="eyebrow">Independent and unofficial</p><h1>King County <span>Food Safety</span></h1></div>
        <p class="intro">Explore public ratings and inspection records.</p>
      </header>

      <div class="search-controls">
        <label class="search-label" for="facility-search">Search facilities</label>
        <div class="search-wrap">
          <svg class="search-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.15A7.5 7.5 0 1 1 4 11.5a7.5 7.5 0 0 1 15 0Z" /></svg>
          <input id="facility-search" ref="searchInput" v-model="query" type="search" autocomplete="off" enterkeyhint="search" placeholder="Name, address, ZIP..." @keydown.down.prevent="focusFirstResult" />
          <button v-if="query" type="button" class="clear-search" aria-label="Clear facility search" @click="clearSearch">x</button>
          <button type="button" class="filter-menu-button" :class="{ active: enabledRatings.size < ratingLabels.length }" aria-label="Rating filters" :aria-expanded="filterMenuOpen" aria-controls="filter-panel" @click="filterMenuOpen = !filterMenuOpen">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M7 12h10M10 17h4" /></svg>
          </button>
        </div>
        <div id="filter-panel" class="filter-panel" :class="{ open: filterMenuOpen }">
          <div class="filters" aria-label="Filter by food safety rating">
            <button v-for="rating in ratingLabels" :key="rating" type="button" class="filter-chip" :class="[ratingClass(rating), { off: !enabledRatings.has(rating) }]" :aria-pressed="enabledRatings.has(rating)" @click="toggleRating(rating)">
              <span class="rating-dot" />{{ rating }}<span class="count">{{ ratingCounts[rating] }}</span>
            </button>
          </div>
        </div>
      </div>

      <section ref="sheetElement" class="sheet" :class="`sheet-${sheetState}`" :aria-label="selectedFacility ? 'Facility details' : 'Facility results'">
        <span v-for="size in ['collapsed', 'half', 'expanded']" :key="size" class="sheet-size-probe" :data-sheet-size="size" aria-hidden="true" />
        <button type="button" class="sheet-header" :aria-expanded="sheetState !== 'collapsed'" :aria-label="`Results sheet: ${sheetState}. Drag this header or activate to change size.`" @pointerdown="startSheetDrag" @pointermove="moveSheetDrag" @pointerup="endSheetDrag" @pointercancel="cancelSheetDrag" @lostpointercapture="cancelSheetDrag" @click="activateSheet">
          <span class="drag-handle" aria-hidden="true" />
          <span v-if="selectedFacility">Facility details</span>
          <span v-else><strong>{{ rankedFacilities.length.toLocaleString() }}</strong> {{ rankedFacilities.length === 1 ? 'facility' : 'facilities' }}</span>
          <span class="sheet-state">{{ sheetState }}</span>
        </button>

        <div v-if="!selectedFacility" class="explorer">
        <div class="results-summary" aria-live="polite">
          <span>Showing all of King County</span>
          <span v-if="rankedFacilities.length > RESULT_LIMIT">| showing first {{ RESULT_LIMIT }}</span>
        </div>
        <div v-if="loading" class="state"><span class="spinner" /> Loading facilities...</div>
        <div v-else-if="loadError" class="state error">{{ loadError }}</div>
        <div v-else-if="visibleFacilities.length === 0" class="state">No facilities match this search and filter.</div>
        <ol v-else class="results" aria-label="Facility results">
          <li v-for="facility in visibleFacilities" :key="facility.recordId">
            <button type="button" data-result @click="selectFacility(facility.recordId)">
              <span class="result-grade" :class="ratingClass(normalizeGrade(facility.grade))">{{ normalizeGrade(facility.grade).charAt(0) }}</span>
              <span class="result-copy"><strong>{{ facility.name }}</strong><small>{{ facility.address }} | {{ facility.city }}</small></span>
              <span aria-hidden="true" class="chevron">&gt;</span>
            </button>
          </li>
        </ol>
        <p v-if="synthetic" class="fixture-notice"><strong>Demo mode:</strong> showing clearly synthetic facilities because a generated county snapshot is unavailable.</p>
        </div>

        <article v-else class="details">
        <button type="button" class="back-button" @click="closeDetails()">&lt;- Back to results</button>
        <div class="detail-heading">
          <span class="large-grade" :class="ratingClass(normalizeGrade(selectedFacility.grade))">{{ normalizeGrade(selectedFacility.grade).charAt(0) }}</span>
          <div><p class="grade-label">{{ normalizeGrade(selectedFacility.grade) }}</p><h2>{{ selectedFacility.name }}</h2></div>
        </div>
        <p v-if="selectedFacility.establishmentDescription" class="description">{{ selectedFacility.establishmentDescription }}</p>
        <address>{{ addressOf(selectedFacility) }}</address>
        <p v-if="selectedFacility.phone"><a :href="`tel:${selectedFacility.phone}`">{{ selectedFacility.phone }}</a></p>
        <div class="detail-actions">
          <a class="action" :href="`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressOf(selectedFacility))}`" target="_blank" rel="noopener">Directions</a>
          <button type="button" class="action" @click="shareFacility">Share</button>
        </div>
        <p v-if="shareStatus" class="share-status" role="status">{{ shareStatus }}</p>
        <p class="source-date">County source updated {{ formatDate(selectedFacility.updatedAt) }}</p>

        <section class="inspection-section">
          <h3>Inspection history</h3>
          <p class="context"><strong>Lower inspection points are better.</strong> Red violations are critical; blue are non-critical. The facility rating summarizes recent routine inspections, not a guarantee of current conditions.</p>
          <div v-if="selectedInspections?.status === 'loading'" class="state"><span class="spinner" /> Loading inspections...</div>
          <div v-else-if="selectedInspections?.status === 'error'" class="state error">{{ selectedInspections.error }} <button type="button" @click="loadInspections(selectedFacility.recordId)">Try again</button></div>
          <p v-else-if="selectedInspections?.status === 'loaded' && selectedInspections.inspections.length === 0" class="state">No qualifying inspections were returned.</p>
          <div v-else class="timeline">
            <details v-for="inspection in selectedInspections?.inspections" :key="inspection.serialNumber" @toggle="($event.currentTarget as HTMLDetailsElement).open && loadViolationDetails(inspection)">
              <summary>
                <span class="timeline-mark" :class="inspection.result.toLowerCase()" />
                <span><strong>{{ formatDate(inspection.date) }}</strong><small>{{ inspection.type }} | {{ inspection.result }}</small></span>
                <b>{{ inspection.score ?? '-' }}<small> pts</small></b>
              </summary>
              <div class="violations">
                <p v-if="violationStates[inspection.serialNumber]?.status === 'loading'">Loading violations...</p>
                <p v-else-if="violationStates[inspection.serialNumber]?.status === 'error'" class="error">{{ violationStates[inspection.serialNumber]?.error }} <button type="button" class="retry-link" @click="loadViolationDetails(inspection)">Try again</button></p>
                <p v-else-if="violationStates[inspection.serialNumber]?.violations.length === 0">No violations were returned.</p>
                <ul v-else>
                  <li v-for="violation in violationStates[inspection.serialNumber]?.violations" :key="violation.objectId" :class="violation.type.trim().toUpperCase() === 'RED' ? 'critical' : 'non-critical'">
                    <span>{{ violation.points ?? 0 }} pts</span><div><strong>{{ violation.type || 'Violation' }}</strong><p>{{ violation.description }}</p></div>
                  </li>
                </ul>
              </div>
            </details>
          </div>
        </section>
        </article>
        <footer>Data: <a href="https://kingcounty.gov/en/dept/dph/health-safety/food-safety" target="_blank" rel="noopener">Public Health - Seattle &amp; King County</a>. Not affiliated with or endorsed by King County.</footer>
      </section>
    </section>
  </main>
</template>
