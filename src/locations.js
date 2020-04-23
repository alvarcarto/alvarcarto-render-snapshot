// NOTE: Keep in mind that some really large cities might look bad even if Helsinki looks OK
const locations = [
  // Helsinki city center
  // http://localhost:3000/?debug=true&lat=60.1697&lng=24.9397&mapStyle=bw&orientation=portrait&labelsEnabled=false&size=50x70cm&updateCoords=true&zoom=16
  {
    id: 'hki_c',
    lat: 60.1697,
    lng: 24.9397,
    labelsEnabled: true,
    labelHeader: 'Helsinki',
    labelSmallHeader: 'Finland',
  },

  // Bridge at Lauttasaari, Helsinki
  // http://localhost:3000/?debug=true&lat=60.1654&lng=24.8972&mapStyle=bw&orientation=portrait&labelsEnabled=false&size=50x70cm&updateCoords=true&zoom=16
  {
    id: 'hki_la',
    lat: 60.1654,
    lng: 24.8972,
    labelsEnabled: true,
    labelHeader: '00200',
    labelSmallHeader: 'Finland',
  },

  // Large cross-road at motorway
  // http://localhost:3000/?debug=true&lat=60.2878&lng=24.9810&mapStyle=bw&orientation=portrait&abelsEnabled=ffalse&size=50x70cm&updateCoords=true&zoom=16
  {
    id: 'hki_lab',
    lat: 60.2878,
    lng: 24.9810,
    labelsEnabled: true,
    labelHeader: '00200',
    labelSmallHeader: 'Finland',
  },

  // Small block at Nurmijärvi
  // http://localhost:3000/?debug=true&labelHeader=Nurmij%C3%A4rvi&labelSmallHeader=Finland&labelText=60.472%C2%B0N%20%2F%2024.812%C2%B0E&labelsEnabled=true&lat=60.4718&lng=24.8125&mapStyle=bw&orientation=portrait&posterStyle=sharp&size=50x70cm&updateCoords=true&zoom=16
  {
    id: 'nrjvi',
    lat: 60.4718,
    lng: 24.8125,
    labelsEnabled: true,
    labelHeader: 'Nurmijärvi',
    labelSmallHeader: 'Finland',
  },

  // Tokyo, example of super crowded map
  // http://localhost:3000/?debug=true&labelHeader=Tokyo&labelSmallHeader=Japan&labelText=35.680°N%20%2F%20139.766°E&labelsEnabled=true&lat=35.68&lng=139.76&mapStyle=bw&orientation=portrait&posterStyle=sharp&size=50x70cm&updateCoords=true&zoom=11.25
  {
    id: 'tokyo_c',
    lat: 35.68,
    lng: 139.76,
    labelsEnabled: true,
    labelHeader: '東京都',
    labelSmallHeader: 'Tōkyō-to',
  },
];

module.exports = locations;
