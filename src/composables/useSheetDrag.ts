import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { resistSheetHeight, sheetStates, sheetVelocity, snapSheet, unresistSheetHeight, type DragSample, type SheetHeights, type SheetState } from '../domain/sheetPhysics'

export function useSheetDrag() {
  const sheetElement = ref<HTMLElement>()
  const sheetState = ref<SheetState>('collapsed')
  let observer: ResizeObserver | undefined
  let suppressedClick: { pointerId: number; until: number } | undefined
  let drag: {
    pointerId: number; target: HTMLElement; startY: number; startHeight: number
    height: number; moved: boolean; heights: SheetHeights; samples: DragSample[]
  } | undefined
  let revision = 0

  function releaseCapture(): void {
    const previous = drag
    drag = undefined
    if (previous?.target.hasPointerCapture(previous.pointerId)) previous.target.releasePointerCapture(previous.pointerId)
  }

  function settle(): void {
    const version = ++revision
    // Commit the finger position before restoring the CSS snap height/transition.
    sheetElement.value?.getBoundingClientRect()
    void nextTick(() => {
      if (version !== revision || !sheetElement.value) return
      sheetElement.value.style.removeProperty('transition-property')
      sheetElement.value.style.removeProperty('height')
    })
  }

  function cancelSheetDrag(event?: PointerEvent): void {
    if (event && event.pointerId !== drag?.pointerId) return
    if (drag?.moved) suppressedClick = { pointerId: drag.pointerId, until: performance.now() + 500 }
    releaseCapture()
    settle()
  }

  function startSheetDrag(event: PointerEvent): void {
    if (drag || !event.isPrimary || event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return
    suppressedClick = undefined // A new physical tap must never be swallowed.
    const sheet = sheetElement.value
    if (!sheet || getComputedStyle(event.currentTarget).display === 'none') return
    const measure = (state: SheetState) => sheet.querySelector<HTMLElement>(`[data-sheet-size="${state}"]`)?.getBoundingClientRect().height ?? 0
    const heights = { collapsed: measure('collapsed'), half: measure('half'), expanded: measure('expanded') }
    if (!heights.expanded) return
    event.currentTarget.setPointerCapture(event.pointerId)
    ++revision
    const height = sheet.getBoundingClientRect().height
    sheet.style.transitionProperty = 'none'
    sheet.style.height = `${height}px`
    drag = { pointerId: event.pointerId, target: event.currentTarget, startY: event.clientY,
      startHeight: unresistSheetHeight(height, heights.collapsed, heights.expanded),
      height, moved: false, heights, samples: [{ y: event.clientY, time: event.timeStamp }] }
  }

  function moveSheetDrag(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return
    const distance = drag.startY - event.clientY
    drag.moved ||= Math.abs(distance) >= 5
    drag.samples = drag.samples.filter((sample) => event.timeStamp - sample.time <= 100)
    drag.samples.push({ y: event.clientY, time: event.timeStamp })
    drag.height = resistSheetHeight(drag.startHeight + distance, drag.heights.collapsed, drag.heights.expanded)
    if (sheetElement.value) sheetElement.value.style.height = `${drag.height}px`
  }

  function endSheetDrag(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return
    moveSheetDrag(event)
    const finished = drag
    releaseCapture()
    if (finished.moved) {
      suppressedClick = { pointerId: event.pointerId, until: performance.now() + 500 }
      sheetState.value = snapSheet(finished.height, sheetVelocity(finished.samples, event.timeStamp), finished.heights, sheetState.value)
    }
    settle()
  }

  function activateSheet(event: MouseEvent): void {
    if (drag && event.detail > 0) return
    if (event.detail > 0 && suppressedClick && performance.now() <= suppressedClick.until &&
      (!(event instanceof PointerEvent) || event.pointerId === suppressedClick.pointerId)) {
      suppressedClick = undefined
      event.preventDefault()
      return
    }
    suppressedClick = undefined
    const current = sheetStates.indexOf(sheetState.value)
    sheetState.value = sheetStates[(current + 1) % sheetStates.length] ?? 'collapsed'
  }

  watch(sheetState, () => { if (drag) cancelSheetDrag() }, { flush: 'sync' })
  onMounted(() => {
    // The invisible sizing probes resolve dvh, safe areas, and breakpoints in CSS.
    observer = new ResizeObserver(() => cancelSheetDrag())
    sheetElement.value?.querySelectorAll<HTMLElement>('[data-sheet-size]').forEach((probe) => observer?.observe(probe))
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    ++revision
    releaseCapture()
  })

  return { sheetElement, sheetState, startSheetDrag, moveSheetDrag, endSheetDrag, cancelSheetDrag, activateSheet }
}
