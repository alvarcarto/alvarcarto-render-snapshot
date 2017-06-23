const _ = require('lodash');
const yargs = require('yargs');
const core = require('./core');
const VERSION = require('../package.json').version;

const defaultOpts = {};

function getUserOpts() {
  const userOpts = yargs
    .command('snapshot', 'take a snapshot', () => {}, (argv) => {
      core.snapshot(argv);
    })
    .command('compare', 'compare current status to snapshot', () => {}, (argv) => {
      core.compare(argv);
    })
    .option('originals', {
      describe: 'If true, original images are saved when snapshotting',
      default: false,
      type: 'boolean',
    })
    .option('target', {
      describe: 'Target where snapshots are saved. Options: s3, local',
      default: 's3',
      type: 'string',
    })
    .option('only', {
      describe: 'Process only the posters which match filters',
      default: '**',
      type: 'string',
    })
    .usage('Usage: $0 [options]\n\n')
    .example('\nTake snapshot\n $ $0 snapshot')
    .example('\nCompare snapshot to current status\n $ $0 compare')
    .help('h')
    .alias('h', 'help')
    .alias('v', 'version')
    .version(VERSION)
    .argv;

  return userOpts;
}

function validateAndTransformOpts(opts) {
  return opts;
}

function getOpts() {
  const userOpts = getUserOpts();
  const opts = _.merge(defaultOpts, userOpts);
  return validateAndTransformOpts(opts);
}

if (require.main === module) {
  let opts;
  try {
    opts = getOpts();
  } catch (err) {
    if (err.argumentError) {
      console.error(err.message);
      process.exit(1);
    }

    throw err;
  }
}

module.exports = {
  defaultOpts,
  getOpts,
};
