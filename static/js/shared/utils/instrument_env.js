/*
 *  static/js/shared/utils/env.js
 *
 *  Reads server-provided env/config flags off window.SPECTRO_ENV,
 *  injected by the Django template at page load (see
 *  templates/pages/samples_reader.django). No polling -- Django
 *  re-renders this on every page load, so a changed .env value takes
 *  effect on the next request automatically.
 */

export function getDevInstrumentSource() {
  return !!(window.SPECTRO_ENV && window.SPECTRO_ENV.devInstrumentSource);
}