# Alvar Carto Integration Tests

Integration tests which verifies that render service produces still visually
same posters as before

Dependencies:

* AWS S3 Bucket *(for saving accepted comparison images)*
* https://github.com/kimmobrunfeldt/alvarcarto-render-service


## Doing comparison

The output diff has three images aside: left poster, diff, right poster.
Left side is the prevously snapshotted and right side is what the API just
responded.

## Get started

* `cp .env.sample .env`
* Fill in the blanks in `.env`
* `source .env` or `bash .env`

  Or use [autoenv](https://github.com/kennethreitz/autoenv).

* `npm install`
* `npm run snapshot` Take first snapshot from render API
* `npm run verify` Verify current render API against latest snapshot
