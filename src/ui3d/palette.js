// Colours of the 3D world. Models pick from here instead of inventing their
// own, which is what keeps a hundred little buildings looking like one town.
// Values are how the surface looks in full daylight; night is made by the
// lights, plus the `glow` layer of each model.

export const C = {
  // ground
  grass: 0x93b76b,
  grassDark: 0x7fa65d,
  grassLight: 0xa9c77d,
  meadow: 0xa3bd6e,
  soil: 0xa88d66,
  soilDark: 0x8a7254,
  sand: 0xdccf9f,
  rock: 0x9c9b93,
  rockDark: 0x7e7d76,
  snow: 0xf3f5f2,

  // streets
  asphalt: 0x565b61,
  asphaltDark: 0x464a50,
  marking: 0xe9e6d8,
  pavement: 0xc6c3b7,
  curb: 0xaaa79b,
  concrete: 0xbcb9ae,
  concreteDark: 0x9d9a90,
  gravel: 0xb3aa97,

  // water
  water: 0x5a9dc0,
  waterDeep: 0x4688ae,
  foam: 0xdcecf2,

  // walls
  plaster: 0xeadfc8,
  plasterWarm: 0xe7cfa6,
  plasterRose: 0xe3c2b0,
  plasterCool: 0xdadfe0,
  plasterMint: 0xcfdcc8,
  brick: 0xb8684c,
  brickDark: 0x91503c,
  stone: 0xd0c9b9,
  panel: 0xe1e5e7,
  panelDark: 0xb0b8be,
  steel: 0x8f9ba6,
  steelDark: 0x68747f,
  wood: 0x9f7d55,
  woodDark: 0x71563a,
  white: 0xf4f2ea,
  dark: 0x33393f,
  black: 0x1f2428,

  // roofs
  roofRed: 0xab4b3c,
  roofBrown: 0x7d5442,
  roofGrey: 0x6f767d,
  roofDark: 0x484e55,
  roofGreen: 0x5f816c,
  roofFlat: 0x8f949b,
  roofLight: 0xcbcec9,

  // glass
  glass: 0x425e74,
  glassLight: 0x86b4d0,
  glassDark: 0x2e4353,

  // nature
  leaf: 0x528d47,
  leafDark: 0x417642,
  leafLight: 0x73a655,
  pine: 0x376d4c,
  pineDark: 0x2c5a3f,
  trunk: 0x6d5137,
  crop: 0xd8c264,
  cropGreen: 0x9fc15c,
  cropDark: 0xba9c47,
  hay: 0xe2cf7c,

  // accents
  red: 0xc94a3f,
  orange: 0xe08a2e,
  yellow: 0xe9c53a,
  blue: 0x3f78c0,
  green: 0x4c9a5a,

  // light sources (the glow layer)
  lampWarm: 0xffd98a,
  lampCool: 0xd6e9ff,
  lampRed: 0xff6a55,
};

/** Company identity colours — the same eight slots the charts and the map use. */
export const COMPANY = [0x2a78d6, 0xeb6834, 0x1baf7a, 0xeda100, 0xe87ba4, 0x008300, 0x6250d6, 0xe34948];

export const companyColor = (slot) => COMPANY[((slot % COMPANY.length) + COMPANY.length) % COMPANY.length];

/** Light setups. `sky`/`ground` feed the hemisphere light, `sun` the directional one. */
export const LIGHT = {
  day: {
    background: 0xcfe0e6,
    sky: 0xffffff,
    ground: 0x9aa58c,
    hemi: 1.55,
    sun: 0xfff0d2,
    sunPower: 2.6,
    shadow: 0.62, // how dark shadows get (0 = black)
  },
  night: {
    background: 0x0f1a24,
    sky: 0x7f97c8,
    ground: 0x1d2530,
    hemi: 0.78,
    sun: 0x9db4ee,
    sunPower: 0.85,
    shadow: 0.5,
  },
};
