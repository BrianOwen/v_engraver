// Toolpath generation from medial axis data
// Converts medial axis branches into CNC move sequences with V-bit Z mapping.

import { pointInPolygon, computeBounds, distanceToSegment } from './polygon-utils.js';

/**
 * Generate V-engraving toolpath moves from the medial axis.
 *
 * @param {Object} medialAxis - { branches: [[ {x, y, radius}, ... ], ...] }
 * @param {Object} vBit - { includedAngle: degrees, maxDepth: inches }
 * @param {Object} machine - { feedRate, plungeRate, safeZ, rpm }
 * @returns {Array} Array of move objects
 */
export function generateVEngraveToolpath(medialAxis, vBit, machine) {
  const halfAngle = (vBit.includedAngle / 2) * Math.PI / 180;
  const tanHalfAngle = Math.tan(halfAngle);
  const maxRadius = vBit.maxDepth * tanHalfAngle;
  const safeZ = machine.safeZ;

  const moves = [];
  moves.push({ type: 'comment', text: 'V-Engrave toolpath' });
  moves.push({ type: 'comment', text: `V-bit: ${vBit.includedAngle} deg, max depth: ${vBit.maxDepth}` });

  // Order branches for efficient cutting (nearest-neighbor)
  const orderedBranches = orderBranches(medialAxis.branches);

  for (const branch of orderedBranches) {
    if (branch.length < 2) continue;

    // Retract to safe Z
    moves.push({ type: 'rapid', z: safeZ });

    // Rapid to start XY
    moves.push({ type: 'rapid', x: branch[0].x, y: branch[0].y });

    // Plunge to first point depth
    const r0 = Math.min(branch[0].radius, maxRadius);
    const z0 = -r0 / tanHalfAngle;
    moves.push({ type: 'linear', x: branch[0].x, y: branch[0].y, z: z0 });

    // Traverse the branch
    for (let i = 1; i < branch.length; i++) {
      const r = Math.min(branch[i].radius, maxRadius);
      const z = -r / tanHalfAngle;
      moves.push({ type: 'linear', x: branch[i].x, y: branch[i].y, z: z });
    }
  }

  // Final retract
  moves.push({ type: 'rapid', z: safeZ });

  return moves;
}

/**
 * Order branches using nearest-neighbor heuristic.
 * Minimizes rapid travel distance between branches.
 */
function orderBranches(branches) {
  if (branches.length <= 1) return branches.map(b => [...b]);

  const remaining = branches.map((branch, i) => ({ branch: [...branch], index: i }));
  const ordered = [];
  let currentPos = { x: 0, y: 0 };

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    let bestReverse = false;

    for (let i = 0; i < remaining.length; i++) {
      const b = remaining[i].branch;
      const dStart = Math.hypot(b[0].x - currentPos.x, b[0].y - currentPos.y);
      const dEnd = Math.hypot(b[b.length - 1].x - currentPos.x, b[b.length - 1].y - currentPos.y);

      if (dStart < bestDist) {
        bestDist = dStart;
        bestIdx = i;
        bestReverse = false;
      }
      if (dEnd < bestDist) {
        bestDist = dEnd;
        bestIdx = i;
        bestReverse = true;
      }
    }

    let branch = remaining[bestIdx].branch;
    if (bestReverse) branch = branch.reverse();
    ordered.push(branch);
    currentPos = branch[branch.length - 1];
    remaining.splice(bestIdx, 1);
  }

  return ordered;
}

/**
 * Check if a straight line from (x1,y1) to (x2,y2) stays inside the polygon.
 * Samples several points along the path.
 */
function canLinkInside(x1, y1, x2, y2, polygon) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(4, Math.ceil(dist / 0.05));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + t * (x2 - x1);
    const y = y1 + t * (y2 - y1);
    if (!pointInPolygon(x, y, polygon)) return false;
  }
  return true;
}

/**
 * Generate zigzag pocket clearing passes for flat-bottom areas.
 * When max depth is limited, the V-bit bottoms out in wide regions.
 * This generates raster passes at z = -maxDepth to clear those areas.
 *
 * @param {Array} polygons - polygon array with { outer, holes }
 * @param {Object} vBit - { includedAngle, maxDepth }
 * @param {Object} machine - { safeZ, feedRate, ... }
 * @param {number} stepover - distance between raster lines (inches)
 * @returns {Array} move objects to append to the main toolpath
 */
