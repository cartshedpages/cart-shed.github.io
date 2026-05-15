// ===== STATE =====
var alarms = [];
var muted = false;
var audioCtx = null;
var toneOscillator = null;
var testAudio = null;
var audio = null;
var playingAlarmId = null;
var editingAlarmId = null;
var pendingAlarmUrl = null;
var lastAlarmedMinute = -1;
var beepInterval = null;
var beepCount = 0;
var beepAudio = null;
var toneLoopInterval = null;
var lastInteraction = Date.now();
var userHasInteracted = false;
var soundPlaying = false;
var isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// ===== COOKIE UTILITIES =====
function getCookie(name) {
  var cookies = document.cookie.split(";");
  for (var i = 0; i < cookies.length; i++) {
    var cookie = cookies[i].trim();
    if (cookie.indexOf(name + "=") === 0) {
      return decodeURIComponent(cookie.substring(name.length + 1));
    }
  }
  return null;
}

function setCookie(name, value, days) {
  if (days === undefined) days = 365;
  var date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  var expires = "expires=" + date.toUTCString();
  document.cookie =
    name +
    "=" +
    encodeURIComponent(value) +
    "; " +
    expires +
    "; path=/; SameSite=Lax";
}

// ===== DOM ELEMENTS =====
var clockEl = document.getElementById("clock");
var nextAlarmEl = document.getElementById("nextAlarm");
var alarmsListEl = document.getElementById("alarmsList");
var unlockStatusEl = document.getElementById("unlockStatus");
var alarmTimeEl = document.getElementById("alarmTime");
var daySelectEl = document.getElementById("daySelect");
var addAlarmBtn = document.getElementById("addAlarm");
var cancelAlarmBtn = document.getElementById("cancelAlarm");
var showAddAlarmBtn = document.getElementById("showAddAlarm");
var alarmFormContainer = document.getElementById("alarmFormContainer");
var muteBtn = document.getElementById("muteBtn");
var muteIndicatorEl = document.getElementById("muteIndicator");
var playStopBtn = document.getElementById("playStopBtn");
var soundSelectEl = document.getElementById("soundSelect");
var checkSoundBtn = document.getElementById("checkSoundBtn");
var overlayEl = document.getElementById("overlay");

// ===== INITIALIZE =====
function init() {
  loadAlarms();
  loadMuteState();
  updateClock();
  updateNextAlarm();
  renderAlarms();
  populateSoundSelect();

  setInterval(tick, 1000);
  setInterval(checkAlarms, 1000);
  setInterval(checkInactivity, 1000);
  setInterval(updateNextAlarm, 60000);

  addAlarmBtn.addEventListener("click", addAlarm);
  cancelAlarmBtn.addEventListener("click", hideAlarmForm);
  showAddAlarmBtn.addEventListener("click", showAlarmForm);
  muteBtn.addEventListener("click", toggleMute);
  playStopBtn.addEventListener("click", togglePlayStop);

  // Show Check sound button only on iOS
  if (checkSoundBtn) {
    if (isIOS) {
      checkSoundBtn.classList.remove("ios-only");
    }
    checkSoundBtn.addEventListener("click", checkSound);
  }

  // Overlay click handler
  if (overlayEl) {
    overlayEl.addEventListener("click", function () {
      handleOverlayClick();
    });
    overlayEl.addEventListener("touchstart", function (e) {
      e.preventDefault();
      handleOverlayClick();
    });
  }

  alarmFormContainer.classList.remove("visible");

  var unlockInteraction = function () {
    userHasInteracted = true;
    updateUnlockStatus();

    // Initialize AudioContext on first user gesture for iOS compatibility
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.error("Web Audio API not supported:", e);
      }
    }

    if (pendingAlarmUrl) {
      if (isIOS) {
        handleIOSPendingAlarm();
      } else {
        handleNonIOSPendingAlarm();
      }
      return;
    }
  };

  document.addEventListener("click", function () {
    lastInteraction = Date.now();
    unlockInteraction();
  });
  document.addEventListener("keypress", function () {
    lastInteraction = Date.now();
    unlockInteraction();
  });
  document.addEventListener("scroll", function () {
    lastInteraction = Date.now();
    unlockInteraction();
  });
  document.addEventListener("mousemove", function () {
    lastInteraction = Date.now();
    unlockInteraction();
  });
}

