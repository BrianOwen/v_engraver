// Minimal DXF file parser for V-Engraver
// Supports LINE, LWPOLYLINE, CIRCLE, ARC, POLYLINE/VERTEX entities.

import { computeBounds, buildNestingTree } from './polygon-utils.js';

/**
 * Import a DXF file and extract all closed paths as polygons.
 * Returns { polygons, bounds }
 */
export async function importDXF(file) {
  const text = await file.text();
  return parseDXF(text);
}

/**
 * Parse DXF text content into polygons.
 */
export function parseDXF(text) {
  const lines = text.split(/\r?\n/);
  const entities = parseEntities(lines);

  if (entities.length === 0) {
    throw new Error('No supported entities found in DXF file');
  }

  // Convert entities to polylines
  const polylines = [];
  for (const entity of entities) {
    const pts = entityToPoints(entity);
    if (pts && pts.length >= 3) {
      polylines.push(pts);
    }
  }

  if (polylines.length === 0) {
    throw new Error('No closed paths found in DXF file');
  }

  // Group into polygons
  const polygons = groupPolygons(polylines);
  const allPoints = polylines.flat();
  const bounds = computeBounds(allPoints);

  return { polygons, bounds };
}

/**
 * Parse the ENTITIES section of a DXF file.
 */
function parseEntities(lines) {
  const entities = [];
  let i = 0;

  // Find ENTITIES section
  while (i < lines.length) {
    if (lines[i].trim() === 'ENTITIES') { i++; break; }
    i++;
  }

  // Parse entities
  while (i < lines.length - 1) {
    const code = parseInt(lines[i].trim());
    const value = lines[i + 1].trim();

    if (code === 0 && value === 'ENDSEC') break;

    if (code === 0) {
      const entityType = value;
      i += 2;
      const entityData = { type: entityType };
      const props = [];

      // Read all group code/value pairs until next entity (code 0)
      while (i < lines.length - 1) {
        const nextCode = parseInt(lines[i].trim());
        if (nextCode === 0) break;
        const nextValue = lines[i + 1].trim();
        props.push({ code: nextCode, value: nextValue });
        i += 2;
      }

      entityData.props = props;
      entities.push(entityData);
    } else {
      i += 2;
    }
  }

  return entities;
}

/**
 * Convert a DXF entity to an array of points.
 */
function entityToPoints(entity) {
  switch (entity.type) {
    case 'LINE': return parseLine(entity);
    case 'LWPOLYLINE': return parseLWPolyline(entity);
    case 'CIRCLE': return parseCircle(entity);
    case 'ARC': return parseArc(entity);
    case 'POLYLINE': return null; // VERTEX-based polylines handled separately
    default: return null;
  }
}

function getProps(entity) {
  const map = {};
  const lists = {};
  for (const p of entity.props) {
    if (lists[p.code]) {
      lists[p.code].push(p.value);
    } else if (map[p.code] !== undefined) {
      lists[p.code] = [map[p.code], p.value];
      delete map[p.code];
    } else {
      map[p.code] = p.value;
    }
  }
  return { map, lists };
}

function parseLine(entity) {
  const { map } = getProps(entity);
  // LINE is not a closed polygon, skip
  return null;
}

function parseLWPolyline(entity) {
  // Extract vertices and bulge values
  const vertices = [];
  let currentVertex = null;

  for (const p of entity.props) {
    if (p.code === 10) {
      // New X coordinate starts a new vertex
      if (currentVertex) vertices.push(currentVertex);
      currentVertex = { x: parseFloat(p.value), y: 0, bulge: 0 };
    } else if (p.code === 20 && currentVertex) {
      currentVertex.y = parseFloat(p.value);
    } else if (p.code === 42 && currentVertex) {
      currentVertex.bulge = parseFloat(p.value);
    }
  }
  if (currentVertex) vertices.push(currentVertex);

  if (vertices.length < 3) return null;

  // Check if closed (flag 70, bit 1)
  const { map } = getProps(entity);
  const flags = parseInt(map[70] || '0');
  const isClosed = (flags & 1) !== 0;

  // Convert to points, expanding bulge arcs
  const points = [];
  const count = isClosed ? vertices.length : vertices.length - 1;

  for (let i = 0; i < count; i++) {
    const v = vertices[i];
    points.push({ x: v.x, y: v.y });

    if (Math.abs(v.bulge) > 1e-6) {
      const next = vertices[(i + 1) % vertices.length];
      const arcPoints = bulgeToArc(v.x, v.y, next.x, next.y, v.bulge);
      points.push(...arcPoints);
    }
  }

  if (!isClosed && vertices.length > 0) {
    points.push({ x: vertices[vertices.length - 1].x, y: vertices[vertices.length - 1].y });
  }

  return points.length >= 3 ? points : null;
}

function parseCircle(entity) {
  const { map } = getProps(entity);
  const cx = parseFloat(map[10] || '0');
  const cy = parseFloat(map[20] || '0');
  const r = parseFloat(map[40] || '0');
  if (r <= 0) return null;

  const n = 180;
  const points = [];
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n;
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  return points;
}

function parseArc(entity) {
  const { map } = getProps(entity);
  const cx = parseFloat(map[10] || '0');
  const cy = parseFloat(map[20] || '0');
  const r = parseFloat(map[40] || '0');
  const startAngle = parseFloat(map[50] || '0') * Math.PI / 180;
  const endAngle = parseFloat(map[51] || '360') * Math.PI / 180;
  if (r <= 0) return null;

  let sweep = endAngle - startAngle;
  if (sweep <= 0) sweep += 2 * Math.PI;

  const n = Math.max(8, Math.ceil(sweep / (Math.PI / 36))); // ~5 degree steps
  const points = [];
  for (let i = 0; i <= n; i++) {
    const angle = startAngle + (sweep * i) / n;
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }

  // ARC is open, not a closed polygon
  return null;
}

/**
 * Convert a bulge arc segment to intermediate points.
 * Bulge = tan(arc_angle / 4). Positive = CCW.
 */
function bulgeToArc(x1, y1, x2, y2, bulge) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const chordLen = Math.hypot(dx, dy);
  if (chordLen < 1e-10) return [];

  const sagitta = Math.abs(bulge) * chordLen / 2;
  const radius = (chordLen * chordLen / 4 + sagitta * sagitta) / (2 * sagitta);

  // Midpoint of chord
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  // Normal to chord
  const nx = -dy / chordLen;
  const ny = dx / chordLen;

  // Distance from midpoint to center
  const d = radius - sagitta;
  const sign = bulge > 0 ? 1 : -1;

  const cx = mx + sign * d * nx;
  const cy = my + sign * d * ny;

  // Angles
  const startAngle = Math.atan2(y1 - cy, x1 - cx);
  const endAngle = Math.atan2(y2 - cy, x2 - cx);

  let sweep = endAngle - startAngle;
  if (bulge > 0 && sweep < 0) sweep += 2 * Math.PI;
  if (bulge < 0 && sweep > 0) sweep -= 2 * Math.PI;

  const n = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
  const points = [];
  for (let i = 1; i < n; i++) {
    const angle = startAngle + (sweep * i) / n;
    points.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }

  return points;
}

/**
 * Group polylines into polygon objects
 * using containment-based even-odd nesting.
 */
function groupPolygons(polylines) {
  return buildNestingTree(polylines);
}
