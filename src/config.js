/* eslint-disable no-process-env */
const requireEnvs = require('./util/require-envs');

requireEnvs([
  'RENDER_API_URL',
  'RENDER_API_KEY',
  'PLACEMENT_API_URL',
  'PLACEMENT_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_BUCKET_NAME',
]);

// Env vars should be casted to correct types
const config = {
  NODE_ENV: process.env.NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL,
  RENDER_API_URL: process.env.RENDER_API_URL || 'https://51.255.81.67:8001',
  RENDER_API_KEY: process.env.RENDER_API_KEY,
  PLACEMENT_API_URL: process.env.PLACEMENT_API_URL || 'http://51.255.81.67:8003',
  PLACEMENT_API_KEY: process.env.PLACEMENT_API_KEY,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
  AWS_REGION: process.env.AWS_REGION || 'eu-west-1',
  AWS_DEBUG: process.env.AWS_DEBUG === 'true',
  // Max dimensions for the final visual diff images that are added to review page
  MAX_DIMENSION_FOR_REVIEW: process.env.MAX_DIMENSION_FOR_REVIEW
    ? Number(process.env.MAX_DIMENSION_FOR_REVIEW)
    : 1200,
  // Max dimension for individual poster image from e.g. API or S3
  // before sending it to visual diff
  MAX_DIMENSION_FOR_DIFF: process.env.MAX_DIMENSION_FOR_DIFF
    ? Number(process.env.MAX_DIMENSION_FOR_DIFF)
    : 1500,
};

module.exports = config;