function updateUnlockStatus() {
  unlockStatusEl.textContent = userHasInteracted ? "Autoplay unlocked" : "";
}

function showOverlay() {
  if (overlayEl) overlayEl.classList.add("visible");
}

function hideOverlay() {
  if (overlayEl) overlayEl.classList.remove("visible");
}

function handleOverlayClick() {
  // Remove dimmed class from body
  document.body.classList.remove("dimmed");

  // On iOS, if alarm is beeping, stop beeps and play stream
  if (isIOS && beepCount > 0 && beepCount < 60 && pendingAlarmUrl) {
    stopBeepLoop();
    playSoundIOS(pendingAlarmUrl);
    pendingAlarmUrl = null;
    unlockStatusEl.textContent = "";
  }

  // Hide overlay
  hideOverlay();

  // Update last interaction time
  lastInteraction = Date.now();
  userHasInteracted = true;
  updateUnlockStatus();
}

function checkSound() {
  if (!isIOS) return;

  // Play 2 beeps using Web Audio API to unlock audio context
  unlockStatusEl.textContent = "Sound checked - beeps ready";

  // Play first beep
  playSingleBeep();

  // Play second beep after interval
  setTimeout(function () {
    playSingleBeep();
    setTimeout(function () {
      unlockStatusEl.textContent = "";
    }, 2000);
  }, getBeepInterval());
}

function showAlarmForm() {
  alarmFormContainer.classList.add("visible");
}

function hideAlarmForm() {
  alarmFormContainer.classList.remove("visible");
  editingAlarmId = null;
}

function editAlarm(id) {
  var alarm = null;
  for (var i = 0; i < alarms.length; i++) {
    if (alarms[i].id === id) {
      alarm = alarms[i];
      break;
    }
  }
  if (!alarm) return;

  editingAlarmId = alarm.id;
  alarmTimeEl.value = alarm.time;

  var checkboxes = daySelectEl.querySelectorAll('input[type="checkbox"]');
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].checked = false;
  }

  for (var j = 0; j < alarm.days.length; j++) {
    var day = alarm.days[j];
    var checkbox = daySelectEl.querySelector(
      'input[type="checkbox"][value="' + day + '"]',
    );
    if (checkbox) checkbox.checked = true;
  }

  soundSelectEl.value = alarm.url;
  showAlarmForm();
}

// ===== CLOCK & INACTIVITY =====
function tick() {
  updateClock();
}

function updateClock() {
  var now = new Date();
  var timeString = now.toLocaleTimeString([], { hour12: false });
  var parts = timeString.split(":");
  clockEl.innerHTML =
    parts[0] +
    ":" +
    parts[1] +
    '<span class="clock-small">:' +
    parts[2] +
    "</span>";
}

function checkInactivity() {
  var elapsed = (Date.now() - lastInteraction) / 1000 / 60;
  if (elapsed > 15) {
    document.body.classList.add("dimmed");
    showOverlay();
  } else {
    document.body.classList.remove("dimmed");
    hideOverlay();
  }
}

// ===== MUTE =====
function toggleMute() {
  muted = !muted;
  saveMuteState();
  updateMuteDisplay();
  stopAllSound();
}

function updateMuteDisplay() {
  muteIndicatorEl.textContent = muted ? "ON" : "";
  muteBtn.textContent = muted ? "Unmute" : "Mute";
}

// ===== SOUND CONTROLS =====
function getSelectedSoundUrl() {
  return soundSelectEl.value;
}

function populateSoundSelect() {
  if (typeof RADIO_STATIONS !== "undefined") {
    for (var url in RADIO_STATIONS) {
      if (RADIO_STATIONS.hasOwnProperty(url)) {
        var option = document.createElement("option");
        option.value = url;
        option.textContent = RADIO_STATIONS[url];
        soundSelectEl.appendChild(option);
      }
    }
  }
}

function createAudio(url) {
  var a = new Audio(url);
  a.crossOrigin = "anonymous";
  return a;
}

