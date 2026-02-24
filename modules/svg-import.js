// SVG file import — parse SVG into polygon arrays using browser DOM

import { signedArea, computeBounds, pointInRing } from './polygon-utils.js';

/**
 * Import an SVG file and extract all closed paths as polygons.
 * Returns { polygons: [{ outer, holes }...], bounds }
 */
export async function importSVG(file) {
  const text = await file.text();
  return parseSVGString(text);
}

/**
 * Parse an SVG string into polygons.
 */
export function parseSVGString(svgText) {
  // Create an offscreen container to parse the SVG
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;';
  container.innerHTML = svgText;
  document.body.appendChild(container);

  const svg = container.querySelector('svg');
  if (!svg) {
    document.body.removeChild(container);
    throw new Error('No SVG element found in file');
  }

  // Ensure the SVG has dimensions for proper rendering
  if (!svg.getAttribute('width') && !svg.getAttribute('viewBox')) {
    svg.setAttribute('width', '100');
    svg.setAttribute('height', '100');
  }

  // Collect all shape elements
  const pathElements = svg.querySelectorAll('path, polygon, polyline, rect, circle, ellipse, line');
  const polylines = [];

  for (const el of pathElements) {
    try {
      const points = sampleElement(el);
      if (points && points.length >= 3) {
        polylines.push(points);
      }
    } catch (e) {
      // Skip malformed elements
      console.warn('Skipping SVG element:', e.message);
    }
  }

  document.body.removeChild(container);

  if (polylines.length === 0) {
    throw new Error('No valid paths found in SVG');
  }

  // Group into polygons (outers + holes)
  const polygons = groupPolygons(polylines);

  // Compute overall bounds
  const allPoints = polylines.flat();
  const bounds = computeBounds(allPoints);

  return { polygons, bounds };
}

/**
 * Sample an SVG element into a polyline of {x, y} points.
 * Uses the browser's built-in path geometry for accurate sampling.
 */
function sampleElement(el) {
  // Convert non-path elements to path data for uniform handling
  let pathEl = el;

  if (el.tagName === 'rect') {
    return sampleRect(el);
  }
  if (el.tagName === 'circle') {
    return sampleCircle(el);
  }
  if (el.tagName === 'ellipse') {
    return sampleEllipse(el);
  }
  if (el.tagName === 'line') {
    return null; // Lines aren't closed polygons
  }
  if (el.tagName === 'polygon' || el.tagName === 'polyline') {
    return samplePolyElement(el);
  }

  // For <path> elements, use getTotalLength / getPointAtLength
  if (typeof el.getTotalLength !== 'function') return null;

  const totalLength = el.getTotalLength();
  if (totalLength < 1e-6) return null;

  // Determine sampling density: ~500 points max, or every 0.5 units
  const numSamples = Math.max(20, Math.min(1000, Math.ceil(totalLength / 0.5)));
  const step = totalLength / numSamples;

  const points = [];
  const ctm = el.getCTM();

  for (let i = 0; i <= numSamples; i++) {
    const pt = el.getPointAtLength(Math.min(i * step, totalLength));
    // Apply transform
    if (ctm) {
      const tx = ctm.a * pt.x + ctm.c * pt.y + ctm.e;
      const ty = ctm.b * pt.x + ctm.d * pt.y + ctm.f;
      points.push({ x: tx, y: ty });
    } else {
      points.push({ x: pt.x, y: pt.y });
    }
  }

  // Check if path is closed (start ≈ end)
  if (points.length >= 3) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < 1e-3) {
      points.pop(); // Remove duplicate closing point
    }
  }

  return points.length >= 3 ? points : null;
}

function sampleRect(el) {
  const ctm = el.getCTM();
  const x = parseFloat(el.getAttribute('x') || 0);
  const y = parseFloat(el.getAttribute('y') || 0);
  const w = parseFloat(el.getAttribute('width'));
  const h = parseFloat(el.getAttribute('height'));
  if (!w || !h) return null;

  let corners = [
    { x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }
  ];

  if (ctm) {
    corners = corners.map(p => ({
      x: ctm.a * p.x + ctm.c * p.y + ctm.e,
      y: ctm.b * p.x + ctm.d * p.y + ctm.f,
    }));
  }

  return corners;
}

