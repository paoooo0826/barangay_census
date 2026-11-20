const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  esbuild = require("esbuild");
const { render } = require("./verify-brims.cjs");
const cases = require("./fixtures/moderation-cases.json");
(async () => {
  const built = await esbuild.build({
    stdin: {
      contents:
        "export * from './src/lib/forecast';export * from './src/lib/profanity';export * from './src/lib/captureQuality';",
      loader: "ts",
      resolveDir: path.resolve(__dirname, ".."),
    },
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
  });
  const mod = { exports: {} };
  new Function("module", "exports", built.outputFiles[0].text)(
    mod,
    mod.exports,
  );
  const {
    forecastAnnual,
    hasProfanity,
    requireRespectfulText,
    captureQuality,
  } = mod.exports;
  const years = [2021, 2022, 2023, 2024, 2025].map((year, i) => ({
    year,
    count: 100 + i * 10,
    coverage: "complete",
    age: {},
  }));
  const f = forecastAnnual(years, 2026, 5);
  assert.deepEqual(f.points, [
    { year: 2026, count: 150 },
    { year: 2027, count: 160 },
    { year: 2028, count: 170 },
    { year: 2029, count: 180 },
    { year: 2030, count: 190 },
  ]);
  const nonlinear = forecastAnnual(
    years.slice(0, 4).map((r, i) => ({ ...r, count: i === 3 ? 160 : r.count })),
    2025,
    1,
  );
  assert.equal(nonlinear.mae, 30);
  assert.equal(nonlinear.mape, 18.75);
  assert.equal(f.mae, 0);
  assert.equal(f.mape, 0);
  assert.equal(f.validation.length, 2);
  assert.equal(forecastAnnual(years.slice(2), 2026, 1), null);
  assert.equal(
    forecastAnnual(
      years.map((r) => ({ ...r, coverage: "unconfirmed" })),
      2026,
      1,
    ),
    null,
  );
  assert.equal(forecastAnnual([...years, years[0]], 2026, 1), null);
  assert.equal(
    forecastAnnual(
      years.filter((r) => r.year !== 2024),
      2026,
      1,
    ),
    null,
  );
  assert.equal(forecastAnnual(years, 2026, 2), null);
  assert.equal(
    forecastAnnual(
      years.map((r) => ({ ...r, count: 0 })),
      2026,
      1,
    ).mape,
    null,
  );
  assert.deepEqual(forecastAnnual([...years].reverse(), 2026, 1).points, [
    { year: 2026, count: 150 },
  ]);
  for (const value of cases.blocked)
    assert.equal(hasProfanity(value), true, "A configured bypass was missed");
  for (const value of cases.clean)
    assert.equal(hasProfanity(value), false, "Legitimate text was rejected");
  assert.throws(
    () => requireRespectfulText("BWI$IT", "Feedback"),
    /^Error: Feedback:/,
  );
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      "../supabase/migrations/20261120124600_expanded_moderation.sql",
    ),
    "utf8",
  );
  assert.ok(
    migration.startsWith(require("./generate-profanity-sql.cjs").sql),
    "Database word rules must be regenerated when the central list changes",
  );
  const pixels = (dark, flat) => {
    const data = new Uint8ClampedArray(64 * 64 * 4);
    for (let p = 0; p < 64 * 64; p++) {
      const value = flat ? 100 : dark ? 8 + (p % 2) * 8 : 55 + (p % 2) * 60;
      data.set([value, value, value, 255], p * 4);
    }
    return data;
  };
  assert.equal(captureQuality(pixels(false, false), 64, 64).acceptable, true);
  assert.equal(captureQuality(pixels(false, true), 64, 64).acceptable, false);
  assert.equal(captureQuality(pixels(true, false), 64, 64).acceptable, false);
  assert.equal(
    captureQuality(new Uint8ClampedArray(), 64, 64).acceptable,
    false,
  );
  const report = {
    reportDate: "2026-11-20",
    generatedAt: "2026-11-20T12:00:00Z",
    civil: [
      { label: "Single", count: 2 },
      { label: "Married", count: 1 },
    ],
    annual: years.map((r) => ({ ...r, coverage: "unconfirmed" })),
    monthly: Array.from({ length: 12 }, (_, i) => ({
      year: 2026,
      month: i + 1,
      newBoarders: i === 7 ? 3 : i === 11 ? null : 0,
      activeBoarders: i === 11 ? null : 3,
      partial: i === 10,
    })),
    barangays: ["Old Lucban"],
    years: [2026, 2025],
    datedStays: 3,
    duplicateRecords: 0,
  };
  const api = `window.__calls=[];export const supabase={rpc:async(name,args)=>{window.__calls.push({name,args});return {data:${JSON.stringify(report)},error:null}}};`;
  let t = await render(
    "import A from './src/components/PlanningAnalytics';function Test(){return <A section='Descriptive' refreshKey='0'/>}",
    api,
  );
  assert.ok(
    t.w.document.body.textContent.includes("Residents by Civil Status"),
  );
  assert.ok(t.w.document.body.textContent.includes("peaked in Aug: 3"));
  assert.ok(t.w.__calls[0].args.p_status === "verified");
  const control = [...t.w.document.querySelectorAll("label")]
    .find((el) => el.textContent.startsWith("Boarding measure"))
    .querySelector("select");
  await t.tick(() => {
    control.value = "active";
    control.dispatchEvent(new t.w.Event("change", { bubbles: true }));
  });
  assert.ok(
    ![...t.w.document.querySelectorAll("button")].some((b) =>
      b.textContent.includes("New boarders"),
    ),
  );
  assert.equal(t.errors.length, 0);
  await t.close();
  t = await render(
    "import A from './src/components/ForecastPanel';function Test(){return <A years={" +
      JSON.stringify(years) +
      "} reportDate='2026-11-20' generatedAt='2026-11-20T12:00:00Z'/>}",
    api,
  );
  assert.ok(t.w.document.body.textContent.includes("Forecast calculated"));
  assert.ok(t.w.document.body.textContent.includes("150"));
  assert.equal(t.errors.length, 0);
  await t.close();
  const mainReport = require("./fixtures/analytics-report.cjs");
  t = await render(
    "import A from './src/components/AdminAnalytics';function Test(){return <A/>}",
    `window.__requests=[];export const supabase={rpc:async(name,args)=>{window.__requests.push(name);return {data:name==='admin_planning_analytics'?${JSON.stringify(report)}:${JSON.stringify(mainReport)},error:null}},channel(){return {on(_type,filter,callback){window.__revisionFilter=filter;window.__revision=callback;return this},subscribe(){return this}}},removeChannel:async()=>{window.__removed=true}};`,
  );
  const before = t.w.__requests.length;
  await t.tick(() => {
    const timer = t.w.setTimeout.bind(t.w);
    t.w.setTimeout = (fn, d) => timer(fn, Math.min(d, 1));
    t.w.__revision();
  });
  await t.tick();
  assert.equal(t.w.__revisionFilter.table, "analytics_refresh_state");
  assert.ok(
    t.w.__requests.length >= before + 2,
    "A revision refreshes both protected reports",
  );
  assert.equal(t.errors.length, 0);
  await t.close();
  process.exitCode = 0;
  console.log(
    "Planning, forecast backtesting, capture quality, moderation parity source and interactive charts passed.",
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
