// Three.js 3D preview for V-Engraver
// Shows vector outlines, toolpath lines, and carved surface.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pointInPolygon, distanceToSegment } from './polygon-utils.js';

let renderer, scene, camera, controls;
let vectorGroup, toolpathGroup, surfaceGroup, stockGroup;

/**
 * Initialize the Three.js scene.
 */
export function initThreeScene() {
  const canvas = document.getElementById('threeCanvas');
  const container = document.getElementById('canvasContainer');

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  const aspect = container.clientWidth / container.clientHeight;
  camera = new THREE.PerspectiveCamera(45, aspect, 0.001, 1000);
  camera.position.set(0, -8, 6);
  camera.up.set(0, 0, 1); // Z-up for CNC

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;

  // Lighting
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight1.position.set(5, -5, 10);
  scene.add(dirLight1);
  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dirLight2.position.set(-5, 5, 5);
  scene.add(dirLight2);

  // Groups
  stockGroup = new THREE.Group();
  vectorGroup = new THREE.Group();
  toolpathGroup = new THREE.Group();
  surfaceGroup = new THREE.Group();
  scene.add(stockGroup);
  scene.add(vectorGroup);
  scene.add(toolpathGroup);
  scene.add(surfaceGroup);

  // Handle resize
  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

/**
 * Clear all scene content.
 */
export function clearScene() {
  clearGroup(stockGroup);
  clearGroup(vectorGroup);
  clearGroup(toolpathGroup);
  clearGroup(surfaceGroup);
}

function clearGroup(group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(m => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  }
}

/**
 * Show 2D vector outlines on the XY plane.
 */
export function showVectors(polygons, bounds) {
  clearGroup(vectorGroup);
  clearGroup(toolpathGroup);
  clearGroup(surfaceGroup);

  const material = new THREE.LineBasicMaterial({ color: 0x2080ff, linewidth: 1 });
  const holeMaterial = new THREE.LineBasicMaterial({ color: 0x60a0ff, linewidth: 1 });

  for (const polygon of polygons) {
    addRingLine(vectorGroup, polygon.outer, material);
    for (const hole of polygon.holes) {
      addRingLine(vectorGroup, hole, holeMaterial);
    }
  }

  addGrid(bounds);
  fitCamera(bounds);
}

function addRingLine(group, ring, material) {
  const points = ring.map(p => new THREE.Vector3(p.x, p.y, 0.001));
  points.push(new THREE.Vector3(ring[0].x, ring[0].y, 0.001));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  group.add(new THREE.Line(geometry, material));
}

function addGrid(bounds) {
  const pad = Math.max(bounds.width, bounds.height) * 0.15;
  const gridMin = { x: bounds.minX - pad, y: bounds.minY - pad };
  const gridMax = { x: bounds.maxX + pad, y: bounds.maxY + pad };
  const gridW = gridMax.x - gridMin.x;
  const gridH = gridMax.y - gridMin.y;

  const maxDim = Math.max(gridW, gridH);
  let gridStep = 1;
  if (maxDim > 50) gridStep = 10;
  else if (maxDim > 20) gridStep = 5;
  else if (maxDim > 5) gridStep = 1;
  else gridStep = 0.5;

  const gridMat = new THREE.LineBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.4 });
  const gridLines = [];
  const startX = Math.floor(gridMin.x / gridStep) * gridStep;
  const startY = Math.floor(gridMin.y / gridStep) * gridStep;

  for (let x = startX; x <= gridMax.x; x += gridStep) {
    gridLines.push(new THREE.Vector3(x, gridMin.y, 0));
    gridLines.push(new THREE.Vector3(x, gridMax.y, 0));
  }
  for (let y = startY; y <= gridMax.y; y += gridStep) {
    gridLines.push(new THREE.Vector3(gridMin.x, y, 0));
    gridLines.push(new THREE.Vector3(gridMax.x, y, 0));
  }

  const gridGeom = new THREE.BufferGeometry().setFromPoints(gridLines);
  vectorGroup.add(new THREE.LineSegments(gridGeom, gridMat));
}

/**
 * Show the toolpath as colored 3D lines.
 */
