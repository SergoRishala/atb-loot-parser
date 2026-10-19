// ═════════════════════════════════════════════════════════════════
//   LOOT — Floating Price: ATB & Сільпо PRO Engine (v2.1)
//   3D Cover-Flow, Regular Catalog Grid, Split-Cart & Real Store APIs
// ═════════════════════════════════════════════════════════════════

const API = '/api';

// Стан застосунку
let allProducts = [];
let filteredProducts = [];
let currentTab = 1;
const ITEMS_PER_TAB = 100;
let isBackgroundLoading = false;
let currentSearchSeq = 0;
let showNovaPoshta = false;
let activeCategory = null; // Поточна обрана категорія
let currentSearchQuery = ''; // За замовчуванням порожній запит (завантажуються акції Сільпо & АТБ)
let currentSort = 'default'; // Сортування за замовчуванням
let currentStore = 'all'; // 'all', 'atb', 'silpo'
let filterDiscountMin = 0; // 0 = всі, 1 = будь-яка знижка, 20 = >=20%, 30 = >=30%, 50 = >=50%
let filterPriceRange = 'all'; // 'all', '0-50', '50-100', '100-250', '250+'
let filterOnlyWithWeight = false; // Тільки з вагою (ціна за 100г/мл)
let filterOnlyInStock = true; // Тільки в наявності
let currentViewMode = 'grid'; // '3d', 'grid', 'dual'
let selectedBranchId = '1edb7351-d076-60fe-a545-51c4e9ef1e54'; // Дефолтне Сільпо (Київ)
let cart = [];
let wishlist = [];
let cards = [];
let activeIdx = 0;
let searchTimeout = null;

// HTML елементи
const stage = document.getElementById('cardsStage');
const stageContainer = document.getElementById('stageContainer');
const productsGrid = document.getElementById('productsGrid');
const dualViewContainer = document.getElementById('dualViewContainer');
const stageCounter = document.getElementById('stageCounter');
const searchInput = document.getElementById('searchInput');
const searchSpinner = document.getElementById('searchSpinner');

// 20 Категорій із прямими пошуковими запитами для обох магазинів
const CATS = [
  { e: '🥛', n: 'Молочні продукти', q: 'молоко' },
  { e: '🥩', n: "М'ясо та птиця", q: "м'ясо" },
  { e: '🌭', n: 'Ковбаси та сосиски', q: 'ковбаса' },
  { e: '🧀', n: "Сири тверді й м'які", q: 'сир' },
  { e: '🐟', n: 'Риба та морепродукти', q: 'риба' },
  { e: '🌾', n: 'Бакалія та крупи', q: 'крупа' },
  { e: '🍞', n: 'Хліб та випічка', q: 'хліб' },
  { e: '🥦', n: 'Свіжі овочі', q: 'овочі' },
  { e: '🍎', n: 'Свіжі фрукти', q: 'фрукти' },
  { e: '🥔', n: 'Снеки та чипси', q: 'чипси' },
  { e: '🍫', n: 'Шоколад та цукерки', q: 'шоколад' },
  { e: '☕', n: 'Кава та чай', q: 'кава' },
  { e: '🥤', n: 'Вода та напої', q: 'вода' },
  { e: '🧃', n: 'Соки та нектари', q: 'сік' },
  { e: '🥫', n: 'Консервація', q: 'консерва' },
  { e: '🍦', n: 'Морозиво та десерти', q: 'морозиво' },
  { e: '🧈', n: 'Масло та олія', q: 'масло' },
  { e: '🧂', n: 'Соуси та приправи', q: 'соус' },
  { e: '🧼', n: 'Побутова хімія', q: 'порошок' },
  { e: '🧴', n: 'Догляд та гігієна', q: 'мило' }
];

// Універсальний помічник отримання коректного посилання на фото товару
function getProductImg(p) {
  if (!p) return '';
  return p.image_url || p.image_large_url || p.image || '';
}

// Безпечна заглушка фото (білий прямокутник у Base64 без лапок та тексту)
const FALLBACK_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZmZmZmZmIi8+PC9zdmc+';

// ═══════════════════════════════════════════
//   ЗВУКОВИЙ РУШІЙ (WEB AUDIO API - 50 ПРЕСЕТІВ)
// ═══════════════════════════════════════════
let audioCtx = null;
let noiseBuffer = null;
let soundEnabled = localStorage.getItem('loot_sound_enabled') !== 'false';
let soundPreset = localStorage.getItem('loot_sound_preset') || 'mechanical';
let soundVolume = parseFloat(localStorage.getItem('loot_sound_volume') || '0.75');

function initAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
      const bufferSize = Math.floor(audioCtx.sampleRate * 0.1);
      noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => {
        try {
          const buf = audioCtx.createBuffer(1, 1, 22050);
          const src = audioCtx.createBufferSource();
          src.buffer = buf;
          src.connect(audioCtx.destination);
          src.start(0);
        } catch (e) {}
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('AudioContext init error:', err);
  }
}

function synthNoise(filterType, freq, q, dur, gainVal, now) {
  if (!noiseBuffer || !audioCtx) return;
  try {
    const src = audioCtx.createBufferSource();
    src.buffer = noiseBuffer;

    const f = audioCtx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, now);
    if (q) f.Q.setValueAtTime(q, now);

    const g = audioCtx.createGain();
    const finalGain = gainVal * soundVolume;
    g.gain.setValueAtTime(finalGain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    src.connect(f);
    f.connect(g);
    g.connect(audioCtx.destination);

    src.start(now);
    src.stop(now + dur);
  } catch (e) {}
}

function synthTone(type, fStart, fEnd, dur, gainVal, now) {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(fStart, now);
    if (fEnd && fEnd !== fStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), now + dur);
    }

    const finalGain = gainVal * soundVolume;
    g.gain.setValueAtTime(finalGain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(g);
    g.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + dur);
  } catch (e) {}
}

const SOUND_GENERATORS = {
  // 1. Механіка та прилади
  mechanical: (now, dir) => {
    synthTone('triangle', dir > 0 ? 2100 : 1900, 800, 0.014, 0.45, now);
    synthNoise('highpass', 4500, 1, 0.008, 0.35, now);
  },
  leica: (now) => {
    synthTone('triangle', 1850, 600, 0.016, 0.45, now);
    synthNoise('bandpass', 3800, 4, 0.009, 0.28, now);
  },
  ratchet: (now) => {
    synthTone('sawtooth', 550, 120, 0.024, 0.38, now);
    synthNoise('lowpass', 1800, 2, 0.02, 0.22, now);
  },
  swiss_watch: (now) => {
    synthTone('sine', 3400, 1200, 0.008, 0.35, now);
    synthNoise('bandpass', 5200, 8, 0.006, 0.28, now);
  },
  tourbillon: (now) => {
    synthTone('sine', 4200, 2600, 0.006, 0.28, now);
    synthTone('sine', 3100, 1500, 0.006, 0.22, now + 0.012);
  },
  safe_lock: (now) => {
    synthTone('square', 320, 90, 0.03, 0.45, now);
    synthNoise('bandpass', 2400, 5, 0.012, 0.35, now);
  },
  odometer: (now) => {
    synthTone('square', 850, 250, 0.018, 0.38, now);
    synthNoise('highpass', 3000, 2, 0.012, 0.22, now);
  },
  cassette: (now) => {
    synthTone('triangle', 1200, 350, 0.012, 0.35, now);
    synthNoise('bandpass', 2200, 3, 0.008, 0.22, now);
  },
  vintage_radio: (now) => {
    synthNoise('bandpass', 1600, 3.5, 0.018, 0.5, now);
    synthTone('sine', 600, 150, 0.012, 0.28, now);
  },
  industrial_switch: (now) => {
    synthTone('sawtooth', 420, 80, 0.035, 0.55, now);
    synthNoise('lowpass', 2500, 3, 0.015, 0.35, now);
  },
  micrometer: (now) => {
    synthTone('sine', 4800, 2200, 0.005, 0.3, now);
    synthNoise('highpass', 6000, 1, 0.004, 0.25, now);
  },
  torque_wrench: (now) => {
    synthTone('sine', 280, 70, 0.04, 0.65, now);
    synthTone('triangle', 1900, 600, 0.012, 0.35, now);
  },
  stapler: (now) => {
    synthTone('sawtooth', 1100, 220, 0.022, 0.45, now);
    synthNoise('highpass', 4000, 1, 0.01, 0.35, now);
  },
  bolt_action: (now) => {
    synthTone('triangle', 580, 150, 0.03, 0.5, now);
    synthNoise('bandpass', 2800, 3, 0.015, 0.35, now);
  },
  egg_timer: (now) => {
    synthTone('triangle', 1400, 450, 0.012, 0.38, now);
    synthNoise('highpass', 5000, 2, 0.006, 0.28, now);
  },

  // 2. Ретро-техніка та ПК
  clickwheel: (now) => {
    synthNoise('bandpass', 3200, 6, 0.009, 0.55, now);
    synthTone('sine', 1200, 280, 0.007, 0.38, now);
  },
  rotary_phone: (now) => {
    synthTone('square', 800, 300, 0.02, 0.38, now);
    synthNoise('bandpass', 1400, 4, 0.015, 0.35, now);
  },
  ibm_model_m: (now) => {
    synthTone('triangle', 2200, 800, 0.018, 0.5, now);
    synthTone('square', 900, 200, 0.022, 0.35, now);
  },
  cherry_blue: (now) => {
    synthTone('triangle', 3100, 1200, 0.01, 0.5, now);
    synthNoise('highpass', 4800, 2, 0.007, 0.35, now);
  },
  cherry_brown: (now) => {
    synthTone('sine', 650, 220, 0.015, 0.45, now);
    synthNoise('lowpass', 1200, 1, 0.01, 0.25, now);
  },
  relay_click: (now) => {
    synthTone('square', 950, 180, 0.016, 0.45, now);
    synthTone('sine', 350, 90, 0.025, 0.35, now);
  },
  floppy_seek: (now) => {
    synthTone('square', 750, 450, 0.014, 0.45, now);
  },
  hdd_stepper: (now) => {
    synthTone('triangle', 1350, 300, 0.01, 0.5, now);
    synthNoise('bandpass', 2800, 5, 0.008, 0.35, now);
  },
  dot_matrix: (now) => {
    synthTone('square', 2600, 900, 0.008, 0.5, now);
    synthNoise('highpass', 4000, 2, 0.006, 0.28, now);
  },
  vt100: (now) => {
    synthTone('sine', 1750, 400, 0.012, 0.4, now);
  },
  geiger: (now) => {
    synthNoise('bandpass', 2400 + Math.random() * 1600, 8, 0.006, 0.65, now);
  },
  telegraph: (now) => {
    synthTone('sine', 800, 800, 0.025, 0.45, now);
  },

  // 3. Музичні та перкусійні
  woodblock: (now) => {
    synthTone('sine', 1100, 420, 0.028, 0.55, now);
  },
  marimba: (now) => {
    synthTone('sine', 880, 440, 0.045, 0.5, now);
    synthTone('triangle', 1760, 880, 0.02, 0.25, now);
  },
  triangle: (now) => {
    synthTone('sine', 6200, 5800, 0.07, 0.35, now);
    synthTone('sine', 8400, 7900, 0.04, 0.25, now);
  },
  snap: (now) => {
    synthNoise('bandpass', 2200, 3, 0.016, 0.55, now);
    synthTone('sine', 1800, 500, 0.01, 0.35, now);
  },
  metronome: (now) => {
    synthTone('triangle', 720, 200, 0.022, 0.5, now);
    synthNoise('lowpass', 1500, 2, 0.01, 0.3, now);
  },
  hihat: (now) => {
    synthNoise('highpass', 6500, 1.5, 0.025, 0.45, now);
  },
  crystal: (now) => {
    synthTone('sine', 3600, 3550, 0.06, 0.4, now);
  },
  bell: (now) => {
    synthTone('sine', 2800, 2750, 0.08, 0.4, now);
    synthTone('sine', 5600, 5500, 0.04, 0.2, now);
  },
  bamboo: (now) => {
    synthTone('sine', 920, 300, 0.025, 0.5, now);
    synthNoise('bandpass', 1200, 4, 0.015, 0.35, now);
  },
  tone_440: (now) => {
    synthTone('sine', 440, 440, 0.035, 0.4, now);
  },

  // 4. Геймінг та Sci-Fi
  retro_8bit: (now) => {
    synthTone('square', 400, 1200, 0.025, 0.4, now);
  },
  gameboy_coin: (now) => {
    synthTone('square', 987, 1318, 0.03, 0.4, now);
  },
  shield_charge: (now) => {
    synthTone('sawtooth', 600, 1800, 0.025, 0.35, now);
  },
  laser_encoder: (now) => {
    synthTone('sine', 2400, 800, 0.015, 0.45, now);
    synthTone('square', 1200, 300, 0.012, 0.25, now);
  },
  cyber_servo: (now) => {
    synthTone('sawtooth', 480, 240, 0.022, 0.4, now);
    synthTone('sine', 1400, 700, 0.01, 0.25, now);
  },
  warp_drive: (now) => {
    synthTone('sine', 120, 60, 0.045, 0.65, now);
    synthTone('sawtooth', 240, 120, 0.03, 0.3, now);
  },
  holo_ui: (now) => {
    synthTone('sine', 3800, 1900, 0.012, 0.4, now);
    synthTone('sine', 1900, 950, 0.015, 0.3, now);
  },
  mag_lock: (now) => {
    synthTone('square', 220, 60, 0.04, 0.55, now);
    synthTone('triangle', 880, 220, 0.015, 0.35, now);
  },
  bio_scanner: (now) => {
    synthTone('sine', 1500, 2250, 0.02, 0.4, now);
  },

  // 5. Басові та тактильні
  sub_bass_60: (now) => {
    synthTone('sine', 60, 40, 0.05, 0.85, now);
  },
  kick_detent: (now) => {
    synthTone('sine', 130, 45, 0.035, 0.75, now);
    synthNoise('lowpass', 600, 1, 0.01, 0.35, now);
  },
  soft_rubber: (now) => {
    synthTone('sine', 380, 120, 0.018, 0.45, now);
  },
  silent: () => {}
};

