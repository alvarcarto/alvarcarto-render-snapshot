const _ = require('lodash');
const BPromise = require('bluebird');
const fs = BPromise.promisifyAll(require('fs'));
const BlinkDiff = require('blink-diff');
const sharp = require('sharp');
const moment = require('moment');
const { URL } = require('url');
const minimatch = require('minimatch');
const request = require('request-promise');
const prettyBytes = require('pretty-bytes');
const promiseRetryify = require('promise-retryify');
const { createS3 } = require('./util/aws');
const { createPosterImageUrl, createPlacementImageUrl, createRenderMapImageUrl } = require('./util');
const logger = require('./util/logger')(__filename);
const config = require('./config');
const { getPosters } = require('./posters');
const { generateHtml } = require('./reporting');
const { convertPdfToPng } = require('./util/pdf2png');
const { parseSizeToPixelDimensions } = require('./util');

const API_FILE_PREFIX = 'images/compare/api-';
const S3_FILE_PREFIX = 'images/compare/s3-';
const DIFF_FILE_PREFIX = 'images/compare/diff-';
const TEMP_FILE_PREFIX = 'images/temp/';
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
    case 'test-report':
      return createPosterImageUrl(obj);
    default:
      throw new Error(`Unknown service: ${service}`);
  }
}

async function convertFormatToPng(data, originalFormat) {
  logger.info(`Converting ${originalFormat} format to PNG .. `);
  if (originalFormat === 'jpg') {
    const sharpObj = sharp(data, { limitInputPixels: false });
    const meta = await sharpObj.metadata();
    if (meta.format !== 'jpeg') {
      throw new Error(`Input data was not JPEG, it was: ${meta.format}`);
    }
    return await sharpObj.png().toBuffer();
  } else if (originalFormat === 'svg') {
    const sharpObj = sharp(data, { density: 72, limitInputPixels: false });
    const meta = await sharpObj.metadata();
    if (meta.format !== 'svg') {
      throw new Error(`Input data was not SVG, it was: ${meta.format}`);
    }
    return await sharpObj.png().toBuffer();
  } else if (originalFormat === 'pdf') {
    return await convertPdfToPng(data);
  }

  throw new Error(`Unknown format: ${originalFormat}`);
}

async function fetchImageFromService(service, poster, opts) {
  const imageUrl = getImageUrl(service, poster);
  logger.info(`Downloading poster from "${imageUrl}" ..`);

  const res = await downloadImage(imageUrl);
  let data = res.body;

  if (poster.format !== 'png') {
    if (opts.tempFiles) {
      await fs.writeFileAsync(`${TEMP_FILE_PREFIX}${posterToFileBaseName(service, poster)}.${poster.format}`, data);
    }
    try {
      data = await convertFormatToPng(data, poster.format);
    } catch (err) {
      err.meta = {
        convertError: true,
        url: imageUrl,
      };

      throw err;
    }
  }
  return data;
}

const errorLogger = (err) => {
  if (err.name === 'StatusCodeError') {
    const msg = `StatusCodeError: ${err.response.statusCode} - ${err.response.body.toString()}`;
    logger.error(msg);
    return true;
  } else if (_.get(err, 'meta.convertError')) {
    logger.error(`Conversion error: ${err} for url ${err.meta.url}`);
    return false;
  }

  logger.error(`Error: ${err}`);
  return true;
};

const retryingFetchImageFromService = promiseRetryify(fetchImageFromService, {
  beforeRetry: (retryCount, [service, poster]) => {
    const retryUrl = getImageUrl(service, poster);
    logger.info(`Retrying image download (${retryCount}) for ${retryUrl} ..`);
  },
  maxRetries: 10,
  shouldRetry: errorLogger,
  retryTimeout: count => count * 10000,
});

async function fetchPosterFromS3(service, poster) {
  const posterApiUrl = getS3UrlForPoster(service, poster);
  logger.info(`Downloading poster from "${posterApiUrl}" ..`);

  try {
    const res = await downloadImage(posterApiUrl);
    return {
      data: res.body,
      fallback: false,
    };
  } catch (err) {
    if (err.name === 'StatusCodeError' && !_.includes([404, 403], err.response.statusCode)) {
      throw err;
    }

    logger.warn('Download failed! S3 doesn\'t seem to have this file yet.');
    logger.warn('Remember to take a snapshot of the image for next run.');
    logger.warn('Returning an empty image, this will show up as a massive difference.');
  }

  const dims = parseSizeToPixelDimensions(poster.size, poster.orientation);
  const width = poster.width || dims.width;
  const height = poster.height || dims.height;
  const emptyImage = Buffer.from(`
    <svg width="${width}px" height="${height}px" viewBox="0 0 ${width} ${height}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <rect fill="#d6d8d9" x="0" y="0" width="${width}" height="${height}"/>
      <g text-anchor="middle">
        <text id="warning" font-family="sans-serif" font-size="${width / 35}" font-weight="700" letter-spacing="${width / 200}" fill="#ff0000">
          <tspan x="${width / 2}" y="${height / 2}">NO SNAPSHOT FOUND FROM S3</tspan>
        </text>
      </g>
    </svg>
  `);

  return {
    data: await sharp(emptyImage, { density: 72 }).png().toBuffer(),
    fallback: true,
  };
}