function getBeepInterval() {
  // If BEEP_FREQUENCY is defined in radiostations.js, use it
  if (typeof BEEP_FREQUENCY !== "undefined") {
    return Math.max(100, Math.round(1000 / BEEP_FREQUENCY));
  }
  return 2000; // Default: 2 seconds
}

function getBeepFrequency(url) {
  // Map beep URLs to frequencies
  switch (url) {
    case "beep-high":
      return 1320; // High pitch
    case "beep":
      return 880; // Medium pitch (default)
    case "beep-low":
      return 440; // Low pitch
    default:
      return 880; // Default for tone, beep, data: URLs
  }
}

function stopAllSound() {
  stopBeepLoop();
  if (toneLoopInterval) {
    clearInterval(toneLoopInterval);
    toneLoopInterval = null;
  }
  if (testAudio) {
    testAudio.pause();
    testAudio = null;
  }
  if (audio) {
    audio.pause();
    audio = null;
  }
  if (toneOscillator) {
    toneOscillator.stop();
    toneOscillator = null;
  }
  if (beepAudio) {
    beepAudio.pause();
    beepAudio = null;
  }
  playingAlarmId = null;
  pendingAlarmUrl = null;
  soundPlaying = false;
  updatePlayStopButton();
  unlockStatusEl.textContent = "";
}

function updatePlayStopButton() {
  playStopBtn.textContent = soundPlaying ? "Stop Sound" : "Play sound";
}

function togglePlayStop() {
  if (soundPlaying) {
    stopAllSound();
  } else {
    var url;
    if (alarmFormContainer.classList.contains("visible")) {
      url = soundSelectEl.value;
    } else {
      var nextAlarm = getUpcomingAlarm();
      if (nextAlarm) url = nextAlarm.url;
    }
    if (url) {
      playingAlarmId = "manual";
      if (isIOS) {
        playSoundIOS(url);
      } else {
        playSoundNonIOS(url);
      }
    }
  }
}

function stopBeepLoop() {
  if (beepInterval) {
    clearInterval(beepInterval);
    clearTimeout(beepInterval);
    beepInterval = null;
    beepCount = 0;
  }
  if (toneOscillator) {
    toneOscillator.stop();
    toneOscillator = null;
  }
}

function playSingleBeep(frequency) {
  if (muted) return;

  // Default frequency is 880Hz (Beep)
  if (frequency === undefined) frequency = 880;

  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.error("Web Audio API not supported:", e);
      return;
    }
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(function () {});
  }

  if (toneOscillator) {
    toneOscillator.stop();
    toneOscillator = null;
  }

  toneOscillator = audioCtx.createOscillator();
  var gainNode = audioCtx.createGain();
  toneOscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  toneOscillator.frequency.value = frequency;
  toneOscillator.type = "sine";
  gainNode.gain.value = 0.3;
  toneOscillator.start();
  gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
}

// Get the upcoming alarm object
function getUpcomingAlarm() {
  var now = new Date();
  var currentTime = now.getHours() * 60 + now.getMinutes();
  var currentDay = now.getDay();

  var nextAlarm = null;
  var minDiff = Infinity;

  for (var i = 0; i < alarms.length; i++) {
    var alarm = alarms[i];
    if (!alarm.enabled) continue;

    var parts = alarm.time.split(":");
    var alarmTime = parseInt(parts[0]) * 60 + parseInt(parts[1]);

    for (var j = 0; j < alarm.days.length; j++) {
      var day = alarm.days[j];
      var daysUntil = (day - currentDay + 7) % 7;
      var totalMinutes = daysUntil * 1440 + (alarmTime - currentTime);
      if (totalMinutes < 0) totalMinutes += 7 * 1440;

      if (totalMinutes < minDiff) {
        minDiff = totalMinutes;
        nextAlarm = alarm;
      }
    }
  }
  return nextAlarm;
}

