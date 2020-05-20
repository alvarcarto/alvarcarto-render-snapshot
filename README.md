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
* `npm run snapshot` Save or update snapshot of current render API state into S3
* `npm run compare` Compare current render API against latest snapshot in S3


### More examples

*If needed, you can increase the node process memory with `NODE_OPTIONS=--max_old_space_size=4096`.*

**Take a snapshot and upload to S3**

```
# Take snapshots for production settings
npm run snapshot -- --concurrency 2
# Take snapshots for qa settings (only uses helsinki location as the QA server doesn't have whole planet data)
npm run snapshot -- --concurrency 2 --main-location-id hki_c --only 'locationId:hki_c' --only 'orientation:portrait'
```

**Take a snapshot to local disk**

```
# Take snapshots for production settings
npm run snapshot -- --concurrency 2 --target local
# Take snapshots for qa settings (only uses helsinki location as the QA server doesn't have whole planet data)
npm run snapshot -- --concurrency 2 --target local --main-location-id hki_c --only 'locationId:hki_c' --only 'orientation:portrait'
```

**Only do snapshots for poster renders:**

`node src/index.js snapshot --service render`

**Only compare smaller subset of poster renders:**

`node src/index.js compare --service render --only 'locationId:hki*'`


**Only PDF renders:**

`node src/index.js snapshot --service render --only 'format:pdf'`


**Generate test report:**

`npm run compare -- --temp-files --concurrency 3 --services 'test-report'`


## Known issues


### ERROR: Stream not writable

This explains the likely cause:

* https://www.bountysource.com/issues/39261863-backstopjs-test-execution-failing-error-stream-not-writable
* Fix PR: https://github.com/lukeapage/pngjs/pull/130

```
/home/circleci/project/alvarcarto-render-snapshot/node_modules/blink-diff/index.js:355

			throw new Error('ERROR: ' + text);

			^
Error: ERROR: Stream not writable
    at Object.<anonymous> (/home/circleci/project/alvarcarto-render-snapshot/node_modules/blink-diff/index.js:355:10)
    at exports.PNG.<anonymous> (/home/circleci/project/alvarcarto-render-snapshot/node_modules/pngjs-image/index.js:28:12)
    at exports.PNG.emit (events.js:203:15)
    at exports.PNG.EventEmitter.emit (domain.js:448:20)
    at module.exports.emit (events.js:198:13)
    at module.exports.EventEmitter.emit (domain.js:448:20)
    at module.exports.ChunkStream.write (/home/circleci/project/alvarcarto-render-snapshot/node_modules/pngjs/lib/chunkstream.js:46:10)
    at exports.PNG.PNG.write (/home/circleci/project/alvarcarto-render-snapshot/node_modules/pngjs/lib/png.js:92:16)
    at ReadStream.ondata (_stream_readable.js:710:20)
    at ReadStream.emit (events.js:198:13)
    at ReadStream.EventEmitter.emit (domain.js:448:20)
    at addChunk (_stream_readable.js:288:12)
    at readableAddChunk (_stream_readable.js:269:11)
    at ReadStream.Readable.push (_stream_readable.js:224:10)
    at lazyFs.read (internal/fs/streams.js:181:12)
    at FSReqWrap.wrapper [as oncomplete] (fs.js:467:17)
```
