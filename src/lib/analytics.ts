// Thin wrapper around the Umami tracker injected by the <script> tag in
// index.html. `window.umami` is undefined whenever tracking shouldn't happen —
// dev (domain mismatch → the script disables itself), an ad-blocker, or the
// script failing to load — so this optional-chains and silently no-ops.
// Callers never guard and analytics can never break the app.

type Umami = {
  track: (event: string, data?: Record<string, string | number>) => void;
};

export function track(
  event: string,
  data?: Record<string, string | number>,
): void {
  (window as Window & { umami?: Umami }).umami?.track(event, data);
}
