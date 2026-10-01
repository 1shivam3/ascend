/**
 * String and number formatting helpers
 */

export const plural = (n: number, one: string, many = one + 's'): string =>
  `${n} ${n === 1 ? one : many}`;

export const formatKg = (kg: number): string => `${Math.round(kg * 10) / 10} kg`;
