// ===== STATE =====
let alarms = [];
let muted = false;
let audioCtx = null;
let toneOscillator = null;
let testAudio = null;
let audio = null;
let playingAlarmId = null;
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

  setInterval(tick, 1000);
  setInterval(checkAlarms, 1000);
  setInterval(checkInactivity, 1000);

  // Event listeners
  addAlarmBtn.addEventListener("click", addAlarm);
  muteBtn.addEventListener("click", toggleMute);
  testSoundBtn.addEventListener("click", testSound);
  stopSoundBtn.addEventListener("click", stopAllSound);

  // Track ANY user interaction to unlock autoplay
  const unlockInteraction = () => {
    userHasInteracted = true;
    updateUnlockStatus();
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

function initAudioContext() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // Create silent buffer to keep context alive
      const buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.start();
    } catch (e) {
      console.error("Web Audio API not supported:", e);
    }
  }
}

// ===== CLOCK & INACTIVITY =====
function tick() {
  updateClock();
  updateNextAlarm();
}

function updateClock() {
  const now = new Date();
  clockEl.textContent = now.toLocaleTimeString([], { hour12: false });
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

// ===== ALARM POPUP REMOVED - using autoplay after interaction =====

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
}

function playAlarmBeep() {
  if (!audioCtx || muted) return;
  stopAllSound();

  toneOscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  toneOscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  toneOscillator.type = "sine";
  toneOscillator.frequency.value = 880;
  gainNode.gain.value = 0.3;

  toneOscillator.start();

  // Pulse the beep
  const now = audioCtx.currentTime;
  gainNode.gain.setValueAtTime(0.3, now);
  gainNode.gain.linearRampToValueAtTime(0, now + 0.5);

  setTimeout(() => {
    if (!muted && playingAlarmId) playAlarmBeep();
  }, 600);
}

function playSingleBeep() {
  if (!audioCtx || muted) return;
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
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
  const url = getSelectedSoundUrl();
  if (!url) return;

  if (url === "tone") {
    playAlarmBeep();
    playingAlarmId = "test";
    return;
  }
  if (url === "beep") {
    playSingleBeep();
    return;
  }
  if (url.startsWith("data:")) {
    testAudio = createAudio(url);
    testAudio.loop = true;
    testAudio.play().catch(console.error);
    return;
  }

  // For streams - play if user has interacted
  if (userHasInteracted) {
    testAudio = createAudio(url);
    testAudio
      .play()
      .then(() => {
        unlockStatusEl.textContent = "✓ Stream playing";
      })
      .catch((e) => {
        unlockStatusEl.textContent = "⚠ Stream needs unlock";
      });
  } else {
    unlockStatusEl.textContent = "⚠ Click any button first to unlock streams";
  }
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

  const alarm = { id: Date.now(), time, days, url };
  alarms.push(alarm);
  saveAlarms();
  renderAlarms();

  alarmTimeEl.value = "";
  daySelectEl
    .querySelectorAll('input[type="checkbox"]')
    .forEach((cb) => (cb.checked = false));
}

function deleteAlarm(id) {
  alarms = alarms.filter((a) => a.id !== id);
  saveAlarms();
  renderAlarms();
  if (playingAlarmId === id) stopAllSound();
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
          <div class="alarm-days">${alarm.days.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")}</div>
        </div>
        <button class="delete-btn" onclick="event.stopPropagation(); deleteAlarm(${alarm.id})">Delete</button>
      </div>
    `;
    })
    .join("");
}

function getStationName(url) {
  const stations = {
    tone: "Tone",
    beep: "Beep",
    "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrLBhNjVgodDbq2EcBj+a2teleQAA":
      "Simple Beep",
    "http://as-hls-ww-live.akamaized.net/pool_01505109/live/ww/bbc_radio_one/bbc_radio_one.isml/bbc_radio_one-audio=96000.norewind.m3u8":
      "BBC Radio 1",
    "http://as-hls-ww-live.akamaized.net/pool_74208725/live/ww/bbc_radio_two/bbc_radio_two.isml/bbc_radio_two-audio=96000.norewind.m3u8":
      "BBC Radio 2",
    "http://as-hls-ww-live.akamaized.net/pool_23461179/live/ww/bbc_radio_three/bbc_radio_three.isml/bbc_radio_three-audio=96000.norewind.m3u8":
      "BBC Radio 3",
    "http://as-hls-ww-live.akamaized.net/pool_55057080/live/ww/bbc_radio_fourfm/bbc_radio_fourfm.isml/bbc_radio_fourfm-audio=96000.norewind.m3u8":
      "BBC Radio 4",
    "http://as-hls-ww-live.akamaized.net/pool_89021708/live/ww/bbc_radio_five_live/bbc_radio_five_live.isml/bbc_radio_five_live-audio=96000.norewind.m3u8":
      "BBC Radio 5 Live",
  };
  return stations[url] || "Custom";
}

// ===== ALARM CHECKING =====
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

  if (url === "tone") {
    playAlarmBeep();
    return true;
  }
  if (url === "beep") {
    stopAllSound();
    setTimeout(() => playAlarmBeep(), 0);
    return true;
  }
  if (url.startsWith("data:")) {
    audio = createAudio(url);
    audio.loop = true;
    audio.play().catch(console.error);
    return true;
  }
  // Streams - only reached if userHasInteracted is true
  audio = createAudio(url);
  audio.loop = true;
  audio.play().catch((e) => {
    console.error("Stream play failed:", e);
    return false;
  });
  return true;
}

function getNextAlarm() {
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const currentDay = now.getDay();

  let nextAlarm = null;
  let minDiff = Infinity;

  for (const alarm of alarms) {
    const [hours, minutes] = alarm.time.split(":").map(Number);
    const alarmTime = hours * 60 + minutes;

    for (const day of alarm.days) {
      let daysDiff =
        day < currentDay || (day === currentDay && alarmTime <= currentTime)
          ? 7
          : 0;
      const totalMinutes = daysDiff * 24 * 60 + (alarmTime - currentTime);

      if (totalMinutes >= 0 && totalMinutes < minDiff) {
        minDiff = totalMinutes;
        nextAlarm = {
          time: alarm.time,
          days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day],
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
    const seconds = Math.floor((next.diff * 60) % 60);
    nextAlarmEl.textContent = `Next alarm: ${next.time} on ${next.days} (in ${hours}h ${minutes}m ${seconds}s)`;
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
