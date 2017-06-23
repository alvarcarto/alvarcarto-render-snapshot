const _ = require('lodash');
const geolib = require('geolib');
const combinatorics = require('js-combinatorics');

const posterStyles = [
  'sharp', 'classic', 'sans', 'bw',
  'pacific', 'summer', 'round',
];
const mapStyles = [
  'bw', 'gray', 'black', 'petrol',
  'iceberg', 'marshmellow', 'copper',
  'madang',
];
const sizes = ['30x40cm', '50x70cm', '70x100cm'];
const orientations = ['landscape', 'portrait'];

// Create combinations of all possible:
// posterStyle, mapStyle, size and orientation
// All of the maps are from Barcelona
const barcelonaAttrs = {
  swLat: 41.20008064,
  swLng: 1.985047735,
  neLat: 41.56438133,
  neLng: 2.349196506,
  labelsEnabled: true,
  labelHeader: 'Barcelona',
  labelSmallHeader: 'Catalonia',
  labelText: '(assigned later)',
};
const cp = combinatorics.cartesianProduct(posterStyles, mapStyles, sizes, orientations);
const posters = _.map(cp.toArray(), ([posterStyle, mapStyle, size, orientation]) =>
  _.extend({}, barcelonaAttrs, {
    posterStyle,
    mapStyle,
    size,
    orientation,
  })
);

function getCenter(poster) {
  const center = geolib.getCenter([
    { latitude: poster.neLat, longitude: poster.neLng },
    { latitude: poster.swLat, longitude: poster.swLng },
  ]);

  return { lat: center.latitude, lng: center.longitude };
}

function coordToPrettyText(coord) {
  const first = {
    val: Math.abs(coord.lat).toFixed(3),
    label: coord.lat > 0 ? 'N' : 'S',
  };

  const second = {
    val: Math.abs(coord.lng).toFixed(3),
    label: coord.lng > 0 ? 'E' : 'W',
  };

  return `${first.val}°${first.label} / ${second.val}°${second.label}`;
}

module.exports = _.map(posters, poster => _.extend({}, poster, {
  labelText: coordToPrettyText(getCenter(poster)),
}));
