// V-Engraver — Centralized state

export const state = {
  // Input vectors
  polygons: [],           // Array of { outer: [{x,y}...], holes: [[{x,y}...]...] }
  fileName: '',
  inputType: null,        // 'svg', 'dxf', or 'text'
  bounds: null,           // { minX, minY, maxX, maxY, width, height }
  materialOffset: null,   // { x, y } offset applied for material centering

  // Material
  material: {
    width: 12,            // inches
    height: 12,           // inches
    thickness: 0.75,      // inches
  },

  // V-Bit configuration
  vBit: {
    includedAngle: 90,    // Full included angle in degrees
    maxDepth: 0.25,       // Maximum plunge depth (inches)
  },

  // Machine settings
  machine: {
    feedRate: 60,         // in/min
    plungeRate: 20,       // in/min
    safeZ: 0.25,          // inches
    rpm: 18000,
  },

  // Computed data
  medialAxis: null,       // { branches: [{ points: [{x, y, radius}...] }...] }
  moves: [],              // Array of move objects { type, x, y, z }

  // Units
  units: 'in',

  // UI state
  statusText: 'Ready',
  loading: false,
};

export function setStatus(text) {
  state.statusText = text;
  const el = document.getElementById('statusText');
  if (el) el.textContent = text;
}

export function setLoading(loading, text) {
  state.loading = loading;
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  if (overlay) overlay.classList.toggle('hidden', !loading);
  if (loadingText && text) loadingText.textContent = text;
}