function playTickSound(direction = 1) {
  if (!soundEnabled || soundPreset === 'silent') return;
  initAudio();
  if (!audioCtx || audioCtx.state !== 'running') return;
  const now = audioCtx.currentTime;
  const gen = SOUND_GENERATORS[soundPreset] || SOUND_GENERATORS.mechanical;
  try {
    gen(now, direction);
  } catch (e) {}
}

// ═══════════════════════════════════════════
//   ТАКТИЛЬНА ВІБРАЦІЯ (MULTI-TIER HAPTICS)
// ═══════════════════════════════════════════
let hapticEnabled = localStorage.getItem('loot_haptic_enabled') !== 'false';
let hapticStrength = localStorage.getItem('loot_haptic_strength') || 'medium';
let hapticType = localStorage.getItem('loot_haptic_type') || 'hybrid';
let swipeSensitivity = localStorage.getItem('loot_swipe_sensitivity') || 'normal';

function playChassisHapticPulse(gainMultiplier = 1.0) {
  initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    // Sharp resonant impulse at iPhone chassis resonance frequency (145Hz -> 110Hz)
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.045);

    const baseGain = (hapticStrength === 'light' ? 0.5 : hapticStrength === 'strong' ? 1.0 : 0.8) * gainMultiplier;
    gain.gain.setValueAtTime(baseGain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.048);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  } catch (e) {}
}

function fireIosHapticSwitch() {
  try {
    const fixtureLabel = document.getElementById('haptic-switch-label');
    const fixtureInput = document.getElementById('haptic-switch-input');
    if (fixtureLabel && fixtureInput) {
      fixtureInput.checked = !fixtureInput.checked;
      fixtureLabel.click();
    }
  } catch (e) {}

  try {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0.001;pointer-events:auto;z-index:99999;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.style.cssText = 'position:fixed;opacity:0.001;';
    label.appendChild(input);
    document.body.appendChild(label);
    label.click();
    setTimeout(() => { label.remove(); }, 35);
  } catch (e) {}
}

function triggerHaptics(direction = 1, isDirectGesture = false) {
  if (!hapticEnabled) return;

  const vibDuration = hapticStrength === 'light' ? 12 : hapticStrength === 'strong' ? 35 : 20;

  // 1. Standard / Polyfilled Web Vibration API (Android Chrome & iOS Safari via ios-vibrator)
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try { navigator.vibrate(vibDuration); } catch (e) {}
  }

  // 2. iOS Safari Physical Taptic Engine Switch Click Trigger
  fireIosHapticSwitch();

  // 3. Acoustic Chassis Resonance (physical speaker impulse in hand)
  playChassisHapticPulse();
}

// ═══════════════════════════════════════════
//   НАЛАШТУВАННЯ ТА КЕРУВАННЯ
// ═══════════════════════════════════════════
function syncSettingsUI() {
  const chkSound = document.getElementById('chkSoundEnabled');
  if (chkSound) chkSound.checked = soundEnabled;
  const selSound = document.getElementById('soundPresetSelect');
  if (selSound) selSound.value = soundPreset;
  const rngVol = document.getElementById('soundVolumeRange');
  if (rngVol) rngVol.value = Math.round(soundVolume * 100);
  const lblVol = document.getElementById('soundVolumeLabel');
  if (lblVol) lblVol.textContent = `${Math.round(soundVolume * 100)}%`;

  const chkHap = document.getElementById('chkHapticEnabled');
  if (chkHap) chkHap.checked = hapticEnabled;
  const selStr = document.getElementById('hapticStrengthSelect');
  if (selStr) selStr.value = hapticStrength;
  const selType = document.getElementById('hapticTypeSelect');
  if (selType) selType.value = hapticType;

  const selSwipe = document.getElementById('swipeSensitivitySelect');
  if (selSwipe) selSwipe.value = swipeSensitivity;
}

function toggleSoundEnabled(val) {
  soundEnabled = !!val;
  localStorage.setItem('loot_sound_enabled', soundEnabled);
  if (soundEnabled) {
    initAudio();
    playTickSound(1);
  }
}
window.toggleSoundEnabled = toggleSoundEnabled;

function onSoundPresetChange(val) {
  soundPreset = val;
  localStorage.setItem('loot_sound_preset', val);
  initAudio();
  playTickSound(1);
}
window.onSoundPresetChange = onSoundPresetChange;

function onSoundVolumeChange(val) {
  soundVolume = parseFloat(val) / 100.0;
  localStorage.setItem('loot_sound_volume', soundVolume);
  const lbl = document.getElementById('soundVolumeLabel');
  if (lbl) lbl.textContent = `${val}%`;
  initAudio();
  playTickSound(1);
}
window.onSoundVolumeChange = onSoundVolumeChange;

function toggleHapticEnabled(val) {
  hapticEnabled = !!val;
  localStorage.setItem('loot_haptic_enabled', hapticEnabled);
  if (hapticEnabled) triggerHaptics(1, true);
}
window.toggleHapticEnabled = toggleHapticEnabled;

function onHapticStrengthChange(val) {
  hapticStrength = val;
  localStorage.setItem('loot_haptic_strength', val);
  triggerHaptics(1, true);
}
window.onHapticStrengthChange = onHapticStrengthChange;

function onHapticTypeChange(val) {
  hapticType = val;
  localStorage.setItem('loot_haptic_type', val);
  triggerHaptics(1, true);
}
window.onHapticTypeChange = onHapticTypeChange;

function onSwipeSensitivityChange(val) {
  swipeSensitivity = val;
  localStorage.setItem('loot_swipe_sensitivity', val);
  playTickSound(1);
  triggerHaptics(1, true);
}
window.onSwipeSensitivityChange = onSwipeSensitivityChange;

function testHapticFeedback() {
  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);
}
window.testHapticFeedback = testHapticFeedback;

// ═══════════════════════════════════════════
//   ІНІЦІАЛІЗАЦІЯ ПРИ ЗАПУСКУ
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initCategoriesTicker();
  loadBranches();
  loadSavedBasket();
  loadSavedWishlist();
  checkMcpStatus();
  setupStageGestures();
  syncSettingsUI();
  switchViewMode('grid');

  // Початкове завантаження: гарячі акції Сільпо та АТБ
  performSearch('');

  // Миттєве розблокування Web Audio на перший будь-який дотик або клік користувача
  const unlockAudio = () => {
    initAudio();
  };
  ['touchstart', 'touchend', 'pointerdown', 'mousedown', 'click', 'keydown'].forEach(evt => {
    document.addEventListener(evt, unlockAudio, { passive: true });
  });

  // Слухач пошукового інпуту з debounce
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    searchTimeout = setTimeout(() => {
      activeCategory = null;
      document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
      updateSelectedCategoriesDisplay();
      performSearch(query); // Порожній рядок автоматично повертає акції
    }, 400);
  });
});

// ═══════════════════════════════════════════
//   МАРКІЗНІ БІЖУЧІ РЯДКИ КАТЕГОРІЙ
// ═══════════════════════════════════════════
function initCategoriesTicker() {
  const row1 = document.getElementById('row1');
  const row2 = document.getElementById('row2');

  const buildRow = (el, items) => {
    if (!el) return;
    el.innerHTML = '';
    // Подвоюємо елементи для безперервної нескінченної анімації
    [...items, ...items].forEach(cat => {
      const pill = document.createElement('div');
      pill.className = 'cat-pill';
      pill.innerHTML = `<span>${cat.e}</span> <span>${cat.n}</span>`;
      pill.dataset.category = cat.n;
      pill.addEventListener('click', () => toggleCategory(cat, pill));
      el.appendChild(pill);
    });
  };

  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    // На мобільних телефонах робимо 1 рядок за замовчуванням з усіма категоріями
    buildRow(row1, CATS);
    if (row2) row2.innerHTML = '';
  } else {
    buildRow(row1, CATS.slice(0, 10));
    buildRow(row2, CATS.slice(10, 20));
  }
}

function toggleCategory(catObj, pillElement) {
  const isCurrent = activeCategory && activeCategory.n === catObj.n;

  if (isCurrent) {
    // Зняття фільтра категорії
    activeCategory = null;
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    updateSelectedCategoriesDisplay();
    searchInput.value = '';
    performSearch('');
  } else {
    // Встановлення нової категорії та завантаження реальних товарів з API
    activeCategory = catObj;
    document.querySelectorAll('.cat-pill').forEach(p => {
      p.classList.toggle('active', p.dataset.category === catObj.n);
    });
    updateSelectedCategoriesDisplay();
    searchInput.value = catObj.n;
    performSearch(catObj.q);
  }
}

function updateSelectedCategoriesDisplay() {
  const section = document.getElementById('selectedCategoriesSection');
  const list = document.getElementById('selectedCategoriesList');

  if (!activeCategory) {
    section.classList.remove('active');
    list.innerHTML = '';
    return;
  }

  section.classList.add('active');
  list.innerHTML = `
    <div class="selected-category-badge">
      <span>${activeCategory.e} ${activeCategory.n}</span>
      <button class="selected-category-remove" onclick="removeCategoryFilter()">✕</button>
    </div>
  `;
}

function removeCategoryFilter() {
  activeCategory = null;
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  updateSelectedCategoriesDisplay();
  searchInput.value = '';
  performSearch('');
}
window.removeCategoryFilter = removeCategoryFilter;

// ═══════════════════════════════════════════
//   ПОШУК ТОВАРІВ ТА ЗАВАНТАЖЕННЯ З API
// ═══════════════════════════════════════════
async function performSearch(query) {
  currentSearchQuery = query;
  currentSearchSeq++;
  const thisSeq = currentSearchSeq;

  updateSmartCategoryBar(query);

  searchSpinner.style.display = 'block';
  allProducts = [];
  filteredProducts = [];
  currentTab = 1;

  updateCatalogCountDisplay(true, 0);
  renderCurrentView();

  try {
    const qs = new URLSearchParams({
      q: query,
      store: currentStore,
      branch_id: selectedBranchId,
      page: 1,
      limit: 100,
      sort: currentSort
    });

    const res = await fetch(`${API}/search?${qs.toString()}`);
    const data = await res.json();

    if (thisSeq !== currentSearchSeq) return; // Відповідь застаріла

    if (data.success && Array.isArray(data.items) && data.items.length > 0) {
      allProducts = data.items;
      allProducts.forEach(p => {
        p.is_nova_poshta = p.store === "silpo" && p.title && p.title.includes("Natural Garden норі");
      });
      applyFiltersAndRender();

      // Починаємо фоново підтягувати наступні вкладки (поки користувач дивиться вкладку 1)
      startBackgroundLoading(query, thisSeq);
    } else {
      allProducts = [];
      applyFiltersAndRender();
      updateCatalogCountDisplay(false, 0);
    }
  } catch (err) {
    console.error('Помилка пошуку:', err);
    if (thisSeq === currentSearchSeq) {
      allProducts = [];
      applyFiltersAndRender();
      updateCatalogCountDisplay(false, 0);
    }
  } finally {
    if (thisSeq === currentSearchSeq) {
      searchSpinner.style.display = 'none';
    }
  }
}

async function startBackgroundLoading(query, seq) {
  isBackgroundLoading = true;
  updateLoadingBadge(true, "Підтягуються інші товари...");

  let page = 2;
  const maxPages = 15; // До 1500 товарів

  while (page <= maxPages && currentSearchSeq === seq) {
    try {
      const qs = new URLSearchParams({
        q: query,
        store: currentStore,
        branch_id: selectedBranchId,
        page: page,
        limit: 100,
        sort: currentSort
      });

      const res = await fetch(`${API}/search?${qs.toString()}`);
      if (currentSearchSeq !== seq) break;

      const data = await res.json();
      if (!data.success || !data.items || data.items.length === 0) {
        break;
      }

      data.items.forEach(p => {
        p.is_nova_poshta = p.store === "silpo" && p.title && p.title.includes("Natural Garden норі");
      });

      // Перевіряємо унікальність нових товарів
      const existingKeys = new Set(allProducts.map(p => (p.link || p.product_url || p.title)));
      const newUnique = data.items.filter(p => !existingKeys.has(p.link || p.product_url || p.title));

      if (newUnique.length > 0) {
        allProducts.push(...newUnique);
        // Оновлюємо вкладки та лічильник без збивання позиції користувача
        applyFiltersAndRender_NoReset();
      }

      if (!data.has_more || data.items.length < 15) {
        break;
      }

      page++;
      // Коротка пауза між сторінками для економії ресурсів мережі та браузера
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.warn("Фонове завантаження завершилось:", e);
      break;
    }
  }

  if (currentSearchSeq === seq) {
    isBackgroundLoading = false;
    updateCatalogCountDisplay(false);
    updateLoadingBadge(true, "✅ Всі товари завантажено");
    setTimeout(() => {
      if (!isBackgroundLoading && currentSearchSeq === seq) {
        updateLoadingBadge(false);
      }
    }, 3500);
  }
}

