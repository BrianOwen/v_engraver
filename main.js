// V-Engraver — Main application controller

import { state, setStatus, setLoading } from './state.js';
import { importSVG } from './modules/svg-import.js';
import { importDXF } from './modules/dxf-import.js';
import { loadDefaultFont, loadFontByName, textToPolygons, isFontReady } from './modules/text-to-paths.js';
import { computeMedialAxis } from './modules/medial-axis.js';
import { generateVEngraveToolpath, calculateStats } from './modules/toolpath-gen.js';
import { exportAsGcode, exportAsSbp } from './modules/export.js';
import { CLIPART_CATALOG } from './modules/clipart.js';
import { parseSVGString } from './modules/svg-import.js';
import { initThreeScene, clearScene, showVectors, showToolpath, showCarvedSurface, setTheme, showVectorOverlay, showStock } from './modules/preview.js';

// Unit conversion helpers
const MM_PER_INCH = 25.4;
function toDisplay(val) { return state.units === 'mm' ? val * MM_PER_INCH : val; }
function fromDisplay(val) { return state.units === 'mm' ? val / MM_PER_INCH : val; }
function unitSuffix() { return state.units === 'mm' ? 'mm' : 'in'; }
function rateSuffix() { return state.units === 'mm' ? 'mm/min' : 'in/min'; }

function init() {
  initThreeScene();
  setupEventListeners();
  loadDefaultFont();

  // Show the stock immediately with camera framed to material
  readMaterial();
  showVectors([], materialBounds());
  showStock(state.material.width, state.material.height, state.material.thickness);
}

function setupEventListeners() {
  // Unit toggle
  document.querySelectorAll('.unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const newUnit = btn.dataset.unit;
      if (newUnit === state.units) return;

      // Convert displayed values before switching
      const fields = [
        { id: 'materialWidth', type: 'length' },
        { id: 'materialHeight', type: 'length' },
        { id: 'materialThickness', type: 'length' },
        { id: 'maxDepth', type: 'length' },
        { id: 'feedRate', type: 'rate' },
        { id: 'plungeRate', type: 'rate' },
        { id: 'safeZ', type: 'length' },
        { id: 'textHeight', type: 'length' },
      ];

      state.units = newUnit;

      for (const field of fields) {
        const el = document.getElementById(field.id);
        if (!el) continue;
        const raw = parseFloat(el.value);
        if (newUnit === 'mm') {
          el.value = (raw * MM_PER_INCH).toFixed(field.type === 'rate' ? 0 : 2);
        } else {
          el.value = (raw / MM_PER_INCH).toFixed(field.type === 'rate' ? 0 : 3);
        }
      }

      // Update unit labels
      document.querySelectorAll('[data-unit-label="length"]').forEach(el => {
        el.textContent = unitSuffix();
      });
      document.querySelectorAll('[data-unit-label="rate"]').forEach(el => {
        el.textContent = rateSuffix();
      });

      document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-mode');
    document.body.classList.toggle('light-mode', !isDark);
    setTheme(isDark);
  });

  // File import — drag/drop
  const dropZone = document.getElementById('dropZone');
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // File import — browse
  document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  // Clear file
  document.getElementById('clearFile').addEventListener('click', () => {
    clearInput();
  });

  // V-bit angle custom toggle
  document.getElementById('vBitAngle').addEventListener('change', (e) => {
    const isCustom = e.target.value === 'custom';
    document.getElementById('customAngleLabel').classList.toggle('hidden', !isCustom);
    document.getElementById('customAngleWrap').classList.toggle('hidden', !isCustom);
  });

  // Text convert button
  document.getElementById('convertTextBtn').addEventListener('click', () => {
    handleTextInput();
  });

  // Live text preview — debounced on typing and height changes
  let textPreviewTimer = null;
  function scheduleTextPreview() {
    clearTimeout(textPreviewTimer);
    textPreviewTimer = setTimeout(updateTextPreview, 300);
  }
  document.getElementById('textInput').addEventListener('input', scheduleTextPreview);
  document.getElementById('textHeight').addEventListener('input', scheduleTextPreview);

  // Clipart selector — populate dropdown and handle selection
  const clipartSelect = document.getElementById('clipartSelect');
  const categories = [...new Set(CLIPART_CATALOG.map(c => c.category))];
  for (const cat of categories) {
    const group = document.createElement('optgroup');
    group.label = cat;
    for (const item of CLIPART_CATALOG.filter(c => c.category === cat)) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.label;
      group.appendChild(opt);
    }
    clipartSelect.appendChild(group);
  }
  clipartSelect.addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    handleClipart(id);
  });

  // Font change — load new font then re-preview
  document.getElementById('fontSelect').addEventListener('change', async (e) => {
    const name = e.target.value;
    setStatus(`Loading font...`);
    const ok = await loadFontByName(name);
    if (ok) {
      setStatus('Font loaded');
      updateTextPreview();
    } else {
      setStatus('Error: Could not load font');
    }
  });

  // Generate button
  document.getElementById('generateBtn').addEventListener('click', () => {
    doGenerate();
  });

  // Export buttons
  document.getElementById('exportGcode').addEventListener('click', () => doExport('gcode'));
  document.getElementById('exportSbp').addEventListener('click', () => doExport('sbp'));
}

