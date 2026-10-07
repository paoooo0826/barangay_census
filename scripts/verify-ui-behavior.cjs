const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const { JSDOM, VirtualConsole } = require("jsdom");
const project = path.resolve(__dirname, "..");
const checks = [];
function check(value, label) {
  assert.ok(value, label);
  checks.push(label);
}
async function render(source, api = "export const supabase = {};") {
  const built = await esbuild.build({
    stdin: {
      contents: `import {act} from 'react';window.__act=act;${source}`,
      resolveDir: project,
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: {
      "process.env.NODE_ENV": '"development"',
      "import.meta.env.BASE_URL": '"/"',
    },
    loader: { ".png": "dataurl" },
    plugins: [
      {
        name: "isolated-ui",
        setup(build) {
          build.onResolve({ filter: /\/context\/AuthContext$/ }, () => ({
            path: "auth",
            namespace: "ui-test",
          }));
          build.onResolve({ filter: /\/lib\/supabase$/ }, () => ({
            path: "api",
            namespace: "ui-test",
          }));
          build.onResolve(
            { filter: /FaceIdentityVerification$|IdCameraCapture$/ },
            () => ({ path: "camera", namespace: "ui-test" }),
          );
          build.onLoad({ filter: /.*/, namespace: "ui-test" }, (args) => ({
            loader: "tsx",
            contents:
              args.path === "auth"
                ? `const user={id:'u0',email:'resident@test.invalid'};const adminProfile={full_name:'Test Admin'};export const useAuth=()=>({user,adminProfile,signIn:async()=>{window.__signCalls++;return{error:null}}});`
                : args.path === "camera"
                  ? "export default function Camera(){return null;}"
                  : api,
          }));
        },
      },
    ],
  });
  const errors = [];
  const vc = new VirtualConsole();
  vc.on("error", (...a) => errors.push(a.join(" ")));
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://ui-test.invalid",
    runScripts: "dangerously",
    virtualConsole: vc,
    beforeParse(w) {
      w.IS_REACT_ACT_ENVIRONMENT = true;
      w.__signCalls = 0;
      w.MessageChannel = require("node:worker_threads").MessageChannel;
      w.__desktop = false;
      w.__mediaListeners = new Set();
      w.matchMedia = () => ({
        get matches() {
          return w.__desktop;
        },
        addEventListener: (_type, fn) => w.__mediaListeners.add(fn),
        removeEventListener: (_type, fn) => w.__mediaListeners.delete(fn),
      });
      w.__scrolls = [];
      w.HTMLElement.prototype.scrollIntoView = function () {
        w.__scrolls.push(this.id);
      };
      w.URL.createObjectURL = () => "blob:test";
      w.URL.revokeObjectURL = () => {};
    },
  });
  const w = dom.window;
  w.eval(built.outputFiles[0].text);
  const tick = (fn) =>
    w.__act(async () => {
      fn?.();
      await new Promise((r) => setTimeout(r, 15));
    });
  await tick(() => w.__mount());
  await tick();
  return {
    w,
    dom,
    errors,
    tick,
    close: async () => {
      await tick(() => w.__unmount());
      dom.window.close();
    },
  };
}
(async () => {
  const a = await render(
    `import {createRoot} from 'react-dom/client';import ResidentAuth from './src/pages/ResidentAuth';const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<ResidentAuth onBack={()=>{}} onLoginSuccess={()=>{}} onRegisterClick={()=>{}}/>);window.__unmount=()=>root.unmount();`,
  );
  const d = a.w.document;
  check(
    d.querySelector("#resident-email").labels[0].textContent.includes("Email"),
    "Resident email label is linked to its input",
  );
  check(
    d
      .querySelector("#resident-password")
      .labels[0].textContent.includes("Password"),
    "Resident password has a linked label and autocomplete",
  );
  await a.tick(() => d.querySelector('[aria-label="Show password"]').click());
  check(
    d.querySelector("#resident-password").type === "text",
    "Password visibility toggle still works after the shared auth layout",
  );
  await a.tick(() =>
    d
      .querySelector("form")
      .dispatchEvent(
        new a.w.Event("submit", { bubbles: true, cancelable: true }),
      ),
  );
  check(
    d.querySelector("#resident-email").getAttribute("aria-invalid") ===
      "true" && a.w.__signCalls === 0,
    "Empty resident login shows field errors without an auth request",
  );
  check(
    a.errors.length === 0,
    "Resident auth renders and validates without React/runtime errors",
  );
  await a.close();

  const api = fs.readFileSync(
    path.join(project, "scripts/fixtures/admin-api.js"),
    "utf8",
  );
  const m = await render(
    `import {createRoot} from 'react-dom/client';import AdminDashboard from './src/pages/AdminDashboard';const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<AdminDashboard onLogout={()=>{}} onReview={()=>{}}/>);window.__unmount=()=>root.unmount();`,
    api,
  );
  const md = m.w.document;
  const open = md.querySelector('[aria-label="Open navigation"]');
  open.focus();
  await m.tick(() => open.click());
  const dialog = md.querySelector("[role=dialog]");
  check(
    dialog?.contains(md.activeElement) && md.body.style.overflow === "hidden",
    "Mobile navigation receives focus and prevents background scrolling",
  );
  const buttons = [...dialog.querySelectorAll("button,a[href]")];
  buttons.at(-1).focus();
  await m.tick(() =>
    md.dispatchEvent(
      new m.w.KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  check(
    md.activeElement === buttons[0],
    "Keyboard Tab stays within the open mobile navigation",
  );
  await m.tick(() =>
    md.dispatchEvent(
      new m.w.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  check(
    !md.querySelector("[role=dialog]") &&
      md.body.style.overflow === "" &&
      md.activeElement === open,
    "Escape closes the menu, restores scrolling and returns focus",
  );
  await m.tick(() => open.click());
  await m.tick(() =>
    md.querySelector('[aria-label="Close navigation"]').click(),
  );
  check(
    !md.querySelector("[role=dialog]") && md.body.style.overflow === "",
    "Backdrop dismissal closes without submitting or keeping scroll locked",
  );
  await m.tick(() => open.click());
  await m.tick(() => {
    m.w.__desktop = true;
    m.w.__mediaListeners.forEach((fn) => fn());
  });
  check(
    !md.querySelector("[role=dialog]") && md.body.style.overflow === "",
    "Moving to desktop closes the hidden mobile menu and releases scrolling",
  );
  check(
    m.errors.length === 0,
    "Admin menu interactions have no React/runtime errors",
  );
  await m.close();

  const emptyApi = `export const supabase={from:()=>({select(){return this},eq(){return this},order(){return this},maybeSingle:async()=>({data:null,error:null}),then:resolve=>Promise.resolve({data:[],error:null}).then(resolve)})};`;
  const c = await render(
    `import {createRoot} from 'react-dom/client';import CensusForm from './src/pages/CensusForm';const root=createRoot(document.getElementById('root'));window.location.hash='/resident/census';window.__mount=()=>root.render(<CensusForm onDashboard={()=>{}}/>);window.__unmount=()=>root.unmount();`,
    emptyApi,
  );
  const cd = c.w.document;
  const nav = cd.querySelector('[aria-label="Census form sections"]');
  const hash = c.w.location.hash;
  await c.tick(() => nav.querySelectorAll("button")[2].click());
  check(
    c.w.__scrolls.at(-1) === "census-education" && c.w.location.hash === hash,
    "Census section shortcuts scroll to the section without breaking hash routing",
  );
  check(
    cd.activeElement === cd.querySelector("#census-education h2"),
    "Census shortcuts move keyboard focus to the selected section",
  );
  check(
    [
      ...cd.querySelectorAll(
        "input[data-field],select[data-field],textarea[data-field]",
      ),
    ].every((el) => el.labels.length > 0),
    "Visible census controls all retain an associated label",
  );
  check(
    cd.querySelector("[data-field=email_address]").readOnly &&
      cd.querySelector("[data-field=email_address]").value ===
        "resident@test.invalid",
    "Account-linked census email remains protected",
  );
  check(
    c.errors.length === 0,
    "Census section navigation has no React/runtime errors",
  );
  const boardingRadio = (status) =>
    cd.querySelector(`input[name="boarding_status"][value="${status}"]`);
  check(
    cd.querySelectorAll('input[name="boarding_status"]').length === 3 &&
      boardingRadio("neither").checked &&
      !cd.querySelector("#census-boarding_house_name"),
    "New census defaults to one mutually exclusive Boarding Status with no irrelevant fields",
  );
  await c.tick(() => boardingRadio("boarder").click());
  check(
    cd.querySelector("#census-boarding_landlord_name") &&
      cd.querySelector("#census-boarding_start_date") &&
      !cd.querySelector("#census-boarding_tenant_count"),
    "Boarder selection shows only the appropriate boarding fields",
  );
  const submitCensus = () =>
    [...cd.querySelectorAll("button")]
      .find((el) => el.textContent.includes("Submit Census Form"))
      .click();
  await c.tick(submitCensus);
  check(
    cd
      .querySelector("#census-boarding_house_name")
      .getAttribute("aria-invalid") === "true" &&
      cd.querySelector("#census-boarding_house_name-error"),
    "Missing visible Boarder fields receive linked red validation feedback",
  );
  await c.tick(() => boardingRadio("landlord").click());
  check(
    cd.querySelector("#census-boarding_tenant_count") &&
      cd.querySelector("#census-boarding_contact") &&
      !cd.querySelector("#census-boarding_landlord_name") &&
      !cd.querySelector("#census-boarding_start_date"),
    "Landlord selection hides Boarder-only controls and exposes landlord fields",
  );
  await c.tick(submitCensus);
  check(
    cd
      .querySelector("#census-boarding_tenant_count")
      .getAttribute("aria-invalid") === "true",
    "Landlord validation requires a tenant count while Boarder fields are hidden",
  );
  await c.tick(() => boardingRadio("neither").click());
  await c.tick(submitCensus);
  check(
    !cd.querySelector("#census-boarding_house_name") &&
      !cd.querySelector('[id^="census-boarding_"][aria-invalid="true"]'),
    "Changing to Neither removes boarding fields and their validation errors",
  );
  check(
    c.errors.length === 0,
    "Boarding status selection and validation have no React/runtime errors",
  );
  await c.close();
  const n = await render(
    `import {createRoot} from 'react-dom/client';import AnnouncementSections from './src/components/AnnouncementSections';import {isRecentAnnouncement} from './src/lib/announcements';const root=createRoot(document.getElementById('root'));window.__isRecent=isRecentAnnouncement;const now=Date.now();const base={is_published:true,archived:false,expires_at:null};window.__items=[{...base,id:'new',title:'New notice',published_at:new Date(now-86400000).toISOString()},{...base,id:'old',title:'Older notice',published_at:new Date(now-14*86400000).toISOString()},{...base,id:'draft',title:'Draft',is_published:false,published_at:new Date(now).toISOString()}];window.__ungrouped=false;window.__mount=()=>root.render(<AnnouncementSections items={window.__items} groupRecent={!window.__ungrouped}>{(item,recent)=><article key={item.id} data-recent={recent}>{item.title}</article>}</AnnouncementSections>);window.__unmount=()=>root.unmount();`,
  );
  const nd = n.w.document;
  check(
    nd
      .querySelector('[aria-label="Recent Announcements"]')
      .querySelectorAll("article").length === 1 &&
      nd
        .querySelector('[aria-label="Earlier Announcements"]')
        .querySelectorAll("article").length === 2,
    "Recent notices are separated; older posts and drafts remain available",
  );
  check(
    nd.querySelector('[data-recent="true"]').textContent === "New notice",
    "Only the recently published notice receives the highlight",
  );
  const now = Date.parse("2026-10-06T12:00:00Z");
  const baseNotice = {
    is_published: true,
    archived: false,
    expires_at: null,
    published_at: new Date(now - 86400000).toISOString(),
  };
  for (const [patch, expected, label] of [
    [
      { published_at: new Date(now).toISOString() },
      true,
      "A just-published announcement is recent",
    ],
    [
      { published_at: new Date(now - 7 * 86400000 + 1).toISOString() },
      true,
      "The recent window includes notices younger than seven days",
    ],
    [
      { published_at: new Date(now - 7 * 86400000).toISOString() },
      false,
      "A notice leaves Recent at the seven-day boundary",
    ],
    [
      { published_at: new Date(now + 60000).toISOString() },
      false,
      "Future publication dates do not receive a recent badge",
    ],
    [
      { published_at: null },
      false,
      "Missing publication dates do not look new",
    ],
    [{ published_at: "invalid" }, false, "Invalid dates do not look new"],
    [
      { archived: true },
      false,
      "Archived announcements are never highlighted as recent",
    ],
    [
      { is_published: false },
      false,
      "Unpublished announcements are never highlighted as recent",
    ],
    [
      { expires_at: new Date(now).toISOString() },
      false,
      "Expired announcements are no longer highlighted",
    ],
    [
      { expires_at: new Date(now + 86400000).toISOString() },
      true,
      "An unexpired recent notice retains its highlight",
    ],
  ])
    check(n.w.__isRecent({ ...baseNotice, ...patch }, now) === expected, label);
  await n.tick(() => {
    n.w.__ungrouped = true;
    n.w.__mount();
  });
  check(
    !nd.querySelector('[aria-label="Recent Announcements"]') &&
      nd.querySelectorAll("article").length === 3,
    "Archive-style lists preserve all records without recent grouping",
  );
  check(
    n.errors.length === 0,
    "Announcement grouping renders without React/runtime errors",
  );
  const later = n.w.Date.now() + 120_000;
  n.w.Date.now = () => later;
  await n.tick(() => {
    n.w.__ungrouped = false;
    n.w.__items = [
      ...n.w.__items,
      {
        is_published: true,
        archived: false,
        expires_at: null,
        id: "just-posted",
        title: "Just published",
        published_at: new n.w.Date(later).toISOString(),
      },
    ];
    n.w.__mount();
  });
  check(
    [
      ...nd.querySelectorAll('[aria-label="Recent Announcements"] article'),
    ].some((el) => el.textContent === "Just published"),
    "Newly received announcements are highlighted immediately without waiting for the clock timer",
  );
  n.w.Date.now = () => later + 7 * 86_400_000;
  await n.tick(() => {
    n.w.__items = [...n.w.__items];
    n.w.__mount();
  });
  check(
    !nd.querySelector('[aria-label="Recent Announcements"]') &&
      nd.querySelectorAll("article").length === 4,
    "Refreshing the list after seven days moves posts to Earlier without losing them",
  );
  await n.close();
  const preview = await render(
    `import {createRoot} from 'react-dom/client';import AdminAnnouncements from './src/components/AdminAnnouncements';const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<AdminAnnouncements adminProfileId="profile"/>);window.__unmount=()=>root.unmount();`,
    api,
  );
  const pd = preview.w.document;
  const photoButton = pd.querySelector("article button");
  preview.w.__desktop = true;
  photoButton.focus();
  await preview.tick(() => photoButton.click());
  const photoDialog = pd.querySelector('[role="dialog"]');
  check(
    photoDialog?.contains(pd.activeElement) &&
      pd.body.style.overflow === "hidden",
    "Announcement image preview opens and retains keyboard focus on desktop",
  );
  await preview.tick(() => photoDialog.querySelector("img").click());
  check(
    Boolean(pd.querySelector('[role="dialog"]')),
    "Clicking inside the image preview does not dismiss it",
  );
  const closePhoto = photoDialog.querySelector(
    '[aria-label="Close image preview"]',
  );
  await preview.tick(() =>
    pd.dispatchEvent(
      new preview.w.KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  check(
    pd.activeElement === closePhoto,
    "Tab stays within the image preview rather than reaching background controls",
  );
  await preview.tick(() =>
    pd.dispatchEvent(
      new preview.w.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  check(
    !pd.querySelector('[role="dialog"]') &&
      pd.body.style.overflow === "" &&
      pd.activeElement === photoButton,
    "Escape closes the preview, releases scrolling, and returns focus to its photo button",
  );
  await preview.tick(() => photoButton.click());
  await preview.tick(() => pd.querySelector('[role="dialog"]').click());
  check(
    !pd.querySelector('[role="dialog"]') && pd.body.style.overflow === "",
    "Clicking outside a preview dismisses it without a mutation",
  );
  await preview.tick(() => photoButton.click());
  await preview.tick(() =>
    pd.querySelector('[aria-label="Close image preview"]').click(),
  );
  check(
    !pd.querySelector('[role="dialog"]'),
    "The image preview Close button remains functional",
  );
  check(
    preview.w.__requests.every((request) => request.operation === "select"),
    "Preview interactions never archive, delete, or update an announcement",
  );
  check(
    preview.errors.length === 0,
    "Image preview interactions have no React/runtime errors",
  );
  await preview.close();
  const appointment = await render(
    `import {useState} from 'react';import {createRoot} from 'react-dom/client';import {AdminAppointmentDetails} from './src/components/AdminAppointments';const root=createRoot(document.getElementById('root'));const record={id:'a0',service_type:'certificate_of_residency',service_purpose:'low_income',status:'pending',fee:30,purpose:'Test request',appointment_date:'2026-10-07',appointment_time:'09:00:00',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z',residents:{first_name:'Test',last_name:'Resident'}};function App(){const [open,setOpen]=useState(false);return <><button id="open-details" onClick={()=>setOpen(true)}>View appointment</button>{open&&<AdminAppointmentDetails appointment={record} onClose={()=>setOpen(false)}/>}</>}window.__mount=()=>root.render(<App/>);window.__unmount=()=>root.unmount();`,
    api,
  );
  const ad = appointment.w.document;
  const detailsButton = ad.querySelector("#open-details");
  detailsButton.focus();
  await appointment.tick(() => detailsButton.click());
  check(
    ad
      .querySelector('[aria-label="Appointment details"]')
      ?.contains(ad.activeElement) && ad.body.style.overflow === "hidden",
    "Appointment details receive focus and stop background scrolling",
  );
  await appointment.tick(() =>
    ad.dispatchEvent(
      new appointment.w.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  check(
    !ad.querySelector('[role="dialog"]') &&
      ad.activeElement === detailsButton &&
      ad.body.style.overflow === "",
    "Escape dismisses appointment details and restores the opening control",
  );
  check(
    appointment.errors.length === 0,
    "Appointment detail dialogs have no React/runtime errors",
  );
  await appointment.close();
  const residence = await render(
    `import {createRoot} from 'react-dom/client';import ResidencyDetails from './src/components/ResidencyDetails';const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<ResidencyDetails residentId="r0" admin/>);window.__unmount=()=>root.unmount();`,
    emptyApi,
  );
  const rd = residence.w.document;
  const startResidence = [...rd.querySelectorAll("button")].find(
    (button) => button.textContent === "Record Residence Start",
  );
  startResidence.focus();
  await residence.tick(() => startResidence.click());
  check(
    rd.querySelector('[role="dialog"]')?.contains(rd.activeElement) &&
      rd.body.style.overflow === "hidden",
    "Residence date entry receives focus and stops background scrolling",
  );
  const residenceDate = rd.querySelector('input[type="date"]');
  await residence.tick(() => {
    Object.getOwnPropertyDescriptor(
      residence.w.HTMLInputElement.prototype,
      "value",
    ).set.call(residenceDate, "2026-01-01");
    residenceDate.dispatchEvent(
      new residence.w.Event("input", { bubbles: true }),
    );
  });
  residence.w.confirm = () => false;
  await residence.tick(() =>
    rd.dispatchEvent(
      new residence.w.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  check(
    rd.querySelector('[role="dialog"]') && residenceDate.value === "2026-01-01",
    "Cancelling the unsaved-changes confirmation keeps the entered residence date",
  );
  residence.w.confirm = () => true;
  await residence.tick(() =>
    rd.dispatchEvent(
      new residence.w.KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  check(
    !rd.querySelector('[role="dialog"]') &&
      rd.body.style.overflow === "" &&
      rd.activeElement === startResidence,
    "Confirming dismissal releases the residence dialog and restores focus",
  );
  check(
    residence.errors.length === 0,
    "Residence dialog interactions have no React/runtime errors",
  );
  await residence.close();
  const recordsApi = api.replace(
    "const appointments =",
    "residents.forEach((r,i)=>Object.assign(r,{boarding_status:i%3===0?'boarder':i%3===1?'landlord':'neither',boarding_house_name:'Saved house',boarding_house_address:'Saved boarding address',boarding_landlord_name:'Saved owner',boarding_start_date:'2026-01-01',boarding_tenant_count:3}));const appointments =",
  );
  const records = await render(
    `import {createRoot} from 'react-dom/client';import AdminDashboard from './src/pages/AdminDashboard';const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<AdminDashboard tab="records" onLogout={()=>{}} onReview={()=>{}}/>);window.__unmount=()=>root.unmount();`,
    recordsApi,
  );
  const recordDoc = records.w.document;
  const filter = recordDoc.querySelector(
    '[aria-label="Boarding status filter"]',
  );
  await records.tick(() => {
    filter.value = "boarder";
    filter.dispatchEvent(new records.w.Event("change", { bubbles: true }));
  });
  check(
    [...recordDoc.querySelectorAll("main article")].length === 8 &&
      [...recordDoc.querySelectorAll("main article")].every((el) =>
        el.textContent.includes("Boarder"),
      ) &&
      records.w.__requests
        .at(-1)
        .filters.some(([k, v]) => k === "boarding_status" && v === "boarder"),
    "Admin Boarding Status filter queries Supabase and displays matching paginated residents",
  );
  await records.tick(() =>
    [...recordDoc.querySelectorAll('[aria-label="Pagination"] button')]
      .find((el) => el.textContent.trim() === "2")
      .click(),
  );
  check(
    recordDoc.querySelectorAll("main article").length === 1,
    "Boarding-filtered admin records retain a working final pagination page",
  );
  await records.tick(() => {
    filter.value = "landlord";
    filter.dispatchEvent(new records.w.Event("change", { bubbles: true }));
  });
  check(
    recordDoc.querySelectorAll("main article").length === 8 &&
      recordDoc.querySelector('[aria-label="Pagination"] [aria-current="page"]')
        .textContent === "1" &&
      [...recordDoc.querySelectorAll("main article")].every((el) =>
        el.textContent.includes("Landlord/Landlady"),
      ),
    "Changing Boarding Status filter resets to page one and shows landlord labels",
  );
  check(
    records.errors.length === 0,
    "Admin boarding filtering and pagination have no React/runtime errors",
  );
  await records.close();
  const adminBoarding = await render(
    `import {createRoot} from 'react-dom/client';import AdminReview from './src/pages/AdminReview';const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<AdminReview residentId="r0" onBack={()=>{}} onDecisionComplete={()=>{}}/>);window.__unmount=()=>root.unmount();`,
    recordsApi,
  );
  check(
    [
      "Boarding Status",
      "Saved house",
      "Saved boarding address",
      "Saved owner",
      "2026-01-01",
    ].every((value) =>
      adminBoarding.w.document.body.textContent.includes(value),
    ),
    "Admin review renders the same saved Boarder fields as the resident views",
  );
  check(
    adminBoarding.errors.length === 0,
    "Admin boarding detail rendering has no React/runtime errors",
  );
  await adminBoarding.close();
  const boardingApi = `
    window.__saved={id:'r0',user_id:'u0',first_name:'Fixture',last_name:'Resident',tracking_number:'BC-2026-COMPLETE-LONG-TRACKING-NUMBER',status:'verified',boarding_status:'neither',birth_date:'1990-01-01',boarding_house_name:'Reported house',boarding_house_address:'Reported address',boarding_landlord_name:'Reported owner',boarding_start_date:'2026-01-01',boarding_tenant_count:3};
    window.__boardingRequests=[];
    export const supabase={from(table){window.__boardingRequests.push(table);let filters=[];const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},limit(){return q},range(){return q},or(){return q},in(){return q},is(){return q},maybeSingle:async()=>({data:table==='residents'?{...window.__saved}:null,error:null}),then(resolve){let rows=table==='boarding_houses'?[{id:'h0',name:'Assigned house',address:'Assigned address',owner_user_id:'u0',owner_name:'Fixture landlord',active:true}]:table==='boarder_stays'?[{id:'s0',boarding_house_id:'h0',resident_id:'r0',resident_name:'Fixture Resident',tracking_number:window.__saved.tracking_number,move_in_date:'2026-01-01',status:'staying'}]:[];rows=rows.filter(r=>filters.every(([k,v])=>r[k]===v));return Promise.resolve({data:rows,error:null,count:rows.length}).then(resolve)}};return q},storage:{from:()=>({createSignedUrl:async()=>({data:null,error:null})})}};`;
  const dashboard = await render(
    `import {createRoot} from 'react-dom/client';import ResidentDashboard from './src/pages/ResidentDashboard';const root=createRoot(document.getElementById('root'));window.__requestedTab='housing';window.__mount=()=>root.render(<ResidentDashboard tab={window.__requestedTab} onLogout={()=>{}} onEdit={()=>{}}/>);window.__unmount=()=>root.unmount();`,
    boardingApi,
  );
  const bd = dashboard.w.document;
  const housingButtons = () =>
    [...bd.querySelectorAll("button")].filter((el) =>
      /^(My Boarding House|Boarding House Management)$/.test(
        el.textContent.trim(),
      ),
    );
  check(
    housingButtons().length === 0 &&
      !dashboard.w.__boardingRequests.includes("boarding_houses") &&
      bd.body.textContent.includes("Welcome, Fixture."),
    "Neither residents cannot enter a requested housing route or start boarding data requests",
  );
  for (const status of [
    "boarder",
    "landlord",
    "neither",
    "landlord",
    "boarder",
    "neither",
  ]) {
    dashboard.w.__saved.boarding_status = status;
    await dashboard.tick(() =>
      dashboard.w.dispatchEvent(new dashboard.w.Event("focus")),
    );
    if (status === "neither") {
      check(
        housingButtons().length === 0 &&
          !bd.body.textContent.includes("Assigned house"),
        "Saved Neither status immediately hides boarding navigation and content",
      );
    } else {
      const button = housingButtons()[0];
      check(
        Boolean(button) &&
          button.textContent.includes(
            status === "boarder"
              ? "My Boarding House"
              : "Boarding House Management",
          ),
        `Saved ${status} status selects the appropriate dashboard option`,
      );
      await dashboard.tick(() => button.click());
      check(
        bd.body.textContent.includes("Reported house") &&
          bd.body.textContent.includes("Assigned house"),
        `Saved ${status} boarding information appears with the existing housing view`,
      );
      const moveIn = [...bd.querySelectorAll("button")].some((el) =>
        /Record Move-in/i.test(el.textContent),
      );
      check(
        status === "landlord" ? moveIn : !moveIn,
        `Only a landlord can see occupancy mutation controls (${status})`,
      );
    }
  }
  dashboard.w.__saved.boarding_status = "neither";
  await dashboard.tick(() =>
    dashboard.w.dispatchEvent(new dashboard.w.Event("focus")),
  );
  const profileButton = [...bd.querySelectorAll("button")].find(
    (el) => el.textContent.trim() === "Profile",
  );
  await dashboard.tick(() => profileButton.click());
  check(
    bd.body.textContent.includes("Boarding Status") &&
      bd.body.textContent.includes("Neither") &&
      !bd.body.textContent.includes("Reported house"),
    "Profile shows Neither without stale boarding details or empty boarding cards",
  );
  check(
    dashboard.errors.length === 0,
    "Saved boarding status transitions have no React/runtime errors",
  );
  await dashboard.close();

  const copied = await render(
    `import {createRoot} from 'react-dom/client';import CopyableTrackingNumber from './src/components/CopyableTrackingNumber';const root=createRoot(document.getElementById('root'));window.__parentClicks=0;window.__tracking='BC-2026-COMPLETE-LONG-TRACKING-NUMBER';window.__mount=()=>root.render(<div onClick={()=>window.__parentClicks++}><CopyableTrackingNumber trackingNumber={window.__tracking}/></div>);window.__unmount=()=>root.unmount();`,
  );
  const copyDoc = copied.w.document;
  let copiedValue = "";
  Object.defineProperty(copied.w.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (value) => {
        copiedValue = value;
      },
    },
  });
  const copyButton = copyDoc.querySelector(
    '[aria-label^="Copy tracking number"]',
  );
  await copied.tick(() => copyButton.click());
  check(
    copiedValue === copied.w.__tracking &&
      copyDoc.querySelector("[role=status]").textContent ===
        "Tracking number copied!",
    "Tracking number copies the complete original value and announces success",
  );
  check(
    copied.w.__parentClicks === 0 &&
      copyButton.type === "button" &&
      copyButton.textContent.includes(copied.w.__tracking),
    "Copying does not submit a form, activate a surrounding card, or replace the tracking number",
  );
  Object.defineProperty(copied.w.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async () => {
        throw new Error("Clipboard denied");
      },
    },
  });
  copyDoc.execCommand = () => {
    copiedValue = copyDoc.querySelector("textarea").value;
    return true;
  };
  copyButton.focus();
  await copied.tick(() => copyButton.click());
  check(
    copiedValue === copied.w.__tracking &&
      copyDoc.activeElement === copyButton &&
      !copyDoc.querySelector("textarea"),
    "Clipboard fallback copies exactly, cleans up, and restores keyboard focus",
  );
  copyDoc.execCommand = () => false;
  await copied.tick(() => copyButton.click());
  check(
    copyDoc
      .querySelector("[role=status]")
      .textContent.includes("Could not copy"),
    "Clipboard denial displays useful failure feedback instead of claiming success",
  );
  check(
    copied.errors.length === 0,
    "Copy success, fallback, and failure have no React/runtime errors",
  );
  await copied.close();

  const routeTest = await render(
    `import {createRoot} from 'react-dom/client';import {useHashRoute,navigateHash,updateHashQuery} from './src/hooks/useHashRoute';import {validateResidentImage} from './src/lib/imageValidation';const root=createRoot(document.getElementById('root'));window.__navigate=navigateHash;window.__query=updateHashQuery;window.__image=validateResidentImage;function Probe(){return <p>{useHashRoute()}</p>}window.__mount=()=>root.render(<Probe/>);window.__unmount=()=>root.unmount();`,
  );
  await routeTest.tick(() =>
    routeTest.w.__navigate("/resident/dashboard?tab=profile"),
  );
  check(
    routeTest.w.document.body.textContent.includes(
      "/resident/dashboard?tab=profile",
    ),
    "Resident navigation stores the selected section in the URL",
  );
  await routeTest.tick(() =>
    routeTest.w.__navigate("/resident/dashboard?tab=appointments"),
  );
  await routeTest.tick(() => routeTest.w.history.back());
  await routeTest.tick();
  check(
    routeTest.w.location.hash.endsWith("tab=profile"),
    "Browser Back restores the previous section",
  );
  await routeTest.tick(() => routeTest.w.history.forward());
  await routeTest.tick();
  check(
    routeTest.w.location.hash.endsWith("tab=appointments"),
    "Browser Forward restores the next section",
  );
  await routeTest.tick(() =>
    routeTest.w.__query({ q: "Resident & Name", status: "pending" }, true),
  );
  check(
    new URLSearchParams(routeTest.w.location.hash.split("?")[1]).get("q") ===
      "Resident & Name",
    "Search query safely preserves special characters",
  );
  await routeTest.tick(() => routeTest.w.__query({ status: null }));
  check(
    !routeTest.w.location.hash.includes("status="),
    "Clearing a filter removes its URL parameter",
  );
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    routeTest.w.__image(new routeTest.w.File(["photo"], "photo", { type }));
    check(true, `Storage-supported ${type} passes validation`);
  }
  for (const type of ["image/gif", "image/svg+xml", "image/heic", ""]) {
    assert.throws(
      () =>
        routeTest.w.__image(new routeTest.w.File(["photo"], "photo", { type })),
      /JPEG, PNG, or WebP/,
    );
    check(
      true,
      `Unsupported ${type || "unknown"} image is rejected before upload`,
    );
  }
  assert.throws(
    () =>
      routeTest.w.__image(
        new routeTest.w.File([], "photo.jpg", { type: "image/jpeg" }),
      ),
    /empty/,
  );
  check(true, "Empty image is rejected before upload");
  check(
    routeTest.errors.length === 0,
    "Navigation and image validation have no React errors",
  );
  await routeTest.close();

  const filterTest = await render(
    `import {createRoot} from 'react-dom/client';import AdminDashboard from './src/pages/AdminDashboard';window.location.hash='/admin/dashboard?tab=records&status=pending_review';const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<AdminDashboard onLogout={()=>{}} onReview={()=>{}}/>);window.__unmount=()=>root.unmount();`,
    api,
  );
  check(
    filterTest.w.document.querySelector('[aria-label="Census status"]')
      .value === "pending_review",
    "Pending-review shortcut applies its status filter",
  );
  await filterTest.tick(() => {
    filterTest.w.location.hash = "/admin/dashboard?tab=records";
  });
  await filterTest.tick();
  check(
    filterTest.w.document.querySelector('[aria-label="Census status"]')
      .value === "all",
    "View All Records clears an earlier shortcut filter",
  );
  await filterTest.tick(() => filterTest.w.history.back());
  await filterTest.tick();
  check(
    filterTest.w.document.querySelector('[aria-label="Census status"]')
      .value === "pending_review",
    "Back restores the resident record filter",
  );
  check(
    filterTest.errors.length === 0,
    "URL-driven record filters have no React errors",
  );
  await filterTest.close();

  const appointmentTest = await render(
    `import {createRoot} from 'react-dom/client';import AdminAppointments from './src/components/AdminAppointments';window.location.hash='/admin/dashboard?tab=appointments&date=today';const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<AdminAppointments refreshKey={0} mode="active"/>);window.__unmount=()=>root.unmount();`,
    api,
  );
  check(
    Boolean(
      appointmentTest.w.document.querySelector(
        '[aria-label="Appointment date"]',
      ).value,
    ),
    "Today shortcut applies an appointment date",
  );
  await appointmentTest.tick(() => {
    appointmentTest.w.location.hash =
      "/admin/dashboard?tab=appointments&status=pending";
  });
  await appointmentTest.tick();
  check(
    appointmentTest.w.document.querySelector('[aria-label="Appointment date"]')
      .value === "" &&
      appointmentTest.w.document.querySelector(
        '[aria-label="Appointment status"]',
      ).value === "pending",
    "Changing shortcuts synchronizes date and status without remounting",
  );
  await appointmentTest.tick(() => {
    appointmentTest.w.location.hash =
      "/admin/dashboard?tab=appointments&appointment=a0";
  });
  await appointmentTest.tick();
  check(
    appointmentTest.w.document
      .querySelector("[role=dialog]")
      .textContent.includes("Resident0"),
    "Appointment deep link opens the requested details",
  );
  await appointmentTest.tick(() => {
    appointmentTest.w.location.hash =
      "/admin/dashboard?tab=appointments&appointment=a1";
  });
  await appointmentTest.tick();
  check(
    appointmentTest.w.document
      .querySelector("[role=dialog]")
      .textContent.includes("Resident1"),
    "Changing the appointment ID replaces the detail panel",
  );
  await appointmentTest.tick(() => {
    appointmentTest.w.location.hash =
      "/admin/dashboard?tab=appointments&date=2026-02-30&status=completed";
  });
  await appointmentTest.tick();
  check(
    !appointmentTest.w.document.querySelector("[role=dialog]") &&
      appointmentTest.w.document.querySelector(
        '[aria-label="Appointment date"]',
      ).value === "" &&
      appointmentTest.w.document.querySelector(
        '[aria-label="Appointment status"]',
      ).value === "all",
    "Removing details closes the panel and invalid active filters are ignored",
  );
  check(
    appointmentTest.errors.length === 0,
    "Appointment filters and details have no React errors",
  );
  await appointmentTest.close();

  const notificationTest = await render(
    `import {createRoot} from 'react-dom/client';import ResidentNotifications from './src/components/ResidentNotifications';const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<ResidentNotifications residentId="r0" onOpenAppointments={()=>{}} onOpenRecord={()=>{}}/>);window.__unmount=()=>root.unmount();`,
    `Object.defineProperty(document,'hidden',{configurable:true,value:false});window.__timers=new Map();window.setInterval=(fn)=>{window.__timers.set(1,fn);return 1};window.clearInterval=(id)=>window.__timers.delete(id);window.__notices=[];window.__reads=0;window.__pending=[];window.__defer=false;export const supabase={from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:()=>{window.__reads++;const data=[...window.__notices];return window.__defer?new Promise(resolve=>window.__pending.push(()=>resolve({data,error:null}))):Promise.resolve({data,error:null})}};return q}};`,
  );
  notificationTest.w.__notices = [
    {
      id: "n1",
      resident_id: "r0",
      title: "Fresh notice",
      message: "Current update",
      category: "census",
      is_read: false,
      created_at: "2026-10-07T12:00:00Z",
    },
  ];
  await notificationTest.tick(() => notificationTest.w.__timers.get(1)());
  check(
    notificationTest.w.document.querySelector(
      '[aria-label="Open notifications"]',
    ).textContent === "1",
    "Unread badge refreshes while the panel is closed",
  );
  const reads = notificationTest.w.__reads;
  await notificationTest.tick(() =>
    notificationTest.w.document
      .querySelector('[aria-label="Open notifications"]')
      .click(),
  );
  check(
    notificationTest.w.__reads > reads &&
      notificationTest.w.document.body.textContent.includes("Fresh notice"),
    "Opening notifications immediately fetches fresh content",
  );
  Object.defineProperty(notificationTest.w.document, "hidden", {
    configurable: true,
    value: true,
  });
  const hiddenReads = notificationTest.w.__reads;
  await notificationTest.tick(() => notificationTest.w.__timers.get(1)());
  check(
    notificationTest.w.__reads === hiddenReads,
    "Background polling pauses while the document is hidden",
  );
  Object.defineProperty(notificationTest.w.document, "hidden", {
    configurable: true,
    value: false,
  });
  notificationTest.w.__defer = true;
  notificationTest.w.__notices[0].title = "Old response";
  await notificationTest.tick(() =>
    notificationTest.w.dispatchEvent(new notificationTest.w.Event("focus")),
  );
  notificationTest.w.__notices[0] = {
    ...notificationTest.w.__notices[0],
    title: "Latest response",
  };
  await notificationTest.tick(() =>
    notificationTest.w.dispatchEvent(new notificationTest.w.Event("focus")),
  );
  await notificationTest.tick(() => notificationTest.w.__pending[1]());
  await notificationTest.tick(() => notificationTest.w.__pending[0]());
  check(
    notificationTest.w.document.body.textContent.includes("Latest response") &&
      !notificationTest.w.document.body.textContent.includes("Old response"),
    "A late notification response cannot overwrite newer data",
  );
  check(
    notificationTest.errors.length === 0,
    "Notification refresh has no React errors",
  );
  await notificationTest.close();
  check(
    notificationTest.w.__timers.size === 0,
    "Notification timer is cleared on unmount",
  );

  const reviewTest = await render(
    `import {createRoot} from 'react-dom/client';import AdminReview from './src/pages/AdminReview';const root=createRoot(document.getElementById('root'));window.__decisions=0;window.__mount=()=>root.render(<AdminReview residentId="r0" onBack={()=>{}} onDecisionComplete={()=>{window.__decisions++}}/>);window.__unmount=()=>root.unmount();`,
    api +
      `
window.__reviewCalls=[];window.__conflict=true;const originalRpc=supabase.rpc;supabase.rpc=async(name,args)=>{if(name!=='review_resident')return originalRpc(name,args);window.__reviewCalls.push(args);if(window.__conflict){residents[0].first_name='FreshRecord';residents[0].updated_at='2026-10-07T08:00:00.123456+00:00';return{data:null,error:{code:'40001',message:'Concurrent review'}}}return{data:{status:'verified'},error:null}};`,
  );
  const approve = () =>
    [...reviewTest.w.document.querySelectorAll("button")]
      .filter((b) => b.textContent.includes("Approve Record"))
      .at(-1);
  await reviewTest.tick(() => approve().click());
  await reviewTest.tick(() => approve().click());
  check(
    reviewTest.w.__reviewCalls[0].p_expected_updated_at ===
      "2026-10-01T00:00:00Z",
    "Review sends the original database version without losing timestamp precision",
  );
  check(
    reviewTest.w.__decisions === 0 &&
      reviewTest.w.document.body.textContent.includes("FreshRecord") &&
      reviewTest.w.document.body.textContent.includes(
        "changed in another session",
      ),
    "Conflicting review refreshes the record and asks the admin to review again",
  );
  reviewTest.w.__conflict = false;
  await reviewTest.tick(() => approve().click());
  await reviewTest.tick(() => approve().click());
  check(
    reviewTest.w.__decisions === 1 &&
      reviewTest.w.__reviewCalls[1].p_expected_updated_at ===
        "2026-10-07T08:00:00.123456+00:00",
    "Retry uses the latest full-precision version and completes successfully",
  );
  check(
    reviewTest.errors.length === 0,
    "Conflict recovery has no React errors",
  );
  await reviewTest.close();

  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
