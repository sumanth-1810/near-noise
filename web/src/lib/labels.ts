const CELL = 64
const CHAR_WIDTH = 0.56

export const labelSize = (popularity: number) => 11 + (popularity / 100) * 4

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** A point's position on screen, plus how many pixels one world unit covers at its depth. */
export interface Projected {
  x: number
  y: number
  pxPerUnit: number
}

interface PlaceOptions<T> {
  candidates: T[]
  project: (item: T) => Projected | undefined
  nameOf: (item: T) => string
  sizeFor: (item: T) => number
  scoreOf: (item: T) => number
  width: number
  height: number
  offsetFor: (item: T, p: Projected) => number
  maxLabels: number
  reserved?: T[]
  /** Screen areas covered by floating UI, where labels shouldn't go. */
  blocked?: Box[]
}

/**
 * Greedy label placement: highest-scoring items claim screen space first, and any label that would
 * overlap an already-placed one is skipped. Runs on the CPU in screen space using a uniform grid.
 */
export function placeLabels<T>({
  candidates,
  project,
  nameOf,
  sizeFor,
  scoreOf,
  width,
  height,
  offsetFor,
  maxLabels,
  reserved = [],
  blocked = [],
}: PlaceOptions<T>) {
  const cols = Math.ceil(width / CELL) + 1
  const grid = new Map<number, Box[]>()

  const boxFor = (item: T): Box | null => {
    const p = project(item)
    if (!p) return null
    const size = sizeFor(item)
    const w = nameOf(item).length * size * CHAR_WIDTH + 6
    const bottom = p.y - offsetFor(item, p)
    const box = { x0: p.x - w / 2, x1: p.x + w / 2, y0: bottom - size - 2, y1: bottom }
    if (box.x1 < 0 || box.x0 > width || box.y1 < 0 || box.y0 > height) return null
    return box
  }

  const cellsFor = (b: Box) => {
    const keys: number[] = []
    for (let cx = Math.floor(b.x0 / CELL); cx <= Math.floor(b.x1 / CELL); cx++) {
      for (let cy = Math.floor(b.y0 / CELL); cy <= Math.floor(b.y1 / CELL); cy++) keys.push(cy * cols + cx)
    }
    return keys
  }

  const collides = (b: Box, keys: number[]) =>
    keys.some((k) => grid.get(k)?.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0))

  const insert = (b: Box, keys: number[]) => {
    for (const k of keys) {
      const cell = grid.get(k)
      if (cell) cell.push(b)
      else grid.set(k, [b])
    }
  }

  for (const b of blocked) insert(b, cellsFor(b))

  for (const item of reserved) {
    const b = boxFor(item)
    if (b) insert(b, cellsFor(b))
  }

  const placed: T[] = []
  const sorted = [...candidates].sort((a, b) => scoreOf(b) - scoreOf(a))
  for (const item of sorted) {
    if (placed.length >= maxLabels) break
    const b = boxFor(item)
    if (!b) continue
    const keys = cellsFor(b)
    if (collides(b, keys)) continue
    insert(b, keys)
    placed.push(item)
  }
  return placed
}
