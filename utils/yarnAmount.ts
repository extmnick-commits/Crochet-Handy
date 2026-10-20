/** Measured yards only. Never turn a range, negative value, or unit into a total. */
export function parseKnownYards(text: string): number | null {
  const value = text.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return null;
  const yards = Number(value.replace(/,/g, ''));
  return Number.isFinite(yards) && yards > 0 && yards <= 100_000 ? yards : null;
}
