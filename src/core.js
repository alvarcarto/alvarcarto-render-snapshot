const _ = require('lodash');
const BPromise = require('bluebird');
const fs = BPromise.promisifyAll(require('fs'));
const BlinkDiff = require('blink-diff');
const sharp = require('sharp');
const minimatch = require('minimatch');
const request = require('request-promise');
const prettyBytes = require('pretty-bytes');
const promiseRetryify = require('promise-retryify');
const { createS3 } = require('./util/aws');
const { createPosterImageUrl, createPlacementImageUrl, createRenderMapImageUrl } = require('./util');
const logger = require('./util/logger')(__filename);
const config = require('./config');
const { getPosters } = require('./posters');

const API_FILE_PREFIX = 'images/compare/api-';
const S3_FILE_PREFIX = 'images/compare/s3-';
const DIFF_FILE_PREFIX = 'images/compare/diff-';
const SAVE_ALL_FILES = false;
const s3 = createS3();

async function downloadImage(url) {
  const res = request({
    url,
    timeout: 300 * 1000,
    encoding: null,
    resolveWithFullResponse: true,
  });

  return res;
}

function getImageUrl(service, poster) {
  const obj = _.omit(poster, ['locationId']);

  switch (service) {
    case 'render':
      return createPosterImageUrl(obj);
    case 'tile':
      return createPosterImageUrl(obj, { useTileRender: true });
    case 'render-map':
      return createRenderMapImageUrl(obj);
    case 'placement':
      return createPlacementImageUrl(obj);
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}

async function fetchImageFromService(service, poster) {
  const imageUrl = getImageUrl(service, poster);
  logger.info(`Downloading poster from "${imageUrl}" ..`);

  const res = await downloadImage(imageUrl);
  return res;
}

const errorLogger = (err) => {
  logger.error(`Error: ${err}`);
  return true;
};

const retryingFetchImageFromService = promiseRetryify(fetchImageFromService, {
  beforeRetry: retryCount => logger.info(`Retrying image download (${retryCount}) ..`),
  maxRetries: 20,
  shouldRetry: errorLogger,
  retryTimeout: count => count * 10000,
});

function fetchPosterFromS3(service, poster) {
  const posterApiUrl = getS3Url(service, poster);
  logger.info(`Downloading poster from "${posterApiUrl}" ..`);

  const res = downloadImage(posterApiUrl);
  return res;
}

const retryingFetchPosterFromS3 = promiseRetryify(fetchPosterFromS3, {
  beforeRetry: retryCount => logger.info(`Retrying image download from S3 (${retryCount}) ..`),
  shouldRetry: errorLogger,
  retryTimeout: count => count * 10000,
});

function uploadPosterToS3(service, poster, data) {
  logger.info('Uploading poster to S3 ..');

  const key = posterToFileBaseName(service, poster);
  const params = {
    Bucket: config.AWS_S3_BUCKET_NAME,
    ACL: 'public-read',
    Key: `${key}.png`,
    ContentType: 'image/png',
    Body: data,
  };

  return s3.uploadAsync(params)
    .tap(res => logger.info(`Uploaded poster to S3: ${res.Location}`))
    .catch((err) => {
      logger.error(`Error uploading poster to S3: ${err}`);
      throw err;
    });
}

function saveFileToLocal(service, poster, data) {
  const key = posterToFileBaseName(service, poster);
  return fs.writeFileAsync(`images/snapshot/${key}.png`, data, { encoding: null })
    .tap(() => logger.info(`Saved file to images/snapshot/${key}.png`))
    .catch((err) => {
      logger.error(`Error saving poster to local: ${err}`);
      throw err;
    });
}

function savePosterToTarget(target, service, poster, imageData) {
  if (target === 's3') {
    return uploadPosterToS3(service, poster, imageData);
  }

  return saveFileToLocal(service, poster, imageData);
}

function filterPosters(posters, opts) {
  if (!_.isString(opts.only) && !_.isArray(opts.only)) {
    return posters;
  }

  if (_.isString(opts.only)) {
    return filterPostersWithPattern(posters, opts.only);
  }

  return _.reduce(opts.only, (memo, pattern) => {
    const filtered = filterPostersWithPattern(memo, pattern);
    logger.info(`Filtering posters with ${pattern} .. ${filtered.length} posters left`);
    return filtered;
  }, posters);
}

function filterPostersWithPattern(posters, pattern) {
  if (!_.isString(pattern) || pattern === '**') {
    return posters;
  }

  let keyPattern;
  let valPattern;
  const parts = pattern.split(':');

  if (parts.length < 2) {
    keyPattern = '**';
    valPattern = parts[0];
  } else {
    keyPattern = parts[0];
    valPattern = parts[1];
  }

  const matchOpts = { nocase: true };
  return _.filter(posters, (poster) => {
    const matches = _.some(poster, (val, key) => {
      const keyMatches = minimatch(String(key), keyPattern, matchOpts);
      const valMatches = minimatch(String(val), valPattern, matchOpts);
      return keyMatches && valMatches;
    });
    return matches;
  });
}

function logPosterCount(opts) {
  logger.info('Going through the following images:');

  _.forEach(opts.services, (service) => {
    const posters = getPosters(service, { mainLocationId: opts.mainLocationId });
    const filteredPosters = filterPosters(posters, opts);
    logger.info(`${filteredPosters.length} combinations for ${service} service`);
  });
}


async function takeSnapshot(opts) {
  logPosterCount(opts);

  await BPromise.each(opts.services, async (service) => {
    const posters = getPosters(service, { mainLocationId: opts.mainLocationId });
    const filteredPosters = filterPosters(posters, opts);
    logger.info(`Taking snapshots of ${filteredPosters.length} images for service ${service} ..`);

    await BPromise.each(filteredPosters, async (poster) => {
      const res = await fetchImageFromService(service, poster);
      const bytes = parseInt(res.headers['content-length'], 10);
      logger.info(`Downloaded ${prettyBytes(bytes)} data`);

      let imageData = res.body;
      if (!opts.originals && config.MAX_DIMENSION) {
        logger.info(`Resizing picture to max ${config.MAX_DIMENSION}px width or height ..`);
        imageData = await resizeImage(res.body, config.MAX_DIMENSION);
      }

      await savePosterToTarget(opts.target, service, poster, imageData);
    });
  });
}

function posterToFileBaseName(service, poster) {
  return [
    service,
    poster.locationId,
    poster.size,
    poster.posterStyle,
    poster.mapStyle,
    poster.orientation,
    `z${poster.zoomLevel}`,
  ].join('-');
}

function getS3Url(service, poster) {
  const name = posterToFileBaseName(service, poster);
  return `https://alvarcarto-render-snapshots.s3-eu-west-1.amazonaws.com/${name}.png`;
}

async function resizeImage(input, maxDimension) {
  const { width, height } = await sharp(input).metadata();

  const resizeW = width > height ? maxDimension : null;
  const resizeH = width > height ? null : maxDimension;

  const image = await sharp(input, { limitInputPixels: false })
    .resize(resizeW, resizeH)
    .png()
    .toBuffer();
  return image;
}


async function compareAll(opts) {
  logPosterCount(opts);

  await BPromise.each(opts.services, async (service) => {
    const posters = getPosters(service, { mainLocationId: opts.mainLocationId });
    const filteredPosters = filterPosters(posters, opts);
    logger.info(`Comparing ${filteredPosters.length} images for ${service} ..`);
    logger.info(`This totals ${filteredPosters.length * 2} image downloads`);

    await BPromise.each(filteredPosters, async (poster) => {
      const apiResponse = await retryingFetchImageFromService(service, poster);
      const s3Response = await retryingFetchPosterFromS3(service, poster);

      const apiBytes = parseInt(apiResponse.headers['content-length'], 10);
      logger.info(`Downloaded ${prettyBytes(apiBytes)} data from ${service} service`);

      const s3Bytes = parseInt(s3Response.headers['content-length'], 10);
      logger.info(`Downloaded ${prettyBytes(s3Bytes)} data from S3`);

      logger.info(`Resizing pictures to ${config.MAX_DIMENSION}px width or height ..`);
      await sharp(await resizeImage(apiResponse.body, config.MAX_DIMENSION))
        .toFile(`${API_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`);

      await sharp(await resizeImage(s3Response.body, config.MAX_DIMENSION))
        .toFile(`${S3_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`);

      const diff = new BlinkDiff({
        imageAPath: `${S3_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`,
        imageBPath: `${API_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`,
        thresholdType: BlinkDiff.THRESHOLD_PERCENT,
        threshold: 0.01,
        imageOutputPath: `${DIFF_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`,
      });
      const promisifiedDiff = BPromise.promisifyAll(diff);
      const result = await promisifiedDiff.runAsync();

      logger.info(`Found ${result.differences} differences`);
      if (result.differences < 1) {
        fs.unlinkSync(`${S3_FILE_PREFIX}${posterToFileBaseName(poster)}.png`);
        fs.unlinkSync(`${API_FILE_PREFIX}${posterToFileBaseName(poster)}.png`);
        fs.unlinkSync(`${DIFF_FILE_PREFIX}${posterToFileBaseName(poster)}.png`);
      } else if (SAVE_ALL_FILES) {
        logger.info('Saved diff and fetched images under images/');
      } else {
        fs.unlinkSync(`${S3_FILE_PREFIX}${posterToFileBaseName(poster)}.png`);
        fs.unlinkSync(`${API_FILE_PREFIX}${posterToFileBaseName(poster)}.png`);
        logger.info('Saved diff under images/');
      }
    });
  });
}

module.exports = {
  snapshot: takeSnapshot,
  compare: compareAll,
};
