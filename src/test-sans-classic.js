const _ = require('lodash')

const common = {
  mapStyle: 'bw',
  swLat: 41.27237419539145,
  swLng: 2.0141796369013587,
  neLat: 41.70010518785451,
  neLng: 2.4220262605715974,
  labelsEnabled: true,
  labelHeader: 'Barcelono',
  labelSmallHeader: 'Catalonia',
  labelText: '(assigned later)',
};

const posters = [
  /*{
    posterStyle: 'classic',
    size: '70x100cm',
    orientation: 'portrait',
  },
  {
    posterStyle: 'classic',
    size: '70x100cm',
    orientation: 'landscape',
  },
  {
    posterStyle: 'classic',
    size: '50x70cm',
    orientation: 'portrait',
  },
  {
    posterStyle: 'classic',
    size: '50x70cm',
    orientation: 'landscape',
  },
  {
    posterStyle: 'classic',
    size: '30x40cm',
    orientation: 'portrait',
  },
  {
    posterStyle: 'classic',
    size: '30x40cm',
    orientation: 'landscape',
  },*/
  /*{
    posterStyle: 'sans',
    size: '70x100cm',
    orientation: 'portrait',
  },*/
  {
    posterStyle: 'sans',
    size: '70x100cm',
    orientation: 'landscape',
  },
  /*{
    posterStyle: 'sans',
    size: '50x70cm',
    orientation: 'portrait',
  },*/
  {
    posterStyle: 'sans',
    size: '50x70cm',
    orientation: 'landscape',
  },
  /*{
    posterStyle: 'sans',
    size: '30x40cm',
    orientation: 'portrait',
  },
  {
    posterStyle: 'sans',
    size: '30x40cm',
    orientation: 'landscape',
  },*/
];

module.exports = _.map(posters, p => _.merge({}, common, p));