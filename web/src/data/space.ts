import type { Genre } from '../types'
import { CLUSTER_LABELS, GENRES } from './atlas'

export type Vec3 = [number, number, number]

/** Distance between neighboring clusters along the x axis, in world units. */
const CLUSTER_SPACING = 900

export interface Cluster {
  label: string
  index: number
  origin: Vec3
  /** Radius that contains nearly all of the cluster's genres. */
  radius: number
  count: number
}

const members: Genre[][] = CLUSTER_LABELS.map((_, i) => GENRES.filter((g) => g.cluster === i))

export const POSITIONS_3D: Vec3[] = GENRES.map((g) => [g.x + g.cluster * CLUSTER_SPACING, g.y, g.z])

export const CLUSTERS: Cluster[] = CLUSTER_LABELS.map((label, i) => {
  const distances = members[i].map((g) => Math.hypot(g.x, g.y, g.z)).sort((a, b) => a - b)
  return {
    label,
    index: i,
    origin: [i * CLUSTER_SPACING, 0, 0],
    radius: distances[Math.floor(distances.length * 0.95)],
    count: members[i].length,
  }
})

export const CLUSTER_MEMBERS = members
