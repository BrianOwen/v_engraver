// Text-to-paths conversion using opentype.js
// Converts text strings into vector outlines for V-engraving.

import { signedArea, computeBounds, pointInRing } from './polygon-utils.js';

let loadedFont = null;
let fontLoading = false;
let currentFontName = 'roboto';

/**
 * Available fonts — each entry has fallback URLs tried in order.
 */
export const FONT_CATALOG = {
  roboto:           { label: 'Roboto',           category: 'Sans-Serif', urls: [
    'https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-400-normal.ttf',
    'https://cdn.jsdelivr.net/npm/@fontsource/roboto@5.0.8/files/roboto-latin-400-normal.woff',
  ]},
  'open-sans':      { label: 'Open Sans',        category: 'Sans-Serif', urls: [
    'https://cdn.jsdelivr.net/fontsource/fonts/open-sans@latest/latin-400-normal.ttf',
  ]},
  oswald:           { label: 'Oswald',           category: 'Sans-Serif', urls: [
    'https://cdn.jsdelivr.net/fontsource/fonts/oswald@latest/latin-400-normal.ttf',
  ]},
  'playfair-display': { label: 'Playfair Display', category: 'Serif', urls: [
    'https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-400-normal.ttf',
  ]},
  merriweather:     { label: 'Merriweather',     category: 'Serif', urls: [
    'https://cdn.jsdelivr.net/fontsource/fonts/merriweather@latest/latin-400-normal.ttf',
  ]},
  lora:             { label: 'Lora',             category: 'Serif', urls: [
    'https://cdn.jsdelivr.net/fontsource/fonts/lora@latest/latin-400-normal.ttf',
  ]},
  cinzel:           { label: 'Cinzel',           category: 'Serif', urls: [
    'https://cdn.jsdelivr.net/fontsource/fonts/cinzel@latest/latin-400-normal.ttf',
  ]},
  'dancing-script': { label: 'Dancing Script',   category: 'Script', urls: [
    'https://cdn.jsdelivr.net/fontsource/fonts/dancing-script@latest/latin-400-normal.ttf',
  ]},
  'great-vibes':    { label: 'Great Vibes',      category: 'Script', urls: [
    'https://cdn.jsdelivr.net/fontsource/fonts/great-vibes@latest/latin-400-normal.ttf',
  ]},
  pacifico:         { label: 'Pacifico',         category: 'Script', urls: [
    'https://cdn.jsdelivr.net/fontsource/fonts/pacifico@latest/latin-400-normal.ttf',
  ]},
  'courier-prime':  { label: 'Courier Prime',    category: 'Monospace', urls: [
    'https://cdn.jsdelivr.net/fontsource/fonts/courier-prime@latest/latin-400-normal.ttf',
  ]},
  'source-code-pro': { label: 'Source Code Pro', category: 'Monospace', urls: [
    'https://cdn.jsdelivr.net/fontsource/fonts/source-code-pro@latest/latin-400-normal.ttf',
  ]},
};

// Cache loaded fonts so switching back is instant
const fontCache = new Map();

/**
 * Load the default font. Should be called on app init.
 */
export async function loadDefaultFont() {
  await loadFontByName('roboto');
}

/**
 * Load a font by its catalog name.
 * Returns true on success, false on failure.
 */
export async function loadFontByName(name) {
  if (fontLoading) return false;

  // Already cached
  if (fontCache.has(name)) {
    loadedFont = fontCache.get(name);
    currentFontName = name;
    return true;
  }

  const entry = FONT_CATALOG[name];
  if (!entry) return false;

  fontLoading = true;

  for (const url of entry.urls) {
    try {
      const font = await loadFontFromURL(url);
      fontCache.set(name, font);
      loadedFont = font;
      currentFontName = name;
      console.log(`Font "${entry.label}" loaded from:`, url);
      fontLoading = false;
      return true;
    } catch (e) {
      console.warn(`Font load failed for ${entry.label}:`, url, e.message);
    }
  }

  console.error(`Could not load font "${entry.label}"`);
  fontLoading = false;
  return false;
}

function loadFontFromURL(url) {
  return new Promise((resolve, reject) => {
    if (typeof opentype === 'undefined') {
      reject(new Error('opentype.js not loaded'));
      return;
    }
    opentype.load(url, (err, font) => {
      if (err) reject(err);
      else resolve(font);
    });
  });
}

/**
 * Load a custom font from a File object.
 */
export async function loadFontFile(file) {
  const buffer = await file.arrayBuffer();
  loadedFont = opentype.parse(buffer);
  currentFontName = 'custom';
}

/**
 * Check if a font is loaded and ready.
 */
export function isFontReady() {
  return loadedFont !== null;
}

/**
 * Get the current font name.
 */
export function getCurrentFontName() {
  return currentFontName;
}

/**
 * Convert text to polygon arrays.
 * @param {string} text - The text to convert
 * @param {number} height - Desired text height in work units (inches)
 * @returns {{ polygons, bounds }}
 */
