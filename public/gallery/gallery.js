/*
 * The cards shown in the public gallery for every visitor.
 * Keep the array below as plain JSON: scripts/add-card.mjs reads and rewrites it.
 *
 * image / fg   paths relative to the site root (fg is optional)
 * foil         rainbow | stardust | prism | metal | gloss
 * area         full | art | frame
 * frame        none | white | black | silver | gold
 * zoom         1 to 4      posX / posY   0 to 100 (focus point of the photo)
 */
window.HC_GALLERY = [
  {
    "id": "ridgeline",
    "title": "山稜線",
    "subtitle": "Ridgeline at dusk",
    "serial": "001",
    "image": "gallery/ridgeline-bg.svg",
    "fg": "gallery/ridgeline-fg.svg",
    "foil": "rainbow",
    "area": "full",
    "frame": "none",
    "zoom": 1,
    "posX": 50,
    "posY": 50
  },
  {
    "id": "constellation",
    "title": "星圖",
    "subtitle": "Constellation",
    "serial": "002",
    "image": "gallery/constellation-bg.svg",
    "fg": "gallery/constellation-fg.svg",
    "foil": "stardust",
    "area": "full",
    "frame": "black",
    "zoom": 1,
    "posX": 50,
    "posY": 50
  },
  {
    "id": "tide",
    "title": "潮汐",
    "subtitle": "Night tide",
    "serial": "003",
    "image": "gallery/tide-bg.svg",
    "fg": "gallery/tide-fg.svg",
    "foil": "prism",
    "area": "art",
    "frame": "white",
    "zoom": 1,
    "posX": 50,
    "posY": 50
  },
  {
    "id": "glasshouse",
    "title": "溫室",
    "subtitle": "Glasshouse",
    "serial": "004",
    "image": "gallery/glasshouse-bg.svg",
    "fg": "gallery/glasshouse-fg.svg",
    "foil": "metal",
    "area": "frame",
    "frame": "silver",
    "zoom": 1,
    "posX": 50,
    "posY": 50
  },
  {
    "id": "night",
    "title": "末班車",
    "subtitle": "Last tram home",
    "serial": "005",
    "image": "gallery/night-bg.svg",
    "fg": "gallery/night-fg.svg",
    "foil": "rainbow",
    "area": "art",
    "frame": "gold",
    "zoom": 1,
    "posX": 50,
    "posY": 50
  },
  {
    "id": "eclipse",
    "title": "日蝕",
    "subtitle": "Eclipse",
    "serial": "006",
    "image": "gallery/mono-bg.svg",
    "fg": "gallery/mono-fg.svg",
    "foil": "gloss",
    "area": "full",
    "frame": "white",
    "zoom": 1,
    "posX": 50,
    "posY": 50
  }
];