// ---------------------------------------------------------------------------
// Material centering
// ---------------------------------------------------------------------------

function readMaterial() {
  state.material.width = fromDisplay(parseFloat(document.getElementById('materialWidth').value));
  state.material.height = fromDisplay(parseFloat(document.getElementById('materialHeight').value));
  state.material.thickness = fromDisplay(parseFloat(document.getElementById('materialThickness').value));
}

/**
 * Center the current polygons on the material.
 * Undoes any previous offset first so it's safe to call repeatedly.
 */
function centerOnMaterial() {
  if (!state.bounds) return;
  readMaterial();

  // Undo any previous offset
  if (state.materialOffset) {
    const prevOX = state.materialOffset.x;
    const prevOY = state.materialOffset.y;
    for (const polygon of state.polygons) {
      for (const p of polygon.outer) { p.x -= prevOX; p.y -= prevOY; }
      for (const hole of polygon.holes) {
        for (const p of hole) { p.x -= prevOX; p.y -= prevOY; }
      }
    }
    state.bounds = {
      minX: state.bounds.minX - prevOX,
      minY: state.bounds.minY - prevOY,
      maxX: state.bounds.maxX - prevOX,
      maxY: state.bounds.maxY - prevOY,
      width: state.bounds.width,
      height: state.bounds.height,
    };
  }

  // Center on material (origin = bottom-left corner)
  const offsetX = (state.material.width - state.bounds.width) / 2 - state.bounds.minX;
  const offsetY = (state.material.height - state.bounds.height) / 2 - state.bounds.minY;

  for (const polygon of state.polygons) {
    for (const p of polygon.outer) { p.x += offsetX; p.y += offsetY; }
    for (const hole of polygon.holes) {
      for (const p of hole) { p.x += offsetX; p.y += offsetY; }
    }
  }

  state.bounds = {
    minX: state.bounds.minX + offsetX,
    minY: state.bounds.minY + offsetY,
    maxX: state.bounds.maxX + offsetX,
    maxY: state.bounds.maxY + offsetY,
    width: state.bounds.width,
    height: state.bounds.height,
  };
  state.materialOffset = { x: offsetX, y: offsetY };
}

/** Return material-sized bounds object for preview calls. */
function materialBounds() {
  return {
    minX: 0, minY: 0,
    maxX: state.material.width, maxY: state.material.height,
    width: state.material.width, height: state.material.height,
  };
}

