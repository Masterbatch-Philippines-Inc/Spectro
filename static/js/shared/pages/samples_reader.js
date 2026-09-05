
import { showToast } from "../global/toast.js";
import { getColorOffset } from "../ui/color_offset.js";
import { getColorSimulation } from "../ui/color_simulation.js";
import { renderScatter } from "../ui/scatter_graph.js";
import { getCsrfToken } from "../utils/csrf.js";
import {
  connectInstrument,
  disconnectInstrument,
  calibrateInstrument,
  measureStandard,
  measureSample,
  getInstrumentStatus,
} from "../utils/instrument_dev.js";

export function initSamplesReaderPage(urls, productCodeOptions) {
  let instrumentConnected = false;
  let calibrationData = {};   // cached so user isn't asked to re-calibrate (Task 11c2)
  let currentStep = 1;
  let completedSteps = new Set();

  // Step 1 connect flow result — held in memory only, submitted later by
  // the final atomic save button (built in a later task), never written
  // to the DB from here.
  const wizardDevice = { model: null, serial: null };

  // ===========================================================
  // Instrument session persistence — Step 1 (connect + calibrate) is
  // treated as independent from the rest of the wizard. Once connected
  // and calibrated, that state survives navigating away from this page
  // (e.g. to Samples Record and back) via sessionStorage, so the user
  // isn't forced to re-plug/re-calibrate every time they return.
  // Session only clears on (a) a detected disconnect (agent /status
  // reports not connected) or (b) the user manually clicking Disconnect.
  // ===========================================================
  const INSTRUMENT_SESSION_KEY = 'spectroInstrumentSession';

  // localStorage (not sessionStorage) deliberately -- the instrument
  // connection is a property of this PC's agent/hardware, not of any
  // one browser tab or login session. Any tab open on this machine
  // should see the same real connection state, confirmed live against
  // /status before ever being trusted (see restoreInstrumentSession()).
  function saveInstrumentSession() {
    try {
      localStorage.setItem(INSTRUMENT_SESSION_KEY, JSON.stringify({
        connected: instrumentConnected,
        calibration: calibrationData,
        device: wizardDevice,
      }));
    } catch (e) { /* localStorage unavailable -- fail silently, session simply won't persist */ }
  }

  function loadInstrumentSession() {
    try {
      const raw = localStorage.getItem(INSTRUMENT_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearInstrumentSession() {
    try { localStorage.removeItem(INSTRUMENT_SESSION_KEY); } catch (e) {}
  }

  // Task 8 (3) — holds the captured standard's raw values + name/DE in
  // session/memory until Step 3's "Finish Reading" actually persists it.
  const wizardStandard = {
    productCode: null,
    standardName: null,
    stdDe: null,
    standardsId: null, // Task 8 — the SpectroStandard PK, needed to save samples against it
    raw: null, // { raw_l, raw_a, raw_b, raw_c, raw_h }
    standardA: null, // standard's raw a* -- feeds getColorOffset() (color_offset.js) hue-family logic
    standardB: null, // standard's raw b* -- feeds getColorOffset() (color_offset.js) hue-family logic
    savedToDb: false,
    samplesSavedToDb: false, // Task 10 — flips true once Finish Reading actually persists sample rows
  };

  // Task 10 (expanded) — warn before leaving the page (closing tab/browser,
  // typing a new URL, etc.) if EITHER the standard's raw values are
  // captured but not yet persisted, OR any sample readings exist in the
  // Step 3 table but the session hasn't been finished/saved yet. Native
  // browsers show their own generic message text; the string here is
  // ignored by most modern browsers but kept for older engines that still
  // respect it.
  window.addEventListener('beforeunload', function (e) {
    const standardUnsaved = wizardStandard.raw && !wizardStandard.savedToDb;
    const historyTableBody = document.getElementById('historyTableBody');
    const sampleRowCount = historyTableBody ? historyTableBody.querySelectorAll('tr[data-row-id]').length : 0;
    const samplesUnsaved = sampleRowCount > 0 && !wizardStandard.samplesSavedToDb;

    if (standardUnsaved || samplesUnsaved) {
      e.preventDefault();
      e.returnValue = 'You have unsaved readings — leaving now will lose this data.';
      return e.returnValue;
    }
  });

  function scrollToNextCard(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---- Stepper (Task 10) — follows ts-step/ts-circle/ts-line pattern ---- */
  const checkSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const tsSteps = { 1: document.getElementById('tsStep1'), 2: document.getElementById('tsStep2'), 3: document.getElementById('tsStep3') };
  const tsCircles = { 1: document.getElementById('tsCircle1'), 2: document.getElementById('tsCircle2'), 3: document.getElementById('tsCircle3') };
  const tsLines = { 1: document.getElementById('tsLine1'), 2: document.getElementById('tsLine2') };

  function renderStepper() {
    [1, 2, 3].forEach(function (n) {
      const isDone = completedSteps.has(n);
      const isActive = n === currentStep;
      tsSteps[n].classList.toggle('active', isActive);
      tsSteps[n].classList.toggle('done', isDone && !isActive);
      tsCircles[n].innerHTML = (isDone && !isActive) ? checkSvg : n;
    });
    [1, 2].forEach(function (n) {
      tsLines[n].classList.toggle('done', completedSteps.has(n));
    });
  }

  function scrollToStep(n) {
    const panel = document.getElementById('stepPanel' + n);
    if (!panel) return;
    // briefly suspend scroll-spy so the programmatic scroll from a click
    // doesn't fight with the observer mid-animation
    scrollSyncEnabled = false;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () { scrollSyncEnabled = true; }, 700);
  }

  // (10a) click text/circle to jump — navigating no longer clears
  // completed/checkmark state; a step stays marked done once finished
  // regardless of which step the user is currently viewing.
  function goToStep(n) {
    currentStep = n;
    renderStepper();
    scrollToStep(n);
  }

  [1, 2, 3].forEach(function (n) {
    tsSteps[n].addEventListener('click', function () { goToStep(n); });
  });

  // Scroll-spy: highlight whichever step's panel is currently in view,
  // same idea as a scroll-linked nav — clicking still jumps via goToStep,
  // but scrolling manually keeps the active label in sync on its own.
  let scrollSyncEnabled = true;
  const stepObserver = new IntersectionObserver(function (entries) {
    if (!scrollSyncEnabled) return;
    let bestEntry = null;
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
        bestEntry = entry;
      }
    });
    if (bestEntry) {
      const n = parseInt(bestEntry.target.id.replace('stepPanel', ''), 10);
      if (n !== currentStep) {
        currentStep = n;
        renderStepper();
      }
    }
  }, { root: document.getElementById('contentArea'), threshold: [0.25, 0.5, 0.75] });

  [1, 2, 3].forEach(function (n) {
    const panel = document.getElementById('stepPanel' + n);
    if (panel) stepObserver.observe(panel);
  });

  const finishReadingBtn = document.getElementById('finishReadingBtn');
  if (finishReadingBtn) {
    finishReadingBtn.addEventListener('click', function () {
      // (10d) all steps show checkmark once reading is saved/finished
      completedSteps.add(1); completedSteps.add(2); completedSteps.add(3);
      currentStep = 3;
      renderStepper();
    });
  }

  /* ---- Step 1: Connect & Calibrate ---- */
  const connectBtn = document.getElementById('connectBtn');
  const connectLabel = document.getElementById('connectLabel');
  const connBadge = document.getElementById('connBadge');
  const connSubtitle = document.getElementById('connSubtitle');
  const deviceInfo = document.getElementById('deviceInfo');
  const devModel = document.getElementById('devModel');
  const devSerial = document.getElementById('devSerial');
  const blackBtn = document.getElementById('blackBtn');
  const whiteBtn = document.getElementById('whiteBtn');
  const blackCell = document.getElementById('blackCell');
  const whiteCell = document.getElementById('whiteCell');

  function setBadge(state) {
    if (!connBadge) return;
    connBadge.classList.remove('success', 'warn');
    connBadge.classList.remove('border-[hsl(var(--danger-border))]', 'bg-[hsl(var(--danger-bg))]', 'text-danger');
    if (state === 'connecting') {
      connBadge.classList.add('warn');
      connBadge.innerHTML = '<span class="bdot w-1.5 h-1.5 rounded-full" style="margin-bottom: 2px !important;"></span>Connecting…';
    } else if (state === 'disconnecting') {
      connBadge.classList.add('border-[hsl(var(--danger-border))]', 'bg-[hsl(var(--danger-bg))]', 'text-danger');
      connBadge.innerHTML = '<span class="bdot w-1.5 h-1.5 rounded-full bg-[hsl(var(--danger))]" style="margin-bottom: 2px !important;"></span>Disconnecting…';
    } else if (state === 'online') {
      connBadge.classList.add('success');
      connBadge.innerHTML = '<span class="bdot w-1.5 h-1.5 rounded-full" style="margin-bottom: 2px !important;"></span>Online';
    } else {
      connBadge.classList.remove('text-danger');
      connBadge.innerHTML = '<span class="bdot w-1.5 h-1.5 rounded-full bg-[hsl(var(--muted-foreground))]" style="margin-bottom: 2px !important;"></span>Offline';
    }
  }

  function setCalibrateButtonsEnabled(enabled) {
    [blackBtn, whiteBtn].forEach(function (b) { if (b) b.disabled = !enabled; });
  }

  // (b) check DB for an existing Spectrometer row first; if none, fall
  // back to whatever the agent itself reported on /connect.
  function resolveDeviceInfo(agentInfo) {
    return fetch(urls.spectrometerInfo, { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.found) {
          wizardDevice.model = data.device_model;
          wizardDevice.serial = data.device_sn;
        } else {
          wizardDevice.model = agentInfo.model;
          wizardDevice.serial = agentInfo.serial_number;
        }
      })
      .then(persistSpectrometerInfo);
  }

  // (b) get_or_create validation round-trip -- (10.1) status "OK" means
  // this device_sn/device_model pair didn't exist yet and was just
  // created, so toast about it. (10.2) status "EXISTS" means it was
  // already on record -- proceed silently, no extra toast, since
  // resolveDeviceInfo() already sourced the same values from the DB.
  function persistSpectrometerInfo() {
    if (!wizardDevice.serial || !wizardDevice.model) return;

    return fetch(urls.saveSpectrometerInfo, {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      body: new URLSearchParams({
        device_sn: wizardDevice.serial,
        device_model: wizardDevice.model,
        csrfmiddlewaretoken: getCsrfToken(),
      }),
    })
      .then(function (res) { return res.json(); })
      .then(function (result) {
        if (result.status === 'OK') {
          showToast('toastStack', result.message, result.tone || 'success');
        }
        // status === 'EXISTS' -- proceed to next step, no toast here
      })
      .catch(function () {
        // non-fatal -- connection flow shouldn't break if this
        // persistence step fails; device info still works for display
      });
  }

  function doConnect() {
    connectBtn.classList.add('loading');
    connectBtn.disabled = true;
    connectLabel.textContent = 'Scanning for spectrometer…';
    setBadge('connecting');
    if (connSubtitle) connSubtitle.textContent = 'Searching for BLE spectrometer…';

    let lastAgentData = null;
    connectInstrument()
      .then(function (agentData) {
        if (!agentData.ok) {
          throw new Error(agentData.error || 'Connection failed');
        }
        lastAgentData = agentData;
        return resolveDeviceInfo(agentData);
      })
      .then(function () {
        instrumentConnected = true;
        connectBtn.classList.remove('loading');
        connectBtn.disabled = false;
        connectBtn.classList.remove('bg-[hsl(var(--primary))]', 'text-[hsl(var(--primary-foreground))]', 'border-[hsl(var(--primary))]');
        connectBtn.classList.add('text-[hsl(var(--danger))]', 'border-[hsl(var(--danger-border))]', 'bg-[hsl(var(--danger-bg))]');
        connectLabel.textContent = 'Disconnect';
        setBadge('online');
        if (connSubtitle) connSubtitle.textContent = 'Linked over Bluetooth LE';
        if (devModel) devModel.textContent = wizardDevice.model || '—';
        if (devSerial) devSerial.textContent = wizardDevice.serial || '—';
        if (deviceInfo) deviceInfo.style.display = 'block';
        setCalibrateButtonsEnabled(true);
        restoreCalibrationState(lastAgentData);
        saveInstrumentSession();
      })
      .catch(function (err) {
        connectBtn.classList.remove('loading');
        connectBtn.disabled = false;
        connectLabel.textContent = 'Connect to Instument';
        setBadge('offline');
        if (connSubtitle) connSubtitle.textContent = 'Not linked to a spectrometer yet';
        showToast('toastStack', 'Instrument not found.', 'error');
        console.error(err);
      });
  }

  // Reads black_calibrated/white_calibrated straight off the /connect
  // response (sourced from the instrument's own NH_DeviceInfo flags) and,
  // if the hardware already reports itself calibrated, marks the matching
  // button/cell as done instead of forcing the user to re-press Calibrate.
  function restoreCalibrationState(agentData) {
    if (!agentData) return false;
    let restoredAny = false;

    ['black', 'white'].forEach(function (type) {
      if (!agentData[type + '_calibrated']) return;
      calibrationData[type] = true;
      const cell = document.getElementById(type + 'Cell');
      if (cell) cell.classList.add('done');
      const btn = type === 'black' ? blackBtn : whiteBtn;
      const label = btn ? btn.querySelector('.btn-label') : null;
      if (label) label.textContent = 'Recalibrate';
      restoredAny = true;
    });

    if (calibrationData.black && calibrationData.white) {
      unlockStep2();
    }
    if (restoredAny) {
      showToast('toastStack', 'Instrument connected and already calibrated.', 'success');
    } else {
      showToast('toastStack', 'Please recalibrate before continuing', 'info');
    }
    return restoredAny;
  }

  function doDisconnect() {
    connectBtn.classList.add('loading');
    connectBtn.disabled = true;
    connectLabel.textContent = 'Disconnecting from spectrometer…';
    setBadge('disconnecting');
    if (connSubtitle) connSubtitle.textContent = 'Disconnecting from spectrometer…';

    function finishDisconnect() {
      instrumentConnected = false;
      calibrationData = {};
      clearInstrumentSession();
      relockStep2();
      wizardDevice.model = null;
      wizardDevice.serial = null;
      connectBtn.classList.remove('loading');
      connectBtn.disabled = false;
      connectBtn.classList.remove('text-[hsl(var(--danger))]', 'border-[hsl(var(--danger-border))]', 'bg-[hsl(var(--danger-bg))]');
      connectBtn.classList.add('bg-[hsl(var(--primary))]', 'text-[hsl(var(--primary-foreground))]', 'border-[hsl(var(--primary))]');
      connectLabel.textContent = 'Connect to Instument';
      setBadge('offline');
      if (connSubtitle) connSubtitle.textContent = 'Not linked to a spectrometer yet';
      if (deviceInfo) deviceInfo.style.display = 'none';
      setCalibrateButtonsEnabled(false);
      [blackCell, whiteCell].forEach(function (c) { if (c) c.classList.remove('done'); });
      [blackBtn, whiteBtn].forEach(function (b) {
        if (!b) return;
        const label = b.querySelector('.btn-label');
        if (label) label.textContent = 'Calibrate';
      });
      showToast('toastStack', 'Instrument disconnected', 'success');
    }

    disconnectInstrument()
      .catch(function () {})
      .finally(finishDisconnect);
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', function () {
      if (instrumentConnected) doDisconnect(); else doConnect();
    });
  }

  const step2LockOverlay = document.getElementById('step2LockOverlay');
  const step2LockedContent = document.getElementById('step2LockedContent');
  const step1FooterNote = document.getElementById('step1FooterNote');
  let step2Unlocked = false;

  function unlockStep2() {
    if (step2Unlocked) return;
    step2Unlocked = true;
    if (step2LockOverlay) step2LockOverlay.style.display = 'none';
    if (step2LockedContent) step2LockedContent.classList.remove('opacity-40', 'pointer-events-none', 'select-none');
    if (step1FooterNote) step1FooterNote.style.display = 'none';
    completedSteps.add(1);
    renderStepper();
    scrollToNextCard(document.getElementById('stepPanel2'));
  }

  function relockStep2() {
    if (!step2Unlocked) return;
    step2Unlocked = false;
    if (step2LockOverlay) step2LockOverlay.style.display = 'flex';
    if (step2LockedContent) step2LockedContent.classList.add('opacity-40', 'pointer-events-none', 'select-none');
    if (step1FooterNote) step1FooterNote.style.display = 'block';
    completedSteps.delete(1);
    renderStepper();
  }

  function markCalibrated(type) {
    calibrationData[type] = true;
    const cell = document.getElementById(type + 'Cell');
    if (cell) cell.classList.add('done');
    const btn = type === 'black' ? blackBtn : whiteBtn;
    const label = btn ? btn.querySelector('.btn-label') : null;
    if (label) label.textContent = 'Recalibrate';
    showToast('toastStack', (type === 'black' ? 'Black' : 'White') + ' calibration complete', 'info');
    saveInstrumentSession();
    if (calibrationData.black && calibrationData.white) {
      unlockStep2();
    }
  }

  function runCalibration(type) {
    if (!instrumentConnected) return;
    const btn = type === 'black' ? blackBtn : whiteBtn;
    const label = btn ? btn.querySelector('.btn-label') : null;
    const isRecalibration = !!calibrationData[type];
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }
    if (label) label.textContent = isRecalibration ? 'Recalibrating…' : 'Calibrating…';

    calibrateInstrument(type)
      .then(function (data) {
        if (!data.ok) {
          showToast('toastStack', 'Calibration failed, check instrument for details.', 'error');
          console.error(data.error);
          if (label) label.textContent = isRecalibration ? 'Recalibrate' : 'Calibrate';
          return;
        }
        markCalibrated(type);
      })
      .catch(function (err) {
        showToast('toastStack', 'Calibration failed, check instrument for details.', 'error');
        console.error(err);
        if (label) label.textContent = isRecalibration ? 'Recalibrate' : 'Calibrate';
      })
      .finally(function () {
        if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
      });
  }

  if (blackBtn) blackBtn.addEventListener('click', function () { runCalibration('black'); });
  if (whiteBtn) whiteBtn.addEventListener('click', function () { runCalibration('white'); });

  /* ---- Task 2: Read Reference (Capture Reflectance) ---- */
  (function readReference() {
    const measureBtn1 = document.getElementById('measureBtn1');
    const measureLabel1 = document.getElementById('measureLabel1');
    const aperture1 = document.getElementById('apertureSvg1');
    const statusText1 = document.getElementById('statusText1');
    const statusSub1 = document.getElementById('statusSub1');
    const resultsBlock1 = document.getElementById('resultsBlock1');
    const rereadStdBtn = document.getElementById('rereadStdBtn');
    const saveStdBtn = document.getElementById('saveStdBtn');
    if (!measureBtn1) return;

    // holds the real reading from the agent's /measure/standard response
    // -- { L, a, b, C, h } -- until saveStdBtn commits it into
    // wizardStandard. Scoped to this IIFE; saveStdBtn/rereadStdBtn below
    // are declared in the same closure so they can read/clear it.
    let capturedStandardRaw = null;

    // Exposed so other closures (product-code clear guard, Task 8) can
    // check/clear this without reaching into readReference()'s private
    // state directly.
    window.hasCapturedStandardReading = function () { return capturedStandardRaw !== null; };
    window.clearCapturedStandardRaw = function () { capturedStandardRaw = null; };

    function fillResults(raw) {
      document.getElementById('valL1').textContent = raw.L.toFixed(2);
      document.getElementById('valC1').textContent = raw.C.toFixed(2);
      document.getElementById('valH1').textContent = raw.h.toFixed(2);
      document.getElementById('valA1').textContent = raw.a.toFixed(2);
      document.getElementById('valB1').textContent = raw.b.toFixed(2);
    }

    function runReadReference() {
      measureBtn1.classList.add('loading');
      measureBtn1.disabled = true;
      measureLabel1.textContent = 'Scanning…';
      if (aperture1) aperture1.classList.add('scanning');
      if (statusText1) statusText1.textContent = 'Measuring standard…';
      if (statusSub1) statusSub1.textContent = 'Keep the aperture still and flat against the sample.';

      measureStandard()
        .then(function (data) {
          if (!data.ok || !data.sci) {
            throw new Error(data.error || 'No measurement returned');
          }
          capturedStandardRaw = data.sci; // { L, a, b, C, h }

          if (aperture1) aperture1.classList.remove('scanning');
          measureBtn1.classList.remove('loading');
          measureBtn1.style.display = 'none';
          const saveStdBtnWrap = document.getElementById('saveStdBtnWrap');
          const rereadStdBtnWrap = document.getElementById('rereadStdBtnWrap');
          if (saveStdBtnWrap) saveStdBtnWrap.style.display = 'block';
          if (rereadStdBtnWrap) rereadStdBtnWrap.style.display = 'block';

          fillResults(capturedStandardRaw);
          if (resultsBlock1) resultsBlock1.style.display = 'block';
          if (statusText1) statusText1.textContent = 'Capture complete';
          if (statusSub1) statusSub1.textContent = 'Review the readings, then save the standard.';
          showToast('toastStack', 'Reference captured successfully', 'success');
        })
        .catch(function (err) {
          if (aperture1) aperture1.classList.remove('scanning');
          measureBtn1.classList.remove('loading');
          measureBtn1.disabled = false;
          measureLabel1.textContent = 'Read Reference';
          if (statusText1) statusText1.textContent = 'Ready to scan';
          if (statusSub1) statusSub1.textContent = 'Press the button below once the sample is in position.';
          showToast('toastStack', 'Measurement failed. Is the agent running?', 'error');
          console.error(err);
        });
    }

    measureBtn1.addEventListener('click', runReadReference);

    // F5 keybind for "Read Reference" (New Standard flow) -- same
    // guard pattern as the Step 3 keybinds: ignored while a reading is
    // already in flight, with a toast instead of silently doing nothing.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'F5') return;
      if (measureBtn1.style.display === 'none') return; // already captured -- button swapped out
      e.preventDefault();

      if (measureBtn1.disabled) {
        showToast('toastStack', 'Please wait until the current reading finishes.', 'info');
        return;
      }
      runReadReference();
    });

    if (saveStdBtn) {
      saveStdBtn.addEventListener('click', function () {
        const productCodeGlobal = document.getElementById('productCodeGlobal');
        const refChipName = document.getElementById('refChipName');
        const refChipDe = document.getElementById('refChipDe');

        wizardStandard.productCode = productCodeGlobal ? productCodeGlobal.value.trim() : null;
        wizardStandard.standardName = refChipName ? refChipName.textContent.trim() : null;
        wizardStandard.stdDe = refChipDe ? refChipDe.textContent.trim() : '1.00';
        if (!capturedStandardRaw) {
          showToast('toastStack', 'No captured reading found — read the reference first.', 'error');
          return;
        }
        wizardStandard.raw = {
          raw_l: capturedStandardRaw.L,
          raw_a: capturedStandardRaw.a,
          raw_b: capturedStandardRaw.b,
          raw_c: capturedStandardRaw.C,
          raw_h: capturedStandardRaw.h,
        };
        // same shape as the "Use Existing Standard" flow -- so
        // getColorOffset() call sites don't need to branch on which
        // flow was used to know where the standard's raw a*/b* live
        wizardStandard.standardA = capturedStandardRaw.a;
        wizardStandard.standardB = capturedStandardRaw.b;

        // Task 6: carry standard name, ΔE, and product code into the
        // Step 3 chip -- mirrors what useExistingStandardFlow() already
        // does for the "Use Existing Standard" path.
        const sampleRefChipName = document.getElementById('sampleRefChipName');
        const sampleRefChipDe = document.getElementById('sampleRefChipDe');
        const sampleRefChipProductCode = document.getElementById('sampleRefChipProductCode');
        if (sampleRefChipName) sampleRefChipName.textContent = wizardStandard.standardName;
        if (sampleRefChipDe) sampleRefChipDe.textContent = '   (Standard ΔE: ' + parseFloat(wizardStandard.stdDe).toFixed(2) + ')';
        if (sampleRefChipProductCode) sampleRefChipProductCode.textContent = wizardStandard.productCode;

        showToast('toastStack', 'Standard raw values save into session', 'info');

        completedSteps.add(2);
        renderStepper();
        if (window.lockStep2CardsAfterStep3) window.lockStep2CardsAfterStep3();
        if (window.setSpecialReadButtonsDisabled) window.setSpecialReadButtonsDisabled(false);
        if (window.setReadSampleButtonState) window.setReadSampleButtonState(true);
        if (window.setFinishReadingMode) window.setFinishReadingMode(true);

        const step3LockOverlay = document.getElementById('step3LockOverlay');
        const step3LockedContent = document.getElementById('step3LockedContent');
        if (step3LockOverlay) step3LockOverlay.style.display = 'none';
        if (step3LockedContent) step3LockedContent.classList.remove('opacity-40', 'pointer-events-none', 'select-none');

        scrollToNextCard(document.getElementById('stepPanel3'));
      });
    }

    function clearResults() {
      ['valL1', 'valC1', 'valH1', 'valA1', 'valB1'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.textContent = '—';
      });
    }

    if (rereadStdBtn) {
      rereadStdBtn.addEventListener('click', function () {
        capturedStandardRaw = null;
        const saveStdBtnWrap = document.getElementById('saveStdBtnWrap');
        const rereadStdBtnWrap = document.getElementById('rereadStdBtnWrap');
        if (rereadStdBtnWrap) rereadStdBtnWrap.style.display = 'none';
        if (saveStdBtnWrap) saveStdBtnWrap.style.display = 'none';
        measureBtn1.style.display = 'inline-flex';
        measureBtn1.disabled = false;
        measureBtn1.classList.remove('loading');
        measureLabel1.textContent = 'Read Reference';
        clearResults();
        if (resultsBlock1) resultsBlock1.style.display = 'none';
        if (statusText1) statusText1.textContent = 'Ready to scan';
        if (statusSub1) statusSub1.textContent = 'Press the button below once the sample is in position.';
        showToast('toastStack', 'Ready to re-read the standard', 'info');
      });
    }
  })();

  // Restores UI to "already connected + calibrated" state without
  // re-running the connect/calibrate animations -- used only when a
  // stored session is confirmed still valid against the agent.
  function restoreInstrumentSession(session) {
    instrumentConnected = true;
    calibrationData = session.calibration || {};
    wizardDevice.model = session.device ? session.device.model : null;
    wizardDevice.serial = session.device ? session.device.serial : null;

    connectBtn.classList.remove('bg-[hsl(var(--primary))]', 'text-[hsl(var(--primary-foreground))]', 'border-[hsl(var(--primary))]');
    connectBtn.classList.add('text-[hsl(var(--danger))]', 'border-[hsl(var(--danger-border))]', 'bg-[hsl(var(--danger-bg))]');
    connectLabel.textContent = 'Disconnect';
    setBadge('online');
    if (connSubtitle) connSubtitle.textContent = 'Linked over Bluetooth LE';
    if (devModel) devModel.textContent = wizardDevice.model || '—';
    if (devSerial) devSerial.textContent = wizardDevice.serial || '—';
    if (deviceInfo) deviceInfo.style.display = 'block';
    setCalibrateButtonsEnabled(true);

    ['black', 'white'].forEach(function (type) {
      if (!calibrationData[type]) return;
      const cell = document.getElementById(type + 'Cell');
      if (cell) cell.classList.add('done');
      const btn = type === 'black' ? blackBtn : whiteBtn;
      const label = btn ? btn.querySelector('.btn-label') : null;
      if (label) label.textContent = 'Recalibrate';
    });

    if (calibrationData.black && calibrationData.white) {
      // Step 1 fully satisfied by the restored session -- skip straight
      // to Step 2 instead of re-showing the connect/calibrate screen.
      unlockStep2();
      showToast('toastStack', 'Instrument already calibrated.', 'info');
    } else {
      showToast('toastStack', 'Finish calibration to continue.', 'info');
    }
  }

  window.addEventListener('load', function () {
    setBadge('offline');
    setCalibrateButtonsEnabled(false);
    renderStepper();

    const session = loadInstrumentSession();
    if (!session || !session.connected) {
      // No stored session -- stay idle at "Offline" and let the user
      // press Connect themselves. Auto-connect on load removed; only
      // an existing, agent-confirmed session restores automatically.
      return;
    }

    // A stored session exists -- but don't blindly trust it, since the
    // dongle could have disconnected unexpectedly since the last page
    // view. Confirm against the agent's actual /status before restoring.
    getInstrumentStatus()
      .then(function (data) {
        if (data.ok && data.connected) {
          restoreInstrumentSession(session);
        } else {
          clearInstrumentSession();
        }
      })
      .catch(function () {
        // agent unreachable -- can't confirm, so don't trust the stale
        // session; clear it and leave the user at the normal Offline
        // state to press Connect manually
        clearInstrumentSession();
      });
  });

  window.getScatterPlotPoints = function () {
    const historyTableBody = document.getElementById('historyTableBody');
    if (!historyTableBody) return [];
    const points = [];
    historyTableBody.querySelectorAll('tr[data-row-id]').forEach(function (tr) {
      const da = parseFloat(tr.dataset.da);
      const db = parseFloat(tr.dataset.db);
      if (isNaN(da) || isNaN(db)) return;
      points.push({
        id: tr.dataset.rowId,
        name: tr.dataset.sampleName || tr.dataset.rowId,
        da: da,
        db: db,
        passed: tr.dataset.judgement === 'pass',
      });
    });
    return points;
  };

  /* =========================================================
      STEP 2 — Product Code (combobox + add-new) and mode lock
  ========================================================== */
  (function step2ProductCodeAndMode() {
    const productCodeGlobal = document.getElementById('productCodeGlobal');
    const productCodeGlobalErr = document.getElementById('productCodeGlobalErr');
    const productCodeGlobalMatch = document.getElementById('productCodeGlobalMatch');
    const productCodeSuggestions = document.getElementById('productCodeSuggestions');
    const productCodeSavedChip = document.getElementById('productCodeSavedChip');
    const productCodeSavedValue = document.getElementById('productCodeSavedValue');

    const modeSelectLockOverlay = document.getElementById('modeSelectLockOverlay');
    const modeSelectContent = document.getElementById('modeSelectContent');
    const modeCardNew = document.getElementById('modeCardNew');
    const modeCardExisting = document.getElementById('modeCardExisting');
    const flowNewStandard = document.getElementById('flowNewStandard');
    const stepDetailsWrap = document.getElementById('stepDetailsWrap');
    const stepDetailsLockOverlay = document.getElementById('stepDetailsLockOverlay');
    const stepDetails = document.getElementById('stepDetails');

    // Accepts both the original XX00000E(-I)? shape and the newer
    // XX-X00000E(-I)? shape (e.g. "DV-I16110E") -- the "-X" segment
    // is an optional single-letter sub-prefix inserted right after the
    // initial 2 letters.
    const PRODUCT_CODE_RE = /^[A-Z]{2}(-[A-Z])?\d{1,5}E(-I)?$/;
    // Task 2: no longer dumped in full client-side -- grows only from
    // actual server search results / saves, same principle as Samples
    // Record's product code lookup (Task 1).
    let existingCodes = Array.isArray(productCodeOptions) ? productCodeOptions.slice() : [];

    let savedCode = null;
    let selectedMode = null;
    // Task 8: tracks the last non-empty value the field held, so a
    // cancelled "clear the code" confirmation can restore it exactly.
    let lastNonEmptyProductCode = '';

    const SUGGEST_DEBOUNCE_MS = 300;
    let suggestDebounceTimer = null;
    let suggestRequestSeq = 0; // guards a stale, slow response from overwriting a newer one

    function renderMatches(query, matches) {
      const q = query.trim().toUpperCase();
      let html = '';
      matches.forEach(function (c) {
        html += '<div class="px-3 py-2 text-[13px] cursor-pointer hover:bg-[hsl(var(--accent))] font-mono" data-code="' + c + '">' + c + '</div>';
      });
      // dedupe guard: never offer "+ Add" for a code the search already matched
      if (q && PRODUCT_CODE_RE.test(q) && matches.indexOf(q) === -1) {
        html += '<div class="px-3 py-2 text-[13px] cursor-pointer hover:bg-[hsl(var(--accent))] font-mono text-[hsl(var(--primary))]" data-add-code="' + q + '">+ Add "' + q + '"</div>';
      }
      if (!html) {
        productCodeSuggestions.style.display = 'none';
        productCodeSuggestions.innerHTML = '';
        return;
      }
      productCodeSuggestions.innerHTML = html;
      productCodeSuggestions.style.display = 'block';

      // primary action: clicking an existing code selects it immediately,
      // no Enter/server round-trip needed
      productCodeSuggestions.querySelectorAll('[data-code]').forEach(function (el) {
        el.addEventListener('click', function () {
          productCodeGlobal.value = el.dataset.code;
          productCodeSuggestions.style.display = 'none';
          selectExistingCode(el.dataset.code);
        });
      });
      productCodeSuggestions.querySelectorAll('[data-add-code]').forEach(function (el) {
        el.addEventListener('click', function () {
          productCodeGlobal.value = el.dataset.addCode;
          productCodeSuggestions.style.display = 'none';
          saveProductCode();
        });
      });
    }

    // Task 2: debounced (~300ms) server-side lookup -- fires only after
    // the user stops typing, instead of filtering a full client-side list.
    function renderSuggestions(query) {
      const q = query.trim();
      clearTimeout(suggestDebounceTimer);

      if (!q) {
        productCodeSuggestions.style.display = 'none';
        productCodeSuggestions.innerHTML = '';
        return;
      }

      suggestDebounceTimer = setTimeout(function () {
        const seq = ++suggestRequestSeq;
        fetch(urls.searchProductCodes + '?q=' + encodeURIComponent(q), {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (seq !== suggestRequestSeq) return; // superseded -- drop stale response
            const matches = data.results || [];
            matches.forEach(function (c) { if (existingCodes.indexOf(c) === -1) existingCodes.push(c); });
            renderMatches(query, matches);
          })
          .catch(function () {
            if (seq !== suggestRequestSeq) return;
            productCodeSuggestions.innerHTML = '<div class="px-3 py-2 text-[13px] text-[hsl(var(--muted-foreground))] italic">Search failed</div>';
            productCodeSuggestions.style.display = 'block';
          });
      }, SUGGEST_DEBOUNCE_MS);
    }

    // Selecting a code already known client-side -- no need to hit the
    // server again. Toast only, no inline "saved" chip (that's reserved
    // for genuinely new codes going through saveProductCode()).
    function selectExistingCode(code) {
      const v = code.trim().toUpperCase();
      productCodeGlobal.value = v;
      lastNonEmptyProductCode = v;
      validateProductCode();
      savedCode = v;
      productCodeSavedChip.style.display = 'none';
      showToast('toastStack', 'Using existing product code — ' + v, 'info');
      unlockModeSelect();
    }

    function validateProductCode() {
      const v = productCodeGlobal.value.trim().toUpperCase();
      const isValidFormat = PRODUCT_CODE_RE.test(v);
      const isExisting = existingCodes.indexOf(v) !== -1;
      productCodeGlobal.classList.toggle('error', v.length > 0 && !isValidFormat);
      productCodeGlobalErr.style.display = (v.length > 0 && !isValidFormat) ? 'block' : 'none';
      productCodeGlobalMatch.style.display = isExisting ? 'block' : 'none';
      return isValidFormat;
    }

    function saveProductCode() {
      const v = productCodeGlobal.value.trim().toUpperCase();
      if (!validateProductCode()) {
        showToast('toastStack', 'Please enter a valid product code first.', 'error');
        return;
      }
      productCodeGlobal.value = v;
      lastNonEmptyProductCode = v;

      // server-side check happens first -- existence is decided by the DB,
      // not by the client's cached existingCodes list
      fetch(urls.saveProductCode, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({
          product_code: v,
          csrfmiddlewaretoken: getCsrfToken(),
        }),
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (!result.ok) {
            showToast('toastStack', result.data.message || 'Failed to save product code.', 'error');
            return;
          }
          savedCode = v;
          if (existingCodes.indexOf(v) === -1) existingCodes.push(v);
          // inline chip only for a code the server actually just created
          if (result.data.created) {
            productCodeSavedValue.textContent = v;
            productCodeSavedChip.style.display = 'flex';
          } else {
            productCodeSavedChip.style.display = 'none';
          }
          showToast('toastStack', result.data.message, result.data.tone || 'success');
          unlockModeSelect();
        })
        .catch(function () {
          showToast('toastStack', 'Network error — please try again.', 'error');
        });
    }

    function unlockModeSelect() {
      modeSelectLockOverlay.style.display = 'none';
      modeSelectContent.classList.remove('opacity-40', 'pointer-events-none', 'select-none');
      // Task 4: cache whether this product code already has ANY standard
      // record -- gates the "STANDARD" keyword allowed in CMA/Lot Number
      // (only permitted for genuinely new product codes with none yet).
      window.productCodeHasStandard = null; // unknown until the fetch below resolves
      fetchStandardsForCurrentProductCode()
        .then(function (data) {
          window.productCodeHasStandard = (data.standards || []).length > 0;
        })
        .catch(function () {
          window.productCodeHasStandard = true; // fail safe -- block the keyword if we can't confirm
        });
    }

    // Task 10 (revised) — once Step 2 is completed, disable the specific
    // interactive elements below and dim the whole step2LockedContent
    // wrapper to .5 opacity, instead of the broader card-level locking.
    function lockStep2Cards() {
      const step2LockedContent = document.getElementById('step2LockedContent');
      const editRefBtn = document.getElementById('editRefBtn');
      const rereadStdBtn = document.getElementById('rereadStdBtn');
      const saveStdBtn = document.getElementById('saveStdBtn');
      const modeCardGroup = document.getElementById('modeCardGroup');

      if (step2LockedContent) step2LockedContent.style.opacity = '.5';

      if (productCodeGlobal) productCodeGlobal.disabled = true;
      if (modeCardGroup) modeCardGroup.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      if (editRefBtn) editRefBtn.disabled = true;
      if (rereadStdBtn) rereadStdBtn.disabled = true;
      if (saveStdBtn) saveStdBtn.disabled = true;
    }
    window.lockStep2CardsAfterStep3 = lockStep2Cards;

    // Task 21: full revert of Step 2 back to its pre-selection state,
    // used when the user backs out of Step 3 via "Change what you're doing".
    window.resetStep2ToDefault = function () {
      const step2LockedContent = document.getElementById('step2LockedContent');
      const modeCardGroup = document.getElementById('modeCardGroup');
      const rereadStdBtn = document.getElementById('rereadStdBtn');
      const saveStdBtn = document.getElementById('saveStdBtn');
      const rereadStdBtnWrap = document.getElementById('rereadStdBtnWrap');
      const saveStdBtnWrap = document.getElementById('saveStdBtnWrap');
      const editRefBtn = document.getElementById('editRefBtn');
      const measureBtn1 = document.getElementById('measureBtn1');
      const measureLabel1 = document.getElementById('measureLabel1');
      const resultsBlock1 = document.getElementById('resultsBlock1');
      const statusText1 = document.getElementById('statusText1');
      const statusSub1 = document.getElementById('statusSub1');
      const stepMeasureCard = document.getElementById('stepMeasure');

      // un-dim / re-enable everything Task 10 locked
      if (step2LockedContent) step2LockedContent.style.opacity = '';
      productCodeGlobal.disabled = false;
      if (modeCardGroup) modeCardGroup.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
      if (editRefBtn) editRefBtn.disabled = false;
      if (rereadStdBtn) rereadStdBtn.disabled = false;
      if (saveStdBtn) saveStdBtn.disabled = false;

      // clear product code + mode selection
      productCodeGlobal.value = '';
      savedCode = null;
      selectedMode = null;
      window.currentStandardFlowIsNew = false;
      productCodeSavedChip.style.display = 'none';
      productCodeGlobalErr.style.display = 'none';
      productCodeGlobalMatch.style.display = 'none';
      [modeCardNew, modeCardExisting].forEach(function (c) { c.classList.remove('selected'); });

      // re-lock the mode-select + standard-details sections
      modeSelectLockOverlay.style.display = 'flex';
      modeSelectContent.classList.add('opacity-40', 'pointer-events-none', 'select-none');
      lockStepDetails();
      flowNewStandard.style.display = 'none';

      // reset the Capture Reflectance card back to its pre-read state
      if (stepMeasureCard) stepMeasureCard.style.display = 'none';
      if (stepDetails) stepDetails.style.display = 'block';
      if (measureBtn1) { measureBtn1.style.display = 'inline-flex'; measureBtn1.disabled = false; measureBtn1.classList.remove('loading'); }
      if (measureLabel1) measureLabel1.textContent = 'Read Reference';
      if (resultsBlock1) resultsBlock1.style.display = 'none';
      if (statusText1) statusText1.textContent = 'Ready to scan';
      if (statusSub1) statusSub1.textContent = 'Press the button below once the sample is in position.';
      if (rereadStdBtnWrap) rereadStdBtnWrap.style.display = 'none';
      if (saveStdBtnWrap) saveStdBtnWrap.style.display = 'none';
      if (window.clearCapturedStandardRaw) window.clearCapturedStandardRaw();

      completedSteps.delete(2);
    };

    // Task 8: tracks the last non-empty value typed, so a cancelled
    // "clear the code" confirmation can restore exactly what was there.
    productCodeGlobal.addEventListener('input', function () {
      const typedVal = productCodeGlobal.value.toUpperCase();
      const clearingWithCapturedReading = !typedVal.trim() && lastNonEmptyProductCode
        && window.hasCapturedStandardReading && window.hasCapturedStandardReading();

      if (clearingWithCapturedReading) {
        const proceed = window.confirm('Clearing the product code will discard the standard reading you\'ve captured for it. Continue?');
        if (!proceed) {
          productCodeGlobal.value = lastNonEmptyProductCode;
          validateProductCode();
          return;
        }
        // confirmed -- full reset back to the empty, locked "Standard
        // Details" state; resetStep2ToDefault() also clears productCodeGlobal.value.
        if (window.resetStep2ToDefault) window.resetStep2ToDefault();
        lastNonEmptyProductCode = '';
        return;
      }

      productCodeGlobal.value = typedVal;
      if (typedVal.trim()) lastNonEmptyProductCode = typedVal.trim();
      validateProductCode();
      renderSuggestions(productCodeGlobal.value.trim());
      if (savedCode && productCodeGlobal.value.trim() !== savedCode) {
        productCodeSavedChip.style.display = 'none';
        savedCode = null;
      }
      if (!productCodeGlobal.value.trim()) {
        modeSelectLockOverlay.style.display = 'flex';
        modeSelectContent.classList.add('opacity-40', 'pointer-events-none', 'select-none');
        lockStepDetails();
        flowNewStandard.style.display = 'none';
        [modeCardNew, modeCardExisting].forEach(function (c) { c.classList.remove('selected'); });
        selectedMode = null;
      }
    });
    productCodeGlobal.addEventListener('focus', function () { renderSuggestions(productCodeGlobal.value.trim()); });
    productCodeGlobal.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      productCodeSuggestions.style.display = 'none';
      const v = productCodeGlobal.value.trim().toUpperCase();
      // Enter is optional for an existing code -- if it already matches
      // one exactly, treat it the same as clicking it. Only genuinely
      // new codes go through the save (server-check) path.
      if (existingCodes.indexOf(v) !== -1) {
        selectExistingCode(v);
      } else {
        saveProductCode();
      }
    });
    document.addEventListener('click', function (e) {
      if (!productCodeGlobal.contains(e.target) && !productCodeSuggestions.contains(e.target)) {
        productCodeSuggestions.style.display = 'none';
      }
    });

    /* Standard Details (c) unlocks only for "New Standard + Sample".
        Use Existing Standard (d) unlocks only for "Use Existing Standard".
        Both start locked -- neither is ever hidden, just dimmed + gated
        behind the same lock-overlay pattern used elsewhere in the wizard. */
    function lockStepDetails() {
      stepDetailsLockOverlay.style.display = 'flex';
      stepDetails.classList.add('opacity-40', 'pointer-events-none', 'select-none');
    }
    function unlockStepDetails() {
      stepDetailsLockOverlay.style.display = 'none';
      stepDetails.classList.remove('opacity-40', 'pointer-events-none', 'select-none');
    }
    // Task 11 — "Use Existing Standard" no longer has its own panel.
    // Clicking it directly looks up the active standard for the current
    // product code and, if found, jumps straight into Step 3.
    function fetchStandardsForCurrentProductCode() {
      const v = productCodeGlobal.value.trim().toUpperCase();
      return fetch(urls.standardsForProductCode + '?product_code=' + encodeURIComponent(v), {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      }).then(function (res) { return res.json(); });
    }

    function useExistingStandardFlow() {
      fetchStandardsForCurrentProductCode()
        .then(function (data) {
          const standards = data.standards || [];
          if (!standards.length) {
            showToast('toastStack', 'No Standard data for this product code yet.', 'info');
            selectedMode = 'new';
            window.currentStandardFlowIsNew = true;
            [modeCardNew, modeCardExisting].forEach(function (c) { c.classList.remove('selected'); });
            modeCardNew.classList.add('selected');
            unlockStepDetails();
            flowNewStandard.style.display = 'block';
            if (stepDetails) {
              stepDetails.classList.add('glow-border');
              setTimeout(function () { stepDetails.classList.remove('glow-border'); }, 4800);
            }
            return;
          }

          const active = standards[0]; // ordered -is_active_standard, -date_time
          const sampleRefChipName = document.getElementById('sampleRefChipName');
          const sampleRefChipDe = document.getElementById('sampleRefChipDe');
          const sampleRefChipProductCode = document.getElementById('sampleRefChipProductCode');

          if (sampleRefChipName) sampleRefChipName.textContent = active.standard_name;
          if (sampleRefChipDe) {
            sampleRefChipDe.textContent = (data.std_delta_e_used !== null && data.std_delta_e_used !== undefined)
              ? '   (Standard ΔE: ' + Number(data.std_delta_e_used).toFixed(2) + ')'
              : '';
          }
          if (sampleRefChipProductCode) sampleRefChipProductCode.textContent = productCodeGlobal.value.trim();

          wizardStandard.productCode = productCodeGlobal.value.trim();
          wizardStandard.standardName = active.standard_name;
          wizardStandard.stdDe = data.std_delta_e_used;
          wizardStandard.standardsId = active.standards_id;
          // needed by getColorOffset() (color_offset.js) to determine
          // which hue family (Red/Green, Yellow/Blue) each sample's
          // Δa*/Δb* belongs to -- comes straight from the standard row,
          // not derived/guessed client-side
          wizardStandard.standardA = (active.raw_a !== null && active.raw_a !== undefined) ? Number(active.raw_a) : null;
          wizardStandard.standardB = (active.raw_b !== null && active.raw_b !== undefined) ? Number(active.raw_b) : null;
          // full raw Lab, same shape as the New Standard flow's
          // wizardStandard.raw -- needed as the "standard" param sent to
          // the agent's /measure/sample endpoint
          wizardStandard.raw = {
            raw_l: (active.raw_l !== null && active.raw_l !== undefined) ? Number(active.raw_l) : null,
            raw_a: wizardStandard.standardA,
            raw_b: wizardStandard.standardB,
          };
          wizardStandard.savedToDb = true; // already exists in DB, nothing new to persist

          completedSteps.add(2);
          renderStepper();
          if (window.lockStep2CardsAfterStep3) window.lockStep2CardsAfterStep3();
          if (window.setSpecialReadButtonsDisabled) window.setSpecialReadButtonsDisabled(true);
          if (window.setReadSampleButtonState) window.setReadSampleButtonState(false);
          if (window.setFinishReadingMode) window.setFinishReadingMode(false);

          const step3LockOverlay = document.getElementById('step3LockOverlay');
          const step3LockedContent = document.getElementById('step3LockedContent');
          if (step3LockOverlay) step3LockOverlay.style.display = 'none';
          if (step3LockedContent) step3LockedContent.classList.remove('opacity-40', 'pointer-events-none', 'select-none');

          scrollToNextCard(document.getElementById('stepPanel3'));
        })
        .catch(function () {
          showToast('toastStack', 'Failed to load standards for this product code.', 'error');
        });
    }

    [modeCardNew, modeCardExisting].forEach(function (card) {
      card.addEventListener('click', function () {
        selectedMode = card.dataset.mode;
        [modeCardNew, modeCardExisting].forEach(function (c) { c.classList.remove('selected'); });
        card.classList.add('selected');

        if (selectedMode === 'new') {
          window.currentStandardFlowIsNew = true;
          unlockStepDetails();
          flowNewStandard.style.display = 'block';
          if (window.setReadSampleButtonState) window.setReadSampleButtonState(true);
          if (window.setFinishReadingMode) window.setFinishReadingMode(true);
          if (window.setSpecialReadButtonsDisabled) window.setSpecialReadButtonsDisabled(false);
        } else {
          window.currentStandardFlowIsNew = false;
          lockStepDetails();
          flowNewStandard.style.display = 'none';
          useExistingStandardFlow();
        }
      });
    });

    lockStepDetails();

    const continueBtn = document.getElementById('continueBtn');
    const stepMeasureCard = document.getElementById('stepMeasure');
    const refChipName = document.getElementById('refChipName');
    const refChipDe = document.getElementById('refChipDe');
    const stdDeInput = document.getElementById('stdDeInput');

    function syncRefChipFromStandardDetails() {
      if (refChipName && window.getStandardPreviewText) {
        refChipName.textContent = window.getStandardPreviewText();
      }
      if (refChipDe && stdDeInput) {
        refChipDe.textContent = stdDeInput.value || '1.00';
      }
    }

    if (continueBtn) {
      continueBtn.addEventListener('click', function () {
        if (window.validateStandardDetails && !window.validateStandardDetails()) return;
        syncRefChipFromStandardDetails();
        if (stepDetails) stepDetails.style.display = 'none';
        if (stepMeasureCard) stepMeasureCard.style.display = 'block';
      });
    }

    const editRefBtn = document.getElementById('editRefBtn');
    if (editRefBtn) {
      editRefBtn.addEventListener('click', function () {
        if (stepMeasureCard) stepMeasureCard.style.display = 'none';
        if (stepDetails) stepDetails.style.display = 'block';
      });
    }


  })();

  /* =========================================================
      Lock "What would you like to do?" cards once CMA/Lot has a
      value, until the standard is actually saved in Capture
      Reflectance. Prevents switching modes mid-entry.
  ========================================================== */
  (function lockModeCardsWhileEditingStandard() {
    const cma_lot = document.getElementById('cma_lot');
    const modeCardNew = document.getElementById('modeCardNew');
    const modeCardExisting = document.getElementById('modeCardExisting');
    const saveStdBtn = document.getElementById('saveStdBtn');
    if (!cma_lot || !modeCardNew || !modeCardExisting) return;

    let modeCardsLocked = false;

    function lockModeCards() {
      if (modeCardsLocked) return;
      modeCardsLocked = true;
      modeCardNew.disabled = true;
      modeCardExisting.disabled = true;
    }

    function unlockModeCards() {
      if (!modeCardsLocked) return;
      modeCardsLocked = false;
      modeCardNew.disabled = false;
      modeCardExisting.disabled = false;
    }

    cma_lot.addEventListener('input', function () {
      if (cma_lot.value.trim() !== '' && cma_lot.value.trim() !== 'CMA-') {
        lockModeCards();
      } else {
        unlockModeCards();
      }
    });

    // Mode cards now unlock immediately on Save click (Task 8) -- the
    // actual DB save is deferred to Step 3's "Finish Reading" button.
    if (saveStdBtn) {
      saveStdBtn.addEventListener('click', function () {
        unlockModeCards();
        completedSteps.add(2);
        renderStepper();
        if (window.lockStep2CardsAfterStep3) window.lockStep2CardsAfterStep3();
      });
    }

    window.unlockModeCardsAfterStandardSave = unlockModeCards;
  })();

  /* =========================================================
      Standard Details — Dosage field: digits only, "%" fixed
  ========================================================== */
  (function dosageField() {
    const dosage = document.getElementById('dosage');
    if (!dosage) return;
    const dosageWarn = document.getElementById('dosageWarn');

    function sanitizeDosage(raw) {
      let digits = raw.replace(/%/g, '').replace(/[^0-9.]/g, '');
      const dot = digits.indexOf('.');
      if (dot !== -1) {
        digits = digits.slice(0, dot + 1) + digits.slice(dot + 1).replace(/\./g, '');
        // cap to 2 decimal places, e.g. "12.345" -> "12.34"
        const parts = digits.split('.');
        if (parts[1]) parts[1] = parts[1].slice(0, 2);
        digits = parts.join('.');
      }
      return digits;
    }

    function checkDosageMin() {
      const numeric = parseFloat(sanitizeDosage(dosage.value));
      if (dosageWarn) {
        dosageWarn.style.display = (!isNaN(numeric) && sanitizeDosage(dosage.value).length > 0 && numeric < 1.000) ? 'block' : 'none';
      }
    }

    // keep the caret to the left of the fixed "%" no matter where the
    // user clicked/typed
    function pinCaretBeforePercent() {
      const pos = Math.max(dosage.value.length - 1, 0);
      try { dosage.setSelectionRange(pos, pos); } catch (e) {}
    }

    if (!dosage.value) dosage.value = '%';

    dosage.addEventListener('input', function () {
      const digits = sanitizeDosage(dosage.value);
      dosage.value = digits + '%';
      pinCaretBeforePercent();
      checkDosageMin();
      if (window.updateStandardPreview) window.updateStandardPreview();
    });

    // default click behavior would happily place the caret after the "%"
    // (or anywhere in the string) -- force it back to just before "%"
    dosage.addEventListener('click', function () {
      pinCaretBeforePercent();
    });
    dosage.addEventListener('focus', function () {
      pinCaretBeforePercent();
    });

    dosage.addEventListener('keydown', function (e) {
      // block Delete/ArrowRight from ever moving past the "%" character
      const percentIndex = dosage.value.length - 1;
      if ((e.key === 'Delete' || e.key === 'ArrowRight') && dosage.selectionStart >= percentIndex) {
        e.preventDefault();
      }
    });

    dosage.addEventListener('blur', function () {
      const v = dosage.value.trim();
      const DOSAGE_FORMAT_RE = /^\d{1,2}\.\d{1,2}%$/;
      if (v !== '%' && !DOSAGE_FORMAT_RE.test(v)) {
        showToast('toastStack', 'Dosage must be a number with 1-2 decimal places, e.g. 1.5% or 12.34%', 'error');
        dosage.classList.add('error');
      } else {
        dosage.classList.remove('error');
      }
    });
  })();

  /* =========================================================
      Standard Details — CMA/Lot field + reference name preview
  ========================================================== */
  (function cmaLotAndPreview() {
    const cma_lot = document.getElementById('cma_lot');
    const dosage = document.getElementById('dosage');
    const prefixSelect = document.getElementById('prefixSelect');
    const previewName = document.getElementById('previewName');
    if (!cma_lot || !previewName) return;

    // (b) accepts either plain lot format (e.g. 1234A) or CMA-prefixed lot
    // format (e.g. CMA-1234A). (c) 1-5 digits is enough -- a single digit
    // alone is treated as a complete whole number, not flagged as
    // incomplete, as long as it isn't mid-decimal.
    const CMA_LOT_RE = /^(CMA-)?\d{1,5}[A-Za-z]{0,2}$/i;
    const DOSAGE_FORMAT_RE = /^\d{1,2}\.\d{1,2}%$/;
    const STANDARD_KEYWORD = 'STANDARD';

    // Task 4: "STANDARD" is accepted as a CMA/Lot value ONLY when this
    // product code has no existing standard at all -- otherwise it's
    // rejected with a specific toast, distinct from the generic format
    // error, since the text itself is well-formed, just not allowed here.
    function isCmaFormatValid(v) {
      if (v.trim().toUpperCase() === STANDARD_KEYWORD) {
        return window.productCodeHasStandard !== true;
      }
      return CMA_LOT_RE.test(v);
    }

    // (a) prefilled on load, user is free to delete it entirely
    if (!cma_lot.value) cma_lot.value = 'CMA-';

    function isCmaTyped() {
      const v = cma_lot.value.trim().toUpperCase();
      return v !== '' && v !== 'CMA-';
    }

    function isDosageTyped() {
      if (!dosage) return true;
      const v = dosage.value.trim();
      return v !== '' && v !== '%';
    }

    function validateCmaFormat(silent) {
      const v = cma_lot.value.trim();
      if (!isCmaTyped()) return false; // nothing real typed yet -- not an error, just incomplete
      const isStandardKeyword = v.toUpperCase() === STANDARD_KEYWORD;
      const valid = isCmaFormatValid(v);
      if (!valid && !silent) {
        if (isStandardKeyword) {
          showToast('toastStack', '"STANDARD" is not allowed — this product code already has an existing standard.', 'error');
        } else {
          showToast('toastStack', 'Invalid CMA/Lot format — use a lot number (e.g. 1234A) or CMA-lot format (e.g. CMA-1234A).', 'error');
        }
      }
      return valid;
    }

    // (d) preview only shows once both fields are complete AND valid
    function updatePreview() {
      const cmaValid = isCmaTyped() && isCmaFormatValid(cma_lot.value.trim());
      const dosageValid = isDosageTyped();

      if (cmaValid && dosageValid) {
        const label = prefixSelect ? prefixSelect.value : 'STD';
        previewName.innerHTML = [label, cma_lot.value.trim(), dosage.value.trim()].join(' ');
      } else {
        previewName.innerHTML = '<span class="placeholder text-[#a1a1aa] font-normal">Fill in the fields above…</span>';
      }
    }
    window.updateStandardPreview = updatePreview;
    window.getStandardPreviewText = function () {
      return previewName.textContent.trim();
    };

    /* ---- Sequential validation (Task: Continue to Measurement gate) ----
        Each check is its own small function; the orchestrator below just
        calls them in order and stops at the first failure. Keeps the
        "what step failed" logic out of the click handler entirely. */
    const seqWarning = document.getElementById('seqWarning');
    const seqWarningText = document.getElementById('seqWarningText');

    function hideSeqWarning() {
      if (seqWarning) seqWarning.style.display = 'none';
    }

    function validateCmaStep() {
      if (!isCmaTyped()) {
        cma_lot.classList.add('error');
        showToast('toastStack', 'Please enter a CMA/Lot value.', 'error');
        cma_lot.focus();
        return false;
      }
      const v = cma_lot.value.trim();
      if (!isCmaFormatValid(v)) {
        cma_lot.classList.add('error');
        if (v.toUpperCase() === STANDARD_KEYWORD) {
          showToast('toastStack', '"STANDARD" is not allowed — this product code already has an existing standard.', 'error');
        } else {
          showToast('toastStack', 'Invalid CMA/Lot format — use a lot number (e.g. 1234A) or CMA-lot format (e.g. CMA-1234A).', 'error');
        }
        cma_lot.focus();
        return false;
      }
      cma_lot.classList.remove('error');
      return true;
    }

    function validateDosageStep() {
      if (!dosage) return true;
      if (!isDosageTyped()) {
        dosage.classList.add('error');
        showToast('toastStack', 'Please enter a Dosage value.', 'error');
        dosage.focus();
        return false;
      }
      if (!DOSAGE_FORMAT_RE.test(dosage.value.trim())) {
        dosage.classList.add('error');
        showToast('toastStack', 'Dosage must be a number with 1-2 decimal places, e.g. 1.5% or 12.34%', 'error');
        dosage.focus();
        return false;
      }
      dosage.classList.remove('error');
      return true;
    }

    function validateStandardDetails() {
      hideSeqWarning();
      if (!validateCmaStep()) return false;
      if (!validateDosageStep()) return false;
      return true;
    }

    window.validateStandardDetails = validateStandardDetails;

    cma_lot.addEventListener('input', function () {
      // light sanitize only -- letters, digits, hyphen (no forced
      // re-injection of "CMA-", the user can delete it freely)
      const pos = cma_lot.selectionStart;
      const before = cma_lot.value;
      cma_lot.value = cma_lot.value.replace(/[^A-Za-z0-9\-]/g, '').toUpperCase();
      if (cma_lot.value.length !== before.length) {
        try { cma_lot.setSelectionRange(pos, pos); } catch (e) {}
      }
      updatePreview();
    });

    // (b) invalid format only ever flags on toast, on blur -- never inline,
    // never on load
    cma_lot.addEventListener('blur', function () {
      validateCmaFormat(false);
    });

    updatePreview();
  })();

  /* =========================================================
      Task 8 (2) — Step 3 "Finish Reading" actually persists the
      standard (name, DE, raw values) that was held in wizardStandard.
  ========================================================== */
  /* ---- Task 2/5: disable Read Light / Read Dark when flow (i) is used,
      and re-disable each one-shot after it's clicked once ---- */
  (function specialReadButtonsGuard() {
    const readLightBtn = document.getElementById('readLightBtn');
    const readDarkBtn = document.getElementById('readDarkBtn');

    window.setSpecialReadButtonsDisabled = function (disabled) {
      if (readLightBtn) {
        readLightBtn.disabled = disabled;
        if (disabled) readLightBtn.dataset.lockedByFlow = 'true'; else delete readLightBtn.dataset.lockedByFlow;
      }
      if (readDarkBtn) {
        readDarkBtn.disabled = disabled;
        if (disabled) readDarkBtn.dataset.lockedByFlow = 'true'; else delete readDarkBtn.dataset.lockedByFlow;
      }
    };

    let readingInProgress = false;
    window.isAnyReadingInProgress = function () { return readingInProgress; };
    window.setReadingInProgress = function (val) { readingInProgress = val; };

    // Task 2: when a captured Light/Dark row is deleted, its one-shot
    // button should become usable again so the user can redo that
    // reading -- unless the overall flow has locked special reads
    // entirely (e.g. "Use Existing Standard"), in which case it stays
    // disabled regardless of row state.
    window.reenableSpecialReadButton = function (kind) {
      const btn = kind === 'light' ? readLightBtn : (kind === 'dark' ? readDarkBtn : null);
      if (!btn) return;
      if (btn.dataset.lockedByFlow) return;
      btn.disabled = false;
      delete btn.dataset.usedOnce;
    };

    function specialBtnLabel(btn) {
      return btn ? btn.querySelector('.btn-label') : null;
    }

    // Task 2 (selection-based redo): selecting an EXISTING Light or Dark
    // row (without deleting it) flips its matching button into "re-read"
    // mode -- label swaps to "Re-Read Light/Dark", the button becomes
    // usable again (even if already used once), and clicking it or
    // pressing F5 re-measures that same row in place instead of
    // capturing a brand-new one. Deselecting (or selecting a different
    // kind of row) restores the button to its normal one-shot state.
    window.updateSpecialReadButtonsForSelection = function (selectedKind) {
      [
        { btn: readLightBtn, kind: 'light', defaultLabel: 'Read Light', reReadLabel: 'Re-Read Light' },
        { btn: readDarkBtn, kind: 'dark', defaultLabel: 'Read Dark', reReadLabel: 'Re-Read Dark' },
      ].forEach(function (entry) {
        const btn = entry.btn;
        if (!btn) return;
        const label = specialBtnLabel(btn);
        if (selectedKind === entry.kind) {
          btn.dataset.reReadMode = 'true';
          btn.disabled = !!btn.dataset.lockedByFlow; // still respect the overall flow gate
          if (label) label.textContent = entry.reReadLabel;
        } else {
          delete btn.dataset.reReadMode;
          if (label) label.textContent = entry.defaultLabel;
          btn.disabled = !!btn.dataset.lockedByFlow || !!btn.dataset.usedOnce;
        }
      });
    };

    if (readLightBtn) {
      readLightBtn.addEventListener('click', function () {
        if (window.isAnyReadingInProgress()) return;
        if (readLightBtn.dataset.reReadMode === 'true') {
          if (window.rereadSelectedSpecialRow) window.rereadSelectedSpecialRow('light');
          return;
        }
        readLightBtn.disabled = true;
        readLightBtn.dataset.usedOnce = 'true';
        if (window.captureSpecialReading) window.captureSpecialReading('light');
      });
    }
    if (readDarkBtn) {
      readDarkBtn.addEventListener('click', function () {
        if (window.isAnyReadingInProgress()) return;
        if (readDarkBtn.dataset.reReadMode === 'true') {
          if (window.rereadSelectedSpecialRow) window.rereadSelectedSpecialRow('dark');
          return;
        }
        readDarkBtn.disabled = true;
        readDarkBtn.dataset.usedOnce = 'true';
        if (window.captureSpecialReading) window.captureSpecialReading('dark');
      });
    }

    // F5 keybind — triggers whichever of Read Light / Read Dark is
    // still enabled (Light takes priority if both are available).
    // Guarded the same way as a click: ignored while a reading is
    // already in flight, with a toast so repeated F5 presses don't
    // queue up multiple captures. Also yields if Step 2's own F5
    // handler (Read Reference) already consumed this keypress -- both
    // listeners fire on the same document-level keydown, so without
    // this check F5 could trigger a standard capture AND a sample
    // capture at once before the standard was ever committed.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'F5') return;
      if (e.defaultPrevented) return;
      e.preventDefault();

      if (window.isAnyReadingInProgress()) {
        showToast('toastStack', 'Please wait until the current reading finishes.', 'info');
        return;
      }

      // re-read mode takes priority — a selected Light/Dark row means
      // the user explicitly wants THAT row redone, not a new capture.
      if (readLightBtn && readLightBtn.dataset.reReadMode === 'true' && !readLightBtn.disabled) {
        if (window.rereadSelectedSpecialRow) window.rereadSelectedSpecialRow('light');
        return;
      }
      if (readDarkBtn && readDarkBtn.dataset.reReadMode === 'true' && !readDarkBtn.disabled) {
        if (window.rereadSelectedSpecialRow) window.rereadSelectedSpecialRow('dark');
        return;
      }

      if (readLightBtn && !readLightBtn.disabled) {
        readLightBtn.disabled = true;
        readLightBtn.dataset.usedOnce = 'true';
        if (window.captureSpecialReading) window.captureSpecialReading('light');
      } else if (readDarkBtn && !readDarkBtn.disabled) {
        readDarkBtn.disabled = true;
        readDarkBtn.dataset.usedOnce = 'true';
        if (window.captureSpecialReading) window.captureSpecialReading('dark');
      }
    });
  })();

  /* ---- Task 3/6: row select, read/re-read, and full row rendering ---- */
  (function sampleRowsController() {
    const measureBtn2 = document.getElementById('measureBtn2');
    const measureLabel2 = document.getElementById('measureLabel2');
    const historyTableBody = document.getElementById('historyTableBody');
    const historyEmpty = document.getElementById('historyEmpty');
    const historyCount = document.getElementById('historyCount');
    if (!measureBtn2 || !historyTableBody) return;

    let selectedRowId = null;
    let isReading = false;
    let rowSeq = 1;
    const rows = {}; // id -> row data object
    let readSampleGateEnabled = false;

    function hasLightAndDark() {
      const kinds = Object.keys(rows).map(function (id) { return rows[id].kind; });
      return kinds.indexOf('light') !== -1 && kinds.indexOf('dark') !== -1;
    }

    function refreshReadSampleGate() {
      const selectedKind = selectedRowId && rows[selectedRowId] ? rows[selectedRowId].kind : null;
      const specialRowSelected = selectedKind === 'light' || selectedKind === 'dark';
      const lightDarkGate = readSampleGateEnabled && !hasLightAndDark();
      const gated = lightDarkGate || specialRowSelected;
      measureBtn2.disabled = gated;
      measureBtn2.style.opacity = gated ? '0.5' : '';
    }

    function selectRow(id) {
      selectedRowId = (selectedRowId === id) ? null : id;
      historyTableBody.querySelectorAll('tr[data-row-id]').forEach(function (tr) {
        tr.classList.toggle('bg-success-bg', tr.dataset.rowId === selectedRowId);
      });
      updateButtonLabel();
      refreshReadSampleGate();
      if (window.updateSpecialReadButtonsForSelection) {
        const selectedKind = selectedRowId && rows[selectedRowId] ? rows[selectedRowId].kind : null;
        window.updateSpecialReadButtonsForSelection(selectedKind);
      }
    }

    // Read Sample doubles as re-read, but ONLY for a selected "sample"
    // kind row -- a selected Light/Dark row must be redone via its own
    // Read Light / Read Dark button instead (see refreshReadSampleGate,
    // which disables Read Sample entirely in that case).
    function updateButtonLabel() {
      if (!measureLabel2) return;
      const selectedKind = selectedRowId && rows[selectedRowId] ? rows[selectedRowId].kind : null;
      const isSpecialSelection = selectedKind === 'light' || selectedKind === 'dark';
      measureLabel2.textContent = (selectedRowId && !isSpecialSelection) ? 'Re-read Sample' : 'Read Sample';
    }

    // true = gate this button behind "LT and DR rows both present" (new
    // standard flow); false = no gate, always enabled (existing standard flow)
    window.setReadSampleButtonState = function (requiresLightDarkGate) {
      readSampleGateEnabled = requiresLightDarkGate;
      refreshReadSampleGate();
    };

    function currentThreshold() {
      return wizardStandard.stdDe ? parseFloat(wizardStandard.stdDe) : 1.00;
    }

    // real agent call -- POSTs the session's standard Lab to
    // /measure/sample, agent measures the physical sample under the
    // aperture and returns its own Lab (sci) plus CIEDE2000 deltas
    // computed server-side in local_agent.py's delta_e_2000().
    function measureSampleFromAgent() {
      if (!wizardStandard.raw || wizardStandard.raw.raw_l === null || wizardStandard.standardA === null || wizardStandard.standardB === null) {
        return Promise.reject(new Error('Missing standard Lab values — cannot measure sample.'));
      }
      const standard = { L: wizardStandard.raw.raw_l, a: wizardStandard.standardA, b: wizardStandard.standardB };

      return measureSample(standard)
        .then(function (data) {
          if (!data.ok) throw new Error(data.error || 'Measurement failed');
          return data; // { ok, sci: {L,a,b,C,h}, deltas: {dL,da,db,dC,dH,de00}, sce? }
        });
    }

    // Our stored/exported color convention is a plain 6-digit #RRGGBB --
    // no alpha channel (previously #AARRGGBB, but alpha was always fully
    // opaque so it carried no information). Same string works directly
    // for CSS and for openpyxl (see samples_record.py's export fill).
    function toCssBackgroundColor(hex6) {
      return '#' + (hex6 || '').replace('#', '');
    }

    // picks white text on dark backgrounds, dark text on light backgrounds
    function textColorForHex(hex6) {
      const v = (hex6 || '').replace('#', '');
      const r = parseInt(v.slice(0, 2), 16);
      const g = parseInt(v.slice(2, 4), 16);
      const b = parseInt(v.slice(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.6 ? '#18181b' : '#ffffff';
    }

    function formatDateTime(d) {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yy = String(d.getFullYear()).slice(-2);
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return mm + '/' + dd + '/' + yy + ' - ' + hh + ':' + min;
    }

    // returns a Promise<row> -- the caller (captureReading /
    // captureSpecialReading) awaits it, since the actual measurement now
    // requires a real round-trip to the agent instead of an instant mock.
    function makeRow(kind, name) {
      return measureSampleFromAgent().then(function (data) {
        const sci = data.sci;     // { L, a, b, C, h } -- sample's own absolute reading
        const d = data.deltas;    // { dL, da, db, dC, dH, de00 }
        const passed = d.de00 <= currentThreshold();

        return {
          id: 'row' + (rowSeq++),
          kind: kind, // 'light' | 'dark' | 'sample'
          name: name,
                  bag: '',
          colorOffset: getColorOffset(d.dL, d.da, d.db, wizardStandard.standardA, wizardStandard.standardB),
          colorSimulation: getColorSimulation(sci.L, sci.a, sci.b),
          dateTime: formatDateTime(new Date()),
          remarks: '',
          de: d.de00, L: sci.L, C: sci.C, h: sci.h, a: sci.a, b: sci.b,
          dL: d.dL, dC: d.dC, dH: d.dH, da: d.da, db: d.db,
          passed: passed,
        };
      });
    }

    function renderRow(row) {
      const jClass = row.passed ? 'text-success' : 'text-danger';
      const selectedCls = row.id === selectedRowId ? ' bg-success-bg' : '';
      return '<tr data-row-id="' + row.id + '" data-kind="' + row.kind + '" data-sample-name="' + row.name + '"'
        + ' data-da="' + row.da + '" data-db="' + row.db + '" data-judgement="' + (row.passed ? 'pass' : 'fail') + '"'
        + ' class="cursor-pointer hover:bg-accent border-b border-border' + selectedCls + '">'
        + '<td class="py-[7px] px-2.5 text-center"><button type="button" data-action="delete" title="Delete this reading" class="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:bg-danger-bg hover:text-danger cursor-pointer"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg></button></td>'
        + '<td class="py-[7px] px-2.5 whitespace-nowrap" style="background:' + toCssBackgroundColor(row.colorSimulation) + '; color:' + textColorForHex(row.colorSimulation) + ';"><span class="font-mono text-sm font-semibold">' + row.colorSimulation + '</span></td>'
        + '<td class="py-[7px] px-2.5 font-mono text-sm whitespace-nowrap">' + row.dateTime + '</td>'
        + '<td class="py-[7px] px-2.5" data-action="lotNumber" tabindex="0"><span class="lot-number-display font-mono text-sm font-semibold cursor-text underline decoration-dotted">' + row.name + '</span></td>'
        + '<td class="py-[7px] px-2.5" data-action="bag" tabindex="0"><span class="bag-display font-mono text-sm cursor-text underline decoration-dotted">' + (row.bag ? row.bag : '<span class="text-muted-foreground italic">Click to add…</span>') + '</span></td>'
        + '<td class="py-[7px] px-2.5 font-mono text-sm">' + row.de.toFixed(2) + '</td>'
        + '<td class="py-[7px] px-2.5 font-mono text-sm">' + row.L.toFixed(2) + '</td>'
        + '<td class="py-[7px] px-2.5 font-mono text-sm">' + row.C.toFixed(2) + '</td>'
        + '<td class="py-[7px] px-2.5 font-mono text-sm">' + row.h.toFixed(2) + '</td>'
        + '<td class="py-[7px] px-2.5 font-mono text-sm">' + row.a.toFixed(2) + '</td>'
        + '<td class="py-[7px] px-2.5 font-mono text-sm">' + row.b.toFixed(2) + '</td>'
        + '<td class="py-[7px] px-2.5 font-mono text-sm">' + row.dL.toFixed(2) + '</td>'
        + '<td class="py-[7px] px-2.5 font-mono text-sm">' + row.dC.toFixed(2) + '</td>'
        + '<td class="py-[7px] px-2.5 font-mono text-sm">' + row.dH.toFixed(2) + '</td>'
        + '<td class="py-[7px] px-2.5 font-mono text-sm">' + row.da.toFixed(2) + '</td>'
        + '<td class="py-[7px] px-2.5 font-mono text-sm">' + row.db.toFixed(2) + '</td>'
        + '<td class="py-[7px] px-2.5 text-sm">' + row.colorOffset + '</td>'
        + '<td class="py-[7px] px-2.5 text-sm font-bold ' + jClass + '">' + (row.passed ? 'Pass' : 'Fail') + '</td>'
        + '<td class="py-[7px] px-2.5" data-action="remarks" tabindex="0">' + (row.remarks ? row.remarks : '<span class="text-muted-foreground italic">Click to add…</span>') + '</td>'
        + '</tr>';
    }

    function renderAll() {
      const ids = Object.keys(rows);
      historyTableBody.innerHTML = ids.map(function (id) { return renderRow(rows[id]); }).join('');
      if (historyEmpty) historyEmpty.style.display = ids.length ? 'none' : 'flex';
      if (historyCount) historyCount.textContent = ids.length + ' Sample' + (ids.length === 1 ? '' : 's');
      renderScatter();
      if (window.refreshFinishReadingState) window.refreshFinishReadingState();
      refreshReadSampleGate();
    }

    historyTableBody.addEventListener('click', function (e) {
      const deleteBtn = e.target.closest('[data-action="delete"]');
      if (deleteBtn) {
        e.stopPropagation();
        const tr = deleteBtn.closest('tr[data-row-id]');
        const id = tr.dataset.rowId;
        const proceed = window.confirm('Delete "' + rows[id].name + '"? This cannot be undone.');
        if (!proceed) return;
        const deletedKind = rows[id].kind;
        delete rows[id];
        if (selectedRowId === id) {
          selectedRowId = null;
          updateButtonLabel();
          if (window.updateSpecialReadButtonsForSelection) window.updateSpecialReadButtonsForSelection(null);
        }
        if (window.reenableSpecialReadButton) window.reenableSpecialReadButton(deletedKind);
        renderAll();
        return;
      }

      const lotCell = e.target.closest('[data-action="lotNumber"]');
      if (lotCell && !lotCell.querySelector('input')) {
        e.stopPropagation();
        makeCellEditable(lotCell, lotCell.closest('tr[data-row-id]').dataset.rowId, 'lotNumber');
        return;
      }

      const bagCell = e.target.closest('[data-action="bag"]');
      if (bagCell && !bagCell.querySelector('input')) {
        e.stopPropagation();
        makeCellEditable(bagCell, bagCell.closest('tr[data-row-id]').dataset.rowId, 'bag');
        return;
      }

      const remarksCell = e.target.closest('[data-action="remarks"]');
      if (remarksCell && !remarksCell.querySelector('input')) {
        e.stopPropagation();
        makeCellEditable(remarksCell, remarksCell.closest('tr[data-row-id]').dataset.rowId, 'remarks');
        return;
      }

      if (isEditingLotNumber) return;
      const row = e.target.closest('tr[data-row-id]');
      if (row) selectRow(row.dataset.rowId);
    });

    document.addEventListener('click', function (e) {
      if (!selectedRowId) return;
      if (historyTableBody.contains(e.target)) return;
      selectedRowId = null;
      updateButtonLabel();
      if (window.updateSpecialReadButtonsForSelection) window.updateSpecialReadButtonsForSelection(null);
      renderAll();
    });

    let isEditingLotNumber = false;

    // ---- Tab-cycling between editable cells: Lot -> Bag -> Remarks ->
    // bin icon (of the NEXT row) -> Lot (next row)... Shift+Tab reverses.
    // Scoped entirely to elements inside this table -- Tab elsewhere on
    // the page is completely unaffected. ----
    const FIELD_ORDER = ['lotNumber', 'bag', 'remarks'];

    function focusAdjacentField(rowId, field, reverse) {
      const tr = historyTableBody.querySelector('tr[data-row-id="' + rowId + '"]');
      if (!tr) return;
      const idx = FIELD_ORDER.indexOf(field);

      if (!reverse) {
        if (idx < FIELD_ORDER.length - 1) {
          const nextField = FIELD_ORDER[idx + 1];
          const nextCell = tr.querySelector('[data-action="' + nextField + '"]');
          if (nextCell) makeCellEditable(nextCell, rowId, nextField);
          return;
        }
        // last field (remarks) -> bin icon of the NEXT row
        const allRows = Array.from(historyTableBody.querySelectorAll('tr[data-row-id]'));
        const pos = allRows.findIndex(function (r) { return r.dataset.rowId === rowId; });
        const nextRow = allRows[pos + 1];
        if (nextRow) {
          const delBtn = nextRow.querySelector('[data-action="delete"]');
          if (delBtn) delBtn.focus();
        }
      } else {
        if (idx > 0) {
          const prevField = FIELD_ORDER[idx - 1];
          const prevCell = tr.querySelector('[data-action="' + prevField + '"]');
          if (prevCell) makeCellEditable(prevCell, rowId, prevField);
          return;
        }
        // first field (lotNumber) -> bin icon of this same row (bin
        // sits before Lot in the row's column order)
        const delBtn = tr.querySelector('[data-action="delete"]');
        if (delBtn) delBtn.focus();
      }
    }

    // Landing on a lot/bag/remarks cell via native Tab (e.g. forward
    // from the bin icon, or backward via Shift+Tab) drops straight into
    // edit mode, same as a click would.
    historyTableBody.addEventListener('focusin', function (e) {
      const cell = e.target.closest('[data-action="lotNumber"], [data-action="bag"], [data-action="remarks"]');
      if (!cell || cell !== e.target) return; // only react when the td itself was focused, not an input inside it
      if (cell.querySelector('input')) return;
      const tr = cell.closest('tr[data-row-id]');
      if (!tr) return;
      makeCellEditable(cell, tr.dataset.rowId, cell.dataset.action);
    });

    function makeCellEditable(cell, rowId, field) {
      const rowData = rows[rowId];
      if (!rowData) return;
      const currentVal = field === 'lotNumber' ? rowData.name : (field === 'bag' ? rowData.bag : rowData.remarks);
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentVal;
      input.className = 'w-full text-xs border border-ring rounded-md px-2 py-1 outline-none bg-card text-foreground';
      cell.innerHTML = '';
      cell.appendChild(input);
      input.focus();
      input.select();

      if (field === 'lotNumber') isEditingLotNumber = true;

      // Task 6.1: lot number input is always forced to uppercase as the
      // user types, so "lt sample" / "1234a" etc. auto-correct without
      // waiting for commit.
      if (field === 'lotNumber') {
        input.addEventListener('input', function () {
          const pos = input.selectionStart;
          input.value = input.value.toUpperCase();
          try { input.setSelectionRange(pos, pos); } catch (e) {}
        });
      }

    // Bag Number format is restricted to a fixed set of shapes:
    // 0, 00, 000, 0-0, 0-00, 00-00, 00-000, 000-000 -- anything else
    // (letters, extra hyphens, other digit-length pairings) is invalid.
    const BAG_NUMBER_RE = /^(\d{1,3}|\d{1}-\d{1}|\d{1}-\d{2}|\d{2}-\d{2}|\d{2}-\d{3}|\d{3}-\d{3})$/;

      // Task 1.1: duplicate lot/lot+bag checking no longer happens here
      // (per-keystroke/per-cell). A duplicate lot with no bag yet is
      // allowed temporarily while the user is still filling the row in
      // -- it only gets flagged once, at Finish Reading, by the single
      // validateLotBagUniqueness() function below. commit() here only
      // enforces FORMAT (prefix, lot shape, bag shape), not uniqueness.
      let hasCommitted = false;

      function commit() {
        if (hasCommitted) return;
        hasCommitted = true;

        const newVal = field === 'lotNumber' ? input.value.trim().toUpperCase() : input.value.trim();
        if (field === 'lotNumber') {
          const requiredPrefix = rowData.kind === 'light' ? 'LT ' : rowData.kind === 'dark' ? 'DR ' : null;
          if (requiredPrefix && !newVal.toUpperCase().startsWith(requiredPrefix)) {
            showToast('toastStack', 'The "' + requiredPrefix.trim() + '" prefix cannot be removed from this lot number.', 'error');
          } else if (!newVal || !window.isValidLotNumber(newVal, rowData.kind)) {
            showToast('toastStack', 'Invalid lot number format.', 'error');
          } else {
            rowData.name = newVal;
          }
          isEditingLotNumber = false;
        } else if (field === 'bag') {
          if (newVal && !BAG_NUMBER_RE.test(newVal)) {
            showToast('toastStack', 'Invalid Bag Number format — use e.g. 0, 00, 000, 0-0, 0-00, 00-00, 00-000, or 000-000.', 'error');
          } else {
            rowData.bag = newVal;
          }
        } else {
          rowData.remarks = newVal;
        }
        renderAll();
      }

      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { input.blur(); return; }
        if (e.key === 'Escape') { input.value = currentVal; if (field === 'lotNumber') isEditingLotNumber = false; hasCommitted = true; input.blur(); return; }
        if (e.key === 'Tab') {
          e.preventDefault();
          const reverse = e.shiftKey;
          commit();
          focusAdjacentField(rowId, field, reverse);
        }
      });
      input.addEventListener('blur', commit);
    }

    function captureReading() {
      if (isReading || window.isAnyReadingInProgress()) {
        showToast('toastStack', 'Please wait until the current reading finishes.', 'info');
        return;
      }
      const preSelectedKind = selectedRowId && rows[selectedRowId] ? rows[selectedRowId].kind : null;
      if (preSelectedKind === 'light' || preSelectedKind === 'dark') {
        showToast('toastStack', 'Use the Read Light / Read Dark button to redo this reading.', 'info');
        return;
      }
      if (readSampleGateEnabled && !hasLightAndDark()) {
        showToast('toastStack', 'Please click Read Light and Read Dark button to capture both samples first.', 'error');
        return;
      }
      const selectedRow = selectedRowId ? rows[selectedRowId] : null;
      const wasReread = !!selectedRow;
      const kind = wasReread ? rows[selectedRowId].kind : 'sample';
      const name = wasReread ? rows[selectedRowId].name : window.nextDefaultSampleName();

      isReading = true;
      window.setReadingInProgress(true);
      measureBtn2.disabled = true;
      showToast('toastStack', wasReread ? 'Re-reading sample…' : 'Reading sample…', 'info');

      makeRow(kind, name)
        .then(function (newRowData) {
          if (wasReread) {
            rows[selectedRowId] = Object.assign(newRowData, { id: selectedRowId, remarks: rows[selectedRowId].remarks, bag: rows[selectedRowId].bag });
            showToast('toastStack', name + ' re-read successfully.', 'success');
            selectedRowId = null;
            updateButtonLabel();
            if (window.updateSpecialReadButtonsForSelection) window.updateSpecialReadButtonsForSelection(null);
          } else {
            rows[newRowData.id] = newRowData;
            showToast('toastStack', newRowData.name + ' captured successfully.', 'success');
          }
          renderAll();
        })
        .catch(function (err) {
          showToast('toastStack', 'Measurement failed — is the agent running?', 'error');
          console.error(err);
        })
        .finally(function () {
          isReading = false;
          window.setReadingInProgress(false);
          measureBtn2.disabled = false;
        });
    }

    measureBtn2.addEventListener('click', captureReading);

    // Task 2 (selection-based redo): re-measures the currently selected
    // Light/Dark row in place -- same overwrite pattern captureReading()
    // already uses for its own re-read path, just triggered from the
    // Read Light / Read Dark buttons (or F5) instead of Read Sample.
    window.rereadSelectedSpecialRow = function (kind) {
      if (isReading || window.isAnyReadingInProgress()) {
        showToast('toastStack', 'Please wait until the current reading finishes.', 'info');
        return;
      }
      if (!selectedRowId || !rows[selectedRowId] || rows[selectedRowId].kind !== kind) return;

      const id = selectedRowId;
      const name = rows[id].name;

      isReading = true;
      window.setReadingInProgress(true);
      showToast('toastStack', 'Re-reading ' + kind + '…', 'info');

      makeRow(kind, name)
        .then(function (newRowData) {
          rows[id] = Object.assign(newRowData, { id: id, remarks: rows[id].remarks, bag: rows[id].bag });
          showToast('toastStack', name + ' re-read successfully.', 'success');
          selectedRowId = null;
          updateButtonLabel();
          if (window.updateSpecialReadButtonsForSelection) window.updateSpecialReadButtonsForSelection(null);
          renderAll();
        })
        .catch(function (err) {
          showToast('toastStack', 'Measurement failed — is the agent running?', 'error');
          console.error(err);
        })
        .finally(function () {
          isReading = false;
          window.setReadingInProgress(false);
        });
    };

    // Task 3/4: Spacebar triggers the same action as clicking Read Sample
    // (read or re-read) -- excludes Read Light / Read Dark, which remain
    // click-only one-shot buttons. Only fires once a standard/sample chip
    // is actually populated (sampleRefChipName has content).
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'Space') return;
      const sampleRefChipName = document.getElementById('sampleRefChipName');
      if (!sampleRefChipName || !sampleRefChipName.textContent.trim()) return;
      if (isEditingLotNumber) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      e.preventDefault();
      captureReading();
    });

    window.captureSpecialReading = function (kind) {
      window.setReadingInProgress(true);
      measureBtn2.disabled = true;
      const prefix = kind === 'light' ? 'LT ' : 'DR ';
      const name = prefix + window.nextDefaultSampleName();
      showToast('toastStack', 'Reading ' + kind + '…', 'info');

      makeRow(kind, name)
        .then(function (newRow) {
          rows[newRow.id] = newRow;
          renderAll(); // re-applies the correct gated/ungated disabled state
          showToast('toastStack', name + ' captured successfully.', 'success');
        })
        .catch(function (err) {
          showToast('toastStack', 'Measurement failed — is the agent running?', 'error');
          console.error(err);
        })
        .finally(function () {
          window.setReadingInProgress(false);
        });
    };

    window.clearSelectedSampleRow = function () {
      selectedRowId = null;
      updateButtonLabel();
      if (window.updateSpecialReadButtonsForSelection) window.updateSpecialReadButtonsForSelection(null);
    };

    window.resetSampleSession = function () {
      Object.keys(rows).forEach(function (id) { delete rows[id]; });
      if (window.resetSampleCounter) window.resetSampleCounter();
      selectedRowId = null;
      updateButtonLabel();
      if (window.updateSpecialReadButtonsForSelection) window.updateSpecialReadButtonsForSelection(null);
      renderAll();
    };

    // Task 18: block Finish Reading while any row still holds an
    // unrenamed/invalid lot number (e.g. the default "Sample N" name).
    window.hasInvalidLotNumbers = function () {
      return Object.keys(rows).some(function (id) {
        return !window.isValidLotNumber(rows[id].name, rows[id].kind);
      });
    };

    // Task 8: serialize every captured row into the payload shape the
    // save_sample_readings endpoint expects.
    window.getSampleReadingsPayload = function () {
      return Object.keys(rows).map(function (id) {
        const r = rows[id];
        return {
          name: r.name, bag: r.bag, kind: r.kind,
          colorSimulation: r.colorSimulation, colorOffset: r.colorOffset,
          remarks: r.remarks,
          de: r.de, L: r.L, C: r.C, h: r.h, a: r.a, b: r.b,
          dL: r.dL, dC: r.dC, dH: r.dH, da: r.da, db: r.db,
        };
      });
    };

    // Task 1.4: batch server-side existence check, run once at Finish
    // Reading time (not per-keystroke). Checks every captured row's
    // lot+bag against the DB under the current standard in one pass.
    // Resolves to an array of conflict messages (empty = all clear).
    window.checkAllLotsExistOnServer = function () {
      if (!wizardStandard.standardsId) return Promise.resolve([]);
      const ids = Object.keys(rows);
      if (!ids.length) return Promise.resolve([]);

      return Promise.all(ids.map(function (id) {
        const r = rows[id];
        const params = new URLSearchParams({
          standards_id: wizardStandard.standardsId,
          name: r.name,
          bag: r.bag || '',
        });
        return fetch(urls.checkLotExists + '?' + params.toString(), {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            return data.exists ? (data.message || ('Lot "' + r.name + '" is already saved under this standard.')) : null;
          })
          .catch(function () {
            // non-fatal per-row -- surfaced as a general network warning
            // by the caller if ALL checks fail; individual fetch errors
            // here don't block save on their own
            return null;
          });
      })).then(function (results) {
        return results.filter(Boolean);
      });
    };

    // Task 1.1: single source of truth for lot/bag uniqueness, run only
    // at Finish Reading (not per-keystroke). Duplicate lots without a
    // bag are allowed while editing; this is where they finally get
    // flagged. Returns an array of error messages (empty = all clear).
    window.validateLotBagUniqueness = function () {
      const errors = [];
      const nameCounts = {};
      const pairCounts = {};

      Object.keys(rows).forEach(function (id) {
        const nameKey = rows[id].name.trim().toLowerCase();
        const pairKey = nameKey + '||' + (rows[id].bag || '').trim().toLowerCase();
        nameCounts[nameKey] = (nameCounts[nameKey] || 0) + 1;
        pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
      });

      Object.keys(rows).forEach(function (id) {
        const row = rows[id];
        const nameKey = row.name.trim().toLowerCase();
        const pairKey = nameKey + '||' + (row.bag || '').trim().toLowerCase();

        if (nameCounts[nameKey] > 1 && !row.bag) {
          errors.push('Lot "' + row.name + '" repeats — add a Bag Number to distinguish it.');
        } else if (pairCounts[pairKey] > 1) {
          errors.push('Lot "' + row.name + '"' + (row.bag ? ' + Bag "' + row.bag + '"' : '') + ' combination is duplicated in the table.');
        }
      });

      return errors;
    };

    renderAll();
  })();

  /* ---- Task 5: lot number format rules + default naming ---- */
  (function lotNumberFormat() {
    // Valid formats: 4 digits + 1 or 2 letters (e.g. "1062Y" or "7382AO"),
    // or "DR "/"LT " prefix + same
    const LOT_NUMBER_RE = /^(DR |LT )?\d{4}[A-Za-z]{1,2}$/;

    // Task 4: for a brand-new standard ONLY, Light/Dark reference rows
    // may alternatively be named "LT SAMPLE 0.00%" / "DR SAMPLE 0.00%"
    // instead of a lot-number shape. Existing standards must still use
    // the normal LOT_NUMBER_RE format above.
    const SAMPLE_LOT_RE = /^(LT|DR)\s+SAMPLE$/i;

    // kind: 'light' | 'dark' | 'sample' -- the SAMPLE_LOT_RE alternative
    // only applies to light/dark rows, and only while the wizard is in
    // the new-standard flow (window.currentStandardFlowIsNew).
    window.isValidLotNumber = function (name, kind) {
      const v = (name || '').trim();
      if (LOT_NUMBER_RE.test(v)) return true;
      if ((kind === 'light' || kind === 'dark') && window.currentStandardFlowIsNew) {
        return SAMPLE_LOT_RE.test(v);
      }
      return false;
    };

    let sampleCounter = 1;
    window.nextDefaultSampleName = function () {
      return 'Sample ' + (sampleCounter++);
    };
    window.resetSampleCounter = function () {
      sampleCounter = 1;
    };
  })();

  (function backToStep2Guard() {
    const backFromSampleBtn = document.getElementById('backFromSampleBtn');
    const historyTableBody = document.getElementById('historyTableBody');
    if (!backFromSampleBtn) return;

    backFromSampleBtn.addEventListener('click', function () {
      const rowCount = historyTableBody ? historyTableBody.querySelectorAll('tr').length : 0;
      if (rowCount > 0) {
        const proceed = window.confirm('Changing what you\'re doing will discard all ' + rowCount + ' reading(s) captured in this session. This cannot be undone. Proceed anyway?');
        if (!proceed) return;
      }

      // Task 21: fully reset Step 3 back to its default locked state
      if (window.resetSampleSession) window.resetSampleSession();
      wizardStandard.productCode = null;
      wizardStandard.standardName = null;
      wizardStandard.stdDe = null;
      wizardStandard.standardsId = null; // Task 8 — clear so a stale ID can't leak into a new session
      wizardStandard.raw = null;
      wizardStandard.standardA = null;
      wizardStandard.standardB = null;
      wizardStandard.savedToDb = false;
      wizardStandard.samplesSavedToDb = false;

      const step3LockOverlay = document.getElementById('step3LockOverlay');
      const step3LockedContent = document.getElementById('step3LockedContent');
      if (step3LockOverlay) step3LockOverlay.style.display = 'flex';
      if (step3LockedContent) step3LockedContent.classList.add('opacity-40', 'pointer-events-none', 'select-none');

      if (window.setFinishReadingMode) window.setFinishReadingMode(false);
      const finishSessionBtn = document.getElementById('finishSessionBtn');
      if (finishSessionBtn) finishSessionBtn.disabled = true;

      completedSteps.delete(3);
      currentStep = 2;
      renderStepper();

      if (window.resetStep2ToDefault) window.resetStep2ToDefault();

      scrollToNextCard(document.getElementById('stepPanel2'));
    });
  })();

  (function finishReading() {
    const finishSessionBtn = document.getElementById('finishSessionBtn');
    const historyTableBody = document.getElementById('historyTableBody');
    const step3Caption = document.getElementById('step3Caption');
    const DEFAULT_STEP3_CAPTION = step3Caption ? step3Caption.textContent : '';
    const LIGHT_DARK_STEP3_CAPTION = 'Read light or dark samples first before proceeding to sample';
    if (!finishSessionBtn) return;

    // Task 4/5: default flow (i) needs >=3 samples; flow (j) instead needs
    // exactly one light, one dark, and one regular sample present.
    finishSessionBtn.disabled = true;
    let finishRequiresLightDark = false;
    window.setFinishReadingMode = function (requiresLightDark) {
      finishRequiresLightDark = requiresLightDark;
      window.refreshFinishReadingState();
    };
    window.refreshFinishReadingState = function () {
      if (!historyTableBody) { finishSessionBtn.disabled = true; return; }
      const rows = historyTableBody.querySelectorAll('tr[data-row-id]');
      if (finishRequiresLightDark) {
        let hasLight = false, hasDark = false, hasSample = false;
        rows.forEach(function (tr) {
          const kind = tr.dataset.kind; // 'light' | 'dark' | 'sample'
          if (kind === 'light') hasLight = true;
          else if (kind === 'dark') hasDark = true;
          else if (kind === 'sample') hasSample = true;
        });
        finishSessionBtn.disabled = !(hasLight && hasDark && hasSample);
        if (step3Caption) {
          step3Caption.textContent = (hasLight && hasDark) ? DEFAULT_STEP3_CAPTION : LIGHT_DARK_STEP3_CAPTION;
        }
        // point 3: Read Sample itself is gated the same way -- kept in
        // sync here since finishRequiresLightDark and the Read Sample
        // gate both only apply to the "new standard" flow.
        if (window.refreshReadSampleGateIfExposed) window.refreshReadSampleGateIfExposed();
      } else {
        finishSessionBtn.disabled = rows.length < 1;
        if (step3Caption) step3Caption.textContent = DEFAULT_STEP3_CAPTION;
      }
    };

    finishSessionBtn.addEventListener('click', function () {
      // Immediate disable, before any validation/network even runs --
      // the very first line of defense against a double-click firing
      // two save requests back to back.
      finishSessionBtn.disabled = true;

      if (!wizardStandard.productCode || !wizardStandard.standardName) {
        showToast('toastStack', 'Missing standard data — cannot finish reading.', 'error');
        finishSessionBtn.disabled = false;
        return;
      }

      if (window.hasInvalidLotNumbers && window.hasInvalidLotNumbers()) {
        showToast('toastStack', 'Rename lot number samples before saving.', 'error');
        finishSessionBtn.disabled = false;
        return;
      }

      if (window.validateLotBagUniqueness) {
        const uniquenessErrors = window.validateLotBagUniqueness();
        if (uniquenessErrors.length) {
          showToast('toastStack', uniquenessErrors[0], 'error');
          finishSessionBtn.disabled = false;
          return;
        }
      }

      showToast('toastStack', 'Verifying lot numbers against existing records…', 'info');

      Promise.resolve(window.checkAllLotsExistOnServer ? window.checkAllLotsExistOnServer() : [])
        .then(function (conflicts) {
          if (conflicts.length) {
            showToast('toastStack', conflicts[0], 'error');
            finishSessionBtn.disabled = false;
            return;
          }
          proceedWithSave();
        })
        .catch(function () {
          showToast('toastStack', 'Could not verify lot numbers, please try again.', 'error');
          finishSessionBtn.disabled = false;
        });
      return;

      function proceedWithSave() {

      function saveSampleReadings(standardsId) {
        const rows = window.getSampleReadingsPayload ? window.getSampleReadingsPayload() : [];
        if (!rows.length) {
          showToast('toastStack', 'No sample readings to save.', 'error');
          finishSessionBtn.disabled = false;
          return;
        }

        fetch(urls.saveSampleReadings, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          body: new URLSearchParams({
            standards_id: standardsId,
            rows: JSON.stringify(rows),
            is_new_standard: window.currentStandardFlowIsNew ? '1' : '0',
            csrfmiddlewaretoken: getCsrfToken(),
          }),
        })
          .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
          .then(function (result) {
            showToast('toastStack', result.data.message, result.data.tone || (result.ok ? 'success' : 'error'));
            if (result.ok) {
              wizardStandard.samplesSavedToDb = true;
              completedSteps.add(1); completedSteps.add(2); completedSteps.add(3);
              renderStepper();
              // Keep the button disabled through the reload -- prevents
              // any further click from resubmitting already-saved data
              // during the 3s window, and a full reload clears every
              // bit of in-memory wizard state so there's nothing stale
              // left to accidentally resave afterward either.
              showToast('toastStack', 'Reloading in a few seconds…', 'info');
              setTimeout(function () {
                window.location.reload();
              }, 3000);
              return;
            }
            finishSessionBtn.disabled = false;
          })
          .catch(function () {
            showToast('toastStack', 'Network error — please try again.', 'error');
            finishSessionBtn.disabled = false;
          });
      }

      // Existing standard was already saved to the DB earlier -- only the
      // sample readings need to be persisted here.
      if (wizardStandard.savedToDb) {
        saveSampleReadings(wizardStandard.standardsId);
        return;
      }

      if (!wizardStandard.raw) {
        showToast('toastStack', 'Missing standard raw values — cannot finish reading.', 'error');
        finishSessionBtn.disabled = false;
        return;
      }

      fetch(urls.saveStandard, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: new URLSearchParams({
          product_code: wizardStandard.productCode,
          standard_name: wizardStandard.standardName,
          std_delta_e: wizardStandard.stdDe,
          raw_l: wizardStandard.raw.raw_l,
          raw_a: wizardStandard.raw.raw_a,
          raw_b: wizardStandard.raw.raw_b,
          raw_c: wizardStandard.raw.raw_c,
          raw_h: wizardStandard.raw.raw_h,
          csrfmiddlewaretoken: getCsrfToken(),
        }),
      })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) {
          showToast('toastStack', result.data.message, result.data.tone || 'error');
          finishSessionBtn.disabled = false;
          return;
        }
        wizardStandard.savedToDb = true;
        wizardStandard.standardsId = result.data.standards_id;
        // finishSessionBtn stays disabled here -- saveSampleReadings()
        // below handles the button's disabled state for the rest of
        // this flow (either re-enabling on failure or keeping it
        // locked through the reload on success).
        saveSampleReadings(result.data.standards_id);
      })
      .catch(function () {
        showToast('toastStack', 'Network error — please try again.', 'error');
        finishSessionBtn.disabled = false;
      });

      } // end proceedWithSave
    });
  })();
}