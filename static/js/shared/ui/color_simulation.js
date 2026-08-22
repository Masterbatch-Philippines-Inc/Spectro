/*
 *  static/js/shared/ui/color_simulation.js
 *
 *  Pure function that converts a sample's own absolute CIELAB reading
 *  (L*, a*, b*) into the closest displayable sRGB hex color -- i.e. "what
 *  does this sample actually look like," as opposed to color_offset.js
 *  which describes HOW a sample differs from its standard.
 *
 *  Unlike color_offset.js, this does NOT need the standard or any delta
 *  values -- only the sample's own raw L* / a* /b*, since absolute color
 *  appearance is a property of the sample alone.
 *
 *  Conversion pipeline (standard, matches what colorimetry software like
 *  SQCX does under the hood): CIELAB -> XYZ (D65 reference white, same
 *  illuminant the spectrometer/agent already measures under -- see
 *  ILLUMINANT_D65 in spectrometer.py) -> linear sRGB -> gamma-corrected
 *  sRGB -> hex string.
 *
 *  Output format matches this project's existing convention: an 8-digit
 *  hex string in #AARRGGBB order (alpha first) -- e.g. "#FFE0F3FC" --
 *  NOT the CSS Color 4 #RRGGBBAA order. See samples_record.py's export
 *  color-fill fix for why that distinction matters when this value is
 *  later read by openpyxl vs rendered by the browser.
 */

/**
 * Convert a sample's raw CIELAB reading into a displayable hex color.
 *
 * @param {number} L - sample's raw L* (lightness, 0-100).
 * @param {number} a - sample's raw a* (green-red axis).
 * @param {number} b - sample's raw b* (blue-yellow axis).
 * @returns {string} 8-digit hex color string, "#AARRGGBB" format,
 *   fully opaque (alpha always "FF").
 *
 * ---- Usage example ----
 *
 *   getColorSimulation(69.72, -27.64, -17.18);
 *   // deep, muted teal-green -> something like "#FF5CA6A0"
 *   // (exact bytes depend on the sRGB gamut clamp for this Lab point)
 */
function getColorSimulation(L, a, b) {
  // ---- 1. CIELAB -> XYZ (D65 reference white) ----
  const refX = 95.047, refY = 100.0, refZ = 108.883;

  let fy = (L + 16) / 116;
  let fx = a / 500 + fy;
  let fz = fy - b / 200;

  const finv = function (t) {
    const t3 = t * t * t;
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
  };

  let X = refX * finv(fx);
  let Y = refY * finv(fy);
  let Z = refZ * finv(fz);

  // ---- 2. XYZ -> linear sRGB ----
  X /= 100; Y /= 100; Z /= 100;

  let r = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
  let g = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
  let bl = X * 0.0557 + Y * -0.2040 + Z * 1.0570;

  // ---- 3. linear sRGB -> gamma-corrected sRGB ----
  const gammaCorrect = function (c) {
    return c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c;
  };
  r = gammaCorrect(r);
  g = gammaCorrect(g);
  bl = gammaCorrect(bl);

  // ---- 4. clamp to displayable 0-255 range and format as hex ----
  const toHexByte = function (c) {
    const clamped = Math.max(0, Math.min(255, Math.round(c * 255)));
    return clamped.toString(16).toUpperCase().padStart(2, '0');
  };

  return '#FF' + toHexByte(r) + toHexByte(g) + toHexByte(bl);
}