// ===== ALARMS =====
function addAlarm() {
  var time = alarmTimeEl.value;
  if (!time) return alert("Please set a time");

  var days = [];
  var checkboxes = daySelectEl.querySelectorAll(
    'input[type="checkbox"]:checked',
  );
  for (var i = 0; i < checkboxes.length; i++) {
    days.push(parseInt(checkboxes[i].value));
  }
  if (days.length === 0) return alert("Please select at least one day");

  var url = getSelectedSoundUrl();
  if (!url) return alert("Please select a sound");

  if (editingAlarmId) {
    for (var i = 0; i < alarms.length; i++) {
      if (alarms[i].id === editingAlarmId) {
        alarms[i] = {
          id: editingAlarmId,
          time: time,
          days: days,
          url: url,
          enabled: alarms[i].enabled !== undefined ? alarms[i].enabled : true,
        };
        break;
      }
    }
  } else {
    alarms.push({
      id: Date.now(),
      time: time,
      days: days,
      url: url,
      enabled: true,
    });
  }

  saveAlarms();
  renderAlarms();
  updateNextAlarm();

  alarmTimeEl.value = "";
  var checkboxes2 = daySelectEl.querySelectorAll('input[type="checkbox"]');
  for (var i = 0; i < checkboxes2.length; i++) {
    checkboxes2[i].checked = false;
  }
  soundSelectEl.value = "";
  editingAlarmId = null;

  hideAlarmForm();
}

function deleteAlarm(id) {
  alarms = alarms.filter(function (a) {
    return a.id !== id;
  });
  saveAlarms();
  renderAlarms();
  updateNextAlarm();
  if (playingAlarmId === id) stopAllSound();
}

function toggleAlarmEnabled(id) {
  for (var i = 0; i < alarms.length; i++) {
    if (alarms[i].id === id) {
      alarms[i].enabled = !alarms[i].enabled;
      break;
    }
  }
  saveAlarms();
  renderAlarms();
}

function testAlarm(id) {
  var alarm = null;
  for (var i = 0; i < alarms.length; i++) {
    if (alarms[i].id === id) {
      alarm = alarms[i];
      break;
    }
  }
  if (!alarm) return;

  playingAlarmId = id;
  if (isIOS) {
    playSoundIOS(alarm.url);
  } else {
    playSoundNonIOS(alarm.url);
  }
}

function renderAlarms() {
  if (alarms.length === 0) {
    alarmsListEl.innerHTML = "<p>No alarms set</p>";
    return;
  }

  var dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var html = "";
  for (var i = 0; i < alarms.length; i++) {
    var alarm = alarms[i];
    var name = getStationName(alarm.url);
    var autoPlay =
      alarm.url === "beep-high" ||
      alarm.url === "beep" ||
      alarm.url === "beep-low" ||
      alarm.url === "tone" ||
      alarm.url.indexOf("data:") === 0;
    var enabledText = alarm.enabled ? "Disable" : "Enable";
    html +=
      '<div class="alarm-item" onclick="testAlarm(' +
      alarm.id +
      ')">' +
      "<div>" +
      '<div class="alarm-time">' +
      alarm.time +
      " - " +
      name +
      (autoPlay ? " ⚡" : "") +
      (alarm.enabled ? "" : " (disabled)") +
      "</div>" +
      '<div class="alarm-days">' +
      alarm.days
        .map(function (d) {
          return dayNames[d];
        })
        .join(", ") +
      "</div>" +
      "</div>" +
      '<div class="alarm-actions">' +
      '<button class="edit-btn" onclick="event.stopPropagation(); editAlarm(' +
      alarm.id +
      ')">Edit</button>' +
      '<button class="toggle-btn" onclick="event.stopPropagation(); toggleAlarmEnabled(' +
      alarm.id +
      ')">' +
      enabledText +
      "</button>" +
      '<button class="delete-btn" onclick="event.stopPropagation(); deleteAlarm(' +
      alarm.id +
      ')">Delete</button>' +
      "</div>" +
      "</div>";
  }
  alarmsListEl.innerHTML = html;
}

// ===== ALARM CHECKING =====
function checkAlarms() {
  if (muted) {
    if (audio) stopAllSound();
    return;
  }

  var now = new Date();
  var currentTime = now.toTimeString().substring(0, 5);
  var currentDay = now.getDay();
  var currentMinute = now.getHours() * 60 + now.getMinutes();

  if (currentMinute === lastAlarmedMinute) return;

  for (var i = 0; i < alarms.length; i++) {
    var alarm = alarms[i];
    if (!alarm.enabled) continue;

    if (
      alarm.days.indexOf(currentDay) !== -1 &&
      alarm.time === currentTime &&
      alarm.id !== playingAlarmId
    ) {
      lastAlarmedMinute = currentMinute;

      if (isIOS) {
        triggerAlarmIOS(alarm);
      } else {
        triggerAlarmNonIOS(alarm);
      }
      return;
    }
  }
}

