const _ = require('lodash');
const combinatorics = require('js-combinatorics');
const locations = require('./locations');
const {
  parseSizeToPixelDimensions,
  getLatLngBounds,
  posterSizeToDesignerPixels,
  DESIGNER_DIMENSIONS,
} = require('./util');

function getBounds(size, orientation, lat, lng, zoom = 11) {
  let dimensions;
  if (_.has(DESIGNER_DIMENSIONS, size)) {
    dimensions = posterSizeToDesignerPixels(size, orientation);
  } else {
    dimensions = parseSizeToPixelDimensions(size, orientation);
  }

  const bounds = getLatLngBounds(
    { lat, lng },
    zoom,
    dimensions.width,
    dimensions.height,
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

function getCombinations(service, _opts = {}) {
  const opts = _.merge({
    mainLocationId: 'tokyo_c',
  }, _opts);

  switch (service) {
    // Goal of render is to test different output formats and that all poster SVG files are valid
    case 'render':
      return [
        // This tests that all SVG poster file combinations are correct
        {
          posterStyles: ['sharp', 'classic', 'sans', 'bw'],
          mapStyles: ['bw'],
          sizes: ['30x40cm', '50x70cm', '70x100cm', '12x18inch', '18x24inch', '24x36inch'],
          orientations: ['landscape', 'portrait'],
          locationIds: [opts.mainLocationId],
          zoomLevels: [11],
          formats: ['png'],
          labelsEnabledFlags: [true],
        },
        // This tests different formats, with labels enabled or not
        {
          posterStyles: ['classic'],
          mapStyles: ['bw'],
          sizes: ['70x100cm'],
          orientations: ['portrait'],
          locationIds: [opts.mainLocationId],
          zoomLevels: [11],
          // By adding png we also test at least once the labels enabled: false variation.
          formats: ['pdf', 'png', 'jpg'],
          labelsEnabledFlags: [true, false],
        },
        // This tests SVG, similar to other formats except we need to zoom closer to get less
        // elements.
        // By taking SVG from higher zoom level and smaller size, we try to omit the following
        // error:
        // SVG comparisons failed to Error: Input buffer has corrupt header:
        //   glib: XML parse error: cannot load more than 200000 XML elements
        // https://gitlab.gnome.org/GNOME/librsvg/-/issues/574
        {
          posterStyles: ['classic'],
          mapStyles: ['bw'],
          sizes: ['50x70cm'],
          orientations: ['portrait'],
          locationIds: [opts.mainLocationId],
          zoomLevels: [14],
          formats: ['svg'],
          labelsEnabledFlags: [true, false],
        },
      ];
    // Goal of render map is to focus on map details on different zoom levels
    case 'render-map':
      return [{
        // Will be visible in the filename
        posterStyles: ['null'],
        mapStyles: ['bw', 'black', 'gray', 'petrol', 'contrast-black', 'bg-black', 'bg-sunset'],
        sizes: ['A6'],
        orientations: ['portrait'],
        locationIds: _.map(locations, 'id'),
        zoomLevels: _.range(6, 17),
        formats: ['png'],
        labelsEnabledFlags: [true],
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
      }];
    // Goal is to test that the tile-renderer works
    case 'tile':
      return [{
        posterStyles: ['bw'],
        mapStyles: ['bw', 'petrol', 'black', 'contrast-black'],
        sizes: ['30x40cm'],
        orientations: ['portrait'],
        locationIds: [opts.mainLocationId],
        zoomLevels: [11],
        formats: ['png'],
        labelsEnabledFlags: [true],
      }];
    // Used for creating a small test mainly to test out the report.html
    case 'test-report':
      return [{
        posterStyles: ['classic'],
        mapStyles: ['bw'],
        sizes: ['30x40cm'],
        orientations: ['portrait', 'landscape'],
        locationIds: ['hki_c'],
        zoomLevels: [12],
        formats: ['png'],
        labelsEnabledFlags: [true],
      }];
    // Goal is to test that the placement service works
    case 'minimal':
    case 'placement':
      return [{
        posterStyles: ['bw'],
        mapStyles: ['bw', 'black', 'petrol'],
        sizes: ['30x40cm'],
        orientations: ['portrait'],
        locationIds: [opts.mainLocationId],
        zoomLevels: [11],
        formats: ['png'],
        labelsEnabledFlags: [true],
      }];
    case 'all':
    default:
      return [{
        posterStyles: ['sharp', 'classic', 'sans', 'bw'],
        mapStyles: ['bw', 'gray', 'black', 'petrol'],
        sizes: ['30x40cm', '50x70cm', '70x100cm', '12x18inch', '18x24inch', '24x36inch'],
        orientations: ['landscape', 'portrait'],
        locationIds: _.map(locations, 'id'),
        zoomLevels: _.range(4, 16),
        formats: ['png'],
        labelsEnabledFlags: [true],
      }];
  }
}

function getPosters(service, opts = {}) {
  const combinationsArr = getCombinations(service, opts);

  const posters = [];
  _.forEach(combinationsArr, (item) => {
    const {
      posterStyles, mapStyles, sizes,
      formats, labelsEnabledFlags, orientations,
      locationIds, zoomLevels, filter,
    } = item;
    // Create combinations of all possible:
    // posterStyle, mapStyle, size and orientation
    const cp = combinatorics.cartesianProduct(locationIds, labelsEnabledFlags, formats, posterStyles, mapStyles, sizes, orientations, zoomLevels);
    const postersBatch = _.map(cp.toArray(), ([locationId, labelsEnabled, format, posterStyle, mapStyle, size, orientation, zoomLevel]) => {
      const location = _.find(locations, l => locationId === l.id);
      if (!location) {
        throw new Error(`Location not found with id: ${locationId}`);
      }

      const bounds = getBounds(size, orientation, location.lat, location.lng, zoomLevel);

      return _.extend({}, _.omit(location, ['id']), bounds, {
        posterStyle,
        mapStyle,
        labelsEnabled,
        format,
        size,
        orientation,
        zoomLevel,
        locationId: location.id,
      });
    });
    const withLabels = _.map(postersBatch, poster => _.extend({}, poster, {
      labelText: prettyLabel(poster),
    }));

    const filterFunc = _.isFunction(filter) ? filter : () => true;
    const filtered = _.filter(withLabels, filterFunc);
    _.forEach(filtered, p => posters.push(p));
  });

  return posters;
}

module.exports = {
  getPosters,
};