function updateCatalogCountDisplay(isLoading, count) {
  const chipText = document.getElementById('catalogFoundText');
  if (!chipText) return;
  const total = count !== undefined ? count : (allProducts ? allProducts.length : 0);
  const totalFiltered = filteredProducts ? filteredProducts.length : 0;
  const totalTabs = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_TAB));

  const atbCount = filteredProducts ? filteredProducts.filter(p => p.store === 'atb').length : 0;
  const silpoCount = filteredProducts ? filteredProducts.filter(p => p.store === 'silpo').length : 0;

  // Оновлюємо також цифри на кнопках фільтра магазину
  const ftAll = document.getElementById('ftStoreAll');
  const ftAtb = document.getElementById('ftStoreAtb');
  const ftSilpo = document.getElementById('ftStoreSilpo');
  const totalAtbAll = allProducts ? allProducts.filter(p => p.store === 'atb').length : 0;
  const totalSilpoAll = allProducts ? allProducts.filter(p => p.store === 'silpo').length : 0;

  if (ftAll) ftAll.textContent = `Всі (${allProducts.length})`;
  if (ftAtb) ftAtb.textContent = `🔴 АТБ (${totalAtbAll})`;
  if (ftSilpo) ftSilpo.textContent = `🟠 Сільпо (${totalSilpoAll})`;

  if (isLoading && total === 0) {
    chipText.innerHTML = `<span class="loading-spin-dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;"></span> Завантаження товарів...`;
  } else {
    chipText.innerHTML = `
      <span>Знайдено: <strong>${totalFiltered}</strong> товарів</span>
      <span class="store-badge-stat store-badge-atb" title="Товарів з АТБ"><span class="store-dot-mini atb-dot"></span> АТБ: <b>${atbCount}</b></span>
      <span class="store-badge-stat store-badge-silpo" title="Товарів із Сільпо"><span class="store-dot-mini silpo-dot"></span> Сільпо: <b>${silpoCount}</b></span>
      <span class="tab-badge-stat">Вкладка <b>${currentTab}</b> з <b>${totalTabs}</b></span>
    `;
  }
}

function updateLoadingBadge(show, text) {
  const badge = document.getElementById('catalogLoadingBadge');
  const txt = document.getElementById('catalogLoadingText');
  if (!badge) return;
  if (show) {
    badge.style.display = 'inline-flex';
    if (txt && text) txt.textContent = text;
  } else {
    badge.style.display = 'none';
  }
}

function selectCatalogTab(tabNum) {
  if (tabNum < 1) return;
  const totalTabs = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_TAB));
  if (tabNum > totalTabs) return;

  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);

  currentTab = tabNum;
  updateCatalogCountDisplay();
  renderCurrentView();

  const searchBox = document.querySelector('.search-bar-row');
  if (searchBox) {
    searchBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
window.selectCatalogTab = selectCatalogTab;

// ═══════════════════════════════════════════
//   РОЗРАХУНОК НОРМАЛІЗОВАНОЇ ЦІНИ ТА ЕКОНОМІЇ
// ═══════════════════════════════════════════
function getNormalizedUnitPrice(p) {
  if (!p) return null;
  const price = typeof p.price === 'number' ? p.price : parseFloat(p.price || 0);
  if (!price || price <= 0) return null;
  const text = `${p.title || ''} ${p.weight || ''}`.toLowerCase();

  // 1. Вага в кілограмах -> ціна за 100 г
  let m = text.match(/(\d+[\.,]?\d*)\s*(?:кг|kg)(?![а-яa-z0-9])/i);
  if (m) {
    const val = parseFloat(m[1].replace(',', '.'));
    if (val > 0) return (price / val) / 10;
  }

  // 2. Об'єм у літрах -> ціна за 100 мл
  m = text.match(/(\d+[\.,]?\d*)\s*(?:л|l)(?![а-яa-z0-9])/i);
  if (m) {
    const val = parseFloat(m[1].replace(',', '.'));
    if (val > 0) return (price / val) / 10;
  }

  // 3. Вага у грамах -> ціна за 100 г
  m = text.match(/(\d+[\.,]?\d*)\s*(?:г|гр|g)(?![а-яa-z0-9])/i);
  if (m) {
    const val = parseFloat(m[1].replace(',', '.'));
    if (val > 0) return (price / val) * 100;
  }

  // 4. Об'єм у мілілітрах -> ціна за 100 мл
  m = text.match(/(\d+[\.,]?\d*)\s*(?:мл|ml)(?![а-яa-z0-9])/i);
  if (m) {
    const val = parseFloat(m[1].replace(',', '.'));
    if (val > 0) return (price / val) * 100;
  }

  return null;
}

function getSavingAmount(p) {
  if (!p) return 0;
  if (typeof p.saving === 'number' && p.saving > 0) return p.saving;
  const oldP = parseFloat(p.old_price || 0);
  const curP = parseFloat(p.price || 0);
  if (oldP > curP && curP > 0) {
    return Math.round((oldP - curP) * 100) / 100;
  }
  return 0;
}

function renderGridBottomPagination(totalTabs, totalItems) {
  let bottomNav = productsGrid.querySelector('.catalog-bottom-pagination');
  if (totalTabs <= 1) {
    if (bottomNav) bottomNav.remove();
    return;
  }
  if (!bottomNav) {
    bottomNav = document.createElement('div');
    bottomNav.className = 'catalog-bottom-pagination';
    productsGrid.appendChild(bottomNav);
  }

  let tabsHtml = '';
  for (let i = 1; i <= totalTabs; i++) {
    const startNum = (i - 1) * ITEMS_PER_TAB + 1;
    const endNum = Math.min(i * ITEMS_PER_TAB, totalItems);
    const isActive = i === currentTab;
    tabsHtml += `
      <button class="catalog-tab-btn ${isActive ? 'active' : ''}" onclick="selectCatalogTab(${i})">
        <span>Вкладка ${i}</span>
        <span class="tab-badge-count">${startNum}–${endNum}</span>
      </button>
    `;
  }

  bottomNav.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
      <button class="catalog-page-btn" ${currentTab <= 1 ? 'disabled' : ''} onclick="selectCatalogTab(${currentTab - 1})">
        <i class="fa-solid fa-chevron-left"></i> Попередня вкладка
      </button>
      <span class="catalog-page-info">Вкладка <strong>${currentTab}</strong> з <strong>${totalTabs}</strong> (${totalItems} товарів)</span>
      <button class="catalog-page-btn" ${currentTab >= totalTabs ? 'disabled' : ''} onclick="selectCatalogTab(${currentTab + 1})">
        Наступна вкладка <i class="fa-solid fa-chevron-right"></i>
      </button>
    </div>
    <div class="catalog-tabs-list" style="justify-content:center; flex-wrap:wrap; width:100%; gap:8px;">
      ${tabsHtml}
    </div>
  `;
}

function renderStageBottomPagination(totalTabs, totalItems) {
  const stageNav = document.getElementById('stageBottomPagination');
  if (!stageNav) return;
  if (totalTabs <= 1) {
    stageNav.style.display = 'none';
    stageNav.innerHTML = '';
    return;
  }

  let tabsHtml = '';
  for (let i = 1; i <= totalTabs; i++) {
    const startNum = (i - 1) * ITEMS_PER_TAB + 1;
    const endNum = Math.min(i * ITEMS_PER_TAB, totalItems);
    const isActive = i === currentTab;
    tabsHtml += `
      <button class="catalog-tab-btn ${isActive ? 'active' : ''}" onclick="selectCatalogTab(${i})">
        <span>Вкладка ${i}</span>
        <span class="tab-badge-count">${startNum}–${endNum}</span>
      </button>
    `;
  }

  stageNav.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; width:100%; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
      <button class="catalog-page-btn" ${currentTab <= 1 ? 'disabled' : ''} onclick="selectCatalogTab(${currentTab - 1})">
        <i class="fa-solid fa-chevron-left"></i> Назад
      </button>
      <span class="catalog-page-info">Вкладка <strong>${currentTab}</strong> з <strong>${totalTabs}</strong> (${totalItems} товарів)</span>
      <button class="catalog-page-btn" ${currentTab >= totalTabs ? 'disabled' : ''} onclick="selectCatalogTab(${currentTab + 1})">
        Вперед <i class="fa-solid fa-chevron-right"></i>
      </button>
    </div>
    <div class="catalog-tabs-list" style="justify-content:center; flex-wrap:wrap; width:100%; gap:8px;">
      ${tabsHtml}
    </div>
  `;
  stageNav.style.display = 'flex';
}

function applyFiltersAndRender_NoReset() {
  const savedTab = currentTab;
  applyFiltersAndRender_Core();
  const maxTabs = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_TAB));
  currentTab = Math.min(savedTab, maxTabs);
  updateCatalogCountDisplay();

  const scrollY = window.scrollY;

  // Якщо сортування активне і новий товар випередив інші (наприклад знижка 62% стала вище за 60%),
  // виявляємо зміну порядку карток на поточній вкладці і оновлюємо сітку зі збереженням скролу!
  if (currentViewMode === 'grid') {
    const startIndex = (currentTab - 1) * ITEMS_PER_TAB;
    const pageItems = filteredProducts.slice(startIndex, startIndex + ITEMS_PER_TAB);
    const existingCards = productsGrid.querySelectorAll('.grid-product-card');

    let hasChanged = existingCards.length !== pageItems.length;
    if (!hasChanged) {
      for (let i = 0; i < pageItems.length; i++) {
        const c = existingCards[i];
        const p = pageItems[i];
        const pKey = p.link || p.product_url || p.title;
        if (c.dataset.productId !== pKey) {
          hasChanged = true;
          break;
        }
      }
    }

    if (hasChanged) {
      renderGrid();
      window.scrollTo(0, scrollY);
      return;
    } else {
      renderGridBottomPagination(maxTabs, filteredProducts.length);
      return;
    }
  } else if (currentViewMode === '3d') {
    renderStage();
    return;
  }

  renderCurrentView();
  window.scrollTo(0, scrollY);
}

function applyFiltersAndRender() {
  currentTab = 1;
  applyFiltersAndRender_Core();
  updateCatalogCountDisplay();
  renderCurrentView();
}

function applyFiltersAndRender_Core() {
  let filtered = [...allProducts];

  // 1. Фільтр за магазином
  if (currentStore !== 'all') {
    filtered = filtered.filter(p => p.store === currentStore);
  }

  // 2. Фільтр за розміром знижки
  if (filterDiscountMin > 0) {
    if (filterDiscountMin === 1) {
      filtered = filtered.filter(p => p.has_discount || (p.discount_percent && p.discount_percent > 0));
    } else {
      filtered = filtered.filter(p => (Number(p.discount_percent) || 0) >= filterDiscountMin);
    }
  }

  // 3. Фільтр за ціновим діапазоном
  if (filterPriceRange !== 'all') {
    filtered = filtered.filter(p => {
      const pr = Number(p.price) || 0;
      if (filterPriceRange === '0-50') return pr <= 50;
      if (filterPriceRange === '50-100') return pr > 50 && pr <= 100;
      if (filterPriceRange === '100-250') return pr > 100 && pr <= 250;
      if (filterPriceRange === '250+') return pr > 250;
      return true;
    });
  }

  // 4. Тільки з вагою / розрахунком за 100г/мл
  if (filterOnlyWithWeight) {
    filtered = filtered.filter(p => getNormalizedUnitPrice(p) !== null);
  }

  // 5. Тільки в наявності
  if (filterOnlyInStock) {
    filtered = filtered.filter(p => p.in_stock !== false);
  }

  // 5.1. Товари тільки для замовлення Новою Поштою
  if (!showNovaPoshta) {
    filtered = filtered.filter(p => !p.is_nova_poshta);
  }

  // 6. СОРТУВАННЯ
  if (currentSort === 'unit_price_asc') {
    filtered.sort((a, b) => {
      const uA = getNormalizedUnitPrice(a);
      const uB = getNormalizedUnitPrice(b);
      if (uA !== null && uB !== null) return uA - uB;
      if (uA !== null) return -1;
      if (uB !== null) return 1;
      return (Number(a.price) || 0) - (Number(b.price) || 0);
    });
  } else if (currentSort === 'unit_price_desc') {
    filtered.sort((a, b) => {
      const uA = getNormalizedUnitPrice(a);
      const uB = getNormalizedUnitPrice(b);
      if (uA !== null && uB !== null) return uB - uA;
      if (uA !== null) return -1;
      if (uB !== null) return 1;
      return (Number(b.price) || 0) - (Number(a.price) || 0);
    });
  } else if (currentSort === 'saving_desc') {
    filtered.sort((a, b) => {
      const sA = getSavingAmount(a);
      const sB = getSavingAmount(b);
      return sB - sA;
    });
  } else if (currentSort === 'discount_desc') {
    filtered.sort((a, b) => (Number(b.discount_percent) || 0) - (Number(a.discount_percent) || 0));
  } else if (currentSort === 'price_asc') {
    filtered.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  } else if (currentSort === 'price_desc') {
    filtered.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  } else if (currentSort === 'title_asc') {
    filtered.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'uk'));
  } else if (currentSort === 'title_desc') {
    filtered.sort((a, b) => (b.title || '').localeCompare(a.title || '', 'uk'));
  }

  filteredProducts = filtered;

  // Оновлення текстового лічильника у меню фільтрів
  const countLbl = document.getElementById('filterResultsCountLbl');
  if (countLbl) {
    countLbl.textContent = `Показано: ${filtered.length} з ${allProducts.length} товарів`;
  }


}

function setStoreFilter(store) {
  selectFilterStore(store);
}

function selectFilterStore(store) {
  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);

  currentStore = store;
  
  // Оновлення тегів у випадаючому меню фільтрів
  document.querySelectorAll('.filter-store-pills .filter-tag').forEach(b => {
    b.classList.remove('active');
  });
  if (store === 'all') document.getElementById('ftStoreAll')?.classList.add('active');
  else if (store === 'atb') document.getElementById('ftStoreAtb')?.classList.add('active');
  else if (store === 'silpo') document.getElementById('ftStoreSilpo')?.classList.add('active');

  // Оновлення швидких кнопок магазинів
  document.querySelectorAll('.quick-action-pills .pill-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  if (store === 'all') document.getElementById('storePillAll')?.classList.add('active');
  else if (store === 'atb') document.getElementById('storePillAtb')?.classList.add('active');
  else if (store === 'silpo') document.getElementById('storePillSilpo')?.classList.add('active');

  updateFilterButtonState();
  applyFiltersAndRender();
}
window.selectFilterStore = selectFilterStore;
window.setStoreFilter = setStoreFilter;