export function showToolpath(moves, bounds) {
  clearGroup(toolpathGroup);

  const cutPositions = [];
  const cutColors = [];
  const rapidPositions = [];
  let lastPos = { x: 0, y: 0, z: 0 };
  let minZ = 0;

  // First pass: find min Z for color mapping
  for (const move of moves) {
    if (move.type === 'comment') continue;
    const z = move.z ?? lastPos.z;
    if (z < minZ) minZ = z;
    lastPos = { x: move.x ?? lastPos.x, y: move.y ?? lastPos.y, z };
  }

  lastPos = { x: 0, y: 0, z: 0 };

  for (const move of moves) {
    if (move.type === 'comment') continue;

    const x = move.x ?? lastPos.x;
    const y = move.y ?? lastPos.y;
    const z = move.z ?? lastPos.z;

    if (move.type === 'rapid') {
      rapidPositions.push(lastPos.x, lastPos.y, lastPos.z);
      rapidPositions.push(x, y, z);
    } else if (move.type === 'linear') {
      cutPositions.push(lastPos.x, lastPos.y, lastPos.z);
      cutPositions.push(x, y, z);

      const depthRatio = minZ !== 0 ? z / minZ : 0;
      const r = 1.0;
      const g = 0.5 * (1 - depthRatio);
      const b = 0.1 * (1 - depthRatio);
      cutColors.push(r, g, b, r, g, b);
    }

    lastPos = { x, y, z };
  }

  if (cutPositions.length > 0) {
    const cutGeom = new THREE.BufferGeometry();
    cutGeom.setAttribute('position', new THREE.Float32BufferAttribute(cutPositions, 3));
    cutGeom.setAttribute('color', new THREE.Float32BufferAttribute(cutColors, 3));
    const cutMat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false });
    toolpathGroup.add(new THREE.LineSegments(cutGeom, cutMat));
  }

  if (rapidPositions.length > 0) {
    const rapidGeom = new THREE.BufferGeometry();
    rapidGeom.setAttribute('position', new THREE.Float32BufferAttribute(rapidPositions, 3));
    const rapidMat = new THREE.LineBasicMaterial({ color: 0x40c040, transparent: true, opacity: 0.4, depthTest: false });
    toolpathGroup.add(new THREE.LineSegments(rapidGeom, rapidMat));
  }
}

/**
 * Show carved surface as a heightmap mesh.
 * Computes V-groove depth at each grid point by checking distance
 * to medial axis LINE SEGMENTS (not just discrete points).
 * When maxDepth is limited, also shows the flat pocket floor.
 *
 * @param {Object} medialAxis
 * @param {Object} vBit
 * @param {Object} bounds
 * @param {Array} [polygons] - optional, needed for pocket visualization
 */
