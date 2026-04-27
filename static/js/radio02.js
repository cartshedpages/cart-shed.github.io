// ===== STATE =====
let alarms = [];
let muted = false;
let audioCtx = null;
let toneOscillator = null;
let testAudio = null;
let audio = null;
let playingAlarmId = null;
let editingAlarmId = null;
let lastInteraction = Date.now();
let userHasInteracted = false;

// ===== COOKIE UTILITIES (FIXED) =====
function getCookie(name) {
  const cookies = document.cookie.split(";");
  for (let cookie of cookies) {
    const [cookieName, cookieValue] = cookie.trim().split("=");
    if (cookieName === name) {
      return decodeURIComponent(cookieValue);
    }
  }
  return null;
}

function setCookie(name, value, days = 365) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = "expires=" + date.toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Lax`;
}

// ===== DOM ELEMENTS =====
const clockEl = document.getElementById("clock");
const nextAlarmEl = document.getElementById("nextAlarm");
const alarmsListEl = document.getElementById("alarmsList");
const unlockStatusEl = document.getElementById("unlockStatus");
const alarmTimeEl = document.getElementById("alarmTime");
const daySelectEl = document.getElementById("daySelect");
const addAlarmBtn = document.getElementById("addAlarm");
const cancelAlarmBtn = document.getElementById("cancelAlarm");
const showAddAlarmBtn = document.getElementById("showAddAlarm");
const alarmFormContainer = document.getElementById("alarmFormContainer");
const muteBtn = document.getElementById("muteBtn");
const muteIndicatorEl = document.getElementById("muteIndicator");
const testSoundBtn = document.getElementById("testSound");
const stopSoundBtn = document.getElementById("stopSound");
const soundSelectEl = document.getElementById("soundSelect");

// ===== INITIALIZE =====
function init() {
  loadAlarms();
  loadMuteState();
  updateClock();
  updateNextAlarm();
  renderAlarms();
  initAudioContext();
  populateSoundSelect();

  setInterval(tick, 1000);
  setInterval(checkAlarms, 1000);
  setInterval(checkInactivity, 1000);

  // Event listeners
  addAlarmBtn.addEventListener("click", addAlarm);
  cancelAlarmBtn.addEventListener("click", hideAlarmForm);
  showAddAlarmBtn.addEventListener("click", showAlarmForm);
  muteBtn.addEventListener("click", toggleMute);
  testSoundBtn.addEventListener("click", testSound);
  stopSoundBtn.addEventListener("click", stopAllSound);

  // Start with alarm form hidden
  hideAlarmForm();

  // Track ANY user interaction to unlock autoplay
  const unlockInteraction = () => {
    userHasInteracted = true;
    updateUnlockStatus();
    // Resume AudioContext for iOS
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(console.error);
    }
    // Play pending alarm stream if any
    if (pendingAlarmUrl) {
      stopAllSound();
      playAlarmSound(pendingAlarmUrl);
      pendingAlarmUrl = null;
    }
  };
  document.addEventListener("click", () => {
    lastInteraction = Date.now();
    unlockInteraction();
  });
  document.addEventListener("keypress", () => {
    lastInteraction = Date.now();
    unlockInteraction();
  });
  document.addEventListener("scroll", () => {
    lastInteraction = Date.now();
    unlockInteraction();
  });
  document.addEventListener("mousemove", () => {
    lastInteraction = Date.now();
    unlockInteraction();
  });
}

function updateUnlockStatus() {
  unlockStatusEl.textContent = userHasInteracted ? "✓ Autoplay unlocked" : "";
}

function showAlarmForm() {
  alarmFormContainer.classList.remove("hidden");
  alarmFormContainer.classList.add("visible");
}

function hideAlarmForm() {
  alarmFormContainer.classList.remove("visible");
  alarmFormContainer.classList.add("hidden");
  editingAlarmId = null;
}

function editAlarm(id) {
  const alarm = alarms.find((a) => a.id === id);
  if (!alarm) return;

  editingAlarmId = alarm.id;
  alarmTimeEl.value = alarm.time;

  // Clear all day checkboxes first
  daySelectEl.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
  });

  // Check the days for this alarm
  alarm.days.forEach((day) => {
    const checkbox = daySelectEl.querySelector(
      `input[type="checkbox"][value="${day}"]`,
    );
    if (checkbox) checkbox.checked = true;
  });

  soundSelectEl.value = alarm.url;
  showAlarmForm();
}

function initAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.error("Web Audio API not supported:", e);
    }
  }
}

function ensureAudioContext() {
  if (!audioCtx) {
    initAudioContext();
  }
}

// ===== CLOCK & INACTIVITY =====
function tick() {
  updateClock();
  updateNextAlarm();
}

function updateClock() {
  const now = new Date();
  const timeString = now.toLocaleTimeString([], { hour12: false });
  // Split into HH:MM and :SS
  const parts = timeString.split(":");
  // Format as HH:MM<span class="clock-small">:SS</span>
  clockEl.innerHTML = `${parts[0]}:${parts[1]}<span class="clock-small">:${parts[2]}</span>`;
}

function checkInactivity() {
  const elapsed = (Date.now() - lastInteraction) / 1000 / 60;
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
  Object.entries(RADIO_STATIONS).forEach(([url, name]) => {
    const option = document.createElement("option");
    option.value = url;
    option.textContent = name;
    soundSelectEl.appendChild(option);
  });
}

// ===== AUDIO PLAYBACK =====
function createAudio(url) {
  const a = new Audio(url);
  a.crossOrigin = "anonymous";
  return a;
}

function stopAllSound() {
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
  unlockStatusEl.textContent = "";
}

function playAlarmBeep() {
  if (!audioCtx || muted) return;
  stopAllSound();

  // Ensure AudioContext is running (for iOS)
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(console.error);
    return; // Resume is async, will be called again next tick
  }

  toneOscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  toneOscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  toneOscillator.type = "sine";
  toneOscillator.frequency.value = 880;
  gainNode.gain.value = 0.3;

  // Use explicit time for iOS compatibility
  const now = audioCtx.currentTime;
  toneOscillator.start(now);

  // Pulse the beep
  gainNode.gain.setValueAtTime(0.3, now);
  gainNode.gain.linearRampToValueAtTime(0, now + 0.5);

  setTimeout(() => {
    if (!muted && playingAlarmId) playAlarmBeep();
  }, 600);
}

function playSingleBeep() {
  if (!audioCtx || muted) return;

  // Ensure AudioContext is running (for iOS)
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(console.error);
    return;
  }

  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.frequency.value = 880;
  oscillator.type = "sine";
  gainNode.gain.value = 0.3;
  const now = audioCtx.currentTime;
  oscillator.start(now);
  gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
}

function testSound() {
  stopAllSound();
  let url;

  // If alarm form is visible, use the selected sound from form
  if (alarmFormContainer.classList.contains("visible")) {
    url = getSelectedSoundUrl();
  } else {
    // Otherwise, get the next alarm's sound
    const nextAlarm = getUpcomingAlarm();
    if (nextAlarm) url = nextAlarm.url;
  }

  if (!url) return;

  // For streams on iOS, ensure we have user interaction
  if (url.startsWith("http") && !userHasInteracted) {
    unlockStatusEl.textContent = "⚠ Tap to test stream";
    return;
  }

  playAlarmSound(url);
}

// Get the upcoming alarm object (not just display info)
function getUpcomingAlarm() {
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const currentDay = now.getDay();

  let nextAlarm = null;
  let minDiff = Infinity;

  for (const alarm of alarms) {
    const [hours, minutes] = alarm.time.split(":").map(Number);
    const alarmTime = hours * 60 + minutes;

    for (const day of alarm.days) {
      // Calculate days until this alarm day (0-6)
      let daysUntil = (day - currentDay + 7) % 7;
      // Calculate total minutes until this occurrence
      let totalMinutes = daysUntil * 1440 + (alarmTime - currentTime);
      // If negative, add a week
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
  const time = alarmTimeEl.value;
  if (!time) return alert("Please set a time");

  const days = Array.from(
    daySelectEl.querySelectorAll('input[type="checkbox"]:checked'),
  ).map((cb) => parseInt(cb.value));
  if (days.length === 0) return alert("Please select at least one day");

  const url = getSelectedSoundUrl();
  if (!url) return alert("Please select a sound");

  if (editingAlarmId) {
    // Update existing alarm
    const index = alarms.findIndex((a) => a.id === editingAlarmId);
    if (index !== -1) {
      alarms[index] = { id: editingAlarmId, time, days, url };
    }
  } else {
    // Add new alarm
    const alarm = { id: Date.now(), time, days, url };
    alarms.push(alarm);
  }

  saveAlarms();
  renderAlarms();
  updateNextAlarm();

  alarmTimeEl.value = "";
  daySelectEl
    .querySelectorAll('input[type="checkbox"]')
    .forEach((cb) => (cb.checked = false));
  soundSelectEl.value = "";
  editingAlarmId = null;

  hideAlarmForm();
}

function deleteAlarm(id) {
  alarms = alarms.filter((a) => a.id !== id);
  saveAlarms();
  renderAlarms();
  updateNextAlarm();
  if (playingAlarmId === id) stopAllSound();
  if (pendingAlarmUrl) {
    // Clear pending if deleted alarm matches
    const deletedAlarm = alarms.find((a) => a.id === id);
    // Can't find it since we just deleted it, but clear pending anyway
    pendingAlarmUrl = null;
    unlockStatusEl.textContent = "";
  }
}

// Test alarm when clicked
function testAlarm(id) {
  const alarm = alarms.find((a) => a.id === id);
  if (!alarm) return;

  const url = alarm.url;
  if (url === "tone") {
    stopAllSound();
    playAlarmBeep();
    playingAlarmId = "test";
  } else if (url === "beep") {
    stopAllSound();
    playSingleBeep();
  } else if (url.startsWith("data:")) {
    stopAllSound();
    audio = createAudio(url);
    audio.loop = true;
    audio.play().catch(console.error);
  } else if (userHasInteracted) {
    stopAllSound();
    audio = createAudio(url);
    audio.play().catch((e) => {
      unlockStatusEl.textContent = "⚠ Stream needs unlock";
    });
  } else {
    unlockStatusEl.textContent = "⚠ Click any button first to unlock streams";
  }
}

function renderAlarms() {
  if (alarms.length === 0) {
    alarmsListEl.innerHTML = "<p>No alarms set</p>";
    return;
  }

  // Day names in order: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  alarmsListEl.innerHTML = alarms
    .map((alarm) => {
      const name = getStationName(alarm.url);
      const autoPlay =
        alarm.url === "tone" ||
        alarm.url === "beep" ||
        alarm.url.startsWith("data:");
      return `
      <div class="alarm-item" onclick="testAlarm(${alarm.id})">
        <div>
          <div class="alarm-time">${alarm.time} - ${name}${autoPlay ? " ⚡" : ""}</div>
          <div class="alarm-days">${alarm.days.map((d) => dayNames[d]).join(", ")}</div>
        </div>
        <div class="alarm-actions">
          <button class="edit-btn" onclick="event.stopPropagation(); editAlarm(${alarm.id})">Edit</button>
          <button class="delete-btn" onclick="event.stopPropagation(); deleteAlarm(${alarm.id})">Delete</button>
        </div>
      </div>
    `;
    })
    .join("");
}

function checkAlarms() {
  if (muted) {
    if (audio) stopAllSound();
    return;
  }

  const now = new Date();
  const currentTime = now.toTimeString().substring(0, 5);
  const currentDay = now.getDay();

  for (const alarm of alarms) {
    if (
      alarm.days.includes(currentDay) &&
      alarm.time === currentTime &&
      alarm.id !== playingAlarmId
    ) {
      const canAutoplay =
        alarm.url === "tone" ||
        alarm.url === "beep" ||
        alarm.url.startsWith("data:") ||
        userHasInteracted;

      if (canAutoplay) {
        stopAllSound();
        playingAlarmId = alarm.id;
        playAlarmSound(alarm.url);
      }
    }
  }
}
=======
// ===== ALARM CHECKING =====
let pendingAlarmUrl = null;

function checkAlarms() {
  if (muted) {
    if (audio) stopAllSound();
    return;
  }

  const now = new Date();
  const currentTime = now.toTimeString().substring(0, 5);
  const currentDay = now.getDay();

  for (const alarm of alarms) {
    if (
      alarm.days.includes(currentDay) &&
      alarm.time === currentTime &&
      alarm.id !== playingAlarmId
    ) {
      // Tone/beep/data can autoplay, streams need user interaction on iOS
      if (alarm.url === "tone" || alarm.url === "beep" || alarm.url.startsWith("data:")) {
        stopAllSound();
        playingAlarmId = alarm.id;
        playAlarmSound(alarm.url);
      } else if (userHasInteracted) {
        // Try to play stream
        stopAllSound();
        playingAlarmId = alarm.id;
        playAlarmSound(alarm.url);
      } else {
        // Stream alarm firing but no user interaction yet - store for when user taps
        pendingAlarmUrl = alarm.url;
        unlockStatusEl.textContent = "⚠ Alarm! Tap to play stream";
        playingAlarmId = alarm.id;
      }
    }
  }
}
============
function checkAlarms() {
  if (muted) {
    if (audio) stopAllSound();
    return;
  }

  const now = new Date();
  const currentTime = now.toTimeString().substring(0, 5);
  const currentDay = now.getDay();

  for (const alarm of alarms) {
    if (
      alarm.days.includes(currentDay) &&
      alarm.time === currentTime &&
      alarm.id !== playingAlarmId
    ) {
      const canAutoplay =
        alarm.url === "tone" ||
        alarm.url === "beep" ||
        alarm.url.startsWith("data:") ||
        userHasInteracted;

      if (canAutoplay) {
        stopAllSound();
        playingAlarmId = alarm.id;
        playAlarmSound(alarm.url);
      }
    }
  }
}

function playAlarmSound(url) {
  if (muted || !url) return false;

  // Try to play the sound
  if (url === "tone") {
    playAlarmBeep();
    return true;
  }
  if (url === "beep") {
    stopAllSound();
    setTimeout(() => playAlarmBeep(), 0);
    return true;
  }

  // For data: URLs and streams - try to play
  const playPromise = new Promise((resolve, reject) => {
    audio = createAudio(url);
    audio.loop = true;

    // Try to play immediately
    const promise = audio.play();
    if (promise !== undefined) {
      promise
        .then(() => resolve(true))
        .catch((e) => {
          console.warn("First play attempt failed:", e);
          // On iOS, need to retry after user gesture
          document.addEventListener(
            "click",
            function playOnInteraction() {
              audio
                .play()
                .then(() => resolve(true))
                .catch(reject);
              document.removeEventListener("click", playOnInteraction);
            },
            { once: true },
          );
          // Try again in 100ms in case it was just a timing issue
          setTimeout(() => {
            audio
              .play()
              .then(() => resolve(true))
              .catch(reject);
          }, 100);
        });
    } else {
      // No promise returned (older browsers), assume success
      resolve(true);
    }
  });

  playPromise
    .then(() => {
      unlockStatusEl.textContent = "✓ Playing";
      return true;
    })
    .catch((e) => {
      console.error("Play failed:", e);
      unlockStatusEl.textContent = "⚠ Tap to play";
      // For iOS with streams, show a more noticeable alert
      if (url.startsWith("http")) {
        setTimeout(() => {
          if (audio && audio.paused) {
            unlockStatusEl.textContent = "⚠ iOS: Tap anywhere to start stream";
          }
        }, 500);
      }
      return false;
    });

  return playPromise;
}

function getNextAlarm() {
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const currentDay = now.getDay();

  // Day names in order: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  let nextAlarm = null;
  let minDiff = Infinity;

  for (const alarm of alarms) {
    const [hours, minutes] = alarm.time.split(":").map(Number);
    const alarmTime = hours * 60 + minutes;

    for (const day of alarm.days) {
      // Calculate days until this alarm day (0-6)
      let daysUntil = (day - currentDay + 7) % 7;
      // Calculate total minutes until this occurrence
      let totalMinutes = daysUntil * 1440 + (alarmTime - currentTime);
      // If negative, add a week
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
  const next = getNextAlarm();
  if (next) {
    const hours = Math.floor(next.diff / 60);
    const minutes = Math.floor(next.diff % 60);
    nextAlarmEl.textContent = `Next alarm: ${next.time} on ${next.days} (in ${hours}h ${minutes}m)`;
  } else {
    nextAlarmEl.textContent = "No alarms set";
  }
}

// ===== COOKIE SAVE/LOAD (FIXED) =====
function saveAlarms() {
  setCookie("alarms", JSON.stringify(alarms), 365);
}

function loadAlarms() {
  const cookie = getCookie("alarms");
  if (cookie) {
    try {
      alarms = JSON.parse(cookie);
    } catch (e) {
      alarms = [];
      console.error("Failed to parse alarms cookie:", e);
    }
  }
}

function saveMuteState() {
  setCookie("muted", muted, 365);
}

function loadMuteState() {
  const cookie = getCookie("muted");
  muted = cookie === "true";
  updateMuteDisplay();
}

// ===== START =====
init();
