# King County Food Safety Map

An **independent, unofficial community project** for exploring food facility ratings and inspection records published by Public Health - Seattle & King County. This project is not affiliated with or endorsed by King County.

## Setup

Requires Node.js 20.19 or newer.

```sh
npm ci
npm run dev
```

A fresh checkout works offline after dependencies are installed: if `public/data/facilities.json` is absent, the app uses the checked-in, clearly synthetic fixture in `src/data/synthetic-facilities.json`.

### Scripts

- `npm run dev` - start Vite's development server
- `npm run generate-data` - fetch a fresh active-facility snapshot from King County
- `npm test` - run Vitest once
- `npm run typecheck` - run `vue-tsc`
- `npm run build` - type-check and make the production bundle
- `npm run preview` - serve the production bundle locally

## Architecture and data flow

The Vue 3 single-page app loads a compact build-time facility snapshot and indexes it locally. Tokenized search, ranking, rating filters, and MapLibre's native GeoJSON clustering all run in the browser. On mobile, rating filters are tucked behind the search control and results start in a collapsed three-state bottom sheet. Selecting a facility fetches its qualifying inspections from ArcGIS layer 1; opening an inspection fetches violations from layer 2. Deep links use `?facility={Business_Record_ID}` and the History API.

### Mobile bottom sheet

- Drag **the header** to follow your finger continuously, with gentle, bounded resistance beyond collapsed/expanded. Release snaps to collapsed, half, or expanded using the last 100ms of movement and a 180ms velocity projection; pausing before release discards earlier flick momentum.
- Tap the header, or focus it and press Enter/Space, to cycle sizes. A drag's follow-up click is suppressed without suppressing keyboard activation or the next physical tap.
- Settling uses an eased height transition; grabbing the header again starts from its current rendered height. Reduced-motion preferences make settling effectively immediate while retaining direct finger tracking.
- Results and details keep native scrolling: dragging their content does **not** resize the sheet. There is no content-scroll-to-sheet gesture handoff.
- Snap heights live in CSS, including dynamic viewport units, safe-area insets, and the narrow-screen adjustment. Hidden sizing probes supply resolved pixel heights to the gesture code. A sizing change cancels an active drag back to its logical snap state; pointer cancellation or lost capture does the same, without fling momentum. Secondary pointers cannot take over the gesture.

`npm test` includes pure drag-physics regression tests for resistance, recent velocity, pauses/reversals, projection, and coincident snap heights. These tests do not simulate browser pointer capture, native scrolling, or CSS transitions; physical iOS interaction has not been verified. Device checks should cover flick/hold/reversal, interruption during settling, canceled/multi-touch gestures, drag then tap, keyboard activation, rotation, and reduced motion.

### Co-located facilities

At zoom 14 and above, groups of two to four facilities appear as vertical pin/name stacks with connector lines to each facility's actual point. Five or more show an **N places here** button opening the existing results sheet with every matching facility at that location. Buttons are keyboard accessible; selecting a row opens the usual details and deep link. Back to results retains the location list; **Show all results** leaves it. Search or rating changes clear that list and recalculate groups.

Grouping uses a one-metre distance from a stable anchor in a local metric approximation at King County's latitude, absorbing coordinate rounding without grouping separate nearby storefronts. It does not merge transitive chains. Viewport-only DOM markers keep stacks in screen pixels during zoom, pan, rotation and pitch, with names sized from 10px at zoom 14 to 16px at zoom 18. Camera events do not rewrite facility sources. Coordinates, directions, and wide-zoom clustering are unchanged; selection highlights the displayed pin or group button.

This is not a general collision solver: separate nearby groups and unrelated labels can still overlap, and long stack names are ellipsized (full names are available to assistive technology, in hover titles, and in details/results). Unit tests cover grouping, filtering, stable ordering, offsets and name sizing; browser/physical-device visual testing of the stacks has not been performed.

`scripts/generate-data.mjs` requests layer 0 in deterministic `OBJECTID ASC` pages of 2,000, limits records to active businesses, requests EPSG:4326 geometry, validates essential fields, and atomically writes `public/data/facilities.json`. That output is intentionally ignored by Git. Generation is not part of `build`, so an upstream outage cannot break a build from a clean checkout.

### Public endpoints

Service root: [`EPL_BusinessPoint/FeatureServer`](https://services.arcgis.com/Ej0PsM5Aw677QF1W/arcgis/rest/services/EPL_BusinessPoint/FeatureServer)

- Layer 0: active facility snapshot
- Layer 1: inspections by `Business_Record_ID`, excluding Consultation/Education and accepting Satisfactory/Unsatisfactory results
- Layer 2: violations by `Inspection_Serial_Num`

The map uses the no-key [OpenFreeMap Liberty](https://openfreemap.org/) MapLibre style, with attribution displayed by MapLibre.

## Deployment

`npm run build` outputs static assets to `dist/` and is suitable for any static host. The Pages workflow builds on pushes to `main`, manual dispatch, and a schedule. It attempts a fresh snapshot but deliberately falls back to the synthetic fixture if the public service is unavailable. Set the repository's Pages source to **GitHub Actions** before the first deployment.

## Limitations

- Records can be delayed, incomplete, changed, or removed by the publisher; verify important decisions with King County.
- Ratings summarize recent routine inspections and do not guarantee present conditions.
- Only facilities with usable point geometry appear, and only the first 150 ranked search results render in the county-wide list (all matching points remain on the map; a selected co-location list is not truncated).
- Live inspection and violation details require network access and the ArcGIS service to permit browser requests.
- Search is intentionally lightweight and does not perform geocoding, typo correction, or proximity ranking.

## Licensing

Application source code is MIT licensed; see [LICENSE](LICENSE). King County data and assets are **not** covered by that license. See [DATA_NOTICE.md](DATA_NOTICE.md) for attribution, restrictions, and disclaimers.
