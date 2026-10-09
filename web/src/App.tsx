import { ClusterTitle } from './components/ClusterTitle'
import { DetailsSheet } from './components/DetailsSheet'
import { Dock } from './components/Dock'
import { GenreSpace } from './components/GenreSpace'
import { LayerToggle } from './components/LayerToggle'
import { SearchBar } from './components/SearchBar'
import { loadArtistMap } from './data/artistSpace'

void loadArtistMap()

export default function App() {
  return (
    <main className="relative h-full w-full">
      <GenreSpace />
      <div className="absolute left-6 top-[1.2rem] z-10 flex items-center gap-3.5">
        <h1 className="font-serif text-[21px] leading-none tracking-[-0.015em]">Near Noise</h1>
        <LayerToggle />
      </div>
      <ClusterTitle />
      <SearchBar />
      <Dock />
      <DetailsSheet />
    </main>
  )
}
