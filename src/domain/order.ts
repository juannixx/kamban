interface Ordered {
  order: number;
}

export function nextOrder(items: readonly Ordered[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map((i) => i.order)) + 1;
}

export function byOrder(a: Ordered, b: Ordered): number {
  return a.order - b.order;
}

/** Define `order` de cada item pela posição do seu id em `orderedIds`. Itens fora da lista ficam como estão. */
export function applyOrder<T extends { id: string; order: number }>(
  items: readonly T[],
  orderedIds: readonly string[],
): T[] {
  return items.map((item) => {
    const index = orderedIds.indexOf(item.id);
    return index === -1 ? item : { ...item, order: index };
  });
}