const retryingFetchPosterFromS3 = promiseRetryify(fetchPosterFromS3, {
  beforeRetry: retryCount => logger.info(`Retrying image download from S3 (${retryCount}) ..`),
  shouldRetry: errorLogger,
  retryTimeout: count => count * 10000,
});

function uploadFileToS3(fileKey, data, contentType) {
  const params = {
    Bucket: config.AWS_S3_BUCKET_NAME,
    ACL: 'public-read',
    Key: fileKey,
    ContentType: contentType,
    Body: data,
  };

  return s3.uploadAsync(params)
    .tap(res => logger.info(`Uploaded file to S3: ${res.Location}`))
    .catch((err) => {
      logger.error(`Error uploading file to S3: ${err}`);
      throw err;
    });
}

function uploadPosterToS3(service, poster, data) {
  logger.info('Uploading poster to S3 ..');

  const baseKey = posterToFileBaseName(service, poster);
  return uploadFileToS3(`${baseKey}.png`, data, 'image/png');
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

  let total = 0;
  _.forEach(opts.services, (service) => {
    const posters = getPosters(service, { mainLocationId: opts.mainLocationId });
    const filteredPosters = filterPosters(posters, opts);
    logger.info(`* ${filteredPosters.length} combinations for ${service} service`);
    total += filteredPosters.length;
  });

  logger.info(`Total of ${total} combinations\n\n`);
}

function getS3KeyForPoster(service, poster) {
  const name = posterToFileBaseName(service, poster);
  return `${name}.png`;
}

function getS3UrlForPoster(service, poster) {
  const key = getS3KeyForPoster(service, poster);
  return getS3UrlForKey(key);
}

function getS3UrlForKey(key) {
  return `https://${config.AWS_S3_BUCKET_NAME}.s3-eu-west-1.amazonaws.com/${key}`;
}

