const _ = require('lodash');
const combinatorics = require('js-combinatorics');
const locations = require('./locations');
const { parseSizeToPixelDimensions, getLatLngBounds } = require('./util');

function getBounds(size, orientation, lat, lng, zoom = 11) {
  const { width, height } = parseSizeToPixelDimensions(size, orientation);
  const bounds = getLatLngBounds(
    { lat, lng },
    zoom,
    width,
    height,
  );
  return bounds;
}

function prettyLabel(poster) {
  const first = {
    val: Math.abs(poster.lat).toFixed(3),
    label: poster.lat > 0 ? 'N' : 'S',
  };

  const second = {
    val: Math.abs(poster.lng).toFixed(3),
    label: poster.lng > 0 ? 'E' : 'W',
  };

  return `${first.val}°${first.label} / ${second.val}°${second.label}`;
}

function getCombinations(service) {
  switch (service) {
    case 'render':
      return {
        posterStyles: ['sharp', 'classic', 'sans', 'bw'],
        mapStyles: ['bw', 'gray', 'black', 'petrol'],
        sizes: ['30x40cm', '50x70cm', '70x100cm', '12x18inch', '18x24inch', '24x36inch'],
        orientations: ['landscape', 'portrait'],
        locationIds: ['tokyo_c'],
        zoomLevels: [11],
      };
    case 'render-map':
      return {
        // Will be visible in the filename
        posterStyles: ['null'],
        mapStyles: ['bw', 'gray', 'petrol', 'contrast-black'],
        sizes: ['A6'],
        orientations: ['portrait'],
        locationIds: _.map(locations, 'id'),
        zoomLevels: _.range(6, 16),
        filter: (poster) => {
          // Remove all posters of alternative locations when zoom level is too high
          // They don't differ much, since they are usually somewhat in the same area
          // We only want low zoom level images of the locations defined below
          const isCenterLocation = _.includes(['hki_c', 'tokyo_c'], poster.locationId);
          if (!isCenterLocation && poster.zoomLevel < 15) {
            return false;
          }

          return true;
        },
      };
    case 'tile':
      return {
        posterStyles: ['bw'],
        mapStyles: ['bw', 'petrol', 'petrol', 'contrast-black'],
        sizes: ['30x40cm'],
        orientations: ['portrait'],
        locationIds: ['tokyo_c'],
        zoomLevels: [11],
      };
    case 'minimal':
    case 'placement':
      return {
        posterStyles: ['bw'],
        mapStyles: ['bw', 'black', 'petrol'],
        sizes: ['30x40cm'],
        orientations: ['portrait'],
        locationIds: ['tokyo_c'],
        zoomLevels: [11],
      };
    case 'all':
    default:
      return {
        posterStyles: ['sharp', 'classic', 'sans', 'bw'],
        mapStyles: ['bw', 'gray', 'black', 'petrol'],
        sizes: ['30x40cm', '50x70cm', '70x100cm', '12x18inch', '18x24inch', '24x36inch'],
        orientations: ['landscape', 'portrait'],
        locationIds: _.map(locations, 'id'),
        zoomLevels: _.range(4, 16),
      };
  }
}

function getPosters(service) {
  const { posterStyles, mapStyles, sizes, orientations, locationIds, zoomLevels, filter } = getCombinations(service);

  // Create combinations of all possible:
  // posterStyle, mapStyle, size and orientation
  const cp = combinatorics.cartesianProduct(locationIds, posterStyles, mapStyles, sizes, orientations, zoomLevels);
  const posters = _.map(cp.toArray(), ([locationId, posterStyle, mapStyle, size, orientation, zoomLevel]) => {
    const location = _.find(locations, l => locationId === l.id);
    if (!location) {
      throw new Error(`Location not found with id: ${locationId}`);
    }

    const bounds = getBounds(size, orientation, location.lat, location.lng, zoomLevel);

    return _.extend({}, _.omit(location, ['id']), bounds, {
      posterStyle,
      mapStyle,
      size,
      orientation,
      zoomLevel,
      locationId: location.id,
    });
  });

  const withLabels = _.map(posters, poster => _.extend({}, poster, {
    labelText: prettyLabel(poster),
  }));

  const filterFunc = _.isFunction(filter) ? filter : () => true;
  return _.filter(withLabels, filterFunc);
}

module.exports = {
  getPosters,
};
