// Polygon utility functions

/**
 * Ray-casting point-in-polygon test.
 * polygon is an array of {x, y} forming a closed ring.
 */
export function pointInRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x, yi = ring[i].y;
    const xj = ring[j].x, yj = ring[j].y;
    if ((yi > py) !== (yj > py) &&
        px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Test if point is inside polygon (outer boundary minus holes).
 */
export function pointInPolygon(px, py, polygon) {
  if (!pointInRing(px, py, polygon.outer)) return false;
  for (const hole of polygon.holes) {
    if (pointInRing(px, py, hole)) return false;
  }
  return true;
}

/**
 * Signed area of a polygon ring.
 * Positive = counter-clockwise, negative = clockwise.
 */
export function signedArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y);
  }
  return area / 2;
}

/**
 * Bounding box of a set of points.
 */
export function computeBounds(points) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Bounding box of an array of polygons.
 */
export function computePolygonsBounds(polygons) {
  const allPoints = [];
  for (const poly of polygons) {
    allPoints.push(...poly.outer);
    for (const hole of poly.holes) {
      allPoints.push(...hole);
    }
  }
  return computeBounds(allPoints);
}

/**
 * Uniformly resample a polyline at the given spacing.
 * Returns an array of {x, y} points.
 */
export function samplePolyline(points, spacing) {
  if (points.length < 2) return [...points];

  const result = [{ x: points[0].x, y: points[0].y }];
  let accumulated = 0;

  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 1e-10) continue;

    const ux = dx / segLen;
    const uy = dy / segLen;
    let remaining = segLen;
    let startX = points[i - 1].x;
    let startY = points[i - 1].y;

    // Distance needed to reach next sample point
    let needed = spacing - accumulated;

    while (remaining >= needed) {
      startX += ux * needed;
      startY += uy * needed;
      result.push({ x: startX, y: startY });
      remaining -= needed;
      accumulated = 0;
      needed = spacing;
    }

    accumulated += remaining;
  }

  return result;
}

/**
 * Distance from point (px, py) to the line segment (ax, ay)-(bx, by).
 */
export function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-12) return Math.hypot(px - ax, py - ay);

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Minimum distance from point to a polygon boundary (all edges of outer + holes).
 */
export function distanceToBoundary(px, py, polygon) {
  let minDist = Infinity;

  const checkRing = (ring) => {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const d = distanceToSegment(px, py, ring[j].x, ring[j].y, ring[i].x, ring[i].y);
      if (d < minDist) minDist = d;
    }
  };

  checkRing(polygon.outer);
  for (const hole of polygon.holes) {
    checkRing(hole);
  }

  return minDist;
}

/**
 * Build a spatial grid for fast nearest-point queries.
 */
export function buildSpatialGrid(points, cellSize) {
  const grid = new Map();
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const cx = Math.floor(p.x / cellSize);
    const cy = Math.floor(p.y / cellSize);
    const key = `${cx},${cy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(p);
  }
  return { grid, cellSize };
}

/**
 * Find the nearest point in the spatial grid.
 */
export function nearestInGrid(spatialGrid, x, y) {
  const { grid, cellSize } = spatialGrid;
  const cx = Math.floor(x / cellSize);
  const cy = Math.floor(y / cellSize);
  let minDist = Infinity;
  let nearest = null;

  for (let r = 0; r <= 5; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r && r > 0) continue;
        const key = `${cx + dx},${cy + dy}`;
        const cell = grid.get(key);
        if (!cell) continue;
        for (const p of cell) {
          const d = Math.hypot(x - p.x, y - p.y);
          if (d < minDist) {
            minDist = d;
            nearest = p;
          }
        }
      }
    }
    if (minDist < (r + 1) * cellSize) break;
  }

  return { point: nearest, dist: minDist };
}