function getShortUrl(urlStr) {
  const url = new URL(urlStr);
  return `${url.origin}${url.pathname}?...`;
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

// When changing the file name format, you can mass change files in s3 with rename-s3-files.js tool
// Not the most advanced approach, but simple and works
function posterToFileBaseName(service, poster) {
  return [
    service,
    poster.locationId,
    poster.size,
    poster.posterStyle,
    poster.mapStyle,
    poster.orientation,
    `z${poster.zoomLevel}`,
    `L${poster.labelsEnabled ? '1' : '0'}`,
    // The files are always compared as PNGs, and snapshots are saved as PNGs, even though
    // we are comparing other formats. The comparison happens by always first converting the
    // different format to PNG and then doing diff
    poster.format,
  ].join('-');
}

async function takeSnapshot(opts) {
  logPosterCount(opts);

  await BPromise.each(opts.services, async (service) => {
    const posters = getPosters(service, { mainLocationId: opts.mainLocationId });
    const filteredPosters = filterPosters(posters, opts);
    logger.info(`Taking snapshots of ${filteredPosters.length} images for service ${service} ..`);

    await BPromise.map(filteredPosters, async (poster) => {
      const apiData = await retryingFetchImageFromService(service, poster, opts);
      logger.info(`Downloaded ${prettyBytes(apiData.length)} data`);

      let imageData = apiData;
      if (!opts.originals && config.MAX_DIMENSION_FOR_DIFF) {
        logger.info(`Resizing picture to max ${config.MAX_DIMENSION_FOR_DIFF}px width or height ..`);
        imageData = await resizeImage(apiData, config.MAX_DIMENSION_FOR_DIFF);
      }

      await savePosterToTarget(opts.target, service, poster, imageData);
    }, { concurrency: opts.concurrency });
  });
}

async function compareAll(opts) {
  logPosterCount(opts);

  // Must be done once before loop to keep it stable
  const localDateString = moment().format('YYYY-MM-DD_HH[h]mm[m]ss[s]');
  const buildNum = process.env.CIRCLE_BUILD_NUM
    ? `ci-build-${process.env.CIRCLE_BUILD_NUM}`
    : `local-${localDateString}`;
  const tempS3Prefix = `temp/${buildNum}/`;

  const diffInfo = {
    tempS3Prefix,
    diffs: [],
  };

  await BPromise.each(opts.services, async (service) => {
    const posters = getPosters(service, { mainLocationId: opts.mainLocationId });
    const filteredPosters = filterPosters(posters, opts);
    logger.info(`Comparing ${filteredPosters.length} images for ${service} ..`);
    logger.info(`This totals ${filteredPosters.length * 2} image downloads`);

    await BPromise.map(filteredPosters, async (poster) => {
      const apiData = await retryingFetchImageFromService(service, poster, opts);
      const s3Res = await retryingFetchPosterFromS3(service, poster, opts);
      const s3Data = s3Res.data;

      logger.info(`Received ${prettyBytes(apiData.length)} data from ${service} service`);
      if (s3Res.fallback) {
        logger.info('Using empty fallback image since the requested image was not found from S3');
      } else {
        logger.info(`Received ${prettyBytes(s3Data.length)} data from S3`);
      }

      logger.info(`Resizing pictures to ${config.MAX_DIMENSION_FOR_DIFF}px width or height ..`);
      await sharp(await resizeImage(apiData, config.MAX_DIMENSION_FOR_DIFF))
        .toFile(`${API_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`);

      await sharp(await resizeImage(s3Data, config.MAX_DIMENSION_FOR_DIFF))
        .toFile(`${S3_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`);

      const diff = new BlinkDiff({
        imageAPath: `${S3_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`,
        imageBPath: `${API_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`,
        thresholdType: BlinkDiff.THRESHOLD_PERCENT,
        threshold: 0.02,
        imageOutputPath: `${DIFF_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`,
      });
      const promisifiedDiff = BPromise.promisifyAll(diff);
      const result = await promisifiedDiff.runAsync();

      logger.info(`Found ${result.differences} differences`);
      const diffFileName = `${DIFF_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`;
      if (result.differences < 1) {
        fs.unlinkSync(`${S3_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`);
        fs.unlinkSync(`${API_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`);
        fs.unlinkSync(diffFileName);
      } else {
        const diffImage = fs.readFileSync(diffFileName, { encoding: null });
        const originalDiffMeta = await sharp(diffImage).metadata();
        const resizedDiffImage = await resizeImage(diffImage, config.MAX_DIMENSION_FOR_REVIEW);
        const baseName = posterToFileBaseName(service, poster);
        const s3DiffImageKey = `${tempS3Prefix}${baseName}.png`;
        await uploadFileToS3(s3DiffImageKey, resizedDiffImage, 'image/png');
        const resizedDiffMeta = await sharp(resizedDiffImage).metadata();

        diffInfo.diffs.push({
          key: s3DiffImageKey,
          differences: result.differences,
          url: getS3UrlForKey(s3DiffImageKey),
          snapshotS3UrlShort: `s3://${config.AWS_S3_BUCKET_NAME}/${getS3KeyForPoster(service, poster)}`,
          snapshotS3Url: getS3UrlForPoster(service, poster),
          originalDiffImageWidth: originalDiffMeta.width,
          originalDiffImageHeight: originalDiffMeta.height,
          resizedDiffImageWidth: resizedDiffMeta.width,
          resizedDiffImageHeight: resizedDiffMeta.height,
          service,
          poster,
          baseName,
          apiUrl: getImageUrl(service, poster),
          apiUrlShort: getShortUrl(getImageUrl(service, poster)) ,
        });

        if (SAVE_ALL_FILES) {
          logger.info('Saved diff and fetched images under images/');
        } else {
          fs.unlinkSync(`${S3_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`);
          fs.unlinkSync(`${API_FILE_PREFIX}${posterToFileBaseName(service, poster)}.png`);
          logger.info('Saved diff under images/');
        }
      }
    }, { concurrency: opts.concurrency });
  });

  const totalDiffs = _.sumBy(diffInfo.diffs, 'differences');
  if (totalDiffs > 0) {
    const htmlStr = generateHtml(diffInfo);
    const reportKeyName = `${tempS3Prefix}report.html`;
    await uploadFileToS3(reportKeyName, htmlStr, 'text/html');
    logger.info(`Uploaded final review report to ${getS3UrlForKey(reportKeyName)}`);
  } else {
    logger.info('No differences found. Skipping report generation.');
  }
}

module.exports = {
  snapshot: takeSnapshot,
  compare: compareAll,
};
