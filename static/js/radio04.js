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

  hideAlarmForm();

  var unlockInteraction = function () {
    userHasInteracted = true;
    updateUnlockStatus();

    if (pendingAlarmUrl) {
      stopBeepLoop();
      playAlarmSound(pendingAlarmUrl);
      pendingAlarmUrl = null;
      unlockStatusEl.textContent = "";
      return;
    }
    stopBeepLoop();
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

function showAlarmForm() {
  alarmFormContainer.style.display = "block";
}

function hideAlarmForm() {
  alarmFormContainer.style.display = "none";
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
  } else {
    document.body.classList.remove("dimmed");
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
  // Add radio stations from radiostations.js
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

function stopAllSound() {
  stopBeepLoop();
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
    soundPlaying = true;
    updatePlayStopButton();
    // Play the selected sound or next alarm sound
    var url;
    if (alarmFormContainer.style.display === "block") {
      url = soundSelectEl.value;
    } else {
      var nextAlarm = getUpcomingAlarm();
      if (nextAlarm) url = nextAlarm.url;
    }
    if (url) {
      playAlarmSound(url);
    } else {
      soundPlaying = false;
      updatePlayStopButton();
    }
  }
}

function stopBeepLoop() {
  if (beepInterval) {
    clearInterval(beepInterval);
    beepInterval = null;
    beepCount = 0;
    stopAllSound();
  }
}

function playSingleBeep() {
  if (muted) return;

  // Create audio context if it doesn't exist
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.error("Web Audio API not supported:", e);
      return;
    }
  }

  // Resume if suspended
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(function () {});
  }

  var oscillator = audioCtx.createOscillator();
  var gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.frequency.value = 880;
  oscillator.type = "sine";
  gainNode.gain.value = 0.3;
  oscillator.start();
  gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
}

function testSound() {
  stopAllSound();
  var url;

  // If alarm form is visible, use the selected sound from form
  if (alarmFormContainer.style.display === "block") {
    url = getSelectedSoundUrl();
  } else {
    // Otherwise, get the next alarm's sound
    var nextAlarm = getUpcomingAlarm();
    if (nextAlarm) url = nextAlarm.url;
  }

  if (!url) return;
  playAlarmSound(url);
}

// Get the upcoming alarm object (not just display info)
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
    // Update existing alarm
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
    // Add new alarm
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

  var url = alarm.url;
  if (url === "tone") {
    stopAllSound();
    playingAlarmId = Date.now();
    soundPlaying = true;
    updatePlayStopButton();
    var beepLoop = setInterval(function () {
      if (muted || !playingAlarmId) {
        clearInterval(beepLoop);
        soundPlaying = false;
        updatePlayStopButton();
        return;
      }
      playSingleBeep();
    }, 1000);
    playingAlarmId = "test";
  } else if (url === "beep") {
    stopAllSound();
    soundPlaying = true;
    updatePlayStopButton();
    playSingleBeep();
  } else if (url.indexOf("data:") === 0) {
    stopAllSound();
    soundPlaying = true;
    updatePlayStopButton();
    audio = createAudio(url);
    audio.loop = true;
    audio.play();
  } else if (userHasInteracted) {
    stopAllSound();
    soundPlaying = true;
    updatePlayStopButton();
    audio = createAudio(url);
    audio.play();
  } else {
    unlockStatusEl.textContent = "Click any button first to unlock streams";
  }
}

function renderAlarms() {
  if (alarms.length === 0) {
    alarmsListEl.innerHTML = "<p>No alarms set</p>";
    return;
  }

  // Day names in order: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
  var dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  var html = "";
  for (var i = 0; i < alarms.length; i++) {
    var alarm = alarms[i];
    var name = getStationName(alarm.url);
    var autoPlay =
      alarm.url === "tone" ||
      alarm.url === "beep" ||
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

      // On iOS, all alarms need user gesture to play
      if (isIOS) {
        stopBeepLoop();
        stopAllSound();
        pendingAlarmUrl = alarm.url;
        unlockStatusEl.textContent = "iOS Alarm! Tap to play";
        playingAlarmId = alarm.id;
        beepCount = 0;
        soundPlaying = true;
        updatePlayStopButton();
        // Start beeping - will work if AudioContext was created from prior gesture
        beepInterval = setInterval(function () {
          beepCount++;
          if (beepCount >= 60) {
            stopBeepLoop();
            unlockStatusEl.textContent = "Alarm cancelled";
            playingAlarmId = null;
          } else {
            playSingleBeep();
          }
        }, 1000);
        return;
      }

      // For non-iOS
      if (
        alarm.url === "tone" ||
        alarm.url === "beep" ||
        alarm.url.indexOf("data:") === 0
      ) {
        stopBeepLoop();
        stopAllSound();
        playingAlarmId = alarm.id;
        playAlarmSound(alarm.url);
        return;
      } else if (alarm.url.indexOf("http") === 0) {
        if (userHasInteracted) {
          stopBeepLoop();
          stopAllSound();
          playingAlarmId = alarm.id;
          playAlarmSound(alarm.url);
          return;
        } else {
          stopBeepLoop();
          stopAllSound();
          pendingAlarmUrl = alarm.url;
          unlockStatusEl.textContent = "Alarm! Tap to play stream";
          playingAlarmId = alarm.id;
          return;
        }
      }
    }
  }
}

function playAlarmSound(url) {
  if (muted || !url) return;

  soundPlaying = true;
  updatePlayStopButton();

  if (url === "tone") {
    playingAlarmId = Date.now();
    var loop = setInterval(function () {
      if (muted || !playingAlarmId || url !== "tone") {
        clearInterval(loop);
        soundPlaying = false;
        updatePlayStopButton();
        return;
      }
      playSingleBeep();
    }, 1000);
    return;
  }

  if (url === "beep") {
    stopAllSound();
    soundPlaying = true;
    updatePlayStopButton();
    setTimeout(playSingleBeep, 0);
    return;
  }

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

function getNextAlarm() {
  var now = new Date();
  var currentTime = now.getHours() * 60 + now.getMinutes();
  var currentDay = now.getDay();

  // Day names in order: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
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
  // Ensure all alarms have enabled property
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
