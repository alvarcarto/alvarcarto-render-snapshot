const _ = require('lodash');
const yargs = require('yargs');
const core = require('./core');
const VERSION = require('../package.json').version;

const defaultOpts = {};

function main() {
  yargs
    .command('snapshot', 'take a snapshot', () => {}, async (argv) => {
      validateAndTransformArgv(argv);
      await core.snapshot(argv);
    })
    .command('compare', 'compare current status to snapshot', () => {}, async (argv) => {
      validateAndTransformArgv(argv);
      await core.compare(argv);
    })
    .option('originals', {
      describe: 'If true, original sized images are saved when snapshotting',
      default: false,
      type: 'boolean',
    })
    .option('target', {
      describe: 'Target where snapshots are saved. Options: s3, local',
      default: 's3',
      type: 'string',
    })
    .option('main-location-id', {
      describe: 'Main location id. For example tokyo_c or hki_c',
      default: 'tokyo_c',
      type: 'string',
    })
    .option('only', {
      describe: 'Process only the posters which match filters',
      default: '**',
      type: 'string',
    })
    .option('services', {
      describe: 'Services to take diffs from',
      default: ['render', 'render-map', 'tile', 'placement'],
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
}

function validateAndTransformArgv(argv) {
  if (!_.isArray(argv.services)) {
    argv.services = [argv.services];
  }

  return argv;
}

if (require.main === module) {
  try {
    main();
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
};