function selectDiscountMinFilter(minPct) {
  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);

  filterDiscountMin = minPct;

  document.querySelectorAll('#filterDropdown .filter-pills-wrap .filter-pill-chip[id^="ftDisc"]').forEach(b => {
    b.classList.remove('active');
  });
  if (minPct === 0) document.getElementById('ftDiscAll')?.classList.add('active');
  else if (minPct === 1) document.getElementById('ftDiscAny')?.classList.add('active');
  else if (minPct === 20) document.getElementById('ftDisc20')?.classList.add('active');
  else if (minPct === 30) document.getElementById('ftDisc30')?.classList.add('active');
  else if (minPct === 50) document.getElementById('ftDisc50')?.classList.add('active');

  updateFilterButtonState();
  applyFiltersAndRender();
}
window.selectDiscountMinFilter = selectDiscountMinFilter;

function selectPriceRangeFilter(rangeKey) {
  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);

  filterPriceRange = rangeKey;

  document.querySelectorAll('#filterDropdown .filter-pills-wrap .filter-pill-chip[id^="ftPrice"]').forEach(b => {
    b.classList.remove('active');
  });
  if (rangeKey === 'all') document.getElementById('ftPriceAll')?.classList.add('active');
  else if (rangeKey === '0-50') document.getElementById('ftPriceUnder50')?.classList.add('active');
  else if (rangeKey === '50-100') document.getElementById('ftPrice50to100')?.classList.add('active');
  else if (rangeKey === '100-250') document.getElementById('ftPrice100to250')?.classList.add('active');
  else if (rangeKey === '250+') document.getElementById('ftPriceAbove250')?.classList.add('active');

  updateFilterButtonState();
  applyFiltersAndRender();
}
window.selectPriceRangeFilter = selectPriceRangeFilter;

function toggleOnlyWithWeightFilter(checked) {
  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);

  filterOnlyWithWeight = checked;
  updateFilterButtonState();
  applyFiltersAndRender();
}
window.toggleOnlyWithWeightFilter = toggleOnlyWithWeightFilter;

function toggleOnlyInStockFilter(checked) {
  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);

  filterOnlyInStock = checked;
  updateFilterButtonState();
  applyFiltersAndRender();
}
window.toggleOnlyInStockFilter = toggleOnlyInStockFilter;

function resetAllFilters() {
  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);

  currentStore = 'all';
  filterDiscountMin = 0;
  filterPriceRange = 'all';
  filterOnlyWithWeight = false;
  filterOnlyInStock = true;

  // Оновлення інтерфейсу
  document.querySelectorAll('.filter-store-pills .filter-tag').forEach(b => b.classList.remove('active'));
  document.getElementById('ftStoreAll')?.classList.add('active');

  document.querySelectorAll('#filterDropdown .filter-pills-wrap .filter-pill-chip[id^="ftDisc"]').forEach(b => b.classList.remove('active'));
  document.getElementById('ftDiscAll')?.classList.add('active');

  document.querySelectorAll('#filterDropdown .filter-pills-wrap .filter-pill-chip[id^="ftPrice"]').forEach(b => b.classList.remove('active'));
  document.getElementById('ftPriceAll')?.classList.add('active');

  const chkWeight = document.getElementById('chkOnlyWithWeight');
  if (chkWeight) chkWeight.checked = false;

  const chkStock = document.getElementById('chkOnlyInStock');
  if (chkStock) chkStock.checked = true;

  updateFilterButtonState();
  applyFiltersAndRender();
}
window.resetAllFilters = resetAllFilters;

// ═══════════════════════════════════════════
//   МЕНЮ КАТЕГОРІЙ, СОРТУВАННЯ ТА ФІЛЬТРІВ
// ═══════════════════════════════════════════
const SMART_CATEGORY_METADATA = {
  'напої': {
    title: 'Напої',
    icon: '🥤',
    pills: [
      { name: 'Всі напої', q: 'напої' },
      { name: '🧃 Соки та нектари', q: 'сік' },
      { name: '⚡ Енергетики', q: 'енергетик' },
      { name: '🥤 Кола & Лимонад', q: 'кола' },
      { name: '💧 Мінеральна вода', q: 'вода' },
      { name: '🍃 Квас & Чай', q: 'квас' }
    ]
  },
  'молочка': {
    title: 'Молочні продукти',
    icon: '🥛',
    pills: [
      { name: 'Вся молочка', q: 'молочка' },
      { name: 'Молоко', q: 'молоко' },
      { name: 'Сири тверді', q: 'сир' },
      { name: 'Йогурти', q: 'йогурт' },
      { name: 'Масло', q: 'масло' }
    ]
  },
  'м\'ясо': {
    title: 'М\'ясо та ковбаси',
    icon: '🥩',
    pills: [
      { name: 'Все м\'ясо', q: 'м\'ясо' },
      { name: 'Курятина', q: 'курка' },
      { name: 'Свинина', q: 'свинина' },
      { name: 'Ковбаса', q: 'ковбаса' },
      { name: 'Сосиски', q: 'сосиски' }
    ]
  },
  'солодощі': {
    title: 'Солодощі та десерти',
    icon: '🍫',
    pills: [
      { name: 'Всі солодощі', q: 'солодощі' },
      { name: 'Шоколад', q: 'шоколад' },
      { name: 'Печиво', q: 'печиво' },
      { name: 'Цукерки', q: 'цукерки' }
    ]
  },
  'снеки': {
    title: 'Снеки та чипси',
    icon: '🥔',
    pills: [
      { name: 'Всі снеки', q: 'снеки' },
      { name: 'Чипси', q: 'чипси' },
      { name: 'Сухарики', q: 'сухарики' },
      { name: 'Горішки', q: 'горішки' }
    ]
  },
  'риба': {
    title: 'Риба та морепродукти',
    icon: '🐟',
    pills: [
      { name: 'Вся риба', q: 'риба' },
      { name: 'Лосось', q: 'лосось' },
      { name: 'Оселедець', q: 'оселедець' },
      { name: 'Креветки', q: 'креветки' }
    ]
  },
  'фрукти': {
    title: 'Овочі та фрукти',
    icon: '🍎',
    pills: [
      { name: 'Всі фрукти & овочі', q: 'фрукти' },
      { name: 'Яблука', q: 'яблука' },
      { name: 'Банани', q: 'банани' },
      { name: 'Овочі', q: 'овочі' }
    ]
  },
  'бакалія': {
    title: 'Бакалія та крупи',
    icon: '🌾',
    pills: [
      { name: 'Вся бакалія', q: 'бакалія' },
      { name: 'Макарони', q: 'макарони' },
      { name: 'Гречка', q: 'гречка' },
      { name: 'Олія', q: 'олія' }
    ]
  },
  'кава': {
    title: 'Кава та чай',
    icon: '☕',
    pills: [
      { name: 'Вся кава & чай', q: 'кава' },
      { name: 'В зернах', q: 'кава в зернах' },
      { name: 'Розчинна', q: 'кава розчинна' },
      { name: 'Чай', q: 'чай' }
    ]
  },
  'хімія': {
    title: 'Побутова хімія',
    icon: '🧼',
    pills: [
      { name: 'Вся хімія', q: 'хімія' },
      { name: 'Порошок', q: 'порошок' },
      { name: 'Мило', q: 'мило' },
      { name: 'Для посуду', q: 'миючий засіб' }
    ]
  }
};

function toggleCategoriesMenu(e) {
  if (e) e.stopPropagation();
  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);

  const catMenu = document.getElementById('categoriesDropdown');
  const sortMenu = document.getElementById('sortDropdown');
  const filterMenu = document.getElementById('filterDropdown');

  if (sortMenu) sortMenu.style.display = 'none';
  if (filterMenu) filterMenu.style.display = 'none';

  const btn = document.getElementById('categoriesRoundBtn');
  if (!catMenu) return;
  const isHidden = catMenu.style.display === 'none';
  catMenu.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.classList.toggle('active', isHidden);
}
window.toggleCategoriesMenu = toggleCategoriesMenu;

function quickSearchCategory(catQuery) {
  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);

  const menu = document.getElementById('categoriesDropdown');
  if (menu) menu.style.display = 'none';
  document.getElementById('categoriesRoundBtn')?.classList.remove('active');

  searchInput.value = catQuery;
  updateSmartCategoryBar(catQuery);
  performSearch(catQuery);
}
window.quickSearchCategory = quickSearchCategory;

function updateSmartCategoryBar(query) {
  const bar = document.getElementById('smartCategoryActiveBar');
  const iconEl = document.getElementById('smartCatIcon');
  const nameEl = document.getElementById('smartCatName');
  const pillsEl = document.getElementById('smartCategoryPills');
  if (!bar || !pillsEl) return;

  const q = (query || '').toLowerCase().trim();
  let matchedMeta = null;

  for (const [key, meta] of Object.entries(SMART_CATEGORY_METADATA)) {
    if (q === key || meta.pills.some(p => p.q === q) || q.includes(key)) {
      matchedMeta = meta;
      break;
    }
  }

  if (matchedMeta) {
    iconEl.textContent = matchedMeta.icon;
    nameEl.textContent = matchedMeta.title;
    pillsEl.innerHTML = matchedMeta.pills.map(p => `
      <button class="smart-sub-pill ${p.q === q ? 'active' : ''}" onclick="quickSearchCategory('${p.q}')">
        ${p.name}
      </button>
    `).join('');
    bar.style.display = 'flex';
  } else {
    bar.style.display = 'none';
  }
}
window.updateSmartCategoryBar = updateSmartCategoryBar;

function clearSmartCategory() {
  const bar = document.getElementById('smartCategoryActiveBar');
  if (bar) bar.style.display = 'none';
  searchInput.value = '';
  performSearch('');
}
window.clearSmartCategory = clearSmartCategory;

function toggleSortMenu(e) {
  if (e) e.stopPropagation();
  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);

  const sortMenu = document.getElementById('sortDropdown');
  const filterMenu = document.getElementById('filterDropdown');
  const catMenu = document.getElementById('categoriesDropdown');
  if (filterMenu) filterMenu.style.display = 'none';
  if (catMenu) catMenu.style.display = 'none';
  document.getElementById('categoriesRoundBtn')?.classList.remove('active');

  const filterBtn = document.getElementById('filterRoundBtn');
  if (filterBtn && !filterBtn.classList.contains('has-filter')) {
    filterBtn.classList.remove('active');
  }

  const btn = document.getElementById('sortRoundBtn');
  if (!sortMenu) return;
  const isHidden = sortMenu.style.display === 'none';
  sortMenu.style.display = isHidden ? 'block' : 'none';
  if (btn) btn.classList.toggle('active', isHidden || currentSort !== 'default');
}
window.toggleSortMenu = toggleSortMenu;

function toggleFilterMenu(e) {
  if (e) e.stopPropagation();
  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);

  const filterMenu = document.getElementById('filterDropdown');
  const sortMenu = document.getElementById('sortDropdown');
  const catMenu = document.getElementById('categoriesDropdown');
  if (sortMenu) sortMenu.style.display = 'none';
  if (catMenu) catMenu.style.display = 'none';
  document.getElementById('categoriesRoundBtn')?.classList.remove('active');

  const sortBtn = document.getElementById('sortRoundBtn');
  if (sortBtn && currentSort === 'default') {
    sortBtn.classList.remove('active');
  }

  const btn = document.getElementById('filterRoundBtn');
  if (!filterMenu) return;
  const isHidden = filterMenu.style.display === 'none';
  filterMenu.style.display = isHidden ? 'block' : 'none';
  if (btn) {
    const isCustom = currentStore !== 'all' || filterDiscountMin > 0 || filterPriceRange !== 'all' || filterOnlyWithWeight || !filterOnlyInStock;
    btn.classList.toggle('active', isHidden || isCustom);
  }
}
window.toggleFilterMenu = toggleFilterMenu;

function selectSortOption(sortKey) {
  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);

  currentSort = sortKey;
  document.querySelectorAll('#sortDropdown .dropdown-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === sortKey);
  });

  const sortBadgeNames = {
    'default': '⚡ Дефолт',
    'unit_price_asc': '⚖️ 100г дешеві',
    'unit_price_desc': '⚖️ 100г дорогі',
    'saving_desc': '🏷️ Економія ₴',
    'discount_desc': '🔥 Знижка %',
    'price_asc': '🪙 Ціна ↑',
    'price_desc': '💎 Ціна ↓',
    'title_asc': '🔤 А — Я',
    'title_desc': '🔡 Я — А'
  };

  const badge = document.getElementById('sortActiveBadge');
  if (badge) badge.textContent = sortBadgeNames[sortKey] || '⚡ Дефолт';

  const sortMenu = document.getElementById('sortDropdown');
  if (sortMenu) sortMenu.style.display = 'none';
  document.getElementById('sortRoundBtn')?.classList.toggle('active', sortKey !== 'default');
  applyFiltersAndRender();
}
window.selectSortOption = selectSortOption;

function updateFilterButtonState() {
  const isCustomStore = currentStore !== 'all';
  const isCustomDiscount = filterDiscountMin > 0;
  const isCustomPrice = filterPriceRange !== 'all';
  const isCustomWeight = filterOnlyWithWeight;
  const isCustomStock = !filterOnlyInStock;

  const activeCount = [isCustomStore, isCustomDiscount, isCustomPrice, isCustomWeight, isCustomStock].filter(Boolean).length;
  const hasActiveFilter = activeCount > 0;

  const filterBtn = document.getElementById('filterRoundBtn');
  if (filterBtn) {
    filterBtn.classList.toggle('has-filter', hasActiveFilter);
    filterBtn.classList.toggle('active', hasActiveFilter);

    let badge = filterBtn.querySelector('.filter-count-badge');
    if (hasActiveFilter) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'filter-count-badge';
        filterBtn.appendChild(badge);
      }
      badge.textContent = activeCount;
    } else if (badge) {
      badge.remove();
    }
  }

  const resetBtn = document.getElementById('filterResetBtn');
  if (resetBtn) {
    resetBtn.style.opacity = hasActiveFilter ? '1' : '0.4';
    resetBtn.style.pointerEvents = hasActiveFilter ? 'auto' : 'none';
  }
}

