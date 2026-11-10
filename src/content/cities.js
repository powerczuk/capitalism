// City archetypes used by the map generator. A new game takes the first
// N archetypes (N = number of cities), so the list is ordered by importance.
//
//   zone    where on the map the city may lie, as fractions of width/height
//           (y = 0 is the northern coast, y = 1 the southern mountains)
//   pop     population range
//   wealth  income index range (1 = national average; drives wages and prices)
//   growth  yearly population growth range
//   port    imports arrive here (freight is charged from the nearest port)
//
// Which natural resources a city gets is decided per raw material in
// products.js (`occurs`), keyed by the archetype ids below.

export const CITY_ARCHETYPES = [
  {
    id: 'metropolis',
    name: { pl: 'Metropolia', en: 'Metropolis' },
    names: ['Dębogród', 'Wisłogród', 'Jasnogród'],
    zone: { x: [0.38, 0.62], y: [0.38, 0.58] },
    pop: [2_200_000, 3_000_000], wealth: [1.15, 1.28], growth: [0.01, 0.016],
  },
  {
    id: 'port',
    name: { pl: 'Miasto portowe', en: 'Port city' },
    names: ['Solna Przystań', 'Jantarowo', 'Bursztynów'],
    zone: { x: [0.2, 0.8], y: [0.15, 0.21] },
    pop: [1_000_000, 1_500_000], wealth: [1.0, 1.12], growth: [0.008, 0.014],
    port: true,
  },
  {
    id: 'industrial',
    name: { pl: 'Miasto przemysłowe', en: 'Industrial city' },
    names: ['Stalowy Bród', 'Hutniki', 'Żelazna Wola'],
    zone: { x: [0.15, 0.85], y: [0.7, 0.86] },
    pop: [900_000, 1_400_000], wealth: [0.88, 0.98], growth: [0.004, 0.01],
  },
  {
    id: 'farmland',
    name: { pl: 'Zagłębie rolnicze', en: 'Farming region' },
    names: ['Złotopole', 'Lipowiec', 'Nowy Młyn'],
    zone: { x: [0.08, 0.92], y: [0.38, 0.64] },
    pop: [450_000, 750_000], wealth: [0.8, 0.9], growth: [0.006, 0.012],
  },
  {
    id: 'university',
    name: { pl: 'Miasto akademickie', en: 'University town' },
    names: ['Sowia Góra', 'Jasne Wzgórza', 'Kolegiata'],
    zone: { x: [0.1, 0.9], y: [0.26, 0.6] },
    pop: [500_000, 900_000], wealth: [1.05, 1.2], growth: [0.012, 0.02],
  },
  {
    id: 'highland',
    name: { pl: 'Miasto podgórskie', en: 'Highland town' },
    names: ['Borowa Góra', 'Białe Skały', 'Halny Zdrój'],
    zone: { x: [0.1, 0.9], y: [0.76, 0.9] },
    pop: [300_000, 550_000], wealth: [0.9, 1.05], growth: [0.004, 0.01],
  },
];
