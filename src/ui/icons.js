// Line icons for the interface chrome (24×24 grid, drawn with the text colour).
// Products and buildings use emoji from their definitions instead.

import { raw } from './dom.js';

const PATHS = {
  overview: '<rect x="3" y="3" width="8" height="10" rx="1.5"/><rect x="13" y="3" width="8" height="6" rx="1.5"/><rect x="13" y="11" width="8" height="10" rx="1.5"/><rect x="3" y="15" width="8" height="6" rx="1.5"/>',
  map: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  buildings: '<path d="M4 21V8l7-4v17"/><path d="M11 10h9v11"/><path d="M2 21h20"/><path d="M7 10v1M7 14v1M15 14v1M15 17.5v1"/>',
  market: '<path d="M4 9h16l-1.5 10.5a1.5 1.5 0 0 1-1.5 1.5H7a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M8.5 9 11 3M15.5 9 13 3"/><path d="M9.5 13v4M14.5 13v4"/>',
  finance: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>',
  stocks: '<path d="M3 20h18"/><path d="m4 16 5-5 4 3 7-8"/><path d="M15.5 6H20v4.5"/>',
  brands: '<path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M16.5 9.5a3.5 3.5 0 0 1 0 5M19 7a7 7 0 0 1 0 10"/>',
  rivals: '<circle cx="8" cy="8" r="3.2"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.6A4.6 4.6 0 0 1 21.5 19"/>',
  news: '<path d="M5 4h12v15a1.5 1.5 0 0 0 3 0V8h-3"/><path d="M5 4v15a1.5 1.5 0 0 0 1.5 1.5H18.5"/><path d="M8 8h6M8 12h6M8 16h4"/>',
  guide: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2.5H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="M11 5 4 12l7 7"/><path d="M4 12h16"/>',
  check: '<path d="m4.5 12.5 5 5L20 7"/>',
  save: '<path d="M5 3h11l4 4v14H4V4a1 1 0 0 1 1-1z"/><path d="M8 3v6h7V3M8 21v-7h8v7"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 14h10l1-14"/><path d="M10 11v6M14 11v6"/>',
  up: '<path d="M12 20V5"/><path d="m5 11 7-7 7 7"/>',
  edit: '<path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/>',
  swap: '<path d="M4 8h14l-4-4M20 16H6l4 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r="0.6" fill="currentColor"/>',
  warn: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v5"/><circle cx="12" cy="17.6" r="0.6" fill="currentColor"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18M3 15h18M9.5 4v16"/>',
  chart: '<path d="M3 20h18"/><path d="m4 16 5-5 4 3 7-8"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8.5 11h7"/>',
  turnLeft: '<path d="M5 12a7 7 0 1 1 3 5.7"/><path d="M5 6.5V12h5.5"/>',
  turnRight: '<path d="M19 12a7 7 0 1 0-3 5.7"/><path d="M19 6.5V12h-5.5"/>',
  plots: '<path d="M4 4h6M14 4h6M4 20h6M14 20h6M4 4v6M4 14v6M20 4v6M20 14v6"/><path d="M12 8.5v7M8.5 12h7"/>',
  list: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><circle cx="4.2" cy="6.5" r="0.9" fill="currentColor"/><circle cx="4.2" cy="12" r="0.9" fill="currentColor"/><circle cx="4.2" cy="17.5" r="0.9" fill="currentColor"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  flat: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/>',
};

const FILLED = new Set(['pause', 'play', 'more']);

/**
 * @param {string} name key of PATHS
 * @param {number} [size] pixel size
 */
export function icon(name, size = 20) {
  const body = PATHS[name] ?? PATHS.info;
  const paint = FILLED.has(name)
    ? 'fill="currentColor" stroke="none"'
    : 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  return raw(`<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" ${paint} aria-hidden="true">${body}</svg>`);
}

/** Two or three play triangles for the faster speeds. */
export function speedIcon(level, size = 20) {
  if (level <= 0) return icon('pause', size);
  const n = Math.min(level, 3);
  const step = 6.5;
  const width = 8 + (n - 1) * step;
  const start = (24 - width) / 2;
  let body = '';
  for (let i = 0; i < n; i++) {
    const x = start + i * step;
    body += `<path d="M${x} 6v12l8-6z"/>`;
  }
  const extra = level >= 4 ? '<rect x="20.5" y="6" width="1.8" height="12" rx="0.6"/>' : '';
  return raw(`<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}${extra}</svg>`);
}
