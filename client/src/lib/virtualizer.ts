export interface VirtualWindowResult<T> {
  visibleItems: T[];
  startIndex: number;
  endIndex: number;
  topSpacerPx: number;
  bottomSpacerPx: number;
  totalHeightPx: number;
}

export function computeVirtualMessageWindow<T extends { id?: string }>(params: {
  items: T[];
  scrollTopPx: number;
  viewportHeightPx: number;
  estimatedRowHeightPx?: number;
  overscanCount?: number;
  measuredHeights?: Record<string, number>;
}): VirtualWindowResult<T> {
  const {
    items,
    scrollTopPx,
    viewportHeightPx,
    estimatedRowHeightPx = 68,
    overscanCount = 8,
    measuredHeights,
  } = params;

  const totalCount = items.length;
  if (totalCount === 0) {
    return {
      visibleItems: [],
      startIndex: 0,
      endIndex: 0,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
      totalHeightPx: 0,
    };
  }

  // Build prefix-sum height table supporting variable-height measured bubbles (Fixes Bug 15)
  const prefixOffsets = new Array<number>(totalCount + 1);
  prefixOffsets[0] = 0;
  for (let i = 0; i < totalCount; i++) {
    const id = items[i]?.id;
    const h = (id && measuredHeights?.[id]) || estimatedRowHeightPx;
    prefixOffsets[i + 1] = prefixOffsets[i]! + h;
  }

  const totalHeightPx = prefixOffsets[totalCount]!;

  if (totalCount <= 60) {
    return {
      visibleItems: items,
      startIndex: 0,
      endIndex: totalCount - 1,
      topSpacerPx: 0,
      bottomSpacerPx: 0,
      totalHeightPx,
    };
  }

  const clampedScrollTop = Math.max(0, scrollTopPx);
  const viewportBottom = clampedScrollTop + Math.max(1, viewportHeightPx);

  let rawStart = 0;
  while (rawStart < totalCount - 1 && prefixOffsets[rawStart + 1]! < clampedScrollTop) {
    rawStart++;
  }

  let rawEnd = rawStart;
  while (rawEnd < totalCount - 1 && prefixOffsets[rawEnd]! < viewportBottom) {
    rawEnd++;
  }

  const startIndex = Math.max(0, rawStart - overscanCount);
  const endIndex = Math.min(totalCount - 1, rawEnd + overscanCount);

  const topSpacerPx = prefixOffsets[startIndex]!;
  const bottomSpacerPx = Math.max(0, totalHeightPx - prefixOffsets[endIndex + 1]!);

  return {
    visibleItems: items.slice(startIndex, endIndex + 1),
    startIndex,
    endIndex,
    topSpacerPx,
    bottomSpacerPx,
    totalHeightPx,
  };
}