export function showCarvedSurface(medialAxis, vBit, bounds, polygons) {
  clearGroup(surfaceGroup);
  // Clear the vector overlay (its ground plane obscures the surface)
  clearGroup(vectorGroup);

  const halfAngle = (vBit.includedAngle / 2) * Math.PI / 180;
  const tanHA = Math.tan(halfAngle);
  let maxRadius = vBit.maxDepth * tanHA;
  const depthLimited = isFinite(vBit.maxDepth);
  const maxDepth = depthLimited ? vBit.maxDepth : Infinity;

  // If unlimited depth, derive maxRadius from actual medial axis data
  if (!isFinite(maxRadius)) {
    maxRadius = 0;
    for (const branch of medialAxis.branches) {
      for (const pt of branch) {
        if (pt.radius > maxRadius) maxRadius = pt.radius;
      }
    }
  }

  const x0 = bounds.minX;
  const y0 = bounds.minY;
  const totalW = bounds.width;
  const totalH = bounds.height;

  // Resolution scaled to geometry size
  const pixelsPerUnit = 50;
  const maxRes = 400;
  const cols = Math.min(maxRes, Math.max(40, Math.ceil(totalW * pixelsPerUnit)));
  const rows = Math.min(maxRes, Math.max(40, Math.ceil(totalH * pixelsPerUnit)));
  const dx = totalW / (cols - 1);
  const dy = totalH / (rows - 1);

  // Collect all medial axis SEGMENTS (pairs of consecutive points).
  // First, group branches into connected components and detect point-like
  // clusters (e.g., circles/dots whose Voronoi skeleton is a starburst).
  // Replace those with a single point source for smooth cone rendering.
  const segments = [];
  const branchComponents = groupBranchComponents(medialAxis.branches);

  for (const comp of branchComponents) {
    // Check if this component is point-like
    let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
    let cMaxR = 0;
    let deepest = null;
    for (const bi of comp) {
      for (const pt of medialAxis.branches[bi]) {
        if (pt.x < cMinX) cMinX = pt.x;
        if (pt.y < cMinY) cMinY = pt.y;
        if (pt.x > cMaxX) cMaxX = pt.x;
        if (pt.y > cMaxY) cMaxY = pt.y;
        if (pt.radius > cMaxR) { cMaxR = pt.radius; deepest = pt; }
      }
    }
    const extent = Math.max(cMaxX - cMinX, cMaxY - cMinY);
    const isPointLike = deepest && comp.length >= 5 && cMaxR > extent * 0.49;
    console.log(`Surface component: ${comp.length} branches, extent=${extent.toFixed(6)}, maxR=${cMaxR.toFixed(4)}, ratio=${(cMaxR / Math.max(extent, 1e-9)).toFixed(3)}, pointLike=${isPointLike}`);
    if (isPointLike) {
      // Point-like — single point source for a smooth cone
      const r = Math.min(cMaxR, maxRadius);
      console.log(`  → POINT SOURCE at (${deepest.x.toFixed(4)}, ${deepest.y.toFixed(4)}), r=${r.toFixed(4)}`);
      segments.push({ ax: deepest.x, ay: deepest.y, ar: r,
                       bx: deepest.x, by: deepest.y, br: r });
      continue;
    }

    // Normal component — emit all segments
    for (const bi of comp) {
      const branch = medialAxis.branches[bi];
      for (let i = 0; i < branch.length - 1; i++) {
        segments.push({
          ax: branch[i].x, ay: branch[i].y, ar: Math.min(branch[i].radius, maxRadius),
          bx: branch[i + 1].x, by: branch[i + 1].y, br: Math.min(branch[i + 1].radius, maxRadius),
        });
      }
    }
  }

  // Build spatial grid of medial axis segments for fast lookup
  const cellSize = Math.max(maxRadius * 2, dx * 4, 0.1);
  const segGrid = new Map();
  for (const seg of segments) {
    const sMinX = Math.min(seg.ax, seg.bx) - maxRadius;
    const sMaxX = Math.max(seg.ax, seg.bx) + maxRadius;
    const sMinY = Math.min(seg.ay, seg.by) - maxRadius;
    const sMaxY = Math.max(seg.ay, seg.by) + maxRadius;

    const cxMin = Math.floor(sMinX / cellSize);
    const cxMax = Math.floor(sMaxX / cellSize);
    const cyMin = Math.floor(sMinY / cellSize);
    const cyMax = Math.floor(sMaxY / cellSize);

    for (let cx = cxMin; cx <= cxMax; cx++) {
      for (let cy = cyMin; cy <= cyMax; cy++) {
        const key = `${cx},${cy}`;
        if (!segGrid.has(key)) segGrid.set(key, []);
        segGrid.get(key).push(seg);
      }
    }
  }

  // When depth is limited, build a spatial grid of polygon boundary segments
  // so we can quickly check distance-to-boundary for flat pocket areas.
  let boundarySegGrid = null;
  let boundaryCellSize = 0;
  if (depthLimited && polygons && polygons.length > 0) {
    const boundarySegs = [];
    for (const polygon of polygons) {
      const addRing = (ring) => {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          boundarySegs.push({ ax: ring[j].x, ay: ring[j].y, bx: ring[i].x, by: ring[i].y });
        }
      };
      addRing(polygon.outer);
      for (const hole of polygon.holes) addRing(hole);
    }
    boundaryCellSize = Math.max(maxRadius * 1.5, 0.2);
    boundarySegGrid = new Map();
    for (const seg of boundarySegs) {
      const sMinX = Math.min(seg.ax, seg.bx) - maxRadius;
      const sMaxX = Math.max(seg.ax, seg.bx) + maxRadius;
      const sMinY = Math.min(seg.ay, seg.by) - maxRadius;
      const sMaxY = Math.max(seg.ay, seg.by) + maxRadius;
      for (let cx = Math.floor(sMinX / boundaryCellSize); cx <= Math.floor(sMaxX / boundaryCellSize); cx++) {
        for (let cy = Math.floor(sMinY / boundaryCellSize); cy <= Math.floor(sMaxY / boundaryCellSize); cy++) {
          const key = `${cx},${cy}`;
          if (!boundarySegGrid.has(key)) boundarySegGrid.set(key, []);
          boundarySegGrid.get(key).push(seg);
        }
      }
    }
  }

  function fastDistToBoundary(px, py) {
    if (!boundarySegGrid) return 0;
    const gcx = Math.floor(px / boundaryCellSize);
    const gcy = Math.floor(py / boundaryCellSize);
    let minDist = Infinity;
    for (let ddx = -1; ddx <= 1; ddx++) {
      for (let ddy = -1; ddy <= 1; ddy++) {
        const cell = boundarySegGrid.get(`${gcx + ddx},${gcy + ddy}`);
        if (!cell) continue;
        for (const seg of cell) {
          const d = distanceToSegment(px, py, seg.ax, seg.ay, seg.bx, seg.by);
          if (d < minDist) minDist = d;
        }
      }
    }
    return minDist;
  }

  // Pass 1: compute Z values
  const zValues = new Float32Array(cols * rows);
  let globalMinZ = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      const px = x0 + col * dx;
      const py = y0 + row * dy;

      let minZ = 0;

      // V-groove depth from medial axis
      const gcx = Math.floor(px / cellSize);
      const gcy = Math.floor(py / cellSize);
      const cell = segGrid.get(`${gcx},${gcy}`);

      if (cell) {
        for (const seg of cell) {
          const closest = closestOnSegment(px, py, seg);
          if (closest.dist < closest.radius) {
            const grooveZ = -(closest.radius - closest.dist) / tanHA;
            if (grooveZ < minZ) minZ = grooveZ;
          }
        }
      }

      // When depth is limited: the profile pass rolls a circle of radius
      // maxRadius along the inside of the polygon boundary.  This produces:
      //  - A V-profile wall from the boundary inward (z = -dist / tanHA)
      //  - A flat pocket floor at z = -maxDepth where dist >= maxRadius
      // Take the deepest of the medial-axis groove and the profile-wall cut.
      if (depthLimited && polygons) {
        // Clamp medial-axis groove depth to maxDepth
        if (minZ < -maxDepth) minZ = -maxDepth;

        for (const polygon of polygons) {
          if (pointInPolygon(px, py, polygon)) {
            const dist = fastDistToBoundary(px, py);
            // Profile wall: V-bit at boundary distance carves a slope
            const profileZ = -Math.min(dist, maxRadius) / tanHA;
            if (profileZ < minZ) minZ = profileZ;
            break;
          }
        }
      }

      zValues[idx] = minZ;
      if (minZ < globalMinZ) globalMinZ = minZ;
    }
  }

  // Build geometry
  const geometry = new THREE.PlaneGeometry(totalW, totalH, cols - 1, rows - 1);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col;
      const px = x0 + col * dx;
      const py = y0 + row * dy;
      const z = zValues[idx];

      positions.setX(idx, px);
      positions.setY(idx, py);
      positions.setZ(idx, z);

      // Color: light wood surface, darker in grooves
      const depthFrac = globalMinZ !== 0 ? Math.max(0, Math.min(1, z / globalMinZ)) : 0;
      colors[idx * 3]     = 0.93 - 0.65 * depthFrac;
      colors[idx * 3 + 1] = 0.85 - 0.70 * depthFrac;
      colors[idx * 3 + 2] = 0.65 - 0.60 * depthFrac;
    }
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  positions.needsUpdate = true;
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    flatShading: false,
    shininess: 40,
  });

  const mesh = new THREE.Mesh(geometry, material);
  surfaceGroup.add(mesh);

  fitCamera(bounds);
}

