/*
 *  static/js/shared/ui/color_offset.js
 *
 *  Pure function that derives a human-readable "Color Offset" label from
 *  CIELAB delta values (sample minus standard), matching the convention
 *  used by 3NH's own SQCX software (verified against real SQCX export
 *  data -- see inline examples below).
 *
 *  IMPORTANT -- this is NOT "pick the single dominant axis." SQCX reports
 *  EVERY axis that exceeds tolerance, combined into one comma-separated
 *  string (e.g. "Light+, Green-, Blue-"). Each of the three axes (L, a, b)
 *  is evaluated independently.
 *
 *  IMPORTANT -- the hue WORD (Red vs Green, Yellow vs Blue) is NOT fixed
 *  by the sign of the delta. It's determined by which hue family the
 *  STANDARD itself belongs to:
 *
 *    - If the standard's a* < 0 (product is on the green side), the a*
 *      axis is reported as "Green" -- Δa* negative (going further green)
 *      = "Green+", Δa* positive (drifting away from green) = "Green-".
 *    - If the standard's a* >= 0 (product is on the red side), the a*
 *      axis is reported as "Red" -- Δa* positive = "Red+", negative = "Red-".
 *    - Same logic for b*: standard's b* < 0 -> "Blue" family
 *      (Δb* negative = "Blue+", positive = "Blue-"); standard's b* >= 0
 *      -> "Yellow" family (Δb* positive = "Yellow+", negative = "Yellow-").
 *
 *  L* has no family switch -- it's always Light/Dark:
 *    ΔL* positive = "Light+", ΔL* negative = "Dark+"
 *
 *  This is the single source of truth for color offset -- both the dev
 *  mock data path and the real measurement path should call this same
 *  function so results are always consistent. It has no side effects and
 *  touches no DOM.
 */

/**
 * Determine the Color Offset label(s) for a single sample reading.
 *
 * @param {number} dL - ΔL* (sample minus standard).
 * @param {number} da - Δa* (sample minus standard).
 * @param {number} db - Δb* (sample minus standard).
 * @param {number} standardA - the STANDARD's own raw a* value. Determines
 *   whether the a* axis is reported in the Red or Green family.
 * @param {number} standardB - the STANDARD's own raw b* value. Determines
 *   whether the b* axis is reported in the Yellow or Blue family.
 * @param {number} [tolerance=0.50] - Deadband, evaluated independently per
 *   axis. An axis whose |delta| is <= tolerance contributes no label. If
 *   no axis exceeds tolerance, the overall result is "None".
 * @returns {string} A comma-separated combination of any of:
 *   "Light+", "Dark+", "Red+", "Red-", "Green+", "Green-",
 *   "Yellow+", "Yellow-", "Blue+", "Blue-" -- or "None" if nothing
 *   exceeds tolerance on any axis.
 *
 * ---- Usage examples (verified against real SQCX export rows) ----
 *
 *   // Standard for this product is deep green/blue: a*=-27.58, b*=-15.66
 *   getColorOffset(0.71, 0.97, 1.29, -27.58, -15.66);
 *   // ΔL*=0.71 exceeds tolerance -> "Light+"
 *   // Δa*=0.97 exceeds tolerance, standard a*<0 (Green family),
 *   //   Δa* positive -> drifting away from green -> "Green-"
 *   // Δb*=1.29 exceeds tolerance, standard b*<0 (Blue family),
 *   //   Δb* positive -> drifting away from blue -> "Blue-"
 *   // => "Light+, Green-, Blue-"
 *
 *   getColorOffset(-0.56, 0.53, 0.36, -27.58, -15.66);
 *   // ΔL*=-0.56 exceeds tolerance -> "Dark+"
 *   // Δa*=0.53 exceeds tolerance -> "Green-"
 *   // Δb*=0.36 does NOT exceed tolerance (0.50) -> excluded
 *   // => "Dark+, Green-"
 *
 *   getColorOffset(-0.34, 0.06, -0.44, -27.58, -15.66);
 *   // none of |dL|, |da|, |db| exceed tolerance -> "None"
 *
 *   // Standard on the RED/YELLOW side instead: a*=15, b*=8
 *   getColorOffset(0.10, -0.90, 0.70, 15, 8);
 *   // Δa*=-0.90, standard a*>=0 (Red family), Δa* negative -> "Red-"
 *   // Δb*=0.70, standard b*>=0 (Yellow family), Δb* positive -> "Yellow+"
 *   // => "Red-, Yellow+"
 */
export function getColorOffset(dL, da, db, standardA, standardB, tolerance) {
  if (tolerance === undefined || tolerance === null) tolerance = 0.50;

  const labels = [];

  // ---- L* axis: no family switch, always Light/Dark ----
  if (Math.abs(dL) > tolerance) {
    labels.push(dL >= 0 ? 'Light+' : 'Dark+');
  }

  // ---- a* axis: family depends on the STANDARD's own a* sign ----
  if (Math.abs(da) > tolerance) {
    const isGreenFamily = standardA < 0;
    if (isGreenFamily) {
      // more negative a* = more green ("+"), positive delta = losing green ("-")
      labels.push(da < 0 ? 'Green+' : 'Green-');
    } else {
      // more positive a* = more red ("+"), negative delta = losing red ("-")
      labels.push(da > 0 ? 'Red+' : 'Red-');
    }
  }

  // ---- b* axis: family depends on the STANDARD's own b* sign ----
  if (Math.abs(db) > tolerance) {
    const isBlueFamily = standardB < 0;
    if (isBlueFamily) {
      // more negative b* = more blue ("+"), positive delta = losing blue ("-")
      labels.push(db < 0 ? 'Blue+' : 'Blue-');
    } else {
      // more positive b* = more yellow ("+"), negative delta = losing yellow ("-")
      labels.push(db > 0 ? 'Yellow+' : 'Yellow-');
    }
  }

  return labels.length ? labels.join(', ') : 'None';
}