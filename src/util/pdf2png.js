/* Copyright 2017 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Copied from here: https://github.com/mozilla/pdf.js/blob/15087c35d164a4152b21adde908b4d7619897bb3/examples/node/pdf2png/pdf2png.js
const fs = require('fs');
const Canvas = require('canvas');
const assert = require('assert').strict;
const pdfjsLib = require('pdfjs-dist');

function NodeCanvasFactory() {}
NodeCanvasFactory.prototype = {
  create: (width, height) => {
    assert(width > 0 && height > 0, 'Invalid canvas size');
    const canvas = Canvas.createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  },

  reset: (canvasAndContext, width, height) => {
    assert(canvasAndContext.canvas, 'Canvas is not specified');
    assert(width > 0 && height > 0, 'Invalid canvas size');
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  },

  destroy: (canvasAndContext) => {
    assert(canvasAndContext.canvas, 'Canvas is not specified');

    // Zeroing the width and height cause Firefox to release graphics
    // resources immediately, which can greatly reduce memory consumption.
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  },
};

async function convertPdfToPng(pdfBuffer, pageNumber = 1) {
  // Read the PDF file into a typed array so PDF.js can load it.
  const rawData = new Uint8Array(pdfBuffer);
  const pdfDocument = await pdfjsLib.getDocument(rawData).promise;

  // Get the first page.
  const page = await pdfDocument.getPage(pageNumber);

  // Render the page on a Node canvas with given scale.
  // To get the similar sized PNG as we normally would get from our API (300dpi),
  // we need to scale the PDF dimensions (at 72 dpi when converted to pixels) to achieve 300dpi
  // at pixel size
  const viewport = page.getViewport({ scale: 300 / 72 });
  const canvasFactory = new NodeCanvasFactory();
  const canvasAndContext = canvasFactory.create(
    viewport.width,
    viewport.height,
  );
  const renderContext = {
    canvasContext: canvasAndContext.context,
    viewport,
    canvasFactory,
  };

  await page.render(renderContext).promise;

  const imageBuffer = canvasAndContext.canvas.toBuffer();
  return imageBuffer;
}

async function main() {
  const pdfData = fs.readFileSync(process.argv[2], { encoding: null });
  const pngBuf = await convertPdfToPng(pdfData, 1);
  fs.writeFileSync('output.png', pngBuf, { encoding: null });
  console.log('Wrote output.png');
}

if (require.main === module) {
  main();
}

module.exports = {
  convertPdfToPng,
};