/** Show centered vectors + stock (shared by import, text, and live preview). */
function showCenteredPreview() {
  centerOnMaterial();
  showVectors(state.polygons, materialBounds());
  showStock(state.material.width, state.material.height, state.material.thickness);
}

// ---------------------------------------------------------------------------
// Input handlers
// ---------------------------------------------------------------------------

async function handleFile(file) {
  const name = file.name.toLowerCase();
  setLoading(true, 'Importing file...');

  try {
    let result;

    if (name.endsWith('.svg')) {
      result = await importSVG(file);
      state.inputType = 'svg';
    } else if (name.endsWith('.dxf')) {
      result = await importDXF(file);
      state.inputType = 'dxf';
    } else {
      throw new Error('Unsupported file type. Use SVG or DXF.');
    }

    state.polygons = result.polygons;
    state.bounds = result.bounds;
    state.fileName = file.name;
    state.medialAxis = null;
    state.moves = [];
    state.materialOffset = null;

    // Update UI
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileInfo').classList.remove('hidden');
    document.getElementById('dropZone').style.display = 'none';
    document.getElementById('generateBtn').disabled = false;
    document.getElementById('exportGcode').disabled = true;
    document.getElementById('exportSbp').disabled = true;

    showCenteredPreview();

    const polyCount = state.polygons.length;
    const pointCount = state.polygons.reduce((sum, p) => {
      return sum + p.outer.length + p.holes.reduce((hs, h) => hs + h.length, 0);
    }, 0);
    setStatus(`Loaded ${file.name}: ${polyCount} polygon(s), ${pointCount} points`);

  } catch (err) {
    setStatus(`Error: ${err.message}`);
    console.error('Import error:', err);
  } finally {
    setLoading(false);
  }
}

/**
 * Convert text to vectors, center, and preview.
 * Called by both the Convert button and the live preview timer.
 * @param {boolean} silent — if true, suppress status/loading UI (for live preview)
 */
function handleTextInput(silent = false) {
  const text = document.getElementById('textInput').value;
  const heightDisplay = parseFloat(document.getElementById('textHeight').value);

  if (!text || text.trim().length === 0) {
    if (!silent) setStatus('Error: No text provided');
    // Clear preview if text was erased
    if (state.inputType === 'text') {
      state.polygons = [];
      state.bounds = null;
      state.materialOffset = null;
      clearScene();
      readMaterial();
      showStock(state.material.width, state.material.height, state.material.thickness);
      document.getElementById('generateBtn').disabled = true;
    }
    return;
  }

  if (!isFontReady()) {
    if (!silent) setStatus('Error: Font is still loading, please wait...');
    return;
  }

  const height = fromDisplay(heightDisplay);

  if (!silent) setLoading(true, 'Converting text to vectors...');

  try {
    const result = textToPolygons(text, height);

    state.polygons = result.polygons;
    state.bounds = result.bounds;
    state.fileName = text.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
    state.inputType = 'text';
    state.medialAxis = null;
    state.moves = [];
    state.materialOffset = null;

    // Update UI
    document.getElementById('fileInfo').classList.add('hidden');
    document.getElementById('dropZone').style.display = '';
    document.getElementById('generateBtn').disabled = false;
    document.getElementById('exportGcode').disabled = true;
    document.getElementById('exportSbp').disabled = true;

    showCenteredPreview();

    if (!silent) {
      const polyCount = state.polygons.length;
      setStatus(`Converted text: ${polyCount} polygon(s)`);
    }

  } catch (err) {
    if (!silent) {
      setStatus(`Error: ${err.message}`);
      console.error('Text conversion error:', err);
    }
  } finally {
    if (!silent) setLoading(false);
  }
}

