# Trail App — Status

## Stack (current)
- Vite + React + TypeScript
- Tailwind, Recharts (charting)
- Deployed: Vercel (auto-deploy from GitHub main)
- Pacing model: Minetti grade-adjusted cost

## Done
- Scaffold deployed live on Vercel
- GPX upload + parse (DOMParser → {lat, lon, ele}), with parser-error guard.
  Parse boundary now throws a typed `GpxError` (codes `invalid` / `no-track` /
  `too-few`) for the three bad-input cases; `App.tsx` catches it and shows a
  friendly inline message instead of producing NaN or crashing. Engine stays pure.
- "Try an example" button loads a bundled course (`public/example-imperial-trail.gpx`,
  the Imperial Trail) so a first-time visitor with no GPX sees the full output.
  Fetched lazily on click; runs through the shared `buildTrack` pipeline — the exact
  same path as a user upload.
- Cumulative distance (Haversine)
- Elevation smoothing + D+. Originally a point-count moving average (window 3);
  now a physical-length pipeline (see the elevation-system entry below). Reported
  D+ on 25 Bosses: 835 m raw → 969 m naive-after-resample → **808 m** with the
  hysteresis threshold (back inside official ~700–900). Imperial: 1426 → 1476 →
  **1193 m** (near the ~1130 billing). D+ is display-only; it does not feed time.
- Per-segment gradients (Δele / Δdist)
- Minetti grade-adjusted cost model, clamped to ±0.45 — verified against the 2002 paper
- Engine extracted to `src/lib/pacing.ts` (pure, no React); Minetti anchors + clamp +
  computeSplits behavior locked in Vitest (`npm test`)
- Total-time invariant test: Σ (paceSecPerKm × distanceKm) over splits === last
  split's elapsedSec, asserted per-km on a mixed run/descent/hike course. Replaces
  the cross-check lost when projectTime was deleted; locks the table columns to the
  projected finish so they can't silently drift apart
- Per-segment pace from cost ratio → projected finish time on screen
- Per-km splits table (km / grade / D+ / hike% / pace / elapsed)
- Run/hike transition: HARD SWITCH to power-hike above transition grade at VAM
  (not min(run,hike) — correct, since iso-effort run always "wins" at VAM 750)
- Tailwind dark dashboard UI; effort inputs as live fields + sliders (pace / VAM / gate / terrain)
- Terrain factor (single multiplier) accuracy knob — **default now ×1.00** (pure Minetti
  baseline on load; was silently ×1.20, moved the headline number, so reset to 1.00)
- Elevation profile chart (Recharts)
- **Validated on the real race GPX** (Imperial Trail, Fontainebleau): parses to
  68.75 km / 1426 m D+ raw (1476 m post-resample) — in the ballpark of the
  ~70 km / ~1130 m billing (billed D+ runs low). Pipeline proven end-to-end on a
  point-to-point course, not just the 25 Bosses loop.
- Docs: CLAUDE.md added (decisions, working style, do-not-list); README rewritten
  to current behavior; removed leftover Vite DEFAULT_README.
- **Self-calibration groundwork — timestamp capture.** `TrackPoint` gained an
  optional `time?` (epoch ms); `parseGpx` now reads the `<time>` child of each
  `<trkpt>` (ISO 8601 → epoch ms) when present, undefined when absent — course
  GPX files with no timestamps parse and run the forward model exactly as before.
  New pure fn `actualSegmentTimes(points)` returns per-segment elapsed seconds
  (parallel to gradients, length n−1), or **null if any point lacks a timestamp**
  (all-or-nothing: a partially-timed track can't anchor a fit and zero-filling
  would bias solved params fast). Tests added under a `happy-dom` env docblock
  (new dev-only dep, supplies DOMParser): timestamped track → correct positive
  segment times; no-time course → null + forward pipeline intact; partial timing
  → null. `actualSegmentTimes` is the ground-truth input the calibration fit will
  consume next.
