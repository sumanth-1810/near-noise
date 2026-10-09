# Near Noise

A genre atlas you can fly through. Genres sit in rooms built from people who share MusicBrainz tags. Flip to Artists and the same rooms fill with the people who live there.

## Run it

```bash
cd web
npm install
npm run dev
```

The map opens at http://localhost:5173. The dev server proxies Deezer and ListenBrainz, which the artist sheet uses for previews and “fans also listen to.”

## What’s in the map

- **Genres.** About 1,090 genres with enough listened artists, grouped into 22 rooms. Nearby genres share tagged artists.
- **Artists.** The most-listened people in each room. One artist can live in up to three rooms. Search ignores accents, so `rufus du sol` finds RÜFÜS DU SOL.
- **Artist sheet.** Tags, a preview, and similar artists from ListenBrainz listening sessions. The Familiar / Deep slider changes how much global fame affects that list. Similarity stays first.

## Data

Built data is already in the repo (`web/src/data/atlas.json` and `web/public/data/artists.json`), so the site runs without rebuilding.

To refresh it:

```bash
cd pipeline
npm install
npm run fetch
npm run build
```

`fetch` reads MusicBrainz and ListenBrainz into a local cache. `build` clusters genres and writes the files the site loads. The cache and intermediate output stay out of git.

## Deploy

Production is a static Vite build. `web/vercel.json` forwards `/api/deezer`, `/api/lb`, and `/api/lb-labs` so the browser can reach Deezer and ListenBrainz. From `web/`:

```bash
npm run build
```
