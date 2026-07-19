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
  Verified live (visit + events in Realtime). Caveat, confirmed first-hand:
  ad-blockers (EasyPrivacy list) block `cloud.umami.is`, so counts are a floor —
  a chunk of a dev-leaning audience is invisible. Fine for funnel shape; don't
  read absolutes as true traffic. Fix if it ever matters: proxy the script
  through a first-party path (Vercel rewrite) or self-host.

- **Landing page opens on the full dashboard.** First visit auto-loads the
  bundled Imperial Trail course (ref-guarded mount effect, same `buildTrack`
  path as everything else), so a visitor from the pinned post sees the product
  instead of an empty upload form. Badged "EXAMPLE — Imperial Trail" until a
  user upload succeeds; the example button hides while the example is on
  screen and returns after an upload ("Back to the example"). Auto-load is
  tracked as `auto-example` — separate from the `load-example` click — so the
  intent metric stays honest; an auto-load failure shows NO error banner (the
  visitor did nothing), just the empty state. Header copy now leads with the
  product pitch ("most planners assume you run every hill") + a
  stays-in-your-browser privacy line instead of the feature list.

- **Route GPX support (`<rtept>` fallback) + no-elevation guard.** `parseGpx`
  now falls back to route points when a file has no `<trkpt>` — race organizers
  publish courses as routes, and a route paces exactly like an untimed track.
  Bundled decision: a file whose points ALL lack `<ele>` (common in route
  exports) throws a new `GpxError` code `no-elevation` instead of pacing a
  silently flat course — the friendly message says to re-export with elevation.
  Tests: route-only parses, `trkpt` preferred over `rtept` when both exist,
  waypoint-only still `no-track`, all-missing-ele → `no-elevation`.
- **Footer with backlinks.** "Built by Alvaro Serero … open source on GitHub" —
  closes the X-post → app → follow loop. Outbound clicks tracked via Umami
  `data-umami-event` attributes (`click-x`, `click-github`), no JS needed.

- **Self-calibration v1 — moving-time filter + UI.** Two pieces:
  1. Engine: `movingTimeSec(points, minSpeed=0.3 m/s)` — per-segment speed from
     the RAW points; segments slower than 0.3 m/s are stops (0.3 chosen because
     the slowest deliberate hiking the model produces — VAM 750 on the 45%
     clamp — is still ≈0.46 m/s horizontal; standing GPS jitter is far below).
     Catches both stop shapes (standing watch = tiny-Δdist segments; paused
     watch = one huge-Δt segment). `calibrateTerrainFactor` now divides MOVING
     time by predicted — this resolves honest-limitation #1 (stopped time).
  2. UI: "Calibrate from a real run" card — upload a recorded GPX, see
     "moving X of Y elapsed, model predicts Z → factor ×F", one click applies
     it to the terrain slider (widened to 0.8–1.6, step 0.01; default still
     ×1.00). Plausibility warning outside 0.85–1.5.
  - **Measured on the four real training runs** (was 1.048–1.095 on raw
    elapsed): quais ×0.993, pajariel ×1.013, bois ×1.062, campagne ×1.080.
    The flat quais run had 7½ min of traffic-light stops; filtered, Minetti
    predicts it within 30 s — the engine is near-exact on clean flat ground
    and the factor now measures terrain, not stops.
  - **Trap found, guarded in UI:** route exports (Strava route builder etc.)
    embed SYNTHETIC ~15 km/h timestamps — Imperial_Trail.gpx "fits" ×0.43.
    Timestamps existing ≠ timestamps real; hence the plausibility band. A
    real detector (constant-speed heuristic) is future work.
  - Analytics: `calibrate-run` (with factor), `calibrate-apply`,
    `calibrate-error` (with code).
  - Known: the factor is fitted against the CURRENT flat-pace/VAM/gate inputs;
    changing them afterwards makes it stale. Fine for v1; revisit if confusing.

- **Honest range around the projected finish (product-thesis item).** New pure
  fn `finishRange(likelySec, calibrated)`: center unchanged (the model's
  estimate — this is presentation, not a model change); band −8%/+10%
  uncalibrated, −5%/+7% after applying a measured factor. Grounding: day-of
  noise ≈4–9% on a 70k, plus terrain-guess spread (measured factors vary ±4%
  across the four calibration runs; a hand-set slider is worse). Asymmetric:
  races go long more often than short. Shown as "expect H:MM – H:MM" (no
  seconds — that would be false precision again) on the Projected-finish card
  (with a "· calibrated" tag) and on the share image under the hero time.
  Hand-moving the terrain slider clears the calibrated flag → band widens.
  Band constants exported from pacing.ts; tests lock both bands + narrowing.