export function generatePocketPasses(polygons, vBit, machine, stepover) {
  const halfAngle = (vBit.includedAngle / 2) * Math.PI / 180;
  const maxRadius = vBit.maxDepth * Math.tan(halfAngle);
  const z = -vBit.maxDepth;
  const safeZ = machine.safeZ;
  const sampleStep = Math.min(stepover * 0.5, 0.02);

  const moves = [];
  moves.push({ type: 'comment', text: `Pocket clearing: stepover ${stepover}` });

  for (const polygon of polygons) {
    const bounds = computeBounds(polygon.outer);

    // Build a spatial grid of boundary SEGMENTS for fast distance queries
    const segments = [];
    const addRingSegments = (ring) => {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        segments.push({
          ax: ring[j].x, ay: ring[j].y,
          bx: ring[i].x, by: ring[i].y,
        });
      }
    };
    addRingSegments(polygon.outer);
    for (const hole of polygon.holes) addRingSegments(hole);

    const cellSize = Math.max(maxRadius * 1.5, 0.2);
    const segGrid = new Map();
    for (const seg of segments) {
      const sMinX = Math.min(seg.ax, seg.bx) - maxRadius;
      const sMaxX = Math.max(seg.ax, seg.bx) + maxRadius;
      const sMinY = Math.min(seg.ay, seg.by) - maxRadius;
      const sMaxY = Math.max(seg.ay, seg.by) + maxRadius;
      for (let cx = Math.floor(sMinX / cellSize); cx <= Math.floor(sMaxX / cellSize); cx++) {
        for (let cy = Math.floor(sMinY / cellSize); cy <= Math.floor(sMaxY / cellSize); cy++) {
          const key = `${cx},${cy}`;
          if (!segGrid.has(key)) segGrid.set(key, []);
          segGrid.get(key).push(seg);
        }
      }
    }

    // Fast distance-to-boundary using segment grid
    function fastDistToBoundary(px, py) {
      const gcx = Math.floor(px / cellSize);
      const gcy = Math.floor(py / cellSize);
      let minDist = Infinity;
      // Check 3x3 neighborhood (sufficient since cellSize >= maxRadius * 1.5)
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cell = segGrid.get(`${gcx + dx},${gcy + dy}`);
          if (!cell) continue;
          for (const seg of cell) {
            const d = distanceToSegment(px, py, seg.ax, seg.ay, seg.bx, seg.by);
            if (d < minDist) minDist = d;
          }
        }
      }
      return minDist;
    }

    // Collect all raster cut segments with their zigzag direction
    const allCuts = [];
    let dir = 1;
    for (let y = bounds.minY; y <= bounds.maxY; y += stepover) {
      const flatSegs = [];
      let inFlat = false;
      let segStart = 0;

      for (let x = bounds.minX; x <= bounds.maxX; x += sampleStep) {
        const inside = pointInPolygon(x, y, polygon);
        const flat = inside && fastDistToBoundary(x, y) >= maxRadius;

        if (flat && !inFlat) {
          segStart = x;
          inFlat = true;
        } else if (!flat && inFlat) {
          flatSegs.push({ x1: segStart, x2: x - sampleStep });
          inFlat = false;
        }
      }
      if (inFlat) {
        flatSegs.push({ x1: segStart, x2: bounds.maxX });
      }

      // Order segments for zigzag direction
      const orderedSegs = dir > 0 ? flatSegs : [...flatSegs].reverse();
      for (const seg of orderedSegs) {
        const [sx, ex] = dir > 0 ? [seg.x1, seg.x2] : [seg.x2, seg.x1];
        if (Math.abs(ex - sx) < sampleStep) continue;
        allCuts.push({ sx, sy: y, ex, ey: y });
      }
      dir *= -1;
    }

    // Emit moves: rapid into first cut, then link between cuts at cutting depth
    for (let i = 0; i < allCuts.length; i++) {
      const cut = allCuts[i];

      if (i === 0) {
        // First cut: rapid approach
        moves.push({ type: 'rapid', z: safeZ });
        moves.push({ type: 'rapid', x: cut.sx, y: cut.sy });
        moves.push({ type: 'linear', x: cut.sx, y: cut.sy, z });
      } else {
        // Link from previous cut end to this cut start at cutting depth,
        // but only if the straight-line path stays inside the polygon.
        const prev = allCuts[i - 1];
        const fromX = prev.ex, fromY = prev.ey;
        const toX = cut.sx, toY = cut.sy;

        if (canLinkInside(fromX, fromY, toX, toY, polygon)) {
          // Stay at cutting depth — follow along the boundary wall
          moves.push({ type: 'linear', x: toX, y: toY, z });
        } else {
          // Path crosses outside the polygon (e.g. a hole) — retract
          moves.push({ type: 'rapid', z: safeZ });
          moves.push({ type: 'rapid', x: toX, y: toY });
          moves.push({ type: 'linear', x: toX, y: toY, z });
        }
      }

      // Cut the raster line
      moves.push({ type: 'linear', x: cut.ex, y: cut.ey, z });
    }
  }

  if (moves.length > 1) {
    moves.push({ type: 'rapid', z: safeZ });
  }

  return moves;
}

/**
 * Calculate toolpath statistics.
 */
export function calculateStats(moves, feedRate) {
  let cutLength = 0;
  let rapidLength = 0;
  let moveCount = 0;
  let lastPos = { x: 0, y: 0, z: 0 };
  let minZ = 0;

  for (const move of moves) {
    if (move.type === 'comment') continue;

    const x = move.x ?? lastPos.x;
    const y = move.y ?? lastPos.y;
    const z = move.z ?? lastPos.z;

    const dist = Math.hypot(x - lastPos.x, y - lastPos.y, z - lastPos.z);

    if (move.type === 'rapid') {
      rapidLength += dist;
    } else if (move.type === 'linear') {
      cutLength += dist;
      moveCount++;
    }

    if (z < minZ) minZ = z;
    lastPos = { x, y, z };
  }

  const estTime = cutLength / feedRate; // minutes

  return {
    cutLength: cutLength.toFixed(2),
    rapidLength: rapidLength.toFixed(2),
    moveCount,
    maxDepth: Math.abs(minZ).toFixed(4),
    estTimeMin: estTime.toFixed(1),
  };
}