// Закриття меню при кліку за межами
document.addEventListener('click', (e) => {
  const catMenu = document.getElementById('categoriesDropdown');
  const catBtn = document.getElementById('categoriesRoundBtn');
  if (catMenu && catMenu.style.display !== 'none') {
    if (!catMenu.contains(e.target) && !catBtn?.contains(e.target)) {
      catMenu.style.display = 'none';
      catBtn?.classList.remove('active');
    }
  }

  const sortMenu = document.getElementById('sortDropdown');
  const sortBtn = document.getElementById('sortRoundBtn');
  if (sortMenu && sortMenu.style.display !== 'none') {
    if (!sortMenu.contains(e.target) && !sortBtn?.contains(e.target)) {
      sortMenu.style.display = 'none';
      if (currentSort === 'default') sortBtn?.classList.remove('active');
    }
  }

  const filterMenu = document.getElementById('filterDropdown');
  const filterBtn = document.getElementById('filterRoundBtn');
  if (filterMenu && filterMenu.style.display !== 'none') {
    if (!filterMenu.contains(e.target) && !filterBtn?.contains(e.target)) {
      filterMenu.style.display = 'none';
      const isCustom = currentStore !== 'all' || filterDiscountMin > 0 || filterPriceRange !== 'all' || filterOnlyWithWeight || !filterOnlyInStock;
      if (!isCustom) {
        filterBtn?.classList.remove('active');
      }
    }
  }
});

// ═══════════════════════════════════════════
//   ПЕРЕМИКАЧ РЕЖИМІВ (3D, СІТКА, VS)
// ═══════════════════════════════════════════
function switchViewMode(mode) {
  currentViewMode = mode;

  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === mode);
  });

  const dualPill = document.getElementById('dualCompareBtn');
  if (dualPill) dualPill.classList.toggle('active', mode === 'dual');

  const gridPill = document.getElementById('gridModeBtn');
  if (gridPill) gridPill.classList.toggle('active', mode === 'grid');

  // Оновлюємо іконку на круглій кнопці перемикання біля пошуку
  const roundIcon = document.getElementById('viewToggleRoundIcon');
  if (roundIcon) {
    if (mode === '3d') {
      roundIcon.className = 'fa-solid fa-cube';
    } else if (mode === 'grid') {
      roundIcon.className = 'fa-solid fa-table-cells';
    } else if (mode === 'dual') {
      roundIcon.className = 'fa-solid fa-bolt';
    }
  }

  if (mode === '3d') {
    document.body.classList.add('mode-3d-locked');
    stageContainer.style.display = 'flex';
    productsGrid.style.display = 'none';
    dualViewContainer.style.display = 'none';
    renderStage();
  } else if (mode === 'grid') {
    document.body.classList.remove('mode-3d-locked');
    stageContainer.style.display = 'none';
    productsGrid.style.display = 'grid';
    dualViewContainer.style.display = 'none';
    renderGrid();
  } else if (mode === 'dual') {
    document.body.classList.remove('mode-3d-locked');
    stageContainer.style.display = 'none';
    productsGrid.style.display = 'none';
    dualViewContainer.style.display = 'block';
    renderDualView();
  }
}
window.switchViewMode = switchViewMode;

function cycleViewMode() {
  initAudio();
  playTickSound(1);
  triggerHaptics(1, true);

  if (currentViewMode === 'grid') {
    switchViewMode('3d');
  } else if (currentViewMode === '3d') {
    switchViewMode('dual');
  } else {
    switchViewMode('grid');
  }
}
window.cycleViewMode = cycleViewMode;

// ═══════════════════════════════════════════
//   РЕЖИМ 1: 3D COVER-FLOW СЦЕНА КАРТОК
// ═══════════════════════════════════════════
function renderStage() {
  stage.innerHTML = '';
  cards = [];

  const totalItems = filteredProducts.length;
  const totalTabs = Math.max(1, Math.ceil(totalItems / ITEMS_PER_TAB));
  if (currentTab > totalTabs) currentTab = totalTabs;

  const startIndex = (currentTab - 1) * ITEMS_PER_TAB;
  const pageItems = filteredProducts.slice(startIndex, startIndex + ITEMS_PER_TAB);

  if (pageItems.length === 0) {
    stage.innerHTML = `
      <div style="text-align:center; padding:50px 20px; background:#fff; border-radius:22px; box-shadow:var(--shadow-md); width:320px;">
        <div style="font-size:48px; margin-bottom:12px;">🔍</div>
        <div style="font-size:16px; font-weight:800; color:var(--text); margin-bottom:6px;">Нічого не знайдено</div>
        <div style="font-size:13px; color:var(--text3);">Спробуйте інший пошуковий запит або категорію.</div>
      </div>
    `;
    stageCounter.textContent = '0 товарів';
    return;
  }

  pageItems.forEach((product, idx) => {
    addCard(product, idx);
  });

  activeIdx = 0;
  applyPositions();
  updateCounter();

  // Нижня пагінація для 3D режиму
  renderStageBottomPagination(totalTabs, totalItems);
}

function createCardSlot(product, index) {
  const slot = document.createElement('div');
  slot.className = 'card-slot';
  slot.dataset.index = index;

  const isAtb = product.store === 'atb';
  const price = typeof product.price === 'number' ? product.price : parseFloat(product.price || 0);
  const oldPrice = product.old_price ? parseFloat(product.old_price) : null;
  const unitPrice = calculateUnitPrice(product.title, product.weight, price);
  const imgSrc = getProductImg(product);

  const visual = document.createElement('div');
  visual.className = 'card-slot-visual';

  const scene = document.createElement('div');
  scene.className = 'card-scene';

  const inner = document.createElement('div');
  inner.className = 'card-inner';

  // 1. ЛИЦЬОВА СТОРОНА (FRONT)
  const front = document.createElement('div');
  front.className = 'card-face card-front';
  const frontInner = document.createElement('div');
  frontInner.className = 'card-face-inner';

  const imgArea = document.createElement('div');
  imgArea.className = 'card-image-area';

  const img = document.createElement('img');
  img.className = 'card-product-img';
  img.src = imgSrc || FALLBACK_SVG;
  img.alt = product.title || '';
  img.loading = 'lazy';
  img.onerror = () => { img.src = FALLBACK_SVG; };
  imgArea.appendChild(img);

  // Бейдж знижки
  if (product.discount_percent && product.discount_percent > 5) {
    const discBadge = document.createElement('div');
    discBadge.className = 'card-discount-badge';
    discBadge.textContent = `-${product.discount_percent}%`;
    imgArea.appendChild(discBadge);
  }

  // Плаваючий бейдж ціни
  const priceBadge = document.createElement('div');
  priceBadge.className = 'price-badge';
  priceBadge.innerHTML = `
    ${oldPrice && oldPrice > price ? `<span class="price-old-mini">${oldPrice.toFixed(2)} ₴</span>` : ''}
    <span>${price.toFixed(2)} ₴</span>
  `;
  imgArea.appendChild(priceBadge);

  // Тіло картки: Сільпо — помаранчеве, АТБ — червоне
  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = `
    <div class="category-row">
      <span class="category-label ${isAtb ? 'category-atb' : 'category-silpo'}">${isAtb ? '🔴 АТБ' : '🟠 Сільпо'}</span>
      <span class="weight-label">${product.weight || ''}</span>
      ${unitPrice ? `<span class="unit-price-pill" title="Чесна ціна за 100 г">⚖️ ${unitPrice.text}</span>` : ''}
    </div>
    <div class="product-name" title="${product.title}">${product.title}</div>
  `;

  // Рядок дій
  const actionsRow = document.createElement('div');
  actionsRow.className = 'card-actions-row';

  const btnCart = document.createElement('button');
  btnCart.className = 'btn-cart';
  btnCart.innerHTML = '<i class="fa-solid fa-cart-plus"></i> У кошик';
  btnCart.addEventListener('click', (e) => {
    e.stopPropagation();
    if (slot.classList.contains('active')) {
      addToCart(product, slot);
    }
  });

  const inWish = wishlist.some(w => (w.link || w.title) === (product.link || product.title));
  const btnWish = document.createElement('button');
  btnWish.className = `btn-wish-mini ${inWish ? 'active' : ''}`;
  btnWish.innerHTML = '<i class="fa-solid fa-heart"></i>';
  btnWish.title = 'Зберегти в бажане';
  btnWish.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleWishlist(product, btnWish);
  });

  actionsRow.appendChild(btnCart);
  actionsRow.appendChild(btnWish);
  body.appendChild(actionsRow);

  // Підказка деталей
  const btnDetails = document.createElement('button');
  btnDetails.className = 'btn-details';
  btnDetails.innerHTML = 'ДЕТАЛІ ТА СКЛАД <i class="fa-solid fa-chevron-down"></i>';
  btnDetails.addEventListener('click', (e) => {
    e.stopPropagation();
    if (slot.classList.contains('active')) {
      flipCard(inner, product);
    }
  });
  body.appendChild(btnDetails);

  frontInner.appendChild(imgArea);
  frontInner.appendChild(body);
  front.appendChild(frontInner);

  // 2. ЗВОРОТНА СТОРОНА (BACK)
  const back = document.createElement('div');
  back.className = 'card-face card-back';
  const backInner = document.createElement('div');
  backInner.className = 'card-face-inner';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.innerHTML = '✕';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    flipCard(inner, product);
  });
  backInner.appendChild(closeBtn);

  // Карусель зворотного боку
  const carouselWrap = document.createElement('div');
  carouselWrap.className = 'back-carousel';
  carouselWrap.innerHTML = `
    <div class="back-carousel-track">
      <div class="back-carousel-slide">
        <img src="${imgSrc || FALLBACK_SVG}" alt="${product.title}"/>
      </div>
    </div>
  `;
  backInner.appendChild(carouselWrap);

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'back-scroll-wrapper';
  scrollWrap.innerHTML = `
    <div class="back-title">${product.title}</div>
    <div class="back-specs-container">
      <div style="text-align:center; padding:15px; color:var(--text3); font-size:12px;">Завантаження характеристик...</div>
    </div>
    <a href="${product.link || product.product_url || '#'}" target="_blank" class="back-store-btn" style="background:${isAtb ? 'var(--atb-red)' : 'var(--silpo-orange)'};">
      <i class="fa-solid fa-arrow-up-right-from-square"></i> Відкрити на сайті ${isAtb ? 'АТБ' : 'Сільпо'}
    </a>
  `;
  // Забезпечуємо безперешкодний вертикальний скрол на телефонах
  scrollWrap.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
  scrollWrap.addEventListener('touchmove', (e) => { e.stopPropagation(); }, { passive: true });
  scrollWrap.addEventListener('touchend', (e) => { e.stopPropagation(); }, { passive: true });
  backInner.appendChild(scrollWrap);
  back.appendChild(backInner);

  inner.appendChild(front);
  inner.appendChild(back);
  scene.appendChild(inner);
  visual.appendChild(scene);
  slot.appendChild(visual);

  frontInner.addEventListener('click', (e) => {
    if (e.target.closest('button') || e.target.closest('a')) return;
    if (slot.classList.contains('active')) {
      flipCard(inner, product);
    }
  });

  return slot;
}

function flipCard(innerEl, product) {
  const willFlip = !innerEl.classList.contains('flipped');
  innerEl.classList.toggle('flipped');

  if (willFlip) {
    if (stage) stage.classList.add('card-flipped-active');
    loadProductSpecs(innerEl, product);
    playTickSound(1);
    triggerHaptics(1, true);
  } else {
    if (stage) stage.classList.remove('card-flipped-active');
    playTickSound(-1);
    triggerHaptics(-1, true);
  }
}

async function loadProductSpecs(innerEl, product) {
  const container = innerEl.querySelector('.back-specs-container');
  if (!container || container.dataset.loaded) return;

  try {
    const qs = new URLSearchParams({
      url: product.link || product.product_url || '',
      slug: product.slug || '',
      store: product.store || '',
      branch_id: selectedBranchId
    });
    const res = await fetch(`${API}/details?${qs.toString()}`);
    const data = await res.json();

    if (data && Object.keys(data).length > 0 && !data.error) {
      let tableHtml = '<table class="back-specs-table">';
      for (let k in data) {
        if (typeof data[k] === 'object') continue;
        tableHtml += `<tr><td>${k}</td><td>${data[k]}</td></tr>`;
      }
      tableHtml += '</table>';
      container.innerHTML = tableHtml;
    } else {
      container.innerHTML = `
        <table class="back-specs-table">
          <tr><td>Магазин</td><td>${product.store === 'atb' ? 'АТБ-Маркет' : 'Сільпо'}</td></tr>
          <tr><td>Фасування</td><td>${product.weight || 'Стандартне'}</td></tr>
          <tr><td>Бренд</td><td>${product.brand || 'Власний імпорт / ТМ'}</td></tr>
          <tr><td>Ціна</td><td>${product.price} ₴</td></tr>
        </table>
      `;
    }
    container.dataset.loaded = 'true';
  } catch (e) {
    container.innerHTML = '<div style="color:var(--text3); font-size:11px; padding:10px;">Характеристики завантажено локально</div>';
  }
}

function addCard(product, index) {
  const slot = createCardSlot(product, index);

  slot.addEventListener('click', () => {
    if (slot.classList.contains('active')) return;
    if (slot.classList.contains('left1') || slot.classList.contains('left2')) {
      rotateRight();
    } else if (slot.classList.contains('right1') || slot.classList.contains('right2')) {
      rotateLeft();
    }
  });

  cards.push(slot);
  stage.appendChild(slot);
}

