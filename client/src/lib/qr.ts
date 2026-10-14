/**
 * Deterministic visual QR-style matrix generator for offline campus contact sharing.
 * Generates an 11x11 boolean grid from a user's `kamand://contact/<id>:<username>` payload
 * with standard finder patterns in the three corners.
 */
export function generateQrMatrix(payload: string, size = 13): boolean[][] {
  const grid: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const drawFinder = (rowOffset: number, colOffset: number) => {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const isBorder = r === 0 || r === 4 || c === 0 || c === 4;
        const isCenter = r === 2 && c === 2;
        grid[rowOffset + r]![colOffset + c] = isBorder || isCenter;
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 5);
  drawFinder(size - 5, 0);

  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const inTopLeft = r < 6 && c < 6;
      const inTopRight = r < 6 && c >= size - 6;
      const inBottomLeft = r >= size - 6 && c < 6;
      if (inTopLeft || inTopRight || inBottomLeft) continue;

      hash ^= (r * 31 + c * 17) & 0xff;
      hash = Math.imul(hash, 16777619);
      grid[r]![c] = (Math.abs(hash) % 2) === 1;
    }
  }

  return grid;
}
