/**
 * String and number formatting utilities
 */

/**
 * Pad a string or number with spaces on the left to reach a specified width
 */
export function padStart(val: string | number, width: number): string {
  return String(val).padStart(width);
}

/**
 * Pad a string or number with spaces on the right to reach a specified width
 */
export function padEnd(val: string | number, width: number): string {
  return String(val).padEnd(width);
}

/**
 * Format a number with a fixed number of decimal places and pad with spaces on the left
 */
export function formatFloat(
  val: number,
  width: number,
  precision: number
): string {
  return val.toFixed(precision).padStart(width);
}