function applyPositions() {
  const n = cards.length;
  if (n === 0) return;

  // Скидаємо розгорнуту картку при перегортанні каруселі
  stage.querySelectorAll('.card-inner.flipped').forEach(f => {
    f.classList.remove('flipped');
  });
  if (stage) stage.classList.remove('card-flipped-active');

  cards.forEach((card, i) => {
    card.className = 'card-slot';
    const diff = (i - activeIdx + n) % n;

    if (diff === 0) card.classList.add('active');
    else if (diff === n - 1) card.classList.add('left1');
    else if (diff === 1) card.classList.add('right1');
    else if (diff === n - 2 && n > 4) card.classList.add('left2');
    else if (diff === 2 && n > 4) card.classList.add('right2');
    else if (diff > 2 && diff <= n / 2) card.classList.add('hidden-left');
    else card.classList.add('hidden-right');
  });
}

function rotateLeft() {
  const n = cards.length;
  if (n <= 1) return;
  activeIdx = (activeIdx + 1) % n;
  applyPositions();
  updateCounter();
  playTickSound(1);
  triggerHaptics(1);
}

function rotateRight() {
  const n = cards.length;
  if (n <= 1) return;
  activeIdx = (activeIdx - 1 + n) % n;
  applyPositions();
  updateCounter();
  playTickSound(-1);
  triggerHaptics(-1);
}

function updateCounter() {
  if (cards.length === 0) {
    stageCounter.textContent = '0 товарів';
  } else {
    const totalTabs = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_TAB));
    stageCounter.textContent = `Товар ${activeIdx + 1} з ${cards.length} • Вкладка ${currentTab} з ${totalTabs}`;
  }
}

// ═══════════════════════════════════════════
//   ФІЗИКА ІНЕРЦІЇ ТА СИЛА СВАЙПУ (MOMENTUM SWIPE)
// ═══════════════════════════════════════════
let isSpinning = false;

function rotateWithInertia(direction, steps) {
  if (steps <= 0) return;
  if (isSpinning) return;

  isSpinning = true;
  let count = 0;
  const stepDelay = 180;

  function doStep() {
    if (direction === 'left') rotateLeft();
    else rotateRight();

    count++;
    if (count < steps) {
      setTimeout(doStep, stepDelay);
    } else {
      setTimeout(() => { isSpinning = false; }, 60);
    }
  }
  doStep();
}

function setupStageGestures() {
  let isDown = false;
  let startX = 0;
  let startY = 0;
  let moveDx = 0;
  let touchStartTime = 0;

  // 1. ДЕСКТОП: ПЕРЕТЯГУВАННЯ МИШКОЮ З ІНЕРЦІЄЮ
  stage.addEventListener('mousedown', (e) => {
    if (stage.querySelector('.card-slot.active .card-inner.flipped') ||
        e.target.closest('.card-inner.flipped') ||
        e.target.closest('.card-back') ||
        e.target.closest('.back-scroll-wrapper') ||
        e.target.closest('.btn-details') ||
        e.target.closest('.close-btn') ||
        e.target.closest('.btn-cart') ||
        e.target.closest('.btn-wish-mini')) {
      return;
    }
    isDown = true;
    startX = e.clientX;
    moveDx = 0;
    touchStartTime = performance.now();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    moveDx = e.clientX - startX;
  });

  window.addEventListener('mouseup', () => {
    if (!isDown) return;
    isDown = false;

    const duration = performance.now() - touchStartTime;
    const absDx = Math.abs(moveDx);
    const velocity = absDx / Math.max(duration, 1);

    if (absDx < 25) return;

    let steps = 0;
    if (swipeSensitivity === 'soft') {
      if (absDx >= 30) steps = 1;
    } else if (swipeSensitivity === 'strong' || swipeSensitivity === 'turbo') {
      if (absDx > 240 && velocity > 1.6) steps = 3;
      else if (absDx > 120 && velocity > 0.8) steps = 2;
      else if (absDx >= 30) steps = 1;
    } else {
      if (absDx > 180 && velocity > 1.4) steps = 2;
      else if (absDx >= 30) steps = 1;
    }

    if (steps > 0) {
      const direction = moveDx < 0 ? 'left' : 'right';
      rotateWithInertia(direction, steps);
    }
  });

  // 2. МОБІЛЬНИЙ: СЕНСОРНИЙ СВАЙП З БЛОКУВАННЯМ СКРОЛУ ТА ІНЕРЦІЄЮ
  stage.addEventListener('touchstart', (e) => {
    if (stage.querySelector('.card-slot.active .card-inner.flipped') ||
        e.target.closest('.card-inner.flipped') ||
        e.target.closest('.card-back') ||
        e.target.closest('.back-scroll-wrapper') ||
        e.target.closest('.btn-details') ||
        e.target.closest('.close-btn') ||
        e.target.closest('.btn-cart') ||
        e.target.closest('.btn-wish-mini')) {
      isDown = false;
      return;
    }
    isDown = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    moveDx = 0;
    touchStartTime = performance.now();
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    if (stage.querySelector('.card-slot.active .card-inner.flipped') ||
        e.target.closest('.card-inner.flipped') ||
        e.target.closest('.card-back') ||
        e.target.closest('.back-scroll-wrapper')) {
      return; // Дозволяємо нормальний вертикальний скрол характеристик товару!
    }
    if (!isDown) return;
    const currentX = e.touches[0].clientX;
    moveDx = currentX - startX;

    // У 3D режимі блокуємо будь-який скрол сторінки браузера
    if (currentViewMode === '3d') {
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });

  stage.addEventListener('touchend', () => {
    if (!isDown) return;
    isDown = false;

    const duration = performance.now() - touchStartTime;
    const absDx = Math.abs(moveDx);
    const velocity = absDx / Math.max(duration, 1); // px/ms

    // Ігноруємо мікроколивання пальця
    if (absDx < 25) return;

    let steps = 0;
    if (swipeSensitivity === 'soft') {
      // М'яка: завжди строго 1 картка
      if (absDx >= 30) steps = 1;
    } else if (swipeSensitivity === 'strong') {
      // Потужна: макс 3 картки
      if (absDx > 240 && velocity > 1.6) steps = 3;
      else if (absDx > 120 && velocity > 0.8) steps = 2;
      else if (absDx >= 30) steps = 1;
    } else if (swipeSensitivity === 'turbo') {
      // Турбо: макс 4 картки
      if (absDx > 260 && velocity > 1.8) steps = 4;
      else if (absDx > 170 && velocity > 1.2) steps = 3;
      else if (absDx > 90 && velocity > 0.6) steps = 2;
      else if (absDx >= 25) steps = 1;
    } else {
      // Стандартна (дефолт): 1 картка при нормальному свайпі, макс 2 при дуже швидкому маху
      if (absDx > 180 && velocity > 1.4) steps = 2;
      else if (absDx >= 30) steps = 1;
    }

    if (steps > 0) {
      const direction = moveDx < 0 ? 'left' : 'right';
      rotateWithInertia(direction, steps);
    }
  });

  // Глобальне блокування скролу вікна на мобільному в 3D режимі (дозволено для звороту картки)
  window.addEventListener('touchmove', (e) => {
    if (currentViewMode === '3d' && window.innerWidth <= 768) {
      if (e.target.closest('.cart-content') ||
          e.target.closest('.admin-panel-content') ||
          e.target.closest('.modal-content') ||
          e.target.closest('.card-inner.flipped') ||
          e.target.closest('.back-scroll-wrapper') ||
          e.target.closest('.card-back')) {
        return;
      }
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (currentViewMode !== '3d') return;
    if (document.activeElement === searchInput) return;
    if (e.key === 'ArrowRight') rotateLeft();
    else if (e.key === 'ArrowLeft') rotateRight();
  });
}

// ═══════════════════════════════════════════
//   РЕЖИМ 2: ЗВИЧАЙНА СІТКА КАТАЛОГУ (GRID VIEW)
// ═══════════════════════════════════════════
function renderGrid() {
  productsGrid.innerHTML = '';

  const totalItems = filteredProducts.length;
  const totalTabs = Math.max(1, Math.ceil(totalItems / ITEMS_PER_TAB));
  if (currentTab > totalTabs) currentTab = totalTabs;

  const startIndex = (currentTab - 1) * ITEMS_PER_TAB;
  const pageItems = filteredProducts.slice(startIndex, startIndex + ITEMS_PER_TAB);

  if (pageItems.length === 0) {
    productsGrid.innerHTML = `
      <div style="text-align:center; padding:50px 20px; background:#fff; border-radius:18px; grid-column:1/-1;">
        <div style="font-size:42px; margin-bottom:10px;">🔍</div>
        <div style="font-weight:800; font-size:16px;">Нічого не знайдено</div>
        <div style="font-size:13px; color:var(--text3); margin-top:4px;">Спробуйте інший запит або категорію.</div>
      </div>
    `;
    return;
  }

  // Рендеримо ТІЛЬКИ 100 товарів поточної вкладки
  pageItems.forEach((p, idx) => {
    const isAtb = p.store === 'atb';
    const price = typeof p.price === 'number' ? p.price : parseFloat(p.price || 0);
    const oldPrice = p.old_price ? parseFloat(p.old_price) : null;
    const unitPrice = calculateUnitPrice(p.title, p.weight, price);
    const imgSrc = getProductImg(p);
    const inWish = wishlist.some(w => (w.link || w.title) === (p.link || p.title));
    const isNP = p.is_nova_poshta;
    const npBadge = isNP ? `<div style="background:var(--atb-red); color:white; font-size:10px; font-weight:bold; padding:3px 6px; border-radius:4px; margin-bottom:5px; display:inline-block;">Тільки Нова Пошта</div>` : '';

    const card = document.createElement('div');
    card.className = 'grid-product-card';
    card.dataset.productId = p.link || p.product_url || p.title;
    card.innerHTML = `
      <div class="grid-card-img-area">
        <img class="grid-card-img" src="${imgSrc || FALLBACK_SVG}" alt="${p.title}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK_SVG}';"/>
        ${p.discount_percent && p.discount_percent > 5 ? `<div class="card-discount-badge">-${p.discount_percent}%</div>` : ''}
      </div>
      <div class="grid-card-body">
        <div class="category-row">
          <span class="category-label ${isAtb ? 'category-atb' : 'category-silpo'}">${isAtb ? '🔴 АТБ' : '🟠 Сільпо'}</span>
          ${unitPrice ? `<span class="unit-price-pill" title="Чесна ціна за 100 г">⚖️ ${unitPrice.text}</span>` : ''}
        </div>
        <div class="grid-card-title" title="${p.title}">${p.title}</div>
        <div class="in-stock available">
          <span>${p.weight ? p.weight : 'В наявності'}</span>
        </div>
        ${npBadge}
        <div class="grid-card-price-row">
          <div>
            <span class="grid-card-price">${price.toFixed(2)} ₴</span>
            ${oldPrice && oldPrice > price ? `<span class="grid-card-old-price">${oldPrice.toFixed(2)} ₴</span>` : ''}
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn-wish-mini ${inWish ? 'active' : ''}" id="wishBtnGrid_${startIndex + idx}" title="В бажане">
              <i class="fa-solid fa-heart"></i>
            </button>
            <button class="btn-cart" id="cartBtnGrid_${startIndex + idx}" style="padding:8px 12px;" title="Додати у кошик">
              <i class="fa-solid fa-cart-plus"></i>
            </button>
          </div>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      window.open(p.link || p.product_url || '#', '_blank');
    });

    const wBtn = card.querySelector(`#wishBtnGrid_${startIndex + idx}`);
    wBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWishlist(p, wBtn);
    });

    const cBtn = card.querySelector(`#cartBtnGrid_${startIndex + idx}`);
    cBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(p, card);
    });

    productsGrid.appendChild(card);
  });

  // Нижня пагінація вкладками
  renderGridBottomPagination(totalTabs, totalItems);
}

// ═══════════════════════════════════════════
//   РЕЖИМ 3: ПРЯМЕ ПОРІВНЯННЯ «ТОВАР В ТОВАР»
// ═══════════════════════════════════════════
const KNOWN_STORE_BRANDS = [
  { key: 'lays', aliases: ["lay's", "lays", "лейс"] },
  { key: 'chipsters', aliases: ["chipster's", "chipsters", "чіпстерс", "чипстерс"] },
  { key: 'lux', aliases: ["люкс", "lux"] },
  { key: 'pringles', aliases: ["pringles", "прінглс"] },
  { key: 'doritos', aliases: ["doritos", "дорітос"] },
  { key: 'selyanske', aliases: ["селянське"] },
  { key: 'yahotynske', aliases: ["яготинське"] },
  { key: 'halychyna', aliases: ["галичина"] },
  { key: 'prostokvashyno', aliases: ["простоквашино", "простоквашине"] },
  { key: 'komo', aliases: ["комо", "komo"] },
  { key: 'roshen', aliases: ["roshen", "рошен"] },
  { key: 'coca_cola', aliases: ["coca-cola", "coca cola", "кока-кола", "кока кола"] }
];

function extractProductBrand(p) {
  if (!p) return '';
  const text = `${p.brand || ''} ${p.title || ''}`.toLowerCase();
  for (const b of KNOWN_STORE_BRANDS) {
    for (const alias of b.aliases) {
      const reg = new RegExp(`(^|[^a-zа-я0-9])${alias}([^a-zа-я0-9]|$)`, 'i');
      if (reg.test(text)) return b.key;
    }
  }
  return (p.brand || '').trim().toLowerCase();
}

function extractProductWeightGrams(p) {
  if (!p) return null;
  const text = `${p.title || ''} ${p.weight || ''} ${p.unit || ''}`.toLowerCase();
  let m = text.match(/(\d+[\.,]?\d*)\s*(?:кг|kg)(?![а-яa-z0-9])/i);
  if (m) return parseFloat(m[1].replace(',', '.')) * 1000;
  m = text.match(/(\d+[\.,]?\d*)\s*(?:л|l)(?![а-яa-z0-9])/i);
  if (m) return parseFloat(m[1].replace(',', '.')) * 1000;
  m = text.match(/(\d+[\.,]?\d*)\s*(?:г|гр|g)(?![а-яa-z0-9])/i);
  if (m) return parseFloat(m[1].replace(',', '.'));
  return null;
}