function handleClipart(id) {
  const item = CLIPART_CATALOG.find(c => c.id === id);
  if (!item) return;

  try {
    const result = parseSVGString(item.svg);

    // Scale clipart to fit ~60% of the material's smaller dimension
    readMaterial();
    const targetSize = Math.min(state.material.width, state.material.height) * 0.6;
    const clipW = result.bounds.width;
    const clipH = result.bounds.height;
    const scale = targetSize / Math.max(clipW, clipH);

    for (const polygon of result.polygons) {
      for (const p of polygon.outer) {
        p.x = (p.x - result.bounds.minX) * scale;
        p.y = (p.y - result.bounds.minY) * scale;
      }
      for (const hole of polygon.holes) {
        for (const p of hole) {
          p.x = (p.x - result.bounds.minX) * scale;
          p.y = (p.y - result.bounds.minY) * scale;
        }
      }
    }
    result.bounds = {
      minX: 0, minY: 0,
      maxX: clipW * scale, maxY: clipH * scale,
      width: clipW * scale, height: clipH * scale,
    };

    state.polygons = result.polygons;
    state.bounds = result.bounds;
    state.fileName = item.label.toLowerCase().replace(/\s+/g, '-');
    state.inputType = 'clipart';
    state.medialAxis = null;
    state.moves = [];
    state.materialOffset = null;

    // Update UI
    document.getElementById('fileInfo').classList.add('hidden');
    document.getElementById('dropZone').style.display = '';
    document.getElementById('generateBtn').disabled = false;
    document.getElementById('exportGcode').disabled = true;
    document.getElementById('exportSbp').disabled = true;

    showCenteredPreview();

    const polyCount = state.polygons.length;
    setStatus(`Clipart loaded: ${item.label} (${polyCount} polygon(s))`);

  } catch (err) {
    setStatus(`Error: ${err.message}`);
    console.error('Clipart error:', err);
  }
}

/** Live preview while typing (silent — no loading overlay or status updates). */
function updateTextPreview() {
  handleTextInput(true);
}

function clearInput() {
  state.polygons = [];
  state.bounds = null;
  state.fileName = '';
  state.inputType = null;
  state.medialAxis = null;
  state.moves = [];
  state.materialOffset = null;

  document.getElementById('fileInfo').classList.add('hidden');
  document.getElementById('dropZone').style.display = '';
  document.getElementById('fileInput').value = '';
  document.getElementById('generateBtn').disabled = true;
  document.getElementById('exportGcode').disabled = true;
  document.getElementById('exportSbp').disabled = true;
  document.getElementById('toolpathInfo').classList.add('hidden');

  clearScene();
  setStatus('Ready — Import a vector file or type text to begin');
}

function readInputs() {
  const angleSelect = document.getElementById('vBitAngle');
  const angle = angleSelect.value === 'custom'
    ? parseFloat(document.getElementById('customAngle').value)
    : parseFloat(angleSelect.value);

  state.vBit.includedAngle = angle;
  state.vBit.maxDepth = fromDisplay(parseFloat(document.getElementById('maxDepth').value));
  state.material.width = fromDisplay(parseFloat(document.getElementById('materialWidth').value));
  state.material.height = fromDisplay(parseFloat(document.getElementById('materialHeight').value));
  state.material.thickness = fromDisplay(parseFloat(document.getElementById('materialThickness').value));
  state.machine.feedRate = fromDisplay(parseFloat(document.getElementById('feedRate').value));
  state.machine.plungeRate = fromDisplay(parseFloat(document.getElementById('plungeRate').value));
  state.machine.safeZ = fromDisplay(parseFloat(document.getElementById('safeZ').value));
  state.machine.rpm = parseInt(document.getElementById('rpm').value);
}

// ---------------------------------------------------------------------------
// Generate & Export
// ---------------------------------------------------------------------------

