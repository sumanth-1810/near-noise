export type RGB = [number, number, number]

/** Earthy tones that sit on the cream background. Ordered so neighbors in the dock contrast. */
const PALETTE = [
  '#b2593b', // rust
  '#4f6878', // slate
  '#c4913a', // ochre
  '#875a6c', // mauve
  '#55857f', // sage teal
  '#9b8263', // taupe
  '#4c7656', // forest
  '#c27a6c', // dusty rose
  '#5c3b33', // deep brown
  '#8f8960', // olive
  '#b0763e', // caramel
  '#6a6f8e', // dusk
  '#77716a', // warm gray
  '#a0663f', // clay
  '#3f6a6a', // deep teal
  '#a58a3c', // mustard
]

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const RGB_PALETTE = PALETTE.map(hexToRgb)

export const clusterColor = (cluster: number) => PALETTE[cluster % PALETTE.length]
export const clusterRgb = (cluster: number) => RGB_PALETTE[cluster % PALETTE.length]