function sampleCircle(el) {
  const ctm = el.getCTM();
  const cx = parseFloat(el.getAttribute('cx') || 0);
  const cy = parseFloat(el.getAttribute('cy') || 0);
  const r = parseFloat(el.getAttribute('r'));
  if (!r) return null;

  const n = 72;
  const points = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    let px = cx + r * Math.cos(angle);
    let py = cy + r * Math.sin(angle);
    if (ctm) {
      const tx = ctm.a * px + ctm.c * py + ctm.e;
      const ty = ctm.b * px + ctm.d * py + ctm.f;
      px = tx; py = ty;
    }
    points.push({ x: px, y: py });
  }
  return points;
}

function sampleEllipse(el) {
  const ctm = el.getCTM();
  const cx = parseFloat(el.getAttribute('cx') || 0);
  const cy = parseFloat(el.getAttribute('cy') || 0);
  const rx = parseFloat(el.getAttribute('rx'));
  const ry = parseFloat(el.getAttribute('ry'));
  if (!rx || !ry) return null;

  const n = 72;
  const points = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    let px = cx + rx * Math.cos(angle);
    let py = cy + ry * Math.sin(angle);
    if (ctm) {
      const tx = ctm.a * px + ctm.c * py + ctm.e;
      const ty = ctm.b * px + ctm.d * py + ctm.f;
      px = tx; py = ty;
    }
    points.push({ x: px, y: py });
  }
  return points;
}

function samplePolyElement(el) {
  const ctm = el.getCTM();
  const pointsList = el.points;
  if (!pointsList || pointsList.length < 3) return null;

  const points = [];
  for (let i = 0; i < pointsList.length; i++) {
    let px = pointsList[i].x;
    let py = pointsList[i].y;
    if (ctm) {
      const tx = ctm.a * px + ctm.c * py + ctm.e;
      const ty = ctm.b * px + ctm.d * py + ctm.f;
      px = tx; py = ty;
    }
    points.push({ x: px, y: py });
  }
  return points;
}

/**
 * Group polylines into polygon objects { outer, holes }.
 * Uses signed area to determine winding direction,
 * and containment to assign holes to their parent outers.
 */
function groupPolygons(polylines) {
  // Classify each ring as outer (positive area / CCW) or hole (negative / CW)
  const classified = polylines.map(ring => {
    const area = signedArea(ring);
    return {
      ring,
      area,
      isOuter: area > 0, // In SVG, Y axis is flipped, so we may need to flip this
      bounds: computeBounds(ring),
    };
  });

  // If all rings have the same sign, treat them all as outers (some SVGs are inconsistent)
  const outerCount = classified.filter(c => c.isOuter).length;
  if (outerCount === 0) {
    // All CW — flip interpretation
    classified.forEach(c => c.isOuter = true);
  }

  // SVG coordinate system has Y pointing down, so area sign interpretation
  // may be inverted. Use absolute area to find the largest rings as outers.
  // More robust: sort by absolute area descending, largest are outers.
  const outers = classified.filter(c => c.isOuter);
  const holes = classified.filter(c => !c.isOuter);

  // If no holes, each outer is its own polygon
  if (holes.length === 0) {
    return outers.map(o => ({ outer: o.ring, holes: [] }));
  }

  // Assign each hole to the smallest outer that contains it
  const polygons = outers.map(o => ({ outer: o.ring, holes: [] }));

  for (const hole of holes) {
    const testPoint = hole.ring[0];
    let bestOuter = null;
    let bestArea = Infinity;

    for (let i = 0; i < outers.length; i++) {
      if (pointInRing(testPoint.x, testPoint.y, outers[i].ring)) {
        if (Math.abs(outers[i].area) < bestArea) {
          bestArea = Math.abs(outers[i].area);
          bestOuter = i;
        }
      }
    }

    if (bestOuter !== null) {
      polygons[bestOuter].holes.push(hole.ring);
    } else {
      // Hole doesn't fit inside any outer — treat it as its own outer
      // (this happens with some SVG exports)
      polygons.push({ outer: hole.ring, holes: [] });
    }
  }

  return polygons;
}
