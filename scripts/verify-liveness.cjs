const assert = require("node:assert/strict");
const path = require("node:path");
const esbuild = require("esbuild");
let checks = 0;
const check = (condition, label) => {
  assert.ok(condition, label);
  checks++;
};
(async () => {
  const built = await esbuild.build({
    stdin: {
      contents: `export * from './src/lib/liveness';export * from './src/lib/captureGuide';export * from './src/lib/cameraOrientation';`,
      resolveDir: path.resolve(__dirname, ".."),
      loader: "ts",
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
  });
  const module = { exports: {} };
  new Function("module", "exports", built.outputFiles[0].text)(
    module,
    module.exports,
  );
  const {
    initialBlinkState,
    updateBlink,
    interruptBlink,
    detectsSmile,
    detectsMoveCloser,
    detectsHeadTurn,
    faceInsideGuide,
    faceGuide,
  } = module.exports;
  for (const open of [0.18, 0.28, 0.36]) {
    let state = initialBlinkState();
    for (let i = 0; i < 4; i++) state = updateBlink(state, open);
    check(
      state.baseline === open && state.count === 0,
      `Blink calibration adapts to open EAR ${open}`,
    );
    for (let i = 0; i < 12; i++) state = updateBlink(state, open);
    check(
      state.count === 0,
      "Keeping eyes open cannot pass the blink challenge",
    );
    state = updateBlink(state, open * 0.7);
    for (let i = 0; i < 5; i++) state = updateBlink(state, open * 0.7);
    check(
      state.closed && state.count === 0,
      "Holding eyes closed does not count repeated blinks",
    );
    state = updateBlink(state, open);
    check(state.count === 1, "One close/reopen cycle counts exactly once");
    state = updateBlink(state, open * 0.7);
    state = updateBlink(state, open);
    check(
      state.count === 2,
      "Two real close/reopen cycles complete the blink challenge",
    );
  }
  let state = initialBlinkState();
  for (const ear of [0.28, 0.28, 0.12, 0.28]) state = updateBlink(state, ear);
  check(
    state.baseline === 0.28,
    "One blink during calibration does not distort the median baseline",
  );
  state = updateBlink(state, 0.18);
  state = interruptBlink(state);
  state = updateBlink(state, 0.28);
  check(
    state.count === 0,
    "A face loss between closing and reopening cannot count a blink",
  );
  for (const ear of [0.26, 0.27, 0.28, 0.25, 0.27, 0.28])
    state = updateBlink(state, ear);
  check(
    state.count === 0,
    "Small open-eye landmark noise does not count as blinking",
  );
  for (const ear of [NaN, Infinity, 0, -1, 1]) {
    const result = updateBlink({ ...state, closed: true }, ear);
    check(
      result.count === 0 && !result.closed,
      "Invalid eye geometry cannot complete a blink",
    );
  }
  check(
    detectsSmile(0.55) && !detectsSmile(0.3) && !detectsSmile(NaN),
    "A moderate smile passes, while neutral/invalid expressions do not",
  );
  check(
    detectsHeadTurn("turn_left", 0.095) &&
      !detectsHeadTurn("turn_left", -0.095),
    "A smaller left turn passes only in the correct direction",
  );
  check(
    detectsHeadTurn("turn_right", -0.095) &&
      !detectsHeadTurn("turn_right", 0.095),
    "A smaller right turn passes only in the correct direction",
  );
  check(
    !detectsHeadTurn("turn_left", 0.05) &&
      !detectsHeadTurn("turn_right", -0.05),
    "Neutral head movement cannot pass a turn",
  );
  check(
    !detectsHeadTurn("turn_left", Infinity) &&
      !detectsHeadTurn("turn_right", NaN),
    "Invalid head landmarks cannot pass a turn",
  );
  check(
    detectsMoveCloser(0.121, 0.1) && !detectsMoveCloser(0.105, 0.1),
    "A 20% increase in face area passes without requiring the previous absolute 18% frame coverage",
  );
  for (const [area, baseline] of [
    [0.1, 0],
    [0.1, -1],
    [NaN, 0.1],
    [0.1, Infinity],
  ])
    check(
      !detectsMoveCloser(area, baseline),
      "Invalid distance baselines cannot pass movement",
    );
  const guide = faceGuide(1280, 960),
    box = {
      x: guide.x - guide.width * 0.03,
      y: guide.y + 20,
      width: guide.width * 0.6,
      height: guide.height * 0.7,
    };
  check(
    faceInsideGuide(box, 1280, 960),
    "Small drift past the drawn guide does not interrupt a valid face",
  );
  check(
    !faceInsideGuide({ ...box, x: 0 }, 1280, 960),
    "A substantially off-center face still fails positioning",
  );
  check(
    !faceInsideGuide({ ...box, x: -20 }, 1280, 960),
    "A face cut off by the camera frame still fails",
  );
  check(
    !faceInsideGuide({ ...box, width: 30, height: 40 }, 1280, 960),
    "A face too far away still fails positioning",
  );
  check(
    !faceInsideGuide({ ...box, width: NaN }, 1280, 960) &&
      !faceInsideGuide(box, 0, 0),
    "Missing frame dimensions or invalid face geometry cannot pass",
  );
  console.log(`Liveness threshold verification passed (${checks} checks).`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
