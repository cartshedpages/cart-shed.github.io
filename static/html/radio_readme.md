# radio_readme

The whole idea of this project is to use an old tablet as a radio alarm clock. The radio stations are defined in a file called radiostations.js and the alarms are saved in a cookie. When the alarm is due to sound, the radio starts steaming and you wake up.

Not so fast! Those rich people at Apple have once again screwed me over by not allowing sounds to be triggered through JavaScript so we have to be pretty careful. WHat we do then is to make sure that the browser has has some input before you go to sleep. Then when the alarm goes off, if should play a simple beep 60 times (the rate is also set in radiostations.js) or until you tap the screen when the radio should start to play the actual alarm stream.

## How it works for non-iOS browsers


## How it works for iOS browsers

checkAlarms()`** (called every second by `setInterval`)
   - Detects alarm time matches current time
   - Calls `triggerAlarmIOS(alarm)`

2. **`triggerAlarmIOS(alarm)`**
   - Stops any existing sounds: `stopBeepLoop()`, `stopAllSound()`
   - Sets `pendingAlarmUrl = alarm.url`
   - Sets `playingAlarmId = alarm.id`
   - Sets `beepCount = 0`
   - Shows message: **"iOS Alarm! Tap to start beeps and play stream"**

3. **User taps anywhere** → `unlockInteraction()` is called:
   - Sets `userHasInteracted = true`
   - Initializes `audioCtx` (Web Audio API context)
   - Calls `handleIOSPendingAlarm()` because `pendingAlarmUrl` exists

4. **`handleIOSPendingAlarm()`**
   - Since `!beepInterval` (no beeps running yet):
     - Sets `soundPlaying = true`
     - Shows message: **"Beeping... Tap to stop and play stream"**
     - Creates Audio element: `createIOSBeepAudio()`
     - Plays first beep: `playIOSBeep()`
     - Sets `beepCount = 1`
     - Calls `startIOSBeepLoop()`

5. **`startIOSBeepLoop()`**
   - Gets beep interval from `getBeepInterval()` (default 2000ms)
   - Gets the Audio element: `createIOSBeepAudio()`
   - Sets up `onended` event handler on the Audio element:
     - When beep finishes playing, increments `beepCount`
     - If `beepCount >= 60`: shows "Alarm cancelled", stops
     - Otherwise: schedules next beep with `setTimeout` (called from `onended` event)

6. **Beep chain continues**:
   - Each beep's `onended` event fires
   - `setTimeout` callback (from within `onended`) plays next beep
   - This works on iOS because `onended` event handlers retain user gesture context

7. **User taps again** (to stop beeps and play stream):
   - `handleIOSPendingAlarm()` is called again
   - Since `beepInterval` exists (beeps are running):
     - Calls `stopBeepLoop()` which pauses Audio element and clears `onended` handler
     - Calls `playSoundIOS(pendingAlarmUrl)` to play the actual alarm stream
     - Clears `pendingAlarmUrl`
     - Clears message

## Key Points for iOS

- **First beep**: Played directly from user tap gesture → works
- **Subsequent beeps**: Scheduled from `onended` event handler → works on iOS because event handlers retain gesture context
- **Audio element**: Single reusable element with `currentTime = 0` before each play
- **No Web Audio API for beeps on iOS**: Uses Audio element instead because Web Audio API oscillators don't work in timeouts on iOS
