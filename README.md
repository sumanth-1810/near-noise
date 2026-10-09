# Near Noise

Near Noise is a genre atlas. About 1,090 genres sit in 22 rooms, and the rooms are arranged from the artists those genres share. You can fly through one room at a time, or flip the same map to the people who live there.

The public site is [near-noise.vercel.app](https://near-noise.vercel.app). The source is this repository.

## Using the map

The map opens on **Genres**. A dock along the bottom lists the rooms. Scrolling, or clicking a room, moves the camera. Only one room is in front of you at a time.

Click a genre and a sheet opens on the right. It shows:

- related genres, the ones that share the most tagged artists with this one
- a short list of tracks, with a 30-second preview
- the artists most often tagged with that genre

**Artists** is the same atlas with different dots. Each room shows its most-listened people, spread apart so the names stay readable. An artist can belong to as many as three rooms, chosen from their tags. Search lands in the strongest room. Moving among that artist’s rooms keeps the sheet open. Leaving those rooms closes it.

The artist sheet shows tags, a photo when Deezer has one, a preview, and **Fans also listen to**. That list comes from ListenBrainz listening sessions, not from the room the artist is standing in. The Familiar / Deep slider changes how much global fame affects the order. Similarity stays first, so the list does not collapse into the same famous names for every artist.

Search covers artists and genres together. Empty search shows the last five picks for the mode you are in: artists while Artists is selected, genres while Genres is selected. Accents and punctuation are ignored, so `rufus du sol` finds RÜFÜS DU SOL.

Surprise me jumps to a random genre, or to a random visible artist when Artists is on.

## How a room is built

Genres come from MusicBrainz tags on artists who have been listened to on ListenBrainz. A genre needs at least a handful of those artists before it is placed.

Relatedness between two genres is the cosine similarity of the artists they share, weighted by how many listeners those artists have. Louvain clustering turns that graph into the 22 rooms. Inside a room, UMAP places the genres in 3D. The room’s name is its most central popular genre, with a few names overridden so a room reads as a family (house becomes Electronic, samba becomes Brazilian).

An artist’s homes are not a single strongest tag. Tag votes are summed by room, and the artist is kept in up to three rooms. Inside each of those rooms they are pinned to the genre that earned the votes. On the artist map, the visible people in a room are the most listened, then nudged apart so neighboring circles do not sit on top of each other.

Circle size is a rank, not a filter. Genres are ranked across the whole atlas. Artists are ranked only among the people drawn in that room. Filters fade dots. They do not resize them.

## Previews

Track lists come from Deezer. The audio file is not loaded from Deezer’s address in the browser. Phones in some countries, including India, can open the site and still fail to play a file fetched straight from Deezer or Apple.

`web/api/preview.js` fetches that 30-second file on the server and returns it as ordinary MPEG. The browser only talks to this site. The function accepts preview hosts and nothing else, so it is not an open proxy.

Artist pages still call ListenBrainz for biography-style metadata, listener counts, and similar artists. Those calls go through the rewrites in `web/vercel.json`. Locally, the same paths are proxied by Vite.

## Project layout

```
web/          The site. Vite, React, TypeScript, deck.gl.
pipeline/     Fetches MusicBrainz and ListenBrainz, then builds the map data.
```

The site reads two generated files:

- `web/src/data/atlas.json`, the genres, rooms, and positions
- `web/public/data/artists.json`, the artist search index

Both are already committed, so the map runs without the pipeline.

## Run it locally

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173. That is the local server. The public site stays at https://near-noise.vercel.app.

`npm run dev` serves the site and proxies `/api/deezer`, `/api/lb`, and `/api/lb-labs`. The preview route is implemented in the dev server as well, so Listen works without a Vercel deploy.

Other scripts in `web/`:

```bash
npm run build    # typecheck and production build
npm run preview  # serve the production build
npm run lint
```

## Rebuild the data

The pipeline cache is large and stays out of git. A full fetch talks to MusicBrainz and ListenBrainz and can be resumed if it stops.

```bash
cd pipeline
npm install
npm run fetch
npm run build
```

`fetch` writes a local cache and `out/raw.json`. `build` clusters genres and overwrites `web/src/data/atlas.json` and `web/public/data/artists.json`.

## Deploy

Production is a Vite build on Vercel, published at [near-noise.vercel.app](https://near-noise.vercel.app). From `web/`, after `npx vercel login`:

```bash
npx vercel deploy --prod
```

`web/vercel.json` forwards the ListenBrainz and Deezer API paths. One of those paths needs a trailing slash on ListenBrainz’s side and not in the browser, which is why the metadata rewrite is spelled out on its own. The preview function is a small Node route next to those rewrites. GitHub Pages can host the static map, but it cannot do these forwards, so previews and similar artists would not work there.

`.vercel` and `.env*` files are local and are not part of the repo.
