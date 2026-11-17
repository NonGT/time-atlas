# Time Atlas

A 3D globe with a timeline showing cities and empires as they rise, grow and fall, from 10,000 BCE to today. The app is Thai first, with an English version.

Zoomed out you see a globe with glowing cities and the borders of the era. Zoom in and the map flattens out to show the cities themselves as low-poly buildings.

```
npm install
npm run dev        # http://localhost:5173
npm run build      # type check and data check, then build to dist/
npm run validate   # check the data files only
npm run i18n       # report missing translations and Thai text changed since translating
```

## Editing the data

All data lives in `data/` as YAML. Save a file and a page opened with `npm run dev` reloads. If something is malformed, the page lists the file, item and field at fault.

- `cities.yaml`: cities, their position and population by year (in thousands). The number of buildings drawn comes from the population.
- `landmarks.yaml`: major buildings at their real position, with the year built (`built`) and gone (`gone`). The cultural UNESCO World Heritage sites are in `landmarks/`, one file per region, with their site number (`whs`) and year inscribed (`inscribed`). Landmarks also show as small dots on the timeline once it is zoomed in, below events in priority; a dot at a round year may slide a little to find room.
- `events/`: timeline events. Every file in the folder is read, so new sets can go in their own file (`wars.yaml`, `pandemics.yaml`). Each event needs a unique `id`. `importance: 3` stops playback. Events that lasted several years can have an `end` and are drawn as a bar. Where marks overlap, the less important ones step aside and show up as you zoom in.
- `civilizations.yaml`: civilizations and their colors.
- `polities.yaml`: Thai names and colors for border polities, matched by their English name in the border data. The source data sometimes labels land with a name from a later era (Bantu in 8000 BCE, for example); `from` hides such a name before the given year.
- `timeline.yaml`: the year range, slider scale, eras and starting camera.
- `i18n/`: translations, see below.
- `detail/`: smaller events kept for a later, more detailed layer. The app doesn't load them. The timeline only shows events that mattered to the world as a whole: wars, states rising and falling, major disasters.

Events and landmarks whose date or place is not settled get an `uncertain` note, and optionally a range of possible years (`range` for events, `builtRange` and `goneRange` for landmarks). They are drawn differently and can be hidden with the "Uncertain" toggle. Borders the source marks as approximate (`BORDERPRECISION` 1, which is everything before about 1650) belong to the same layer and are drawn dashed.

Negative years are BCE. Adding a city:

```yaml
- id: xian-yang
  name: เสียนหยาง
  en: Xianyang
  civ: chinese
  lat: 34.33
  lon: 108.71
  desc: เมืองหลวงของราชวงศ์ฉิน
  population: [[-350, 0], [-340, 20], [-221, 100], [-206, 0]]
```

Landmark shapes: pyramid, ziggurat, step, temple, arena, dome, pagoda, hall, prang, stupa, citadel, mound, ring, tower, cathedral, town, cave, terrace, bridge, castle, wall, factory, monolith, mosque, church, garden. A new shape goes in `src/map/shapes.ts` and its name in `SHAPES` in `src/data/schema.ts`. A landmark can have its own model in `src/map/models/`, keyed by id; a model wrapped in `staged([years], ...)` is rebuilt for each of those years, so it can show a building growing, being altered or falling into ruin.

## Languages

The source data is in Thai. Translations live in `data/i18n/<lang>/`, in files that mirror `data/`, keyed by `id`. For example `data/i18n/en/events/core.yaml` goes with `data/events/core.yaml`:

```yaml
black-death:
  title: The Black Death
  desc: Plague spreads from Central Asia...
```

- City, landmark and civilization names come from the `en` field in the source data and don't need translating.
- Anything untranslated shows in Thai.
- Outside Thai, borders use the source dataset's own names. `i18n/<lang>/polities.yaml` fixes the awkward ones.
- The page loads only the chosen language. Pick it with the button next to the title or with `?lang=en` in the URL.
- UI text (buttons, labels, year formats) is in `src/i18n/th.ts` and `en.ts`. A key missing from a language fails `tsc`.

`npm run i18n` lists what is untranslated, translations whose id no longer exists, and Thai text edited since it was translated (checked against `source-hashes.json`). After reviewing, `npm run i18n -- --update` records the translations as current.

To add a language, create `data/i18n/<lang>/`, add a file in `src/i18n/` and add it to `LOCALES` in `src/i18n/index.ts`.

## Geographic data

`public/geo/` is built by `npm run fetch-geo`, which downloads and simplifies the borders.

- Borders: [historical-basemaps](https://github.com/aourednik/historical-basemaps), GPL-3.0. About 50 snapshots (the latest is 2010), so borders change in steps, not every year. `borders/` is simplified for the globe and `borders/hi/` is full detail, loaded only for the year in view when zoomed in. Borders are drawn under the base map's water layer, so coastlines follow the base map at every zoom. The Americas in the 1492 snapshot are taken from 1500, because the source splits that year into far finer native territories than the snapshots around it (`npx tsx scripts/fetch-geo.ts --patch-only` patches existing files without downloading).
- Land mask that keeps buildings out of the water: Natural Earth 10m via world-atlas (public domain).
- Base map: OpenFreeMap / OpenMapTiles / © OpenStreetMap contributors (ODbL).
- Terrain: Mapzen Terrain Tiles on AWS Open Data.

Populations in `cities.yaml` are rough estimates, and metro-area figures after 1950. They should be replaced with data from Reba et al. (2016), "Spatializing 6,000 years of global urbanization".
