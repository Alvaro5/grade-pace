// Named-climb detection: turn the smoothed profile into the list of climbs a
// trail runner would actually name ("the wall at 40k"), not 60 micro-bumps
// and not 3 merged blobs. Pure module, metric, no React.
//
// State machine over the 10 m samples: the running local minimum is the
// candidate start; once climbing, track the peak; the climb ends when the
// elevation falls more than dipTol below the peak. dipTol is RELATIVE,
// clamp(dipFraction × gain-so-far, minDipM, maxDipCapM): a 30 m dip splits
// two Fontainebleau walls but merges inside an 800 m alpine climb, while the
// cap keeps a genuine descent a boundary. gainM is the NET rise (what "a
// 400 m climb" means to a runner); the end is the FIRST sample attaining the
// peak, so summit plateaus aren't counted as climbing.
//
// Feed this the resampled + smoothed profile only. Raw GPS elevation would
// re-introduce the noise the pipeline exists to remove.

export type Climb = {
  fromKm: number;
  toKm: number;
  lengthM: number;
  gainM: number; // net rise start → peak
  avgGrade: number; // gainM / lengthM
};

export type ClimbOptions = {
  minGainM?: number;
  minDipM?: number;
  dipFraction?: number;
  maxDipCapM?: number;
  minAvgGrade?: number;
};

export function detectClimbs(
  profile: { km: number; ele: number }[],
  opts: ClimbOptions = {},
): Climb[] {
  const {
    minGainM = 30,
    minDipM = 10,
    dipFraction = 0.1,
    maxDipCapM = 50,
    minAvgGrade = 0.04,
  } = opts;
  const n = profile.length;
  if (n < 2) return [];

  const climbs: Climb[] = [];
  let anchor = 0; // candidate climb start (running local min)
  let peak = 0; // FIRST sample attaining the current maximum

  const finalize = () => {
    const gain = profile[peak].ele - profile[anchor].ele;
    const lengthM = (profile[peak].km - profile[anchor].km) * 1000;
    if (gain >= minGainM && lengthM > 0 && gain / lengthM >= minAvgGrade)
      climbs.push({
        fromKm: profile[anchor].km,
        toKm: profile[peak].km,
        lengthM,
        gainM: gain,
        avgGrade: gain / lengthM,
      });
  };

  for (let i = 1; i < n; i++) {
    const ele = profile[i].ele;
    if (ele > profile[peak].ele) {
      peak = i; // strictly higher → new first-max
    } else {
      const gainSoFar = profile[peak].ele - profile[anchor].ele;
      const dipTol = Math.min(
        maxDipCapM,
        Math.max(minDipM, dipFraction * gainSoFar),
      );
      if (profile[peak].ele - ele > dipTol) {
        finalize();
        // Resume scanning from the peak; re-anchoring below keeps climbs
        // from ever overlapping.
        anchor = i;
        peak = i;
      }
    }
    // While not meaningfully climbing, follow new lows down.
    if (ele < profile[anchor].ele) {
      anchor = i;
      peak = i;
    }
  }
  finalize(); // a course ending mid-climb still yields the climb
  return climbs;
}