// ===== iOS SPECIFIC FUNCTIONS =====

// For iOS beeps, we use Web Audio API (same as non-iOS tone)
// The audioCtx is created with user gesture in unlockInteraction

function triggerAlarmIOS(alarm) {
  stopBeepLoop();
  stopAllSound();
  pendingAlarmUrl = alarm.url;
  playingAlarmId = alarm.id;
  beepCount = 0;

  // On iOS, if audio context is available (user gesture unlocked it), start beeps automatically
  // Otherwise, need user gesture to start beeps first
  if (audioCtx && audioCtx.state !== "suspended") {
    // Audio context is available - start beeps automatically
    soundPlaying = true;
    updatePlayStopButton();
    unlockStatusEl.textContent = "Beeping... Tap to stop and play stream";
    startIOSBeepChain(alarm.url);
    showOverlay();
  } else {
    // Audio context not available - need user gesture to start beeps
    unlockStatusEl.textContent = "iOS Alarm! Tap to start beeps";
    showOverlay();
  }
}

function startIOSBeepChain(url) {
  var frequency = getBeepFrequency(url);
  beepCount = 1;

  // Use setInterval to play 60 beeps using Web Audio API
  beepInterval = setInterval(function () {
    if (beepCount >= 60) {
      clearInterval(beepInterval);
      beepInterval = null;
      unlockStatusEl.textContent = "Alarm cancelled";
      playingAlarmId = null;
      soundPlaying = false;
      updatePlayStopButton();
      return;
    }
    playSingleBeep(frequency);
    beepCount++;
  }, getBeepInterval());

  // Play first beep immediately
  playSingleBeep(frequency);
}

function handleIOSPendingAlarm() {
  // If beeps are running, stop them and play stream
  if (beepCount > 0 && beepCount < 60) {
    stopBeepLoop();
    if (pendingAlarmUrl) {
      playSoundIOS(pendingAlarmUrl);
      pendingAlarmUrl = null;
    }
    unlockStatusEl.textContent = "";
    hideOverlay();
    return;
  }

  // Beeps not running yet - start them with user gesture
  soundPlaying = true;
  updatePlayStopButton();
  unlockStatusEl.textContent = "Beeping... Tap to stop and play stream";
  startIOSBeepChain(pendingAlarmUrl);
}

function playSoundIOS(url) {
  if (muted || !url) return;

  stopAllSound();
  soundPlaying = true;
  updatePlayStopButton();

  var interval = getBeepInterval();

  if (
    url === "beep-high" ||
    url === "beep" ||
    url === "beep-low" ||
    url === "tone" ||
    url.indexOf("data:") === 0
  ) {
    // For beep sounds on iOS, use Web Audio API with interval
    var frequency = getBeepFrequency(url);
    toneLoopInterval = setInterval(function () {
      if (muted || !soundPlaying) {
        clearInterval(toneLoopInterval);
        toneLoopInterval = null;
        return;
      }
      playSingleBeep(frequency);
    }, interval);
    return;
  }

  // For streams
  audio = createAudio(url);
  audio.loop = true;
  var promise = audio.play();
  if (promise && typeof promise.catch === "function") {
    promise.catch(function (e) {
      console.warn("Play failed:", e);
      soundPlaying = false;
      updatePlayStopButton();
    });
  }
  audio.addEventListener("ended", function () {
    soundPlaying = false;
    updatePlayStopButton();
  });
}

// ===== NON-iOS SPECIFIC FUNCTIONS =====

function triggerAlarmNonIOS(alarm) {
  stopBeepLoop();
  stopAllSound();

  if (
    alarm.url === "beep-high" ||
    alarm.url === "beep" ||
    alarm.url === "beep-low" ||
    alarm.url === "tone" ||
    alarm.url.indexOf("data:") === 0
  ) {
    playingAlarmId = alarm.id;
    playSoundNonIOS(alarm.url);
    return;
  } else if (alarm.url.indexOf("http") === 0) {
    if (userHasInteracted) {
      playingAlarmId = alarm.id;
      playSoundNonIOS(alarm.url);
      return;
    } else {
      pendingAlarmUrl = alarm.url;
      unlockStatusEl.textContent = "Alarm! Tap to play stream";
      playingAlarmId = alarm.id;
      return;
    }
  }
}