- **Self-calibration fit v0 — one scalar.** `calibrateTerrainFactor(points, dists,
  grades, flatPace, vam, gate)` inverts the forward model against a recorded
  effort: runs pure Minetti (terrainFactor 1.0), then returns `actualTotal /
  predictedTotal`. Single division is *exact*, not approximate — terrainFactor
  scales every segment time uniformly, so predicted total is linear in it. This
  replaces the slider the user currently guesses with a measured number. Same
  all-or-nothing timing discipline: null if `actualSegmentTimes` is null (also
  null on a degenerate zero-movement course). Pure engine only — NOT wired into
  App.tsx; that's a later step. Test recovers ~1.15 from a track timed at exactly
  1.15× the model across mixed grades; no-time effort → null.
  - Honest limitations (recorded, not solved this session):
    1. **Stopped time** — aid-station / paused-watch / photo deltas inflate
       `actualTotal`, biasing the factor high. A moving-time filter belongs in
       `actualSegmentTimes` (drop near-zero-speed segments) before this division.
    2. **Single-effort overfit** — one race = one day's weather/legs/fueling. The
       real version should fit against several efforts, weighting recent ones more,
       not trust a lone finish time.
- **Resample to even spacing — gradient spikes fixed.** New pure fn
  `resampleEven(points, dists, intervalM)` re-stations the track every 10 m by
  linear interpolation (lat/lon/ele) before gradients, so near-coincident GPS
  fixes can't blow up Δele/Δdist. Slots in as
  `parseGpx → cumulativeDistances → resampleEven(10) → smoothElevation(3) →
  gradients` (now smoothElevationByDistance — see next entry); wired into App.tsx
  and `scripts/calibrate-scan.ts`. Geometry only —
  resampled points carry **no `time`**; the timing path (`actualSegmentTimes`)
  still runs on the raw, truly-timed points, so calibration is unaffected by
  design. Tests lock even spacing, linear-ramp→constant-gradient,
  endpoint/total-distance preservation, and degenerate inputs.
  - **Spike fix, measured.** Max |gradient| collapses: 25 Bosses 5414%→60%,
    Pajariel 325%→34%, quais 168%→18% (Imperial had no big spike, 54%→52%).
  - **Coastline / D+ shift is density-dependent — note this.** Window-3 smoothing
    spans `3 × spacing` meters, so resampling to 10 m changes its physical reach.
    On DENSE recordings (~2.5 m raw) it down-samples → slightly less D+
    (Pajariel 515→502, quais 134→113). On the SPARSE race files (~18–20 m raw) it
    UP-samples → the window now spans 30 m not ~60 m, retaining MORE D+:
    25 Bosses 835→969 m, Imperial 1426→1476 m. Accepted tradeoff for the 10 m
    choice; one side effect is 25 Bosses now sits just above the official
    ~700–900 band.
  - **Bonus — tighter calibration.** Removing spike-driven false hiking pulled the
    `calibrate-scan` factors from 1.015–1.087 to **1.048–1.095** (Pajariel hike
    fraction 13.3%→7.9%, quais 3.1%→0%). The hikeFraction-overstatement issue is
    now resolved in practice, not just bounded.