async function doGenerate() {
  if (state.polygons.length === 0) {
    setStatus('Error: No vectors loaded');
    return;
  }

  readInputs();

  // Warn if max depth exceeds material thickness
  if (state.vBit.maxDepth > state.material.thickness) {
    setStatus(`Warning: Max depth (${toDisplay(state.vBit.maxDepth).toFixed(3)} ${unitSuffix()}) exceeds material thickness (${toDisplay(state.material.thickness).toFixed(3)} ${unitSuffix()})! V-bit will cut through the material.`);
  }

  setLoading(true, 'Centering design on material...');
  await new Promise(r => setTimeout(r, 50));

  try {
    centerOnMaterial();

    setLoading(true, 'Computing medial axis...');
    await new Promise(r => setTimeout(r, 20));

    // Step 1: Compute medial axis
    const halfAngle = (state.vBit.includedAngle / 2) * Math.PI / 180;
    const maxRadius = state.vBit.maxDepth * Math.tan(halfAngle);

    state.medialAxis = computeMedialAxis(state.polygons, {
      maxRadius,
      samplingDensity: 500,
    });

    if (state.medialAxis.branches.length === 0) {
      setStatus('Warning: No medial axis branches found. Shapes may be too small.');
      setLoading(false);
      return;
    }

    setLoading(true, 'Generating toolpath...');
    await new Promise(r => setTimeout(r, 20));

    // Step 2: Generate toolpath
    state.moves = generateVEngraveToolpath(state.medialAxis, state.vBit, state.machine);

    // Step 3: Update preview — use material bounds for the surface
    const matB = materialBounds();
    showCarvedSurface(state.medialAxis, state.vBit, matB);
    showToolpath(state.moves, matB);
    showVectorOverlay(state.polygons);
    showStock(state.material.width, state.material.height, state.material.thickness, true);

    // Step 4: Show stats
    const stats = calculateStats(state.moves, state.machine.feedRate);
    const depthWarning = state.vBit.maxDepth > state.material.thickness
      ? ' <span style="color:#ff4444">⚠ EXCEEDS MATERIAL</span>'
      : '';
    const infoEl = document.getElementById('toolpathInfo');
    infoEl.innerHTML = `
      <div><label>Branches:</label> <span>${state.medialAxis.branches.length}</span></div>
      <div><label>Cut moves:</label> <span>${stats.moveCount}</span></div>
      <div><label>Cut length:</label> <span>${stats.cutLength} ${unitSuffix()}</span></div>
      <div><label>Max depth:</label> <span>${stats.maxDepth} ${unitSuffix()}${depthWarning}</span></div>
      <div><label>Est. time:</label> <span>${stats.estTimeMin} min</span></div>
    `;
    infoEl.classList.remove('hidden');

    // Enable export buttons
    document.getElementById('exportGcode').disabled = false;
    document.getElementById('exportSbp').disabled = false;

    const statusMsg = `Toolpath generated: ${stats.moveCount} moves, ${stats.cutLength} ${unitSuffix()} cut length`;
    if (state.vBit.maxDepth > state.material.thickness) {
      setStatus(`${statusMsg} — WARNING: Depth exceeds material thickness!`);
    } else {
      setStatus(statusMsg);
    }

  } catch (err) {
    setStatus(`Error: ${err.message}`);
    console.error('Generation error:', err);
  } finally {
    setLoading(false);
  }
}

function doExport(format) {
  if (state.moves.length === 0) {
    setStatus('Error: No toolpath to export');
    return;
  }

  readInputs();

  const options = {
    feedRate: state.machine.feedRate,
    plungeRate: state.machine.plungeRate,
    rpm: state.machine.rpm,
    safeZ: state.machine.safeZ,
    fileName: state.fileName || 'v-engrave',
    vBitAngle: state.vBit.includedAngle,
    units: state.units,
  };

  try {
    if (format === 'gcode') {
      exportAsGcode(state.moves, options);
      setStatus('G-code file exported');
    } else {
      exportAsSbp(state.moves, options);
      setStatus('SBP file exported');
    }
  } catch (err) {
    setStatus(`Export error: ${err.message}`);
    console.error('Export error:', err);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
