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
const { createPosterImageUrl } = require('./util');
const logger = require('./util/logger')(__filename);
const config = require('./config');
const POSTERS = require('./posters');

const API_FILE_PREFIX = 'images/api-poster-';
const S3_FILE_PREFIX = 'images/s3-poster-';
const DIFF_FILE_PREFIX = 'images/diff-';
const s3 = createS3();

function fetchPosterFromRenderApi(poster) {
  const posterApiUrl = createPosterImageUrl(poster);
  logger.info(`Downloading poster from "${posterApiUrl}" ..`);

  return request({
    url: posterApiUrl,
    headers: {
      'x-api-key': config.RENDER_API_KEY,
    },
    timeout: 300 * 1000,
    encoding: null,
    resolveWithFullResponse: true,
  })
  .catch((err) => {
    logger.error(`Error fetching poster from render api: ${err}`);
    throw err;
  });
}

const retryingFetchPosterFromRenderApi = promiseRetryify(fetchPosterFromRenderApi, {
  beforeRetry: retryCount => logger.info(`Retrying poster download from render api (${retryCount}) ..`),
});

function fetchPosterFromS3(poster) {
  const posterApiUrl = getS3Url(poster);
  logger.info(`Downloading poster from "${posterApiUrl}" ..`);

  return request({
    url: posterApiUrl,
    timeout: 300 * 1000,
    encoding: null,
    resolveWithFullResponse: true,
  })
  .catch((err) => {
    logger.error(`Error fetching poster from S3: ${err}`);
    throw err;
  });
}

const retryingFetchPosterFromS3 = promiseRetryify(fetchPosterFromS3, {
  beforeRetry: retryCount => logger.info(`Retrying poster download from S3 (${retryCount}) ..`),
});

function uploadPosterToS3(poster, data) {
  logger.info('Uploading poster to S3 ..');

  const key = posterToFileBaseName(poster);
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

function saveFileToLocal(poster, data) {
  const key = posterToFileBaseName(poster);
  return fs.writeFileAsync(`images/snapshots/${key}.png`, data, { encoding: null })
    .tap(() => logger.info(`Saved file to images/snapshots/${key}.png`))
    .catch((err) => {
      logger.error(`Error saving poster to local: ${err}`);
      throw err;
    });
}

function savePosterToTarget(target, poster, imageData) {
  if (target === 's3') {
    return uploadPosterToS3(poster, imageData);
  }

  return saveFileToLocal(poster, imageData);
}

function filterPosters(posters, opts) {
  if (!_.isString(opts.only) || opts.only === '**') {
    return posters;
  }

  let keyPattern;
  let valPattern;
  const parts = opts.only.split(':');

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

function takeSnapshot(opts) {
  const posters = filterPosters(POSTERS, opts);
  logger.info(`Taking snapshots of ${posters.length} posters ..`);

  BPromise.map(posters, poster =>
    fetchPosterFromRenderApi(poster)
      .then((res) => {
        const bytes = parseInt(res.headers['content-length'], 10);
        logger.info(`Downloaded ${prettyBytes(bytes)} data`);

        if (!opts.originals && config.RESIZE_TO_HEIGHT) {
          logger.info(`Resizing picture to ${config.RESIZE_TO_HEIGHT}px height ..`);
          return sharp(res.body)
            .limitInputPixels(false)
            .resize(null, config.RESIZE_TO_HEIGHT)
            .png()
            .toBuffer();
        }

        return res.body;
      })
      .then(imageData => savePosterToTarget(opts.target, poster, imageData))
      .catch((err) => {
        logger.error(`Error processing poster: ${err}`);
        throw err;
      }),
    { concurrency: 1 }
  );
}

function posterToFileBaseName(poster) {
  return [
    poster.labelHeader.toLowerCase(),
    poster.size,
    poster.posterStyle,
    poster.mapStyle,
    poster.orientation,
  ].join('-');
}

function getS3Url(poster) {
  const name = posterToFileBaseName(poster);
  return `https://alvarcarto-render-snapshots.s3-eu-west-1.amazonaws.com/${name}.png`;
}

function compareAll(opts) {
  const posters = filterPosters(POSTERS, opts);
  logger.info(`Comparing ${posters.length} posters ..`);

  BPromise.map(posters, poster =>
    BPromise.props({
      apiResponse: retryingFetchPosterFromRenderApi(poster),
      s3Response: retryingFetchPosterFromS3(poster),
    })
      .then((result) => {
        const apiBytes = parseInt(result.apiResponse.headers['content-length'], 10);
        logger.info(`Downloaded ${prettyBytes(apiBytes)} data from Render API`);

        const s3Bytes = parseInt(result.s3Response.headers['content-length'], 10);
        logger.info(`Downloaded ${prettyBytes(s3Bytes)} data from S3`);

        logger.info(`Resizing picture to ${config.RESIZE_TO_HEIGHT}px height ..`);
        return BPromise.props({
          saveApiFile:
            sharp(result.apiResponse.body)
              .limitInputPixels(false)
              .resize(null, config.RESIZE_TO_HEIGHT)
              .png()
              .toFile(`${API_FILE_PREFIX}${posterToFileBaseName(poster)}.png`),

          saveS3File:
            sharp(result.s3Response.body)
              .limitInputPixels(false)
              .resize(null, config.RESIZE_TO_HEIGHT)
              .png()
              .toFile(`${S3_FILE_PREFIX}${posterToFileBaseName(poster)}.png`),
        });
      })
      .then(() => {
        const diff = new BlinkDiff({
          imageAPath: `${S3_FILE_PREFIX}${posterToFileBaseName(poster)}.png`,
          imageBPath: `${API_FILE_PREFIX}${posterToFileBaseName(poster)}.png`,
          thresholdType: BlinkDiff.THRESHOLD_PERCENT,
          threshold: 0.01,
          imageOutputPath: `${DIFF_FILE_PREFIX}${posterToFileBaseName(poster)}.png`,
        });
        const promisifiedDiff = BPromise.promisifyAll(diff);
        return promisifiedDiff.runAsync();
      })
      .tap((result) => {
        logger.info(`Found ${result.differences} differences`);
        if (result.differences < 1) {
          fs.unlinkSync(`${S3_FILE_PREFIX}${posterToFileBaseName(poster)}.png`);
          fs.unlinkSync(`${API_FILE_PREFIX}${posterToFileBaseName(poster)}.png`);
          fs.unlinkSync(`${DIFF_FILE_PREFIX}${posterToFileBaseName(poster)}.png`);
        } else {
          logger.info('Saved diff under images/');
        }
      })
      .catch((err) => {
        logger.error(`Error processing poster: ${err}`);
        throw err;
      }),
    { concurrency: 1 }
  );
}

module.exports = {
  snapshot: takeSnapshot,
  compare: compareAll,
};
