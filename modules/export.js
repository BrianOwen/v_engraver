// File export helpers for V-Engraver

import { movesToSbp, movesToGcode } from './toolpaths.js';

function downloadFile(content, filename, mimeType = 'text/plain') {
    // FabMo: submit to tool instead of downloading
    if (window.FabMoBridge && window.FabMoBridge.isFabMo) {
        window.FabMoBridge.submitJob(content, filename,
            filename.endsWith('.sbp') ? 'sbp' : 'gcode');
        return;
    }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateGcode(moves, options) {
  const { feedRate, plungeRate, rpm, safeZ, fileName, vBitAngle, units } = options;
  const lines = [];
  const unitCode = units === 'mm' ? 'G21' : 'G20';

  lines.push('(V-Engraver - ShopBot Labs)');
  lines.push(`(File: ${fileName || 'untitled'})`);
  lines.push(`(Date: ${new Date().toISOString()})`);
  lines.push(`(V-bit angle: ${vBitAngle} deg)`);
  lines.push('');
  lines.push('G90');
  lines.push(unitCode);
  lines.push('G17');
  lines.push(`G0 Z${safeZ.toFixed(4)}`);
  lines.push(`M3 S${rpm}`);
  lines.push('G4 P2');
  lines.push('');
  lines.push(movesToGcode(moves, { feedRate }));
  lines.push('');
  lines.push('M5');
  lines.push(`G0 Z${safeZ.toFixed(4)}`);
  lines.push('G0 X0 Y0');
  lines.push('M30');

  return {
    content: lines.join('\n'),
    filename: ((fileName || 'v-engrave').replace(/\.[^.]+$/, '')) + '.nc',
  };
}

export function generateSbp(moves, options) {
  const { feedRate, plungeRate, rpm, safeZ, fileName, vBitAngle } = options;
  const feedIPS = feedRate / 60;
  const plungeIPS = plungeRate / 60;
  const lines = [];

  lines.push("'V-Engraver - ShopBot Labs");
  lines.push(`'File: ${fileName || 'untitled'}`);
  lines.push(`'Date: ${new Date().toISOString()}`);
  lines.push(`'V-bit angle: ${vBitAngle} deg`);
  lines.push('');
  lines.push('SA');
  lines.push(`TR,${rpm}`);
  lines.push('C6');
  lines.push('PAUSE 2');
  lines.push(`MS,${feedIPS.toFixed(4)},${feedIPS.toFixed(4)}`);
  lines.push(`MZ,${plungeIPS.toFixed(4)}`);
  lines.push(`JZ,${safeZ.toFixed(4)}`);
  lines.push('');
  lines.push(movesToSbp(moves));
  lines.push('');
  lines.push('C7');
  lines.push(`JZ,${safeZ.toFixed(4)}`);
  lines.push('J2,0,0');
  lines.push('END');

  return {
    content: lines.join('\n'),
    filename: ((fileName || 'v-engrave').replace(/\.[^.]+$/, '')) + '.sbp',
  };
}

export function exportAsGcode(moves, options) {
  const { content, filename } = generateGcode(moves, options);
  downloadFile(content, filename);
}

export function exportAsSbp(moves, options) {
  const { content, filename } = generateSbp(moves, options);
  downloadFile(content, filename);
}
