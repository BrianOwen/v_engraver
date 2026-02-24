// Toolpath generation from medial axis data
// Converts medial axis branches into CNC move sequences with V-bit Z mapping.

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
