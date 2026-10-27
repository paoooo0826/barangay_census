const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
let checks = 0;
function check(value, description) {
  assert.ok(value, description);
  checks++;
}

(async () => {
  const built = await esbuild.build({
    entryPoints: [path.join(root, "src/lib/idDocument.ts")],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
  });
  const module = { exports: {} };
  new Function("module", "exports", built.outputFiles[0].text)(
    module,
    module.exports,
  );
  const { inspectIdText, GOVERNMENT_ID_TYPES } = module.exports;
  const details =
    "REPUBLIC OF THE PHILIPPINES SURNAME TEST GIVEN NAME RESIDENT DATE OF BIRTH 15 JANUARY 1990 SEX FEMALE ADDRESS SAMPLE CITY NUMBER 123456789";
  const headings = [
    "PHILIPPINE IDENTIFICATION CARD",
    "DRIVER'S LICENSE",
    "PASAPORTE PASSPORT",
    "UNIFIED MULTI PURPOSE ID",
    "POSTAL ID",
    "COMMISSION ON ELECTIONS",
  ];
  for (let i = 0; i < headings.length; i++) {
    const result = inspectIdText(
      `${headings[i]} ${details}`,
      91,
      GOVERNMENT_ID_TYPES[i],
    );
    check(
      result.status === "recognized" &&
        !JSON.stringify(result).includes("123456789"),
      `${GOVERNMENT_ID_TYPES[i]} is recognized without returning its ID number`,
    );
  }
  for (const text of [
    "",
    "a selfie of one person",
    "Beautiful trees beside a mountain",
    `SCHOOL HOMEWORK ${details}`,
  ]) {
    assert.throws(() => inspectIdText(text, 95, "PhilSys ID"), /ID/);
    checks++;
  }
  assert.throws(
    () =>
      inspectIdText(
        `PHILIPPINE IDENTIFICATION CARD ${details}`,
        93,
        "Passport",
      ),
    /appears to show/,
  );
  checks++;
  assert.throws(
    () => inspectIdText(`PHILIPPINE IDENTIFICATION CARD ${details}`, 93, ""),
    /Select/,
  );
  checks++;
  assert.throws(
    () =>
      inspectIdText(
        "PHILIPPINE IDENTIFICATION CARD NAME SAMPLE RESIDENT",
        93,
        "PhilSys ID",
      ),
    /readable/,
  );
  checks++;
  check(
    inspectIdText(`PHILIPPINE IDENTIFICATION CARD ${details}`, 35, "PhilSys ID")
      .status === "manual_review",
    "Uncertain OCR requires admin review even when the heading matches",
  );
  check(
    inspectIdText(
      `PHILIPPINE IDENTIFICATION CARD ${details}`,
      NaN,
      "PhilSys ID",
    ).status === "manual_review",
    "Missing OCR confidence cannot become a confident recognition",
  );
  check(
    inspectIdText(
      `SOCIAL SECURITY SYSTEM IDENTIFICATION CARD ${details}`,
      90,
      "SSS ID",
    ).status === "manual_review",
    "The existing Other ID option remains subject to manual review",
  );
  check(
    inspectIdText(
      `IDENTITY CARD NAME TEST RESIDENT DATE OF BIRTH 1 JAN 1990 SEX F NUMBER 123456`,
      90,
      "Other",
    ).status === "manual_review",
    "An unfamiliar ID issuer is left to admin review rather than automatically verified",
  );
  check(
    inspectIdText(
      `PASSPORT SURNAME TEST GIVEN NAMES RESIDENT NATIONALITY SAMPLE DATE OF BIRTH 15 JAN 1990 SEX F NUMBER 123456`,
      90,
      "Passport",
    ).status === "recognized",
    "Passport screening does not invent a Philippine-only eligibility restriction",
  );

  const client = await esbuild.build({
    stdin: {
      contents: `import {checkIdDocument} from './src/lib/idDocumentOcr';window.checkIdDocument=checkIdDocument;`,
      resolveDir: root,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "iife",
    define: {
      "import.meta.url": '"https://test.invalid/checker.js"',
      "import.meta.env.BASE_URL": '"/barangay_census/"',
    },
  });
  const dom = new JSDOM("", {
    runScripts: "dangerously",
    url: "https://test.invalid/barangay_census/",
  });
  const w = dom.window,
    workers = [],
    timers = new Map();
  w.Worker = class {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.terminated = false;
      workers.push(this);
    }
    postMessage(data) {
      this.input = data;
    }
    terminate() {
      this.terminated = true;
    }
    send(data) {
      this.onmessage?.({ data });
    }
  };
  w.setTimeout = (fn) => {
    const id = timers.size + 1;
    timers.set(id, fn);
    return id;
  };
  w.clearTimeout = (id) => timers.delete(id);
  w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  w.HTMLCanvasElement.prototype.toBlob = (fn) =>
    fn(new w.Blob(["image"], { type: "image/png" }));
  w.eval(client.outputFiles[0].text);
  const image = { naturalWidth: 3600, naturalHeight: 2400 };
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const start = async () => {
    const controller = new w.AbortController(),
      progress = [];
    const promise = w.checkIdDocument(
      image,
      "PhilSys ID",
      controller.signal,
      (message) => progress.push(message),
    );
    // Attach immediately, including for the failure tests, to detect real leaks.
    const outcome = promise.then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await flush();
    return { controller, progress, outcome, worker: workers.at(-1) };
  };
  let t = await start();
  check(
    t.worker.input.base === "https://test.invalid/barangay_census/ocr/v7/" &&
      t.worker.input.blob instanceof w.Blob,
    "ID pixels go to a local worker, with assets respecting the app base path",
  );
  t.worker.send({ type: "progress", message: "Reading ID details… 50%" });
  t.worker.send({
    type: "result",
    text: `PHILIPPINE IDENTIFICATION CARD ${details}`,
    confidence: 90,
  });
  check(
    (await t.outcome).value.status === "recognized" &&
      t.progress.length === 1 &&
      t.worker.terminated &&
      timers.size === 0,
    "Successful OCR reports progress, screens text, and releases its worker/timer",
  );
  t = await start();
  t.worker.send({ type: "result", text: "a selfie", confidence: 90 });
  check(
    (await t.outcome).error.message.includes("readable government ID") &&
      t.worker.terminated,
    "Unrelated images cannot advance and still release the worker",
  );
  t = await start();
  t.controller.abort();
  check(
    (await t.outcome).error.name === "AbortError" &&
      t.worker.terminated &&
      timers.size === 0,
    "Close or navigation cancels initialization and releases its worker and timer",
  );
  t.worker.send({
    type: "result",
    text: `PHILIPPINE IDENTIFICATION CARD ${details}`,
    confidence: 90,
  });
  check(
    (await t.outcome).error.name === "AbortError",
    "A late OCR result cannot reverse cancellation",
  );
  t = await start();
  t.worker.send({ type: "error" });
  check(
    (await t.outcome).error.message.includes("retry") &&
      t.worker.terminated &&
      timers.size === 0,
    "Failed engine/language loading provides a retry and closes the worker",
  );
  t = await start();
  t.worker.onerror();
  check(
    (await t.outcome).error.message.includes("could not load") &&
      t.worker.terminated,
    "A worker script failure is handled without accepting the picture",
  );
  t = await start();
  [...timers.values()][0]();
  check(
    (await t.outcome).error.message.includes("too long") &&
      t.worker.terminated &&
      timers.size === 0,
    "A stalled check times out without accepting or retaining its worker",
  );
  t = await start();
  t.worker.send({
    type: "result",
    text: `PHILIPPINE IDENTIFICATION CARD ${details}`,
    confidence: 45,
  });
  check(
    (await t.outcome).value.status === "manual_review" && t.worker.terminated,
    "Retry after failure works and preserves an uncertain reading for admin review",
  );
  const count = workers.length,
    controller = new w.AbortController();
  controller.abort();
  await assert.rejects(
    w.checkIdDocument(image, "PhilSys ID", controller.signal, () => {}),
    { name: "AbortError" },
  );
  checks++;
  check(
    workers.length === count,
    "An already-cancelled request never starts a worker",
  );
  dom.window.close();
  console.log(`ID document verification passed (${checks} checks).`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
