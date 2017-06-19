const _ = require('lodash');
const BPromise = require('bluebird');
const request = require('request-promise');
const prettyBytes = require('pretty-bytes');
const { createS3 } = require('./util/aws');
const { createPosterImageUrl } = require('./util');
const logger = require('./util/logger')(__filename);
const config = require('./config');
const POSTERS = require('./posters');

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

function uploadPosterToS3(poster, data) {
  const key = [
    poster.labelHeader.toLowerCase(),
    poster.size,
    poster.posterStyle,
    poster.mapStyle,
    poster.orientation,
  ].join('-');

  const params = {
    Bucket: config.AWS_S3_BUCKET_NAME,
    ACL: 'public-read',
    Key: `${key}.png`,
    ContentType: 'image/png',
    Body: data,
  };

  return s3.uploadAsync(params)
    .catch((err) => {
      logger.error(`Error uploading poster to S3: ${err}`);
      throw err;
    });
}

function takeSnapshot() {
  BPromise.map(POSTERS, (poster) =>
    fetchPosterFromRenderApi(poster)
      .then((res) => {
        const bytes = parseInt(res.headers['content-length'], 10);
        logger.info(`Downloaded ${prettyBytes(bytes)} data`);

        logger.info(`Uploading poster to S3 ..`);
        return uploadPosterToS3(poster, res.body);
      })
      .tap(data => logger.info(`Uploaded poster to S3: ${data.Location}`))
      .catch((err) => {
        logger.error(`Error processing poster: ${err}`);
        throw err;
      }),
    { concurrency: 1 }
  );
}

takeSnapshot();