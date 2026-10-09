import { useAtlas } from '../store'

const LAYERS = [
  { id: 'genres' as const, label: 'Genres' },
  { id: 'artists' as const, label: 'Artists' },
]

export function LayerToggle() {
  const mapLayer = useAtlas((s) => s.mapLayer)
  const setMapLayer = useAtlas((s) => s.setMapLayer)

  return (
    <div className="glass flex rounded-full p-0.5" role="tablist" aria-label="Map contents">
      {LAYERS.map((layer) => {
        const on = mapLayer === layer.id
        return (
          <button
            key={layer.id}
            role="tab"
            aria-selected={on}
            onClick={() => setMapLayer(layer.id)}
            className={`pressable h-7 rounded-full px-3 text-[13px] font-medium ${
              on ? 'bg-fg text-bg' : 'text-fg-2 hover:text-fg'
            }`}
          >
            {layer.label}
          </button>
        )
      })}
    </div>
  )
}
