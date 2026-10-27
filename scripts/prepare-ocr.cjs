const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "public/ocr/v7");
fs.mkdirSync(output, { recursive: true });
const assets = [
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  [
    "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    "eng.traineddata.gz",
  ],
  ...["", "simd-", "relaxedsimd-"].flatMap((variant) =>
    ["wasm.js", "wasm"].map((extension) => {
      const name = `tesseract-core-${variant}lstm.${extension}`;
      return [`tesseract.js-core/${name}`, name];
    }),
  ),
];
for (const [source, name] of assets)
  fs.copyFileSync(require.resolve(source), path.join(output, name));
console.log("Prepared local ID text checker assets.");