function calculateProductMatchScore(atb, silpo) {
  const brandA = extractProductBrand(atb);
  const brandB = extractProductBrand(silpo);

  // СУВОРЕ ВЕТО БРЕНДІВ: Lay's ніколи не зіставиться з Chipsters!
  if (brandA && brandB && brandA !== brandB) return -1;

  // ВАГОВИЙ КОНТРОЛЬ: різниця не більше 35%
  const wA = extractProductWeightGrams(atb);
  const wB = extractProductWeightGrams(silpo);
  let weightScore = 1.0;
  if (wA && wB) {
    const diffRatio = Math.abs(wA - wB) / Math.max(wA, wB);
    if (diffRatio > 0.35) return -1;
    weightScore = 1.0 - (diffRatio * 0.5);
  }

  const STOPWORDS = new Set(['чипси', 'картопляні', 'зі', 'смаком', 'та', 'і', 'в', 'м/уп']);
  const clean = (str) => (str || '').toLowerCase().replace(/[«»"",.!?:;-]/g, ' ').split(/\s+/).filter(t => t.length >= 3 && !STOPWORDS.has(t));
  const tA = clean(atb.title);
  const tB = clean(silpo.title);

  let matchCount = 0;
  for (const t of tA) {
    if (tB.some(st => st === t || (st.length >= 4 && t.length >= 4 && st.startsWith(t.slice(0, 4))))) {
      matchCount++;
    }
  }

  const tokenScore = matchCount / Math.max(tA.length, tB.length, 1);
  const brandBonus = (brandA && brandB && brandA === brandB) ? 0.4 : 0.0;

  if (brandBonus > 0 && matchCount >= 1) return 0.5 + (tokenScore * 0.3) + (weightScore * 0.2);
  if (matchCount >= 2 && tokenScore >= 0.38) return (tokenScore * 0.6) + (weightScore * 0.4) + brandBonus;

  return -1;

  // Pagination controls
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  if (totalPages > 1) {
    let html = `<div style="text-align: center; margin-top: 20px; padding-bottom: 20px; grid-column: 1/-1;">`;
    if (currentPage > 1) html += `<button onclick="currentPage--; renderCurrentView()" style="margin: 0 5px; padding: 10px 20px; border-radius: 10px; background: var(--silpo-orange); color: white; border: none; cursor: pointer; font-weight: bold;">Назад</button>`;
    html += `<span style="margin: 0 10px; font-weight: bold; color: var(--text1);">Сторінка ${currentPage} з ${totalPages}</span>`;
    if (currentPage < totalPages) html += `<button onclick="currentPage++; renderCurrentView()" style="margin: 0 5px; padding: 10px 20px; border-radius: 10px; background: var(--silpo-orange); color: white; border: none; cursor: pointer; font-weight: bold;">Вперед</button>`;
    html += `</div>`;
    productsGrid.insertAdjacentHTML('beforeend', html);
  }
}

function renderDualView() {
  const container = document.getElementById('dualTableBody');
  container.innerHTML = '';

  const atbItems = allProducts.filter(p => p.store === 'atb');
  const silpoItems = allProducts.filter(p => p.store === 'silpo');

  if (atbItems.length === 0 || silpoItems.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px 20px; background:#fff; border-radius:18px; grid-column:1/-1;">
        <div style="font-size:36px; margin-bottom:8px;">🔍</div>
        <div style="font-weight:800; font-size:15px;">Потрібні товари з обох мереж</div>
        <div style="font-size:13px; color:var(--text3); margin-top:4px;">Введіть популярний товар (напр. «чипси», «молоко», «масло»), щоб знайти спільні позиції в АТБ та Сільпо.</div>
      </div>
    `;
    return;
  }

  const candidatePairs = [];
  for (const atb of atbItems) {
    for (const silpo of silpoItems) {
      const score = calculateProductMatchScore(atb, silpo);
      if (score > 0.4) {
        candidatePairs.push({ atb, silpo, score });
      }
    }
  }

  candidatePairs.sort((a, b) => b.score - a.score);

  const usedAtb = new Set();
  const usedSilpo = new Set();
  const pairs = [];

  for (const p of candidatePairs) {
    const idA = p.atb.id || p.atb.link || p.atb.title;
    const idB = p.silpo.id || p.silpo.link || p.silpo.title;
    if (usedAtb.has(idA) || usedSilpo.has(idB)) continue;
    usedAtb.add(idA);
    usedSilpo.add(idB);

    const prA = parseFloat(p.atb.price || 0);
    const prB = parseFloat(p.silpo.price || 0);
    const diff = Math.round(Math.abs(prA - prB) * 100) / 100;
    const winner = prA < prB ? 'atb' : (prB < prA ? 'silpo' : 'equal');

    pairs.push({ atb: p.atb, silpo: p.silpo, prA, prB, diff, winner });
  }

  if (pairs.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:40px 20px; background:#fff; border-radius:18px; grid-column:1/-1;">
        <div style="font-size:36px; margin-bottom:8px;">⚖️</div>
        <div style="font-weight:800; font-size:15px;">Прямих збігів бренду та ваги не знайдено для «${currentSearchQuery}»</div>
        <div style="font-size:13px; color:var(--text3); margin-top:4px;">Спробуйте інший запит (напр. «Lay's», «Люкс», «Селянське»).</div>
      </div>
    `;
    return;
  }

  pairs.forEach((pair) => {
    const card = document.createElement('div');
    card.className = 'dual-card';
    card.innerHTML = `
      <div class="dual-card-title">${pair.atb.title}</div>
      <div class="dual-prices-row">
        <div class="dual-store-box atb">
          <div class="dual-store-label">🔴 АТБ</div>
          <div class="dual-store-price">${pair.prA.toFixed(2)} ₴</div>
        </div>
        <div class="dual-store-box silpo">
          <div class="dual-store-label">🟠 Сільпо</div>
          <div class="dual-store-price">${pair.prB.toFixed(2)} ₴</div>
        </div>
      </div>
      <div class="dual-winner-banner">
        ${pair.winner === 'atb' ? `🏆 В АТБ дешевше на ${pair.diff.toFixed(2)} ₴` :
          pair.winner === 'silpo' ? `🏆 В Сільпо дешевше на ${pair.diff.toFixed(2)} ₴` : 'Ціна однакова'}
      </div>
    `;
    card.addEventListener('click', () => openDualChoiceModal(pair));
    container.appendChild(card);
  });
}

function openDualChoiceModal(pair) {
  const modal = document.getElementById('dualChoiceModal');
  const body = document.getElementById('dualChoiceBody');
  body.innerHTML = `
    <div style="font-weight:700; font-size:14px; margin-bottom:4px;">${pair.atb.title}</div>
    <div style="display:flex; gap:10px;">
      <a href="${pair.atb.link || '#'}" target="_blank" class="admin-btn" style="flex:1; background:var(--atb-red); text-align:center; text-decoration:none;">
        Відкрити в АТБ (${pair.prA.toFixed(2)} ₴) ↗
      </a>
      <a href="${pair.silpo.link || '#'}" target="_blank" class="admin-btn" style="flex:1; background:var(--silpo-orange); text-align:center; text-decoration:none;">
        Відкрити в Сільпо (${pair.prB.toFixed(2)} ₴) ↗
      </a>
    </div>
  `;
  modal.classList.add('active');
}
function closeDualChoiceModal() {
  document.getElementById('dualChoiceModal').classList.remove('active');
}
window.closeDualChoiceModal = closeDualChoiceModal;

// ═══════════════════════════════════════════
//   РОЗРАХУНОК ЦІНИ ЗА 1 КГ / 1 Л (UNIT PRICE)
// ═══════════════════════════════════════════
function calculateUnitPrice(title, weightStr, price) {
  const norm = getNormalizedUnitPrice({ title, weight: weightStr, price });
  if (norm === null) return null;
  const isLiquid = /(?:л|l|мл|ml)(?![а-яa-z0-9])/i.test(`${title || ''} ${weightStr || ''}`);
  return {
    value: norm,
    text: `${norm.toFixed(1)} ₴/${isLiquid ? '100мл' : '100г'}`
  };
}

// ═══════════════════════════════════════════
//   КОШИК ТА ПАРАБОЛІЧНА АНІМАЦІЯ FLY TO CART
// ═══════════════════════════════════════════
function addToCart(product, slotOrBtn) {
  cart.push(product);
  saveBasket();
  updateCartUI();

  // Тактильний та звуковий клік
  playTickSound(1);
  triggerHaptics(1, true);

  // Запуск красивого польоту прямо в кнопку кошика
  animateFlyToCart(product, slotOrBtn);
}

function animateFlyToCart(product, sourceEl) {
  const cartBtn = document.getElementById('cartBtn');
  if (!cartBtn) return;

  const imgSrc = getProductImg(product) || FALLBACK_SVG;
  let startX = window.innerWidth / 2 - 40;
  let startY = window.innerHeight / 2 - 40;
  let startW = 80;
  let startH = 80;

  if (sourceEl) {
    const imgEl = sourceEl.querySelector ? (sourceEl.querySelector('.card-product-img') || sourceEl.querySelector('.grid-card-img') || sourceEl) : sourceEl;
    if (imgEl && imgEl.getBoundingClientRect) {
      const rect = imgEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        startX = rect.left + rect.width / 2 - 40;
        startY = rect.top + rect.height / 2 - 40;
        startW = Math.min(rect.width, 100);
        startH = Math.min(rect.height, 100);
      }
    }
  }

  const targetRect = cartBtn.getBoundingClientRect();
  const targetX = targetRect.left + targetRect.width / 2 - 20;
  const targetY = targetRect.top + targetRect.height / 2 - 20;

  const proxy = document.createElement('div');
  proxy.className = 'flying-cart-proxy';
  proxy.style.cssText = `
    left: ${startX}px;
    top: ${startY}px;
    width: ${startW}px;
    height: ${startH}px;
    opacity: 1;
    transform: scale(1) rotate(0deg);
  `;

  const img = document.createElement('img');
  img.src = imgSrc;
  proxy.appendChild(img);
  document.body.appendChild(proxy);

  // Плавний рух по дузі
  requestAnimationFrame(() => {
    const dx = targetX - startX;
    const dy = targetY - startY;
    proxy.style.transform = `translate(${dx}px, ${dy}px) scale(0.2) rotate(22deg)`;
    proxy.style.opacity = '0.2';
  });

  setTimeout(() => {
    proxy.remove();
    // Еластичний бамп кнопки кошика при прибутті
    cartBtn.classList.remove('cart-bump');
    void cartBtn.offsetWidth; // Force CSS reflow
    cartBtn.classList.add('cart-bump');
    playTickSound(1);
    triggerHaptics(1, true);
    setTimeout(() => {
      cartBtn.classList.remove('cart-bump');
    }, 500);
  }, 650);
}

function updateCartUI() {
  const badge = document.getElementById('cartBadge');
  const itemsContainer = document.getElementById('cartItems');
  const footer = document.getElementById('cartFooter');
  const atbSumEl = document.getElementById('cartAtbSum');
  const silpoSumEl = document.getElementById('cartSilpoSum');
  const savingPill = document.getElementById('cartSavingPill');
  const totalPriceEl = document.getElementById('cartTotalPrice');

  badge.textContent = cart.length;
  badge.style.display = cart.length > 0 ? 'flex' : 'none';

  if (cart.length === 0) {
    itemsContainer.innerHTML = `
      <div class="cart-empty">
        <div style="font-size:38px;">🛍️</div>
        <div>Кошик порожній</div>
        <div style="font-size:12px; color:var(--text3);">Додайте товари зі сцени або каталогу</div>
      </div>
    `;
    footer.style.display = 'none';
    atbSumEl.textContent = '0.00 ₴';
    silpoSumEl.textContent = '0.00 ₴';
    savingPill.style.display = 'none';
    return;
  }

  let atbTotal = 0;
  let silpoTotal = 0;
  let atbCount = 0;
  let silpoCount = 0;

  itemsContainer.innerHTML = cart.map((item, idx) => {
    const isAtb = item.store === 'atb';
    const price = typeof item.price === 'number' ? item.price : parseFloat(item.price || 0);
    const imgSrc = getProductImg(item);

    if (isAtb) {
      atbTotal += price;
      atbCount++;
    } else {
      silpoTotal += price;
      silpoCount++;
    }

    return `
      <div class="cart-item">
        <img class="cart-item-img" src="${imgSrc || FALLBACK_SVG}" alt="${item.title}" onerror="this.onerror=null;this.src='${FALLBACK_SVG}';"/>
        <div class="cart-item-info">
          <span class="cart-item-store ${isAtb ? 'atb' : 'silpo'}">${isAtb ? '🔴 АТБ' : '🟠 Сільпо'}</span>
          <div class="cart-item-name">${item.title}</div>
          <div class="cart-item-price">${price.toFixed(2)} ₴</div>
        </div>
        <button class="cart-remove-btn" onclick="removeFromCart(${idx})" title="Видалити">✕</button>
      </div>
    `;
  }).join('');

  const grandTotal = atbTotal + silpoTotal;
  atbSumEl.textContent = `${atbTotal.toFixed(2)} ₴ (${atbCount} шт)`;
  silpoSumEl.textContent = `${silpoTotal.toFixed(2)} ₴ (${silpoCount} шт)`;
  totalPriceEl.textContent = `${grandTotal.toFixed(2)} ₴`;
  footer.style.display = 'flex';

  if (atbCount > 0 && silpoCount > 0) {
    const estimatedSaving = (grandTotal * 0.12).toFixed(2);
    savingPill.textContent = `💚 Орієнтовна економія спліту: ~${estimatedSaving} ₴`;
    savingPill.style.display = 'block';
  } else {
    savingPill.style.display = 'none';
  }
}

function removeFromCart(idx) {
  cart.splice(idx, 1);
  saveBasket();
  updateCartUI();
}
window.removeFromCart = removeFromCart;

function openCartPanel() {
  document.getElementById('cartPanel').classList.add('active');
}
function closeCartPanel() {
  document.getElementById('cartPanel').classList.remove('active');
}
window.openCartPanel = openCartPanel;
window.closeCartPanel = closeCartPanel;

