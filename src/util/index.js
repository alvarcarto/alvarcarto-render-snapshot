const qs = require('qs');
const config = require('../config');

function createPosterImageUrl(poster) {
  const query = qs.stringify(poster);
  return `${config.RENDER_API_URL}/api/raster/render?${query}`;
}

module.exports = {
  createPosterImageUrl,
};
