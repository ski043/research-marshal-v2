export type Numbered<T> = { number: number; item: T };

export function numberItems<T>(items: readonly T[]): readonly Numbered<T>[] {
  return items.map((item, index) => ({ number: index + 1, item }));
}

export function pickByNumber<T>(
  list: readonly Numbered<T>[],
  numbers: readonly number[],
): { items: readonly T[]; unknown: readonly number[] } {
  const byNumber = new Map(list.map((entry) => [entry.number, entry.item]));
  const seen = new Set<number>();
  const items: T[] = [];
  const unknown: number[] = [];
  for (const number of numbers) {
    if (seen.has(number)) continue;
    seen.add(number);
    const item = byNumber.get(number);
    if (item === undefined) unknown.push(number);
    else items.push(item);
  }
  return { items, unknown };
}
