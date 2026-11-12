const assert = require("node:assert/strict"),
  path = require("node:path"),
  esbuild = require("esbuild");
const { render, button, change } = require("./verify-brims.cjs");
const report = require("./fixtures/analytics-report.cjs");
const checks = [];
function check(value, label) {
  assert.ok(value, label);
  checks.push(label);
}
const fixtureApi = `window.__calls=[];window.__report??=null;window.__pending=[];
export const supabase={rpc:async(name,args)=>{
 window.__calls.push({name,args});const data=JSON.parse(JSON.stringify(window.__report));
 if(window.__holdAnalytics)await new Promise(resolve=>window.__pending.push({args,resolve}));
 return window.__analyticsError?{data:null,error:{message:'Unable to load analytics test report'}}:{data,error:null};
}};`;
const component = `import A from './src/components/AdminAnalytics';function Test(){return <A/>}`;
const clone = () => JSON.parse(JSON.stringify(report));
(async () => {
  const built = await esbuild.build({
    stdin: {
      contents: `export * from './src/lib/analytics';export * from './src/lib/censusYears';export * from './src/lib/analyticsInsights';`,
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
  const { chartRows, monthlySeries, monthLabel, validAnalyticsData } =
    mod.exports;
  const { censusYearChange, projectCensusYears } = mod.exports;
  const year = (value, count, coverage = "complete") => ({
    year: value,
    count,
    coverage,
    age: {},
  });
  check(
    censusYearChange(year(2024, 480), year(2025, 540)).percent === 12.5,
    "Year-over-year changes use the previous year as the denominator",
  );
  check(
    censusYearChange(year(2024, 0), year(2025, 10)).percent === null,
    "A confirmed zero does not produce a percentage",
  );
  check(
    censusYearChange(year(2024, null, "missing"), year(2025, 10)) === null,
    "Missing years are never treated as zero",
  );
  check(
    projectCensusYears(
      [
        year(2023, 400),
        year(2024, 480),
        year(2025, 540),
        year(2026, 10, "partial"),
      ],
      2026,
    )?.count === 680,
    "Three consecutive complete years support a transparent linear projection",
  );
  check(
    projectCensusYears(
      [year(2023, 400), year(2024, 480, "unconfirmed"), year(2025, 540)],
      2026,
    ) === null,
    "Unconfirmed coverage suppresses projection",
  );
  const { ageGroupChanges, observedMonthlyChange } = mod.exports;
  const scenario = projectCensusYears(
    [year(2023, 400), year(2024, 480), year(2025, 540)],
    2026,
  );
  check(
    scenario?.slope === 70 &&
      scenario.scenarioLow === 660 &&
      scenario.scenarioHigh === 700,
    "Forecast scenarios repeat the two observed annual changes over the same horizon",
  );
  const movements = ageGroupChanges({ A: 8, B: 2 }, { B: 8, C: 2 });
  check(
    movements[0].label === "A" &&
      movements[0].delta === -8 &&
      movements.reduce((sum, row) => sum + row.delta, 0) === 0,
    "Diagnostic contributions include disappearing categories and offsetting movement",
  );
  const monthly = {
    section: "Activity",
    title: "Service requests",
    unit: "requests",
    kind: "trend",
    period: true,
    rows: [
      { label: "2026-08", count: 10 },
      { label: "2026-09", count: 14 },
      { label: "2026-10", count: 2 },
    ],
  };
  check(
    observedMonthlyChange(monthly, "2026-10-15", "", "")?.delta === 4,
    "Monthly comparison excludes the current month",
  );
  check(
    observedMonthlyChange(monthly, "2026-11-05", "", "2026-10-14")?.delta === 4,
    "Monthly comparison excludes a month clipped by the filter",
  );
  check(
    observedMonthlyChange(
      { ...monthly, rows: [monthly.rows[0], monthly.rows[2]] },
      "2026-11-05",
      "",
      "",
    ) === null,
    "Monthly comparisons never bridge a missing month",
  );
  const chart = {
    section: "Activity",
    title: "Activity by Month",
    unit: "events",
    period: true,
    kind: "trend",
    rows: [
      { label: "2026-03", count: 3 },
      { label: "2026-01", count: 2 },
      { label: "2026-03", count: 4 },
      { label: "Unknown date", count: 5 },
    ],
  };
  const series = monthlySeries([
    chart,
    {
      ...chart,
      title: "Second series",
      rows: [{ label: "2026-02", count: 8 }],
    },
  ]);
  check(
    JSON.stringify(series.months) === '["2026-01","2026-02","2026-03"]',
    "Timeline aligns series chronologically and fills omitted calendar months",
  );
  check(
    series.series[0].values.get("2026-03") === 7 &&
      !series.series[0].values.has("2026-02"),
    "Duplicate month counts are combined without inventing activity",
  );
  check(
    series.series[0].undated === 5,
    "Undated activity is retained separately instead of plotted as a date",
  );
  check(
    JSON.stringify(
      chartRows({
        ...chart,
        rows: [
          { label: " ", count: 2 },
          { label: "Not specified", count: 3 },
        ],
      }),
    ) === '[{"label":"Not specified","count":5}]',
    "Missing category labels are shown explicitly and combined consistently",
  );
  check(
    monthLabel("2026-11") === "Nov 2026" &&
      monthLabel("Unknown date") === "Unknown date",
    "Timeline dates have readable month/year labels while unknown values remain explicit",
  );
  check(
    validAnalyticsData(report) &&
      !validAnalyticsData({ ...report, charts: null }) &&
      !validAnalyticsData({ ...report, residentTotal: -1 }) &&
      !validAnalyticsData({
        ...report,
        charts: [{ ...chart, rows: [{ label: "a", count: NaN }] }],
      }),
    "Malformed or invalid totals cannot reach the dashboard",
  );
  const long = monthlySeries([
    {
      ...chart,
      rows: [
        { label: "1900-01", count: 1 },
        { label: "2026-11", count: 2 },
      ],
    },
  ]);
  check(
    long.sparse && long.months.length === 2,
    "Unusually long histories bound rendering while retaining dated observations",
  );
  let t = await render(component, fixtureApi, (w) => {
    w.__report = clone();
  });
  const article = (title) =>
    [...t.w.document.querySelectorAll("article")].find(
      (a) => a.getAttribute("aria-label") === title,
    );
  check(
    t.w.document.querySelector("h2").textContent === "Barangay Analytics" &&
      button(t.w, "Descriptive").getAttribute("aria-pressed") === "true",
    "Analytics opens the new overview with the established barangay heading",
  );
  check(
    t.w.document
      .querySelector('[aria-label="Analytics summary"]')
      .textContent.includes("1,470") &&
      t.w.document
        .querySelector('[aria-label="Analytics summary"]')
        .textContent.includes("₱21,450.00"),
    "Summary cards show the server cohort total and properly formatted PHP collections",
  );
  check(
    t.w.document
      .querySelector('[aria-label="Analytics summary"]')
      .textContent.includes("83.7%"),
    "Verification rate uses verified residents divided by the selected cohort",
  );
  check(
    article("Residents by Registration Status").querySelectorAll(
      "circle[stroke-dasharray]",
    ).length === 3 &&
      article("Residents by Sex").querySelector("svg") &&
      article("Appointments by Status").querySelector("svg"),
    "Overview renders resident status, sex and appointment distributions as three donut panels",
  );
  check(
    article("Residents by Registration Status").querySelector("text")
      .textContent === "1,470",
    "Donut center shows its actual category total",
  );
  const requests = t.w.__calls.length;
  await t.tick(() =>
    article("Residents by Registration Status").querySelector("button").focus(),
  );
  check(
    article("Residents by Registration Status").querySelector(
      'circle[stroke-width="27"]',
    ) && t.w.__calls.length === requests,
    "Donut legends are keyboard accessible and highlight their segment without refetching",
  );
  await t.tick(
    () =>
      (t.w.document.querySelector(
        '[aria-label="Inspect activity month"]',
      ).value = "2026-06"),
  );
  await t.tick(() =>
    t.w.document
      .querySelector('[aria-label="Inspect activity month"]')
      .dispatchEvent(new t.w.Event("change", { bubbles: true })),
  );
  check(
    article("Monthly Activity Overview")
      .querySelector("output")
      .textContent.includes("Registrations 120") &&
      article("Monthly Activity Overview")
        .querySelector("output")
        .textContent.includes("Verifications 80"),
    "Month inspection exposes exact aligned counts from the response",
  );
  await t.tick(() => button(t.w, "Resident Verifications").click());
  check(
    button(t.w, "Resident Verifications").getAttribute("aria-pressed") ===
      "false" &&
      !article("Monthly Activity Overview")
        .querySelector("output")
        .textContent.includes("Verifications"),
    "Timeline legend toggles a series and its inspected value",
  );
  for (const title of [
    "Resident Registrations",
    "Service Requests",
    "Receipt-Backed Completions",
  ])
    await t.tick(() => button(t.w, title).click());
  check(
    article("Monthly Activity Overview").textContent.includes(
      "Select a series above",
    ),
    "Hiding every timeline series displays a clear recovery state",
  );
  await t.tick(() => button(t.w, "Resident Registrations").click());
  check(
    article("Monthly Activity Overview").querySelector("svg") &&
      !article("Monthly Activity Overview")
        .querySelector("svg")
        .outerHTML.includes("NaN"),
    "Timeline can restore a hidden series with valid chart geometry",
  );
  const sectionNames = [
    ...t.w.document.querySelectorAll(
      '[aria-label="Analytics sections"] button',
    ),
  ].map((el) => el.textContent);
  check(
    JSON.stringify(sectionNames) ===
      JSON.stringify([
        "Descriptive",
        "Diagnostic",
        "Predictive",
        "Prescriptive",
      ]),
    "Four labeled analytics types are available",
  );
  const group = (name) =>
    t.tick(() => {
      const select = t.w.document.querySelector(
        '[aria-label="Statistics group"]',
      );
      select.value = name;
      select.dispatchEvent(new t.w.Event("change", { bubbles: true }));
    });
  for (const section of [...new Set(report.charts.map((c) => c.section))]) {
    await group(section);
    const expected = report.charts.filter((c) => c.section === section);
    check(
      expected.every((c) => article(c.title)),
      `The ${section} group retains every available statistic`,
    );
  }
  await group("Residents");

  check(
    article("Residents by Selected Category").textContent.includes(
      "category counts can exceed the resident total",
    ) && !article("Residents by Selected Category").querySelector("circle"),
    "Multi-selection categories retain their interpretation and use independent bars",
  );
  const dataDetails = article("Residents by Selected Category").querySelector(
    "details",
  );
  await t.tick(() => dataDetails.querySelector("summary").click());
  check(
    dataDetails.open &&
      dataDetails.querySelector("table").textContent.includes("650"),
    "View Data opens an accessible table of exact chart values",
  );
  check(
    t.w.document.body.textContent.includes(
      "3 duplicate account records excluded.",
    ) &&
      t.w.document.body.textContent.includes(
        "Address groups are not verified household counts",
      ),
    "Duplicate handling and address-group limitations remain available",
  );
  check(
    t.w.document.body.textContent.includes("lack linked receipts") &&
      t.w.document.querySelector('a[href*="tab=legacy"]'),
    "Legacy appointment receipt reconciliation stays visible",
  );
  const date = t.w.document.querySelector('[aria-label="Activity From"]'),
    through = t.w.document.querySelector('[aria-label="Activity Through"]');
  await t.tick(() => change(t.w, date, "2026-10-01"));
  await t.tick(() => change(t.w, through, "2026-10-31"));
  check(
    t.w.__calls.at(-1).args.p_from === "2026-10-01" &&
      t.w.__calls.at(-1).args.p_to === "2026-10-31" &&
      t.w.__calls.at(-1).args.p_status === "all",
    "Inclusive date inputs preserve the existing analytics RPC contract",
  );
  check(
    t.w.document
      .querySelector('[aria-label="Analytics summary"]')
      .textContent.includes("1,470") &&
      t.w.document.body.textContent.includes("Current totals stay unchanged"),
    "Activity filters distinguish snapshot totals from period activity",
  );
  const count = t.w.__calls.length;
  await t.tick(() => change(t.w, date, "2026-11-01"));
  check(
    t.w.__calls.length === count &&
      t.w.document
        .querySelector('[role="alert"]')
        .textContent.includes("start date must precede") &&
      !t.w.document.querySelector('[aria-label="Analytics summary"]'),
    "Invalid date ranges are rejected before fetching and do not leave stale charts visible",
  );
  await t.tick(() => button(t.w, "Reset Filters").click());
  check(
    !date.value &&
      !through.value &&
      t.w.__calls.at(-1).args.p_from === null &&
      t.w.__calls.at(-1).args.p_to === null,
    "Reset Filters restores the full-date view",
  );
  const status = t.w.document.querySelector('[aria-label="Resident Status"]');
  await t.tick(() => {
    status.value = "verified";
    status.dispatchEvent(new t.w.Event("change", { bubbles: true }));
  });
  check(
    t.w.__calls.at(-1).args.p_status === "verified",
    "Resident-status filtering remains server-side",
  );
  await t.tick(() => {
    t.w.__analyticsError = true;
    button(t.w, "Refresh").click();
  });
  check(
    t.w.document
      .querySelector('[role="alert"]')
      .textContent.includes("Unable to load") &&
      !t.w.document.querySelector('[aria-label="Analytics summary"]'),
    "A failed refresh removes stale charts and provides an explicit error",
  );
  await t.tick(() => {
    t.w.__analyticsError = false;
    button(t.w, "Retry").click();
  });
  check(
    t.w.document.querySelector('[aria-label="Analytics summary"]'),
    "Failed analytics requests can be retried successfully",
  );
  check(
    t.w.__calls.every((c) => c.name === "admin_system_analytics"),
    "Charts use only the existing protected aggregate endpoint",
  );
  check(
    t.errors.length === 0,
    "Dashboard filters, charts, data tables and recovery have no React/runtime errors",
  );
  await t.close();
  t = await render(component, fixtureApi, (w) => {
    w.__report = clone();
  });
  await t.tick(() => {
    t.w.__holdAnalytics = true;
    t.w.__report.residentTotal = 111;
    t.w.__report.verifiedResidents = 100;
    change(
      t.w,
      t.w.document.querySelector('[aria-label="Activity From"]'),
      "2026-10-01",
    );
  });
  check(
    !t.w.document.querySelector('[aria-label="Analytics summary"]'),
    "Changing filters hides previous-cohort statistics while the new response is pending",
  );
  await t.tick(() => {
    t.w.__report.residentTotal = 222;
    t.w.__report.verifiedResidents = 200;
    change(
      t.w,
      t.w.document.querySelector('[aria-label="Activity Through"]'),
      "2026-10-31",
    );
  });
  await t.tick(() => t.w.__pending[1].resolve());
  await t.tick(() => t.w.__pending[0].resolve());
  check(
    t.w.document
      .querySelector('[aria-label="Analytics summary"]')
      .textContent.includes("222") &&
      !t.w.document
        .querySelector('[aria-label="Analytics summary"]')
        .textContent.includes("111"),
    "A delayed older response cannot overwrite the latest selected filters",
  );
  check(
    t.errors.length === 0,
    "Delayed analytics requests have no runtime errors",
  );
  await t.close();
  t = await render(component, fixtureApi, (w) => {
    w.__report = {
      ...clone(),
      residentTotal: 0,
      verifiedResidents: 0,
      addressGroups: 0,
      postedPayments: 0,
      charts: report.charts.map((c) => ({ ...c, rows: [] })),
    };
  });
  check(
    t.w.document.body.textContent.includes(
      "No records available for this statistic.",
    ) && t.w.document.body.textContent.includes("No dated activity available"),
    "Empty aggregates have useful chart and timeline empty states",
  );
  check(
    !t.w.document.querySelector('svg[aria-label*="NaN"]') &&
      !t.w.document.body.textContent.includes("NaN"),
    "Empty data never produces invalid rates or chart values",
  );
  check(
    t.errors.length === 0,
    "Empty analytics sections render without runtime errors",
  );
  await t.close();
  t = await render(component, fixtureApi, (w) => {
    w.__report = { ...clone(), charts: [] };
  });
  check(
    t.w.document.body.textContent.includes(
      "No analytics records are available yet",
    ),
    "A report with no chart definitions has a useful overview empty state",
  );
  await t.close();
  t = await render(
    `import {AnalyticsChartCard} from './src/components/AnalyticsCharts';function Test(){return <AnalyticsChartCard chart={${JSON.stringify(
      {
        ...chart,
        rows: [
          { label: "2026-11", count: 7 },
          { label: "Unknown date", count: 2 },
        ],
      },
    )}}/>}`,
  );
  check(
    t.w.document
      .querySelector("article")
      .textContent.includes("2 records without a valid month") &&
      t.w.document.querySelector("table").textContent.includes("Unknown Date"),
    "Undated records remain visible in exact data instead of becoming timeline points",
  );
  check(
    !t.w.document.querySelector('svg[role="img"]').outerHTML.includes("NaN"),
    "A single recorded month has valid chart coordinates",
  );
  check(
    t.errors.length === 0,
    "Single-month and undated timeline data render without runtime errors",
  );
  await t.close();
  t = await render(component, fixtureApi, (w) => {
    w.__report = { residentTotal: 7 };
  });
  check(
    t.w.document
      .querySelector('[role="alert"]')
      .textContent.includes("incomplete report") &&
      !t.w.document.querySelector('[aria-label="Analytics summary"]'),
    "An incomplete server response shows a retryable error without crashing",
  );
  await t.close();
  t = await render(component, fixtureApi, (w) => {
    w.__report = {
      ...clone(),
      censusYears: [
        { ...year(2023, 400), age: { Adults: 390, Youth: 10 } },
        { ...year(2024, 480), age: { Adults: 460, Youth: 20 } },
        { ...year(2025, 540), age: { Adults: 525, Youth: 15 } },
      ],
    };
  });
  check(
    t.w.document
      .querySelector('[aria-label="Key findings"]')
      ?.textContent.includes("recorded respondents"),
    "Descriptive findings distinguish the cohort from the population",
  );
  await t.tick(() => button(t.w, "Diagnostic").click());
  check(
    t.w.document
      .querySelector('[aria-label="Age group changes"]')
      ?.textContent.includes("20 → 15"),
    "Diagnostic displays declines as well as increases",
  );
  await t.tick(() => button(t.w, "Predictive").click());
  check(
    t.w.document.body.textContent.includes("660–700 submissions") &&
      t.w.document.body.textContent.includes("not a confidence interval"),
    "Predictive shows a labeled scenario range with its caveat",
  );
  await t.tick(() => button(t.w, "Prescriptive").click());
  check(
    t.w.document
      .querySelector("details[open]")
      ?.textContent.includes("How to check progress"),
    "Prescriptive puts next steps and follow-up measures directly in view",
  );
  check(
    t.errors.length === 0,
    "All four analytics views render without runtime errors",
  );
  await t.close();
  console.log(
    `Analytics dashboard verification passed (${checks.length} checks).`,
  );
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