- **Elevation system — physical length scales (research-backed).** The literature
  (Strava, swisstopo, the arXiv "cumulative ascent meets Mandelbrot" paper) is
  clear that resampling fixes gradient spikes but NOT the coastline paradox: naive
  Σ(positive Δele) is noise-inflated and scale-dependent. Two new pure fns address
  the rest, each with an explicit metres-based knob, decoupled from grid density:
  - `smoothElevationByDistance(points, dists, windowM)` — centered MA over a fixed
    PHYSICAL window instead of a point count. On a 10 m grid, windowM=30 is exactly
    the old window-3 (unit-tested equality), so swapping it in is **time-neutral**
    (calibrate-scan factors unchanged: 1.092/1.095/1.048/1.087). Rule of thumb:
    keep windowM ≥ ~3× the resample interval or it under-smooths.
  - `cumulativeGain(eles, thresholdM)` — density-stable D+ via a hysteresis
    deadband: only bank a climb once it clears `thresholdM` above the last
    reference; sub-band wiggles (GPS noise) never count. `thresholdM = 0` reduces
    exactly to the naive sum (unit-tested), so it's a strict generalization.
  - **Wired:** App.tsx now uses interval 10 m, window 30 m, D+ threshold **5 m**
    (named constants at top of App.tsx, one-line tunable). 5 m chosen because it
    best matches published D+ (25 Bosses 808 m in the ~700–900 band; Imperial
    1193 m near the ~1130 billing) — naive was 969/1476, noise-inflated. Pajariel
    (real hills) barely moves (502→475), confirming the filter strips noise not
    signal. **Decision is yours** — change `D_PLUS_THRESHOLD_M` if you disagree;
    measured table: 25 Bosses 2 m→894 / 3 m→866 / 5 m→808; Imperial 1309/1278/1193.
  - Tests: window-3 equality, line-preserving interior, and threshold deadband
    (noise→0, real climb banked, valley re-anchoring, threshold-0 == naive).

- **Analytics — Umami Cloud (free tier, custom events included).** Script tag in
  `index.html` with `data-domains="gradepace.vercel.app"` so dev/localhost never
  records; `src/lib/analytics.ts` is a no-op-safe `track()` wrapper (undefined
  tracker / ad-blocker / dev all silently skip). Four events: `load-example`,
  `upload-gpx`, `gpx-error` (with source + error code — measures how many
  visitors bring route-only GPX files, which decides whether rtept support is
  worth building), `share-image` (with native-sheet vs download method; only
  counted after a completed share, not a dismissed sheet). Chosen over Vercel
  Analytics because the Hobby plan is pageviews-only (custom events are Pro).
  Site created at cloud.umami.is; the live website ID is in `index.html`.

## Next
- **Optional elevation polish** (only if it earns its keep): expose
  `D_PLUS_THRESHOLD_M` / `SMOOTH_WINDOW_M` as UI controls; or try a Savitzky-Golay
  smoother (preserves climb peaks better than a box MA — the research flagged it,
  but it's harder to explain and the box MA is fine for now).
- **Wire calibration into the UI.** `calibrateTerrainFactor` exists as a pure fn
  but nothing calls it. Next: let the user upload a past *timed* effort, run the
  fit, and feed the measured factor into the forward model (replacing the guessed
  slider). Decide UX for cold-start (no history) vs calibrated.
- **Moving-time filter** in `actualSegmentTimes` before the fit trusts totals
  (limitation 1 above) — drop near-zero-speed segments so aid stops don't inflate
  the factor.
- Calibration: decide a believable terrain factor for Fontainebleau using the
  68.75 km finish as a gut-check (7:17 @1.00 vs 8:44 @1.20 — which matches reality?)
- Fatigue-fade model — ONLY after a second calibration point exists (known split
  or past race time). Do not fit terrain + fatigue against one finish time.
- Gradient-colored profile chart — now unblocked by the resample (gradients are
  clean); clamp grade for display.
- Bundle ~530 kB (Recharts heavy) → code-split the chart if load time matters
- Polish: pace stepper, hover tooltips on splits, mobile layout

## Known issues
- Per-km splits don't split the segment straddling a 1000 m boundary, so each km is
  ~1000–1020 m and distanceKm drifts <2% above 1.0. Principled fix = proportional split at
  the boundary; deferred for v0. Interim: the final partial km shows its actual distance.
- parseGpx forward-fills missing <ele>; fine for clean files, revisit if the messier
  September race file has long elevation gaps.

## Fixed (was a known issue)
- Gradient spikes (saw +3722%) from near-coincident GPS points — fixed by
  `resampleEven` (10 m even spacing before gradients). Max |gradient| on test
  tracks now <35%.
- Hike gate overstating hikeFraction from a surviving GPS spike above the
  transition grade — resolved by the resample (no spikes clear the gate now;
  measured hike fractions dropped, e.g. quais 3.1%→0%).

## Open decisions
- PWA later; native/watch only if validated
