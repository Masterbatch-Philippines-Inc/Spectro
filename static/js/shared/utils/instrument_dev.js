
/*
 *  static/js/shared/utils/instrument_dev.js
 *
 *  Single choke point for every call samples_reader.js makes to the
 *  local hardware agent (localhost:5151). samples_reader.js should
 *  NEVER call fetch('http://localhost:5151/...') directly anymore --
 *  it calls the functions exported here instead.
 *
 *  Why this exists: samples_reader.html is unusable without a real
 *  3NH YS3060 physically connected over BLE + the agent running. That
 *  makes it impossible to iterate on the wizard's UI/logic on a
 *  machine without the dongle. Flipping DEV to true below returns
 *  fake-but-plausible agent responses instead, so every downstream
 *  consumer (color_offset.js, color_simulation.js, the stepper, the
 *  samples table, etc.) keeps working exactly as if hardware were
 *  attached.
 *
 *  ---- USAGE ----
 *  Set DEV = true while developing away from the lab PC / dongle.
 *  Set DEV = false before shipping/testing against the real agent.
 *  Nothing else in samples_reader.js needs to change either way --
 *  every function here resolves to the same shape the real agent's
 *  endpoint returns, so the calling code is identical in both modes.
 */

// ============================================================
// TOGGLE THIS -- the only line that should ever need touching.
// ============================================================
const DEV = true;

const AGENT_BASE = 'http://localhost:5151';

// Small artificial delay so DEV mode "feels" like a real BLE round-trip
// instead of resolving instantly (helps catch UI race conditions that
// would otherwise only show up against real, slower hardware).
function devDelay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms || 350); });
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// Fake device identity used by connectInstrument() in DEV mode --
// mirrors the shape real 3NH devices report (see get_spectrometer_info
// fallback in samples_reader.js's resolveDeviceInfo()).
const DEV_DEVICE = {
  model: 'DEV-YS3060',
  serial_number: 'DEV-000000',
};

// DEV-mode-only instrument state, kept here so calibrate/connect/status
// mock calls stay internally consistent within a session.
const devState = {
  connected: false,
  black_calibrated: false,
  white_calibrated: false,
};

/* ---------------------------------------------------------------------
    Connect / Disconnect / Status
--------------------------------------------------------------------- */

export function connectInstrument() {
  if (DEV) {
    return devDelay(500).then(function () {
      devState.connected = true;
      return {
        ok: true,
        model: DEV_DEVICE.model,
        serial_number: DEV_DEVICE.serial_number,
        black_calibrated: devState.black_calibrated,
        white_calibrated: devState.white_calibrated,
      };
    });
  }

  return fetch(AGENT_BASE + '/connect', { method: 'POST' })
    .then(function (res) { return res.json(); });
}

export function disconnectInstrument() {
  if (DEV) {
    return devDelay(250).then(function () {
      devState.connected = false;
      devState.black_calibrated = false;
      devState.white_calibrated = false;
      return { ok: true };
    });
  }

  return fetch(AGENT_BASE + '/disconnect', { method: 'POST' })
    .then(function (res) { return res.json(); });
}

// Mirrors GET /status -- used on page load to confirm a sessionStorage
// -restored connection is still actually alive before trusting it.
export function getInstrumentStatus() {
  if (DEV) {
    return devDelay(150).then(function () {
      return { ok: true, connected: devState.connected };
    });
  }

  return fetch(AGENT_BASE + '/status')
    .then(function (res) { return res.json(); });
}

/* ---------------------------------------------------------------------
    Calibration
--------------------------------------------------------------------- */

export function calibrateInstrument(type) {
  if (DEV) {
    return devDelay(600).then(function () {
      if (type === 'black') devState.black_calibrated = true;
      if (type === 'white') devState.white_calibrated = true;
      return { ok: true };
    });
  }

  return fetch(AGENT_BASE + '/calibrate/' + type, { method: 'POST' })
    .then(function (res) { return res.json(); });
}

/* ---------------------------------------------------------------------
    Measurement -- standard (Step 2 "Read Reference")
--------------------------------------------------------------------- */

export function measureStandard() {
  if (DEV) {
    return devDelay(700).then(function () {
      // plausible Lab reading in the same rough envelope as real SQCX
      // export data referenced in color_offset.js's doc comments
      const L = randomBetween(60, 92);
      const a = randomBetween(-30, 10);
      const b = randomBetween(-20, 20);
      const C = Math.sqrt(a * a + b * b);
      const h = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;

      return { ok: true, sci: { L: L, a: a, b: b, C: C, h: h } };
    });
  }

  return fetch(AGENT_BASE + '/measure/standard', { method: 'POST' })
    .then(function (res) { return res.json(); });
}

/* ---------------------------------------------------------------------
    Measurement -- sample (Step 3 "Read Sample" / Light / Dark)
--------------------------------------------------------------------- */

// Rough CIEDE2000-ish approximation for DEV mode only -- accurate deltas
// don't matter here, only that de00 is internally consistent with
// dL/da/db so the pass/fail + color offset logic downstream behaves
// sensibly while testing UI without hardware.
function approximateDe00(dL, da, db) {
  return Math.sqrt(dL * dL + da * da + db * db);
}

export function measureSample(standard) {
  if (DEV) {
    return devDelay(700).then(function () {
      const stdL = (standard && standard.L !== undefined && standard.L !== null) ? standard.L : 75;
      const stdA = (standard && standard.a !== undefined && standard.a !== null) ? standard.a : -10;
      const stdB = (standard && standard.b !== undefined && standard.b !== null) ? standard.b : 5;

      // small randomized drift off the standard -- occasionally exceeds
      // typical 0.5-1.0 tolerance so both Pass and Fail rows show up
      // while testing, instead of everything always passing
      const dL = randomBetween(-1.2, 1.2);
      const da = randomBetween(-1.2, 1.2);
      const db = randomBetween(-1.2, 1.2);

      const L = stdL + dL;
      const a = stdA + da;
      const b = stdB + db;
      const C = Math.sqrt(a * a + b * b);
      const h = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;

      const stdC = Math.sqrt(stdA * stdA + stdB * stdB);
      const stdH = (Math.atan2(stdB, stdA) * 180 / Math.PI + 360) % 360;
      const dC = C - stdC;
      const dH = h - stdH;
      const de00 = approximateDe00(dL, da, db);

      return {
        ok: true,
        sci: { L: L, a: a, b: b, C: C, h: h },
        deltas: { dL: dL, da: da, db: db, dC: dC, dH: dH, de00: de00 },
      };
    });
  }

  return fetch(AGENT_BASE + '/measure/sample', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ standard: standard }),
  })
    .then(function (res) { return res.json(); });
}