/* eslint-disable no-process-env */
const requireEnvs = require('./util/require-envs');

requireEnvs([
  'RENDER_API_URL',
  'RENDER_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_S3_BUCKET_NAME',
]);

// Env vars should be casted to correct types
const config = {
  NODE_ENV: process.env.NODE_ENV,
  LOG_LEVEL: process.env.LOG_LEVEL,
  RENDER_API_URL: process.env.RENDER_API_URL || 'http://51.255.81.67:8001',
  RENDER_API_KEY: process.env.RENDER_API_KEY,
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
  AWS_REGION: process.env.AWS_REGION || 'eu-west-1',
  AWS_DEBUG: process.env.AWS_DEBUG === 'true',
  RESIZE_TO_HEIGHT: process.env.RESIZE_TO_HEIGHT
    ? Number(process.env.RESIZE_TO_HEIGHT)
    : 2000,
};

module.exports = config;
