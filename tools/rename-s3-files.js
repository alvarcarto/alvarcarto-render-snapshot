const _ = require('lodash');
const path = require('path');
const BPromise = require('bluebird');
const { createS3 } = require('../src/util/aws');
const config = require('../src/config');

const s3 = createS3();

function removeEnd(str, ending) {
  if (!_.endsWith(str, ending)) {
    return str;
  }

  return str.substring(0, str.length - ending.length);
}

// Edit this function as you wish to change the names
function transformKeyName(old) {
  const name = path.basename(old, path.extname(old));
  const ext = path.extname(old);
  // Currently this function returns the name as is, no changes
  return `${name}${ext}`;
}

async function main() {
  const result = await s3.listObjectsAsync({ Bucket: config.AWS_S3_BUCKET_NAME, MaxKeys: 1000 });
  if (result.IsTruncated) {
    console.error('Unable to rename all objects at once (>1000), so exiting ..');
    process.exit(2);
  }

  await BPromise.each(result.Contents, async (item) => {
    const newKeyName = transformKeyName(item.Key);
    // For some reason this is the documented way to set source object
    // https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#copyObject-property
    const source = `/${config.AWS_S3_BUCKET_NAME}/${item.Key}`;
    const newLocation = `s3://${config.AWS_S3_BUCKET_NAME}/${newKeyName}`;
    console.log(`Copying s3:/${source} ->`);
    console.log(`        ${newLocation}`);
    await s3.copyObjectAsync({
      Bucket: config.AWS_S3_BUCKET_NAME,
      CopySource: source,
      Key: newKeyName,
    });

    console.log(`Deleting old file ${source}`);
    await s3.deleteObjectAsync({
      Bucket: config.AWS_S3_BUCKET_NAME,
      Key: item.Key,
    });
  });
}

main();
