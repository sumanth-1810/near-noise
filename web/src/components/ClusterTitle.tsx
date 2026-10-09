import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { useArtistMap } from '../data/artistSpace'
import { CLUSTERS, CLUSTER_MEMBERS } from '../data/space'
import { clusterColor } from '../lib/colors'
import { useMatchMask } from '../lib/filter'
import { SPRING } from '../lib/motion'
import { useAtlas } from '../store'

export function ClusterTitle() {
  const reduceMotion = useReducedMotion()
  const clusterIndex = useAtlas((s) => s.clusterIndex)
  const mapLayer = useAtlas((s) => s.mapLayer)
  const artists = useArtistMap()
  const { mask } = useMatchMask()

  const [previous, setPrevious] = useState(clusterIndex)
  const [direction, setDirection] = useState(1)
  if (previous !== clusterIndex) {
    setDirection(clusterIndex > previous ? 1 : -1)
    setPrevious(clusterIndex)
  }

  const cluster = CLUSTERS[clusterIndex]
  const genreMatching = CLUSTER_MEMBERS[clusterIndex].filter((g) => mask[g.id]).length
  const artistList = artists?.byCluster[clusterIndex]
  const artistMatching = artistList?.filter((a) => mask[a.genreId]).length
  const caption =
    mapLayer === 'artists'
      ? artistList == null
        ? 'Loading artists…'
        : artistMatching === artistList.length
          ? `${artistList.length} artists`
          : `${artistMatching} of ${artistList.length} artists`
      : genreMatching === cluster.count
        ? `${cluster.count} genres`
        : `${genreMatching} of ${cluster.count} genres`
  const offset = reduceMotion ? 0 : 28

  return (
    <div className="pointer-events-none absolute left-6 top-[4.5rem] z-10 h-32 w-96 overflow-hidden">
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={`${cluster.index}-${mapLayer}`}
          custom={direction}
          variants={{
            enter: (dir: number) => ({ opacity: 0, y: dir * offset }),
            center: { opacity: 1, y: 0 },
            exit: (dir: number) => ({ opacity: 0, y: -dir * offset, transition: { duration: 0.14, ease: 'easeIn' } }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={SPRING}
          className="absolute inset-x-0 top-0"
        >
          <div className="flex items-center gap-2 text-[13px] tabular-nums text-fg-2">
            <span className="h-2 w-2 rounded-full" style={{ background: clusterColor(cluster.index) }} />
            {String(clusterIndex + 1).padStart(2, '0')} / {CLUSTERS.length}
          </div>
          <h2 className="mt-1.5 font-serif text-[56px] leading-[0.98] tracking-[-0.028em]">{cluster.label}</h2>
          <div className="mt-2 text-[14px] text-fg-2">{caption}</div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