- **Polish batch (first-visitor hardening).**
  - *Bundle split:* the Recharts chart moved to `src/ElevationChart.tsx`,
    loaded via `React.lazy` — main bundle no longer carries ~500 kB of chart
    library; the page paints before the chart chunk arrives (fixed-height
    Suspense fallback, no layout jump).
  - *Error boundary* (`src/ErrorBoundary.tsx`, wraps `<App/>` in main.tsx): a
    render error now shows a styled reload screen instead of a white page.
  - *Pace input honesty:* `parsePace` returns NaN on garbage instead of
    silently falling back to 6:00; the plan keeps the last VALID pace, the
    field turns red with "still using X/km". Calibration uses the same
    last-valid pace.
  - *Drag & drop:* dropping a .gpx anywhere on the page loads it (same code
    path as the file input). Non-.gpx drops get a friendly error.
  - *Share-title cleanup:* `Imperial_Trail-2025.gpx` → "Imperial Trail 2025"
    when prefilling the course name (feeds the share image).
  - *App smoke test* (`src/App.test.tsx`): renders the real `<App/>` in
    happy-dom with fetch mocked — locks the auto-load → example badge →
    dashboard wiring that unit tests couldn't see. Chart module stubbed
    (happy-dom has no layout engine).

- **Cold-start terrain prior — investigated, NOT shipped (negative result).**
  Tested three course-derivable signals against the four measured factors
  (`scripts/prior-scan.ts`, kept for re-testing): elevation roughness
  (mean |Δgrade| per 10 m), steep fraction (|grade|>12%), and bearing-change
  rate (horizontal twistiness). None correlates: the flat quais road shows
  MORE elevation roughness than the trail runs (urban GPS multipath), the
  twistiest course has the lowest factor, the steepest a ≈1.0 factor. Also
  systematic: race-course files carry smooth DEM elevations vs noisy GPS on
  recorded runs, so "roughness" measures elevation provenance, not terrain.
  Decision: default stays ×1.00; the asymmetric range (−8/+10%) is the honest
  cold-start story. Re-test when more calibrated efforts exist (post-race).
  Open one-line option (owner's call): set the uncalibrated default to the
  personal measured mean ≈×1.04.

- **Units toggle (km/mi).** Engine stays 100% metric; imperial is a display
  concern plus one engine knob: `computeSplits` gained `bucketMeters`
  (default 1000; 1609.344 in imperial → REAL per-mile splits, not relabeled
  km; total time invariant to bucketing, unit-tested). Toggle in the
  "Your pace" card converts the pace text in place (6:00/km ↔ 9:39/mi — whole-
  second rounding shifts the projection a few seconds, inherent to a text
  field), flips chart axes (ft/mi via converted data so ticks land round),
  stats, table headers, D+ (ft), VAM display (ft/h; slider still m/h
  internally), and the share card (`units` field). Default: en-US locale →
  imperial, else metric; persisted in localStorage (guarded — storage can
  throw in private browsing). `switch-units` analytics event.

- **Declutter pass (owner feedback: too much text on the main page).** Header
  pitch cut to ONE sentence; upload/privacy hint merged to one line; example
  badge text shortened; pace-field hint shortened; calibration card is now a
  collapsed `<details>` (summary shows "· applied ×N" once calibrated); share
  section reduced to one input+button row (no label, no explainer); range
  explainer shortened; splits table collapsed to 12 rows with a
  "Show all N splits" toggle. No behavior changes — copy and layout only.
- **Gradient-colored elevation profile** (was on Next — unblocked by the
  resample). The chart stroke is a horizontal SVG gradient with ~150 stops
  colored by local grade over a ±100 m window (metric profile, before unit
  conversion): blues = descent, emerald = runnable, amber/orange = climb,
  rose = hike-steep (≈ the 18% gate). Tooltip now shows elevation · grade.
  Area fill stays the subtle emerald fade.

- **Share card: grade-colored profile + preview harness.** The card's profile
  stroke now uses the same grade→color scale as the on-page chart, via a new
  shared `src/lib/gradeColor.ts` (single source, the two can't drift).
  Degenerate profiles fall back to solid emerald (a stop-less gradient would
  render an invisible line — guarded + tested). Verified visually with
  `scripts/render-card-preview.mjs` (npx tsx; renders the card to PNG via
  sharp without a browser — kept as a dev harness). Also: aria-labels on both
  file inputs.

- **Power-hike made visible (owner feedback: the header promises it, the app
  barely showed it).** Three changes, one idea:
  1. Chart rose = "the plan walks here": the rose band is now driven by the
     ACTUAL hike gate (prop from the slider), not a fixed 15%; a tight ±30 m
     check overrides the ±100 m band smoothing so short walls get marked; the
     tooltip appends "· power-hike". Gradient stops are now run-length
     encoded on a 30 m grid (stops at color TRANSITIONS) — uniform ~460 m
     sampling was skipping right over Fontainebleau's 30–100 m hike walls,
     so the feature was invisible on the exact course that motivated it.
  2. Legend under the chart (descent / runnable / climb / power-hike), from a
     shared `GRADE_LEGEND` next to the color scale so they can't drift.
  3. Fourth stat card: "Power-hike — X mi/km · N% of the course walked."
     Share card takes the gate too (`hikeAboveGrade`).

- **Shareable plan links.** "Copy link" (next to Share image) encodes the
  effort inputs in the URL hash (`#p=6:00&vam=750&gate=18&tf=1.08&u=metric`);
  on load the hash overrides defaults (validated + clamped; malformed → plain
  defaults). Deliberate limits: an uploaded GPX can't travel by link, and the
  `calibrated` flag never travels — the recipient didn't calibrate, so they
  get the honest wide band even if the sender's factor was measured.
  Clipboard-blocked fallback drops the hash into the address bar. Smoke test
  locks the restore path. `copy-link` analytics event.
- **og.png now generated FROM the product.** `scripts/gen-og.mjs` (run with
  npx tsx) renders the real share card from the bundled example course
  through the real engine pipeline — colored profile, honest range,
  power-hike stat — so the social preview can't drift from the app.
  `public/og.svg` (the old hand-made design) deleted.

- **Multi-run calibration (closes honest-limitation #2, single-effort
  overfit).** The calibration card now takes SEVERAL recorded runs (multiple
  file select, incremental adds, per-run remove). Design upgrade over v1:
  each run stores its geometry (dists/grades) + fixed moving time, and the
  factor is RE-DERIVED from the current pace/VAM/gate on every render — fits
  can never go stale when inputs change (the old staleness caveat is gone).
  Apply uses the MEDIAN of plausible fits (new `median()` in pacing.ts,
  tested; robust to one bad file/day), implausible runs stay visible but
  excluded, and the run list shows date/distance/moving time per fit with
  the spread printed next to the apply button. Verified live with all four
  real runs + the synthetic-timestamp route file: ×0.99/×1.01/×1.06/×1.08
  fitted, route excluded at ×0.43, median ×1.04 applied → Imperial 7:35:59,
  range 7:13–8:08. Note: the measured median (×1.04) equals the personal
  mean previously flagged as the open cold-start-default question.
  `calibrate-apply` event now carries the run count.

- **Owner-directed batch (2026-07-19):**
  1. *Steep showcase course:* `public/example-25-bosses.gpx` — the owner's own
     25 Bosses recording, timestamps + sensor extensions stripped (geometry
     only, nothing personal; cleanest possible rights). 15.16 km / ~808 m D+,
     42% of distance >12% grade — the power-hike showcase. Example switcher
     buttons offer whichever bundled course isn't on screen; badge + analytics
     carry the course key.
  2. *Uncalibrated default terrain factor ×1.00 → ×1.04* (owner decision).
     ×1.04 is the measured MEDIAN across the four calibrated real runs — the
     cold-start default is now data, not a blind 1.0. Moves the uncalibrated
     headline (example: 7:17:59 → ~7:36). og.png regenerated to match.
  3. *Layout for big screens:* container max-w-3xl → max-w-5xl (was a narrow
     stripe on a 27" 1440p), inline chart 160 → 288 px tall, plus a
     fullscreen chart overlay ("Expand"/"Agrandir": backdrop/Escape closes,
     full-height profile + legend) for studying a course.
  4. *Units switch clarified:* labeled "Units/Unités", bigger targets,
     aria-pressed.
  5. *i18n EN/FR:* all UI strings in `src/lib/i18n.ts` (typed off the English
     table so the languages can't drift; interpolations are functions).
     Default from navigator.language (fr→FR), persisted (`gp-lang`), EN|FR
     toggle in the header, `<html lang>` kept in sync, run-list dates
     localized. Share-card image deliberately stays English (single brand
     surface). `switch-lang` analytics event.
  - Light-theme toggle: NOT in this batch (dark-only today); queued as its
    own pass — touches every color class.

- **Light theme.** Dark stays the brand default; light is a Tailwind v4
  custom variant (`@custom-variant light` in index.css, driven by a `light`
  class on `<html>`). Components carry dark styles unprefixed + `light:`
  overrides; repeated clusters are shared constants (cardClass, inputClass,
  btnSecondaryClass, alertClass) so the themes can't drift per-instance.
  Sun/moon toggle next to EN|FR; preference saved (`gp-theme`), else follows
  `prefers-color-scheme`. Chart grid/tooltip colors via a `theme` prop (SVG
  attrs can't use CSS variants). Share card stays dark always (brand
  surface). `switch-theme` analytics event. Verified both themes live.
- **Repo renamed trail-app → grade-pace** (owner): git remote, package.json
  name, and the footer GitHub link updated to
  github.com/Alvaro5/grade-pace.

- **UI polish pass (owner feedback: glyph buttons + badge pill read as
  unfinished; wanted motion).**
  - `src/icons.tsx`: hand-rolled stroke SVG icons (sun/moon/upload/expand/
    close/chevron + the brand LogoMark) replacing ☀ ☾ ⤢ ✕ text glyphs that
    rendered as emoji or shifted baseline per platform.
  - Native file inputs ("Choose File / No file chosen" — unstylable AND
    English-only in the FR UI) → styled label-buttons with the upload icon
    ("Upload GPX / Importer un GPX", "Add recorded runs / Ajouter des
    sorties").
  - Example pill → quiet editorial label (small emerald caps + sentence).
  - Header: LogoMark tile beside the wordmark (same motif as share card).
  - Motion: dashboard fades up on course load (keyed per course), details
    content eases in, animated chevrons replace native markers, fullscreen
    chart fades in, transition-colors on every interactive element,
    focus-visible rings throughout; all gated by prefers-reduced-motion.
  - Shared btnPrimary/btnSecondary/focusRing constants unify every button.
  - Projected-finish card gets an emerald accent border (the hero number).
  Verified in both themes and both languages.

- **UI detail pass #2.**
  - *Chart uses its panel:* padded explicit Y domain (min−8%…max+8%) instead
    of the 0-anchored axis that flattened every hill on courses living at
    altitude; Area baseline follows the domain floor. Path animation OFF —
    it silently broke rendering with custom domains on ~7k points in
    Recharts, and it re-played on every keystroke anyway (page-level fade
    covers the entrance).
  - *Pace input has its unit inside the field* (min/km · min/mi suffix,
    larger text) — the app's one important input now reads as a unit-aware
    control.
  - *Sticky opaque table header* — headers survive "show all 70 splits".
  - *Locale thousands separators* for elevation numbers (1,193 / 1 193).
  - *Share bar icons* (image/link/check states) + active:scale press feel on
    primary/secondary buttons.
  - *theme-color meta follows the theme* so mobile browser chrome matches.

- **UI detail pass #3.**
  - *Effort sliders live on the desktop:* on lg+ the three knobs (VAM, gate,
    terrain) render as a 3-column grid inside the pace card — that card was
    mostly empty space, and these ARE the product's controls. Below lg they
    stay behind the "Advanced settings" toggle (now controlled state with a
    rotating chevron; native details replaced there).
  - *Chart tooltip shows the plan's pace* for the split under the cursor
    (`paceLabelAt` prop: App maps course-km → split pace in active units) —
    hovering now answers "what will I be doing here", making the chart the
    actual planning surface. Verified: "317 ft · +2% · 10:27/mi".

- **Aid stations ("ravitaillements") with projected arrival times.** Free-text
  positions in the active unit ("17, 33, 47", lenient parsing, capped at 30,
  clipped to course length). Rendered as: dashed R1/R2/… ReferenceLines on
  both chart views; chips under the chart showing each station's PROJECTED
  arrival (elapsed time interpolated inside the containing split — the value
  the roadbook can't give); green R-badges on the matching splits-table rows.
  Positions convert on the units toggle like the pace field, and travel in
  shared plan links (`rav` hash param, metric-canonical; smoke-tested).

- **Aid stations auto-detected from GPX waypoints.** Investigated first:
  the GPX spec has `<wpt>` for exactly this, but NONE of the project's 11
  files carry any (Strava/Komoot route exports never do; RideWithGPS/
  OpenRunner/LiveTrail files sometimes do) — so this is a bonus signal on
  top of manual entry, not a replacement. Engine: `parseGpxWaypoints`
  (never throws — waypoints are auxiliary) + `nearestTrackKm` projection
  with a 200 m off-course rejection; both unit-tested. App: `buildTrack`
  projects waypoints, drops start/finish markers (<200 m from either end),
  and a course load pre-fills the ravitaillements field (still editable);
  a course without waypoints clears stale entries, EXCEPT the first-visit
  auto-load so hash-shared stations survive. Verified end-to-end with a
  synthetic 4-waypoint file: the 2 real stations auto-filled with ETAs,
  the départ marker and a 9 km-away parking waypoint were rejected. Known
  limitation (documented in the engine): nearest-point projection can pick
  the wrong passage on out-and-back courses — hence always-editable text.
  `aid-autofill` analytics event.

- **Course map (Leaflet + OpenTopoMap).** New `src/CourseMap.tsx`, lazy like
  the chart (own 44 kB gzip chunk; main bundle untouched). Topo tiles suit
  the trail context; attribution per license (OSM contributors, SRTM,
  OpenTopoMap CC-BY-SA). The route renders as RLE-colored polylines using
  the SAME grade scale + hike-gate as the profile — rose on the map = "the
  plan walks here" everywhere. Start/finish endpoint dots (i18n tooltips),
  aid stations as amber markers whose tooltips carry the R-number + distance
  + PROJECTED arrival (reuses aidStops). Details: scroll-wheel zoom off (the
  map mid-page would trap page scroll); aid markers in their own layer so
  editing stations never re-fits the bounds; `relative z-0` wrapper because
  Leaflet's internal panes (z≈400) would otherwise paint over the
  fullscreen-chart overlay (z-50). Map mocked in the app smoke test
  (happy-dom has no layout). Tiles are the app's second external runtime
  dependency (after Umami) — OpenTopoMap is free/fair-use; swap to a keyed
  provider if traffic ever makes that impolite.

- **Map fullscreen + chart↔map hover sync.**
  - The map gets the same "Agrandir" treatment as the chart (overlay button
    on the card, portal-to-body fullscreen, Escape/backdrop closes; the
    Escape handler now closes whichever overlay is open).
  - Hovering the elevation profile mirrors the position as an emerald dot on
    the map — the profile answers "what will I be doing", the map now answers
    "where is that". Wiring: chart reports metric km via Recharts v3's
    `activeLabel` (NOT `activePayload` — v3 removed it from the chart-level
    mouse state; first attempt silently did nothing, caught by DOM
    inspection); App keeps a hoverKm state with a 50 m dead-band + functional
    bail-out so pointer-moves don't thrash renders; the map moves ONE
    reusable non-interactive circleMarker rather than recreating layers.

- **Hover-sync jank fix (owner feedback: chart tooltip stuttered).** Root
  cause: the hover position was React state with a 50 m dead-band — on a
  70 km course that's ~1 px of chart, so nearly every pointer-move
  re-rendered the dashboard, rebuilt the chart's 7k-point data and restarted
  the tooltip's slide animation. Fix: (1) the chart→map hover is now an
  IMPERATIVE bridge — CourseMap registers its marker-mover (one reusable
  circleMarker, setLatLng) and the chart calls it directly; React never
  renders on hover. (2) Tooltip position animation off — it snaps to the
  cursor. Verified via a temporary dev hook driving the bridge (km 10/50 →
  correct marker moves, null → removed); the browser-automation session
  stopped delivering hover events entirely mid-verification (even on the
  previously-verified commit), so final smoothness feel is confirmed on
  real hardware by the owner.

- **Strava-grade map suite (owner request, Strava's map as the reference).**
  - *Basemap switcher* — Terrain (OpenTopoMap, still the default) / Standard
    (OSM) / Satellite (Esri World Imagery) / Hybrid (Esri imagery + Esri
    Boundaries&Places labels), all keyless, config in `src/lib/basemaps.ts`.
    Choice persists (`gp-basemap`) and is LIFTED to the dashboard so the
    inline and fullscreen map instances stay in sync. Tile swap is its own
    effect — route/aid/hover vectors never rebuild. Zoom ceiling follows the
    active set (`setMaxZoom` — OpenTopo stops at 17, others 19; forgetting
    this shows blank tiles). Attribution follows each layer automatically.
  - *Scroll-wheel zoom only while hovering* the map (created with
    `scrollWheelZoom:false`, enabled on map `mouseover`, disabled on
    `mouseout`) — page scroll is safe, Strava behavior. Verified via the
    dev-only `window.__gpMap` handle: enabled() flips false→true→false
    around hover. (Synthetic wheel deltas couldn't move the zoom in the
    automation session — Chrome suppresses animation frames in occluded
    windows, so animated zooms stall; `setView(..., {animate:false})` worked
    instantly. Real scrolls on visible hardware are fine.)
  - *POI overlay* (drinking water / toilets / viewpoints from OpenStreetMap
    via Overpass, `src/lib/pois.ts` + tests). OPT-IN per session and not
    persisted — the app promises the GPX never leaves the device, so only a
    padded bounding box is ever sent, never track points; corridor filtering
    (≤200 m from the route, reusing haversine) runs client-side. Endpoint
    fallback chain (overpass-api.de → private.coffee → maps.mail.ru) with
    15 s per-endpoint timeouts — exercised live during verification: the
    main endpoint 504'd and a mirror delivered. Bbox area guard (2500 km²)
    refuses continent-sized queries with a friendly note. Fetch state lives
    in the dashboard so toggling fullscreen never refetches; new course
    aborts + resets. Fontainebleau bbox: 54 POIs → corridor-filtered pins.
  - *Scale bar* (`L.control.scale`, bottom-left) in the active display unit.
  - *Unmistakable start/finish*: divIcon inline-SVG markers — emerald ▶
    start, checkered-flag finish — white ring + shadow, readable on all four
    basemaps. On loop courses they stack at the same spot (finish on top).
  - *On-map controls are React* (siblings of the Leaflet div inside a new
    wrapper, `pointer-events-none` column with `pointer-events-auto` chips) —
    no `L.Control`/DomEvent plumbing, i18n + light/dark for free. The inline
    expand button moved into the map's control stack (`topRightSlot` prop).
    Wrapper keeps the `relative z-0` stacking fix; the Leaflet div gets
    explicit `z-0` so its internal panes flatten below the `z-10` chips.

- **Nutrition plan (owner request: carbs, calories, electrolytes, water "at
  each moment of the race").** Pure lib `src/lib/nutrition.ts` (+8 tests):
  hourly targets × each leg's PROJECTED duration — the legs partition the
  race at the aid-station ETAs (start → R1 → … → finish; no stations = one
  leg), so amounts follow time, not distance: a slow climb-heavy leg gets
  proportionally more. Defaults sit mid-band of published guidance — carbs
  70 g/h (60–90 ultra band), fluid 500 ml/h (400–750, heat-scaled), sodium
  450 mg/h — sliders 30–120 / 250–1000 / 300–1200 (sodium range wide on
  purpose: sweat sodium varies 3–4×; hint clarifies elemental sodium vs
  salt, 1 g salt ≈ 390 mg Na). UI: collapsed `<details>` card above the
  splits table — three sliders + per-leg table (duration/carbs/fluids/
  sodium/kcal), totals row, ≈gels equivalent (25 g each), one-line
  disclaimer. Fluid displays ml/L (fl oz in imperial), FR/EN. Rates travel
  in the share link (`nc`/`nfl`/`ns`, validated to slider bounds, written
  only when ≠ default). Kcal = carbs × 4 — deliberately carbs-only (fat/
  protein intake isn't what limits ultra performance mid-race).
  Verified live: 7:35:30 projection → 531 g / 3.8 L / 3420 mg / 2126 kcal
  totals, leg partition matches ETAs (checked against hand math).

## Next
- **Optional elevation polish** (only if it earns its keep): expose
  `D_PLUS_THRESHOLD_M` / `SMOOTH_WINDOW_M` as UI controls; or try a Savitzky-Golay
  smoother (preserves climb peaks better than a box MA — the research flagged it,
  but it's harder to explain and the box MA is fine for now).
- Calibration: decide a believable terrain factor for Fontainebleau. New data
  point: the four real-run fits now span ×0.99 (flat road) to ×1.08 (campagne
  trails) with stops filtered — Fontainebleau sand/rocks plausibly ~1.05–1.10.
  Gut-check against the 68.75 km finish (7:17 @1.00 vs ~7:52 @1.08).
- Calibration next steps: fit against several efforts (weight recent ones) not
  a lone run; synthetic-timestamp detector (route exports at constant speed).
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
