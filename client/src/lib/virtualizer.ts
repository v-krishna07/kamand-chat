/**
 * High-Performance Viewport Windowing Engine for 10,000+ Chat Messages (Section 15 & Section 16.5)
 * Computes the visible `[startIndex, endIndex]` slice + top/bottom spacer heights so only
 * ~30 DOM nodes are mounted at any instant regardless of conversation history size.
 */

export interface VirtualWindowResult<T> {
  visibleItems: T[];
  startIndex: number;
  endIndex: number;
  topSpacerPx: number;
  bottomSpacerPx: number;
  totalHeightPx: number;
}

export function computeVirtualMessageWindow<T>(params: {
  items: T[];
  scrollTopPx: number;
  viewportHeightPx: number;
  estimatedRowHeightPx?: number;
  overscanCount?: number;
}): VirtualWindowResult<T> {
  const {
    items,
    scrollTopPx,
    viewportHeightPx,
    estimatedRowHeightPx = 68,
    overscanCount = 8,
  } = params;

  const totalCount = items.length;
  const totalHeightPx = totalCount * estimatedRowHeightPx;

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

  // For short conversations (<= 60 messages), render all items directly with zero spacer overhead
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

  const rawStart = Math.floor(Math.max(0, scrollTopPx) / estimatedRowHeightPx);
  const visibleCount = Math.ceil(Math.max(1, viewportHeightPx) / estimatedRowHeightPx);

  const startIndex = Math.max(0, rawStart - overscanCount);
  const endIndex = Math.min(totalCount - 1, rawStart + visibleCount + overscanCount);

  const topSpacerPx = startIndex * estimatedRowHeightPx;
  const bottomSpacerPx = Math.max(0, (totalCount - 1 - endIndex) * estimatedRowHeightPx);

  return {
    visibleItems: items.slice(startIndex, endIndex + 1),
    startIndex,
    endIndex,
    topSpacerPx,
    bottomSpacerPx,
    totalHeightPx,
  };
}
