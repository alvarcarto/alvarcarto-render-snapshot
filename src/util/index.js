const _ = require('lodash');
const qs = require('qs');
const SphericalMercator = require('@mapbox/sphericalmercator');
const config = require('../config');

const ONE_CM_IN_INCH = 0.393700787;
const PRINT_DPI = 300;

const SIZES_IN_INCHES = {
  A6: { width: 4.1, height: 5.8 },
  A5: { width: 5.8, height: 8.3 },
  A4: { width: 8.3, height: 11.7 },
  A3: { width: 11.7, height: 16.5 },
};

function createPosterImageUrl(poster, queryAdd = {}) {
  const queryObj = _.merge({
    apiKey: config.PLACEMENT_API_KEY,
  }, poster, queryAdd);

  const query = qs.stringify(queryObj);
  return `${config.RENDER_API_URL}/api/raster/render?${query}`;
}

function createRenderMapImageUrl(poster) {
  const { width, height } = parseSizeToPixelDimensions(poster.size, poster.orientation);
  const queryObj = _.merge({
    apiKey: config.RENDER_API_KEY,
    width,
    height,
  }, poster);

  const query = qs.stringify(queryObj);
  return `${config.RENDER_API_URL}/api/raster/render-map?${query}`;
}

function createPlacementImageUrl(poster) {
  const queryObj = _.merge({
    apiKey: config.PLACEMENT_API_KEY,
    resizeToWidth: config.MAX_DIMENSION_FOR_DIFF,
  }, poster);

  const query = qs.stringify(queryObj);
  return `${config.PLACEMENT_API_URL}/api/place-map/no-flowers-in-blue-black-frame?${query}`;
}

const merc = new SphericalMercator({
  size: 256,
});

function getLatLngBounds(latLngCenter, zoom, viewportWidthPx, viewportHeightPx) {
  const pxCenter = merc.px([latLngCenter.lng, latLngCenter.lat], zoom);
  const pxBottomLeft = [pxCenter[0] - viewportWidthPx / 2, pxCenter[1] + viewportHeightPx / 2];
  const pxTopRight = [pxCenter[0] + viewportWidthPx / 2, pxCenter[1] - viewportHeightPx / 2];
  const swLatLng = merc.ll(pxBottomLeft, zoom);
  const neLatLng = merc.ll(pxTopRight, zoom);
  return {
    swLat: swLatLng[1],
    swLng: swLatLng[0],
    neLat: neLatLng[1],
    neLng: neLatLng[0],
  };
}

function resolveOrientation(dimensions, orientation) {
  if (orientation === 'landscape') {
    return _.merge({}, dimensions, {
      width: dimensions.height,
      height: dimensions.width,
    });
  }

  return dimensions;
}

function cmToInch(cm) {
  return cm * ONE_CM_IN_INCH;
}

const DESIGNER_DIMENSIONS = {
  '30x40cm': { width: 300 * 1.5, height: 400 * 1.5, clipScale: 1 },
  '50x70cm': { width: 500 * 1.2, height: 700 * 1.2, clipScale: 0.9 },
  '70x100cm': { width: 700, height: 1000, clipScale: 0.8 },
  '12x18inch': { width: Math.round(12 * 2.54 * 10 * 1.5), height: Math.round(18 * 2.54 * 10 * 1.5), clipScale: 1 },
  '18x24inch': { width: Math.round(18 * 2.54 * 10 * 1.2), height: Math.round(24 * 2.54 * 10 * 1.2), clipScale: 0.9 },
  '24x36inch': { width: Math.round(24 * 2.54 * 10), height: Math.round(36 * 2.54 * 10), clipScale: 0.8 },
};

// This needs to be in sync with alvarcarto-designer if we want same results
function posterSizeToDesignerPixels(size, orientation) {
  if (!_.has(DESIGNER_DIMENSIONS, size)) {
    throw new Error(`Unknown size: ${size}`);
  }

  const pixelInfo = DESIGNER_DIMENSIONS[size];
  return resolveOrientation(pixelInfo, orientation);
}

// Returns expected pixel dimensions for certain size, when
// we are printing at certain `PRINT_DPI` resolution.
function parseSizeToPixelDimensions(size, orientation) {
  if (_.has(SIZES_IN_INCHES, size)) {
    const { width, height } = SIZES_IN_INCHES[size];

    return resolveOrientation({
      width: Math.round(width * PRINT_DPI, 0),
      height: Math.round(height * PRINT_DPI, 0),
    }, orientation);
  }

  if (!_.isString(size) || !size.match(/[0-9]+x[0-9]+(cm|inch)/)) {
    throw new Error(`Size should match /[0-9]+x[0-9]+(cm|inch)/, size: ${size}`);
  }

  const unit = size.slice(-2);
  const dimensionString = size.slice(0, -2);
  const splitted = dimensionString.split('x');
  const width = parseInt(splitted[0], 10);
  const height = parseInt(splitted[1], 10);
  const widthInch = unit === 'cm' ? cmToInch(width) : width;
  const heightInch = unit === 'cm' ? cmToInch(height) : height;

  return resolveOrientation({
    width: Math.round(widthInch * PRINT_DPI, 0),
    height: Math.round(heightInch * PRINT_DPI, 0),
  }, orientation);
}

module.exports = {
  createPosterImageUrl,
  createPlacementImageUrl,
  createRenderMapImageUrl,
  getLatLngBounds,
  posterSizeToDesignerPixels,
  parseSizeToPixelDimensions,
  DESIGNER_DIMENSIONS,
};