function handleNonIOSPendingAlarm() {
  playSoundNonIOS(pendingAlarmUrl);
  pendingAlarmUrl = null;
  unlockStatusEl.textContent = "";
}

function playSoundNonIOS(url) {
  if (muted || !url) return;

  stopAllSound();
  soundPlaying = true;
  updatePlayStopButton();

  var interval = getBeepInterval();

  if (
    url === "beep-high" ||
    url === "beep" ||
    url === "beep-low" ||
    url === "tone"
  ) {
    var frequency = getBeepFrequency(url);
    toneLoopInterval = setInterval(function () {
      if (muted || !soundPlaying) {
        stopAllSound();
        return;
      }
      playSingleBeep(frequency);
    }, interval);
    return;
  }

  // For data: URLs (simple beep) and streams
  audio = createAudio(url);

  if (url.indexOf("data:") === 0) {
    // Simple beep
    audio.loop = false;
    var simpleBeepLoop = setInterval(function () {
      if (muted || !soundPlaying) {
        clearInterval(simpleBeepLoop);
        audio.pause();
        return;
      }
      audio.currentTime = 0;
      audio.play().catch(function () {});
    }, interval);
    toneLoopInterval = simpleBeepLoop;
  } else {
    // Stream - loop continuously
    audio.loop = true;
    var promise = audio.play();
    if (promise && typeof promise.catch === "function") {
      promise.catch(function (e) {
        console.warn("Play failed:", e);
        soundPlaying = false;
        updatePlayStopButton();
      });
    }
    audio.addEventListener("ended", function () {
      soundPlaying = false;
      updatePlayStopButton();
    });
  }
}

// ===== ALARM DISPLAY =====
function getNextAlarm() {
  var now = new Date();
  var currentTime = now.getHours() * 60 + now.getMinutes();
  var currentDay = now.getDay();

  var dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var nextAlarm = null;
  var minDiff = Infinity;

  for (var i = 0; i < alarms.length; i++) {
    var alarm = alarms[i];
    if (!alarm.enabled) continue;

    var parts = alarm.time.split(":");
    var alarmTime = parseInt(parts[0]) * 60 + parseInt(parts[1]);

    for (var j = 0; j < alarm.days.length; j++) {
      var day = alarm.days[j];
      var daysUntil = (day - currentDay + 7) % 7;
      var totalMinutes = daysUntil * 1440 + (alarmTime - currentTime);
      if (totalMinutes < 0) totalMinutes += 7 * 1440;

      if (totalMinutes < minDiff) {
        minDiff = totalMinutes;
        nextAlarm = {
          time: alarm.time,
          days: dayNames[day],
          diff: totalMinutes,
        };
      }
    }
  }
  return nextAlarm;
}

function updateNextAlarm() {
  var next = getNextAlarm();
  if (next) {
    var hours = Math.floor(next.diff / 60);
    var minutes = Math.floor(next.diff % 60);
    nextAlarmEl.textContent =
      "Next alarm: " +
      next.time +
      " on " +
      next.days +
      " (in " +
      hours +
      "h " +
      minutes +
      "m)";
  } else {
    nextAlarmEl.textContent = "No alarms set";
  }
}

// ===== COOKIE SAVE/LOAD =====
function saveAlarms() {
  setCookie("alarms", JSON.stringify(alarms));
}

function loadAlarms() {
  var cookie = getCookie("alarms");
  if (cookie) {
    try {
      alarms = JSON.parse(cookie);
    } catch (e) {
      alarms = [];
      console.error("Failed to parse alarms cookie:", e);
    }
  }
  for (var i = 0; i < alarms.length; i++) {
    if (alarms[i].enabled === undefined) {
      alarms[i].enabled = true;
    }
  }
}

function saveMuteState() {
  setCookie("muted", muted);
}

function loadMuteState() {
  var cookie = getCookie("muted");
  muted = cookie === "true";
  updateMuteDisplay();
}

// ===== START =====
init();
