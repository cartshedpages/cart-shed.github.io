// Radio station definitions
var RADIO_STATIONS = {
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

// Station display names
var STATION_NAMES = {
  tone: "Tone",
  beep: "Beep",
  "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrLBhNjVgodDbq2EcBj+a2teleQAA":
    "Simple Beep",
};

// Merge RADIO_STATIONS into STATION_NAMES
for (var key in RADIO_STATIONS) {
  if (RADIO_STATIONS.hasOwnProperty(key)) {
    STATION_NAMES[key] = RADIO_STATIONS[key];
  }
}

// Get all radio station URLs
function getRadioStationUrls() {
  var urls = [];
  for (var k in RADIO_STATIONS) {
    if (RADIO_STATIONS.hasOwnProperty(k)) {
      urls.push(k);
    }
  }
  return urls;
}

// Get station name for a URL
function getStationName(url) {
  return STATION_NAMES[url] || "Custom";
}
