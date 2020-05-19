const fs = require('fs');
const _ = require('lodash');
const queryString = require('querystring');
const path = require('path');
const moment = require('moment');
const Mustache = require('mustache');
const { oneLine } = require('common-tags');
const millify = require('millify').default;
const locations = require('./locations');
const config = require('./config');

const serviceToExplanation = {
  render: '/api/raster/render (Render service)',
  tile: '/api/raster/render?useTileRender=true (Render service)',
  'render-map': '/api/raster/render-map (Render service)',
  placement: '/api/place-map (Placement service)',
};

function getFormatDescription(format) {
  if (format === 'png') {
    return '';
  } else if (format === 'svg') {
    return oneLine`
      (Requested as this format and converted to PNG for visual diff.
      SVG files have wrong fonts, because the fonts are not installed in CI)
    `;
  }

  return '(Requested as this format and converted to PNG for visual diff)';
}

function generateHtml(diffInfo) {
  const template = fs.readFileSync(path.join(__dirname, 'templates/index.html'), { encoding: 'utf8' });
  const timestamp = moment().toISOString();
  const diffs = _.map(diffInfo.diffs, (diff) => {
    const location = _.find(locations, l => l.id === diff.poster.locationId);
    const query = queryString.stringify({
      lat: location.lat,
      lng: location.lng,
      zoom: diff.poster.zoomLevel + 0.5,
      size: diff.poster.size,
      orientation: diff.poster.orientation,
      posterStyle: diff.poster.posterStyle,
      mapStyle: diff.poster.mapStyle,
      labelsEnabled: diff.poster.labelsEnabled,
      labelHeader: diff.poster.labelHeader,
      labelSmallHeader: diff.poster.labelSmallHeader,
      labelText: diff.poster.labelText,
    });

    return _.extend({}, diff, {
      id: diff.basename,
      designerUrl: `https://design.alvarcarto.com?${query}`,
      title: `${diff.baseName}.png`,
      serviceExplanation: serviceToExplanation[diff.service] || diff.service,
      differencesHuman: millify(diff.differences, {
        units: ['', 'K', 'M', 'billion', 'tera', 'peta', 'exa'],
      }),
      formatDescription: getFormatDescription(diff.poster.format),
    });
  });
  const sorted = _.orderBy(diffs, 'differences', 'desc');
  const rendered = Mustache.render(template, {
    diffs: sorted,
    maxImageDimension: config.MAX_DIMENSION_FOR_REVIEW,
    pageTitle: `Visual diff report for build ${diffInfo.tempS3Prefix}`,
    pageDescription: oneLine`
      Visual diff report for build ${diffInfo.tempS3Prefix}.
      Generated at ${timestamp}.
      These temporary reports are cleaned after 14 days.`,
  });
  return rendered;
}

module.exports = {
  generateHtml,
};
