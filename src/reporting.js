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
    const originalPixels = ((diff.originalDiffImageWidth * diff.originalDiffImageHeight) / 3);
    return _.extend({}, diff, {
      id: diff.basename,
      designerUrl: `https://design.alvarcarto.com?${query}`,
      diffImageOrientation: diff.resizedDiffImageWidth > diff.resizedDiffImageHeight
        ? 'landscape'
        : 'portrait',
      title: `${diff.baseName}.png`,
      // The differences are the amount of pixels changed.
      differenceRatio: diff.differences / originalPixels,
      differencePercentage: ((diff.differences / originalPixels) * 100).toFixed(2),
      differencesHuman: millify(diff.differences, {
        units: ['', 'K', 'M', 'billion', 'tera', 'peta', 'exa'],
      }),
      formatDescription: getFormatDescription(diff.poster.format),
    });
  });
  const sorted = _.orderBy(diffs, 'differenceRatio', 'desc');
  const rendered = Mustache.render(template, {
    diffs: sorted,
    maxImageDimension: config.MAX_DIMENSION_FOR_REVIEW,
    pageTitle: `Visual diff report for build ${diffInfo.tempS3Prefix}`,
    pageDescription: oneLine`
      Visual diff report for build ${diffInfo.tempS3Prefix}.
      Generated at ${timestamp}.
      These temporary reports are cleaned after 14 days.`,
    renderApiUrl: config.RENDER_API_URL,
    s3BucketName: config.AWS_S3_BUCKET_NAME,
  });
  return rendered;
}

module.exports = {
  generateHtml,
};
