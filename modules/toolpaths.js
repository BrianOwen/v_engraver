// Reusable CNC toolpath generators — movesToSbp / movesToGcode
// (Adapted from ShopBot Labs shared toolpath library)

export function movesToSbp(moves) {
  let sbp = '';
  let lastPos = { x: 0, y: 0, z: 0 };

  moves.forEach(move => {
    if (move.type === 'comment') {
      sbp += `'${move.text}\n`;
      return;
    }

    const x = move.x !== undefined ? move.x : lastPos.x;
    const y = move.y !== undefined ? move.y : lastPos.y;
    const z = move.z !== undefined ? move.z : lastPos.z;

    if (move.type === 'rapid') {
      if (move.x === undefined && move.y === undefined) {
        sbp += `JZ,${z.toFixed(6)}\n`;
      } else if (move.z === undefined) {
        sbp += `J2,${x.toFixed(6)},${y.toFixed(6)}\n`;
      } else {
        sbp += `J3,${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}\n`;
      }
      lastPos = { x, y, z };
      return;
    }
    if (move.type === 'linear') {
      if (move.x === undefined && move.y === undefined) {
        sbp += `MZ,${z.toFixed(6)}\n`;
      } else if (move.z === undefined) {
        sbp += `M2,${x.toFixed(6)},${y.toFixed(6)}\n`;
      } else {
        sbp += `M3,${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}\n`;
      }
      lastPos = { x, y, z };
      return;
    }
    if (move.type === 'arc') {
      const dir = move.cw ? 1 : -1;
      sbp += `CG, ,${x.toFixed(6)},${y.toFixed(6)},${(move.i ?? 0).toFixed(6)},${(move.j ?? 0).toFixed(6)},T,${dir}\n`;
      lastPos = { x, y, z };
    }
  });
  return sbp;
}

export function movesToGcode(moves, { feedRate } = {}) {
  let gcode = '';
  let currentFeed = null;
  let lastPos = { x: 0, y: 0, z: 0 };

  moves.forEach(move => {
    if (move.type === 'comment') {
      gcode += `(${move.text})\n`;
      return;
    }

    const x = move.x !== undefined ? move.x : lastPos.x;
    const y = move.y !== undefined ? move.y : lastPos.y;
    const z = move.z !== undefined ? move.z : lastPos.z;

    if (move.type === 'rapid') {
      let coords = '';
      if (move.x !== undefined) coords += ` X${x.toFixed(6)}`;
      if (move.y !== undefined) coords += ` Y${y.toFixed(6)}`;
      if (move.z !== undefined) coords += ` Z${z.toFixed(6)}`;
      gcode += `G0${coords}\n`;
      lastPos = { x, y, z };
      return;
    }
    if (move.type === 'linear') {
      const feedPart = feedRate && feedRate !== currentFeed ? ` F${feedRate.toFixed(3)}` : '';
      currentFeed = feedRate ?? currentFeed;
      let coords = '';
      if (move.x !== undefined) coords += ` X${x.toFixed(6)}`;
      if (move.y !== undefined) coords += ` Y${y.toFixed(6)}`;
      if (move.z !== undefined) coords += ` Z${z.toFixed(6)}`;
      gcode += `G1${coords}${feedPart}\n`;
      lastPos = { x, y, z };
      return;
    }
    if (move.type === 'arc') {
      const code = move.cw ? 'G2' : 'G3';
      const feedPart = feedRate && feedRate !== currentFeed ? ` F${feedRate.toFixed(3)}` : '';
      currentFeed = feedRate ?? currentFeed;
      gcode += `${code} X${x.toFixed(6)} Y${y.toFixed(6)} Z${z.toFixed(6)} I${(move.i ?? 0).toFixed(6)} J${(move.j ?? 0).toFixed(6)}${feedPart}\n`;
      lastPos = { x, y, z };
    }
  });

  return gcode;
}