/**
 * Find closest point on a medial axis segment to (px, py)
 * and interpolate the radius at that point.
 */
function closestOnSegment(px, py, seg) {
  const ex = seg.bx - seg.ax;
  const ey = seg.by - seg.ay;
  const lenSq = ex * ex + ey * ey;

  let t;
  if (lenSq < 1e-12) {
    t = 0;
  } else {
    t = ((px - seg.ax) * ex + (py - seg.ay) * ey) / lenSq;
    t = Math.max(0, Math.min(1, t));
  }

  const closestX = seg.ax + t * ex;
  const closestY = seg.ay + t * ey;
  const dist = Math.hypot(px - closestX, py - closestY);
  const radius = seg.ar + t * (seg.br - seg.ar); // Linearly interpolate radius

  return { dist, radius };
}

/**
 * Show vector outlines as thin lines overlaid on the surface.
 */
export function showVectorOverlay(polygons) {
  const material = new THREE.LineBasicMaterial({
    color: 0x2060cc,
    transparent: true,
    opacity: 0.6,
    depthTest: false,
  });

  for (const polygon of polygons) {
    addOverlayRing(surfaceGroup, polygon.outer, material);
    for (const hole of polygon.holes) {
      addOverlayRing(surfaceGroup, hole, material);
    }
  }
}

