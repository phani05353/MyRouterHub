/**
 * Format bytes into a human-readable string.
 * @param {number} bytes
 * @param {number} decimals
 */
export function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format bytes/s into a human-readable bandwidth string.
 */
export function formatRate(bytesPerSec) {
  return `${formatBytes(bytesPerSec)}/s`;
}

/**
 * Format a unix epoch seconds timestamp as HH:MM:SS.
 */
export function formatTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Format a unix epoch seconds timestamp as a date string.
 */
export function formatDate(ts) {
  return new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Format a unix epoch seconds timestamp as HH:MM.
 */
export function formatShortTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
