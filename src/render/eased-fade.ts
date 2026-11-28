export function easedFade(amount: number): number {
  const clamped: number = Math.min(1, Math.max(0, amount));
  return clamped * clamped * (3 - 2 * clamped);
}