function addOverlayRing(group, ring, material) {
  const points = ring.map(p => new THREE.Vector3(p.x, p.y, 0.002));
  points.push(new THREE.Vector3(ring[0].x, ring[0].y, 0.002));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  group.add(new THREE.Line(geometry, material));
}

/**
 * Fit the camera to show the given bounds.
 */
function fitCamera(bounds) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const maxDim = Math.max(bounds.width, bounds.height);
  const dist = maxDim * 1.5;

  camera.position.set(cx, cy - dist * 0.6, dist * 0.8);
  controls.target.set(cx, cy, 0);
  controls.update();
}

/**
 * Show a 3D stock block from (0,0,-thickness) to (width, height, 0).
 * Top surface at Z=0, with visible edges.
 * @param {boolean} openTop — if true, omit the top face (carved surface replaces it)
 */
export function showStock(width, height, thickness, openTop = false) {
  clearGroup(stockGroup);

  const boxGeom = new THREE.BoxGeometry(width, height, thickness);
  boxGeom.translate(width / 2, height / 2, -thickness / 2);

  // Light wood material
  const sideMat = new THREE.MeshPhongMaterial({
    color: 0xd4a860,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    shininess: 20,
  });

  let mesh;
  if (openTop) {
    // BoxGeometry groups: 0=+x, 1=-x, 2=+y, 3=-y, 4=+z(top), 5=-z(bottom)
    const hiddenMat = new THREE.MeshBasicMaterial({ visible: false });
    mesh = new THREE.Mesh(boxGeom, [sideMat, sideMat, sideMat, sideMat, hiddenMat, sideMat]);
  } else {
    mesh = new THREE.Mesh(boxGeom, sideMat);
  }
  stockGroup.add(mesh);

  // Dark edges
  const edgesGeom = new THREE.EdgesGeometry(boxGeom);
  const edgesMat = new THREE.LineBasicMaterial({ color: 0x665533, linewidth: 1 });
  stockGroup.add(new THREE.LineSegments(edgesGeom, edgesMat));
}

/**
 * Group medial axis branches into connected components by endpoint proximity.
 * Returns array of components, each an array of branch indices.
 */
function groupBranchComponents(branches) {
  const TOL = 1e-4;
  function ptKey(p) {
    const gx = Math.round(p.x / TOL) * TOL;
    const gy = Math.round(p.y / TOL) * TOL;
    return `${gx.toFixed(6)},${gy.toFixed(6)}`;
  }

  const adj = new Map();
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i];
    if (b.length < 2) continue;
    const sk = ptKey(b[0]);
    const ek = ptKey(b[b.length - 1]);
    if (!adj.has(sk)) adj.set(sk, []);
    if (!adj.has(ek)) adj.set(ek, []);
    adj.get(sk).push(i);
    adj.get(ek).push(i);
  }

  const visited = new Set();
  const components = [];
  for (let i = 0; i < branches.length; i++) {
    if (visited.has(i) || branches[i].length < 2) continue;
    const comp = [];
    const stack = [i];
    while (stack.length > 0) {
      const bi = stack.pop();
      if (visited.has(bi)) continue;
      visited.add(bi);
      comp.push(bi);
      const b = branches[bi];
      for (const key of [ptKey(b[0]), ptKey(b[b.length - 1])]) {
        for (const ni of (adj.get(key) || [])) {
          if (!visited.has(ni)) stack.push(ni);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

/**
 * Update scene background for theme.
 */
export function setTheme(isDark) {
  if (scene) {
    scene.background = new THREE.Color(isDark ? 0x1d1d1f : 0xf0f0f0);
  }
}