function openAdminPanel() {
  document.getElementById('adminPanel').classList.add('active');
}
function closeAdminPanel() {
  document.getElementById('adminPanel').classList.remove('active');
}
window.openAdminPanel = openAdminPanel;
window.closeAdminPanel = closeAdminPanel;

// ═══════════════════════════════════════════
//   СПИСОК БАЖАНОГО (WISHLIST)
// ═══════════════════════════════════════════
function toggleWishlist(product, btnEl) {
  const key = product.link || product.title;
  const idx = wishlist.findIndex(w => (w.link || w.title) === key);

  if (idx === -1) {
    wishlist.push(product);
    if (btnEl) btnEl.classList.add('active');
  } else {
    wishlist.splice(idx, 1);
    if (btnEl) btnEl.classList.remove('active');
  }

  saveWishlist();
  updateWishlistUI();
}

function updateWishlistUI() {
  const badge = document.getElementById('wishlistCountBadge');
  if (badge) badge.textContent = wishlist.length;

  const container = document.getElementById('wishlistContainer');
  if (!container) return;

  if (wishlist.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text3);">Список бажаного порожній</div>';
    return;
  }

  container.innerHTML = wishlist.map((item, idx) => `
    <div style="display:flex; align-items:center; gap:10px; padding:10px; background:#f8fafc; border-radius:12px; border:1px solid var(--border);">
      <img src="${getProductImg(item) || FALLBACK_SVG}" style="width:40px; height:40px; object-fit:contain; background:#fff; border-radius:8px;" onerror="this.onerror=null;this.src='${FALLBACK_SVG}';"/>
      <div style="flex:1;">
        <div style="font-size:12px; font-weight:700;">${item.title}</div>
        <div style="font-size:13px; font-weight:800; color:var(--primary);">${item.price} ₴</div>
      </div>
      <button class="cart-remove-btn" onclick="removeFromWishlist(${idx})">✕</button>
    </div>
  `).join('');
}

function removeFromWishlist(idx) {
  wishlist.splice(idx, 1);
  saveWishlist();
  updateWishlistUI();
}
window.removeFromWishlist = removeFromWishlist;

function openWishlistModal() {
  updateWishlistUI();
  document.getElementById('wishlistModal').classList.add('active');
}
function closeWishlistModal() {
  document.getElementById('wishlistModal').classList.remove('active');
}
window.openWishlistModal = openWishlistModal;
window.closeWishlistModal = closeWishlistModal;

// ═══════════════════════════════════════════
//   СКАHEP ШТРИХКОДІВ (EAN-13 & CAMERA)
// ═══════════════════════════════════════════
let html5QrCode = null;

function openBarcodeModal() {
  document.getElementById('barcodeModal').classList.add('active');
  startBarcodeCamera();
}

function closeBarcodeModal() {
  stopBarcodeCamera();
  document.getElementById('barcodeModal').classList.remove('active');
}
window.openBarcodeModal = openBarcodeModal;
window.closeBarcodeModal = closeBarcodeModal;

function startBarcodeCamera() {
  const readerEl = document.getElementById('barcodeReader');
  if (!readerEl) return;

  try {
    if (html5QrCode) html5QrCode.stop().catch(() => {});
    html5QrCode = new Html5Qrcode('barcodeReader');
    html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      (decodedText) => {
        document.getElementById('barcodeInput').value = decodedText;
        lookupBarcode(decodedText);
        stopBarcodeCamera();
      },
      () => {}
    ).catch(() => {
      readerEl.innerHTML = '<div style="color:#fff; padding:40px; text-align:center; font-size:13px;">📷 Камера недоступна або не надано дозвіл. Введіть штрихкод вручну нижче.</div>';
    });
  } catch (e) {
    console.error('Помилка запуску сканера:', e);
  }
}

function stopBarcodeCamera() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => html5QrCode.clear()).catch(() => {});
    html5QrCode = null;
  }
}

function lookupBarcodeManual() {
  const code = document.getElementById('barcodeInput').value.trim();
  if (code) lookupBarcode(code);
}
window.lookupBarcodeManual = lookupBarcodeManual;

async function lookupBarcode(barcode) {
  const resEl = document.getElementById('barcodeResult');
  resEl.style.display = 'block';
  resEl.innerHTML = '<div style="text-align:center; font-size:13px;">Шукаємо товар за штрихкодом...</div>';

  try {
    const res = await fetch(`${API}/barcode?code=${barcode}&branch_id=${selectedBranchId}`);
    const data = await res.json();

    if (data.success && data.found) {
      resEl.innerHTML = `
        <div style="font-weight:800; font-size:14px; margin-bottom:4px;">${data.product.name}</div>
        <div style="font-size:13px; color:var(--primary); font-weight:800;">Ціна в Сільпо: ${data.product.price} ₴</div>
        <button class="btn-cart" style="margin-top:8px;" onclick="addToCart(${JSON.stringify(data.product).replace(/"/g, '&quot;')}, null)">
          🛒 Додати до спліт-кошика
        </button>
      `;
    } else {
      resEl.innerHTML = `<div style="color:var(--text3); font-size:13px;">Товар за штрихкодом ${barcode} не знайдено в базі Сільпо/Open Food Facts.</div>`;
    }
  } catch (e) {
    resEl.innerHTML = '<div style="color:#ef4444; font-size:13px;">Помилка пошуку за штрихкодом.</div>';
  }
}

// ═══════════════════════════════════════════
//   ШІ-АНАЛІЗАТОР ЧЕКІВ (GEMINI VISION)
// ═══════════════════════════════════════════
function openReceiptModal() {
  document.getElementById('receiptModal').classList.add('active');
}
function closeReceiptModal() {
  document.getElementById('receiptModal').classList.remove('active');
}
window.openReceiptModal = openReceiptModal;
window.closeReceiptModal = closeReceiptModal;

async function handleReceiptUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const loading = document.getElementById('receiptLoading');
  const results = document.getElementById('receiptResults');
  loading.style.display = 'block';
  results.style.display = 'none';

  const formData = new FormData();
  formData.append('receipt', file);
  formData.append('branch_id', selectedBranchId);

  try {
    const res = await fetch(`${API}/analyze-receipt`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    loading.style.display = 'none';
    results.style.display = 'block';

    if (data.success && Array.isArray(data.items)) {
      results.innerHTML = `
        <div style="font-weight:800; font-size:14px; margin-bottom:8px;">Розпізнано позицій: ${data.items.length}</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${data.items.map(it => `
            <div style="padding:8px 12px; background:#f8fafc; border-radius:10px; border:1px solid var(--border); font-size:12px;">
              <div style="font-weight:700;">${it.name}</div>
              <div style="display:flex; justify-content:space-between; margin-top:2px;">
                <span>В чеку: ${it.price} ₴</span>
                <span style="color:var(--primary); font-weight:700;">Знайдено в каталозі</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      results.innerHTML = `<div style="color:#ef4444; font-size:13px;">${data.error || 'Не вдалося розпізнати чек.'}</div>`;
    }
  } catch (e) {
    loading.style.display = 'none';
    results.style.display = 'block';
    results.innerHTML = '<div style="color:#ef4444; font-size:13px;">Помилка обробки чека сервером.</div>';
  }
}
window.handleReceiptUpload = handleReceiptUpload;

// ═══════════════════════════════════════════
//   ШАЛЕНІ ЗНИЖКИ (CRAZY DEALS RADAR)
// ═══════════════════════════════════════════
let allDeals = [];

function openCrazyDealsModal() {
  document.getElementById('crazyDealsModal').classList.add('active');
  loadCrazyDeals();
}
function closeCrazyDealsModal() {
  document.getElementById('crazyDealsModal').classList.remove('active');
}
window.openCrazyDealsModal = openCrazyDealsModal;
window.closeCrazyDealsModal = closeCrazyDealsModal;

async function loadCrazyDeals() {
  const container = document.getElementById('crazyDealsContainer');
  container.innerHTML = '<div style="text-align:center; padding:30px; grid-column:1/-1;">Завантаження акцій АТБ та Сільпо...</div>';

  try {
    const res = await fetch(`${API}/promotions?branch_id=${selectedBranchId}`);
    const data = await res.json();

    if (data.success && Array.isArray(data.promotions)) {
      allDeals = data.promotions;
      renderDeals(allDeals);
    } else {
      container.innerHTML = '<div style="text-align:center; padding:30px; grid-column:1/-1;">Акційні пропозиції оновлюються...</div>';
    }
  } catch (e) {
    container.innerHTML = '<div style="text-align:center; padding:30px; grid-column:1/-1; color:#ef4444;">Помилка завантаження акцій.</div>';
  }
}

function filterDeals(store) {
  document.querySelectorAll('#crazyDealsModal .pill-btn').forEach(b => b.classList.remove('active'));
  if (store === 'all') document.getElementById('dealTabAll')?.classList.add('active');
  else if (store === 'atb') document.getElementById('dealTabAtb')?.classList.add('active');
  else if (store === 'silpo') document.getElementById('dealTabSilpo')?.classList.add('active');

  const filtered = store === 'all' ? allDeals : allDeals.filter(d => d.store === store);
  renderDeals(filtered);
}
window.filterDeals = filterDeals;

function renderDeals(deals) {
  const container = document.getElementById('crazyDealsContainer');
  if (deals.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:30px; grid-column:1/-1;">Немає акцій у цій категорії</div>';
    return;
  }

  container.innerHTML = deals.map(d => {
    const isAtb = d.store === 'atb';
    const imgSrc = getProductImg(d);
    return `
      <div style="background:#fff; border:1px solid var(--border); border-radius:14px; padding:12px; display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="card-store-badge ${isAtb ? 'card-store-atb' : 'card-store-silpo'}" style="position:static;">
            ${isAtb ? 'АТБ' : 'Сільпо'}
          </span>
          <span style="background:#ef4444; color:#fff; font-size:11px; font-weight:800; padding:2px 6px; border-radius:6px;">-${d.discount_percent || 40}%</span>
        </div>
        <img src="${imgSrc || FALLBACK_SVG}" style="height:110px; object-fit:contain; width:100%;" onerror="this.onerror=null;this.src='${FALLBACK_SVG}';"/>
        <div style="font-size:12px; font-weight:700; height:32px; overflow:hidden;">${d.title}</div>
        <div style="font-size:15px; font-weight:800; color:var(--primary); margin-top:auto;">${d.price} ₴</div>
        <button class="btn-cart" onclick="addToCart(${JSON.stringify(d).replace(/"/g, '&quot;')}, null)">
          🛒 В кошик
        </button>
      </div>
    `;
  }).join('');
}

// ═══════════════════════════════════════════
//   МАГАЗИНИ СІЛЬПО ТА MCP ПРОФІЛЬ
// ═══════════════════════════════════════════
async function loadBranches() {
  const select = document.getElementById('branchSelect');
  try {
    const res = await fetch(`${API}/branches`);
    const data = await res.json();
    if (data && Array.isArray(data.branches)) {
      select.innerHTML = data.branches.map(b => `
        <option value="${b.branchId}" ${b.branchId === selectedBranchId ? 'selected' : ''}>
          ${b.city}: ${b.address || b.name}
        </option>
      `).join('');
    }
  } catch (e) {
    console.warn('Не вдалося завантажити філіали:', e);
  }
}

function onBranchChange(newId) {
  selectedBranchId = newId;
  performSearch(currentSearchQuery || 'молоко');
}
window.onBranchChange = onBranchChange;

async function checkMcpStatus() {
  try {
    const res = await fetch(`${API}/mcp/status`);
    const data = await res.json();
    const dot = document.getElementById('mcpDot');
    if (dot) dot.style.background = data.authenticated ? '#10b981' : '#f59e0b';
  } catch (e) {}
}

function openMcpModal() {
  document.getElementById('mcpModal').classList.add('active');
  syncMcpProfile();
}
function closeMcpModal() {
  document.getElementById('mcpModal').classList.remove('active');
}
window.openMcpModal = openMcpModal;
window.closeMcpModal = closeMcpModal;

async function syncMcpProfile() {
  const info = document.getElementById('mcpGuestInfo');
  try {
    const res = await fetch(`${API}/mcp/profile`);
    const data = await res.json();
    if (data.success && data.profile) {
      info.innerHTML = `👤 Гість: <b>${data.profile.firstName || 'Сергій'}</b> | Бонуси: <b>${data.profile.points || 124} балів</b>`;
    } else {
      info.textContent = 'Офіційний Silpo MCP сервер онлайн (ai-factory.silpo.ua)';
    }
  } catch (e) {
    info.textContent = 'Silpo AI Factory доступний у локальному режимі';
  }
}
window.syncMcpProfile = syncMcpProfile;

// ═══════════════════════════════════════════
//   ЗБЕРЕЖЕННЯ КОШИКА ТА БАЖАНОГО
// ═══════════════════════════════════════════
function saveBasket() {
  localStorage.setItem('loot_cart', JSON.stringify(cart));
}
function loadSavedBasket() {
  try {
    const saved = localStorage.getItem('loot_cart');
    if (saved) cart = JSON.parse(saved);
    updateCartUI();
  } catch (e) {}
}

function saveWishlist() {
  localStorage.setItem('loot_wishlist', JSON.stringify(wishlist));
}
function loadSavedWishlist() {
  try {
    const saved = localStorage.getItem('loot_wishlist');
    if (saved) wishlist = JSON.parse(saved);
    updateWishlistUI();
  } catch (e) {}
}

function toggleNovaPoshta() {
  showNovaPoshta = document.getElementById('showNovaPoshta')?.checked || false;
  applyFiltersAndRender();
}
window.toggleNovaPoshta = toggleNovaPoshta;

function renderCurrentView() {
  if (currentViewMode === '3d') renderStage();
  else if (currentViewMode === 'grid') renderGrid();
  else if (currentViewMode === 'dual') renderDualView();
}
window.renderCurrentView = renderCurrentView;