export function textToPolygons(text, height = 2) {
  if (!loadedFont) throw new Error('No font loaded. Call loadDefaultFont() first.');
  if (!text || text.trim().length === 0) throw new Error('No text provided');

  // Calculate font size to match desired height
  const ascender = loadedFont.ascender;
  const descender = loadedFont.descender;
  const unitsPerEm = loadedFont.unitsPerEm;
  const fontUnitHeight = ascender - descender;
  const fontSize = (height * unitsPerEm) / fontUnitHeight;

  // Get the path from opentype (all coordinates in opentype screen space: Y-down)
  const path = loadedFont.getPath(text, 0, 0, fontSize);
  const commands = path.commands;

  // Step 1: Extract rings in NATIVE opentype coordinates (no Y-flip yet)
  const rings = [];
  let currentRing = [];

  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
        if (currentRing.length >= 3) rings.push(currentRing);
        currentRing = [{ x: cmd.x, y: cmd.y }];
        break;
      case 'L':
        currentRing.push({ x: cmd.x, y: cmd.y });
        break;
      case 'Q':
        subdivideBezierQ(currentRing, cmd);
        break;
      case 'C':
        subdivideBezierC(currentRing, cmd);
        break;
      case 'Z':
        if (currentRing.length >= 3) rings.push(currentRing);
        currentRing = [];
        break;
    }
  }
  if (currentRing.length >= 3) rings.push(currentRing);

  if (rings.length === 0) {
    throw new Error('Text produced no valid outlines');
  }

  // Step 2: Group into outers/holes BEFORE flipping Y
  // (winding directions are correct in native opentype coords)
  const polygons = groupOutersAndHoles(rings);

  // Step 3: Flip Y for all points (opentype Y-down → CNC Y-up)
  for (const polygon of polygons) {
    for (const p of polygon.outer) p.y = -p.y;
    for (const hole of polygon.holes) {
      for (const p of hole) p.y = -p.y;
    }
  }

  // Compute bounds after flip
  const allPoints = [];
  for (const polygon of polygons) {
    allPoints.push(...polygon.outer);
    for (const hole of polygon.holes) allPoints.push(...hole);
  }
  const bounds = computeBounds(allPoints);

  return { polygons, bounds };
}

/**
 * Subdivide a quadratic Bezier curve into line segments.
 * All coordinates in native (unflipped) space.
 */
function subdivideBezierQ(ring, cmd) {
  const p0 = ring[ring.length - 1];
  const steps = 12;
  for (let t = 1; t <= steps; t++) {
    const u = t / steps;
    const iu = 1 - u;
    const x = iu * iu * p0.x + 2 * iu * u * cmd.x1 + u * u * cmd.x;
    const y = iu * iu * p0.y + 2 * iu * u * cmd.y1 + u * u * cmd.y;
    ring.push({ x, y });
  }
}

/**
 * Subdivide a cubic Bezier curve into line segments.
 * All coordinates in native (unflipped) space.
 */
function subdivideBezierC(ring, cmd) {
  const p0 = ring[ring.length - 1];
  const steps = 16;
  for (let t = 1; t <= steps; t++) {
    const u = t / steps;
    const iu = 1 - u;
    const x = iu*iu*iu * p0.x + 3*iu*iu*u * cmd.x1 + 3*iu*u*u * cmd.x2 + u*u*u * cmd.x;
    const y = iu*iu*iu * p0.y + 3*iu*iu*u * cmd.y1 + 3*iu*u*u * cmd.y2 + u*u*u * cmd.y;
    ring.push({ x, y });
  }
}

/**
 * Group rings into polygons with outers and holes.
 * In opentype's Y-down screen space:
 *   CW (negative signed area) = outer boundary
 *   CCW (positive signed area) = hole
 */
function groupOutersAndHoles(rings) {
  const classified = rings.map(ring => {
    const area = signedArea(ring);
    return {
      ring,
      area,
      absArea: Math.abs(area),
      // Outer contours have larger absolute area; use sign to distinguish
      isOuter: area > 0,
    };
  });

  // Sort by absolute area descending (largest first)
  classified.sort((a, b) => b.absArea - a.absArea);

  // If all have the same winding, treat the larger rings as outers
  const outerCount = classified.filter(c => c.isOuter).length;
  if (outerCount === 0) {
    // All positive area — flip: largest are outers
    classified.forEach(c => c.isOuter = !c.isOuter);
  }

  const outers = classified.filter(c => c.isOuter);
  const holes = classified.filter(c => !c.isOuter);

  const polygons = outers.map(o => ({ outer: o.ring, holes: [] }));

  // Assign each hole to the smallest containing outer
  for (const hole of holes) {
    const testPoint = hole.ring[0];
    let bestOuter = null;
    let bestArea = Infinity;

    for (let i = 0; i < outers.length; i++) {
      if (pointInRing(testPoint.x, testPoint.y, outers[i].ring)) {
        if (outers[i].absArea < bestArea) {
          bestArea = outers[i].absArea;
          bestOuter = i;
        }
      }
    }

    if (bestOuter !== null) {
      polygons[bestOuter].holes.push(hole.ring);
    }
  }

  return polygons;
}
