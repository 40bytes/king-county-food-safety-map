import { Marker, type Map as MapLibreMap } from 'maplibre-gl'
import { facilityNameSize, OVERLAP_ZOOM, SMALL_GROUP_LIMIT, stackOffset, type FacilityGroup } from './domain/overlap'
import { normalizeGrade, ratingClass } from './domain/ratings'

interface GroupMarker {
  marker: Marker
  group: FacilityGroup
  buttons: HTMLButtonElement[]
  lines: SVGLineElement[]
}

// DOM markers keep offsets in CSS pixels at fractional zoom, rotation and pitch.
// Only viewport groups are mounted. Camera events never write GeoJSON sources.
export class OverlapMarkers {
  private groups: FacilityGroup[] = []
  private mounted = new Map<string, GroupMarker>()
  private selectedId: string | null = null

  constructor(
    private readonly map: MapLibreMap,
    private readonly selectFacility: (recordId: string) => void,
    private readonly selectGroup: (groupId: string) => void,
  ) {
    map.on('move', this.render)
    map.on('resize', this.render)
  }

  setGroups(groups: FacilityGroup[]): void {
    this.clear()
    this.groups = groups
    this.render()
  }

  setSelected(recordId: string | null): void {
    this.selectedId = recordId
    for (const { group, buttons } of this.mounted.values()) {
      buttons.forEach((button, index) => {
        const selected = group.facilities.length > SMALL_GROUP_LIMIT
          ? group.facilities.some((facility) => facility.recordId === recordId)
          : group.facilities[index]?.recordId === recordId
        button.classList.toggle('is-selected', selected)
        button.setAttribute('aria-pressed', String(selected))
      })
    }
  }

  private create(group: FacilityGroup): GroupMarker | undefined {
    const anchor = group.facilities[0]
    if (!anchor) return
    const root = document.createElement('div')
    root.className = 'overlap-marker'
    const buttons: HTMLButtonElement[] = []
    const lines: SVGLineElement[] = []
    const large = group.facilities.length > SMALL_GROUP_LIMIT
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.classList.add('overlap-connectors')
    svg.setAttribute('aria-hidden', 'true')
    root.append(svg)
    for (const [index, facility] of (large ? [anchor] : group.facilities).entries()) {
      const offset = large ? { x: 0, y: 0 } : stackOffset(index, group.facilities.length)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'overlap-place'
      button.style.left = `${offset.x}px`
      button.style.top = `${offset.y}px`
      if (large) {
        button.classList.add('overlap-group')
        button.textContent = `${group.facilities.length} places here`
        button.setAttribute('aria-label', `${group.facilities.length} places here. Open facility list`)
      } else {
        const grade = normalizeGrade(facility.grade)
        const pin = document.createElement('span')
        pin.className = `result-grade ${ratingClass(grade)}`
        pin.textContent = grade === 'Needs to Improve' ? '!' : grade.charAt(0)
        const name = document.createElement('span')
        name.className = 'overlap-name'
        name.textContent = facility.name
        button.append(pin, name)
        button.title = `${facility.name} - ${grade}`
        button.setAttribute('aria-label', button.title)
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        line.setAttribute('x2', String(offset.x))
        line.setAttribute('y2', String(offset.y))
        svg.append(line)
        lines.push(line)
      }
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        if (large) this.selectGroup(group.id)
        else this.selectFacility(facility.recordId)
      })
      root.append(button)
      buttons.push(button)
    }
    const marker = new Marker({ element: root, anchor: 'center', subpixelPositioning: true })
      .setLngLat([anchor.longitude, anchor.latitude]).addTo(this.map)
    return { marker, group, buttons, lines }
  }

  private render = (): void => {
    if (this.map.getZoom() < OVERLAP_ZOOM) {
      this.clear()
      return
    }
    const canvas = this.map.getCanvas()
    const visible = new Set<string>()
    for (const group of this.groups) {
      const anchor = group.facilities[0]
      if (!anchor) continue
      const origin = this.map.project([anchor.longitude, anchor.latitude])
      if (origin.x < -320 || origin.y < -150 || origin.x > canvas.clientWidth + 320 || origin.y > canvas.clientHeight + 150) continue
      visible.add(group.id)
      let mounted = this.mounted.get(group.id)
      if (!mounted) {
        mounted = this.create(group)
        if (!mounted) continue
        this.mounted.set(group.id, mounted)
      }
      mounted.marker.getElement().style.setProperty('--facility-name-size', `${facilityNameSize(this.map.getZoom())}px`)
      mounted.lines.forEach((line, index) => {
        const facility = group.facilities[index]
        if (!facility) return
        const position = this.map.project([facility.longitude, facility.latitude])
        line.setAttribute('x1', String(position.x - origin.x))
        line.setAttribute('y1', String(position.y - origin.y))
      })
    }
    for (const [id, mounted] of this.mounted) {
      if (!visible.has(id)) {
        mounted.marker.remove()
        this.mounted.delete(id)
      }
    }
    this.setSelected(this.selectedId)
  }

  private clear(): void {
    for (const { marker } of this.mounted.values()) marker.remove()
    this.mounted.clear()
  }

  destroy(): void {
    this.map.off('move', this.render)
    this.map.off('resize', this.render)
    this.clear()
  }
}
