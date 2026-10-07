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
            resolveDir: project,
            contents:
              args.path === "auth"
                ? `const user={id:'u0',email:'resident@test.invalid'};const adminProfile={full_name:'Test Admin'};export const useAuth=()=>({user,adminProfile,signIn:async()=>{window.__signCalls++;return{error:null}}});`
                : args.path === "camera"
                  ? "window.__faceLoads=(window.__faceLoads||0)+1;export default function Camera(props){window.__faceProps=props;return <p>Loaded face verification</p>;}"
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
function changeInput(w, element, value) {
  const proto =
    element.tagName === "TEXTAREA"
      ? w.HTMLTextAreaElement.prototype
      : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(element, value);
  element.dispatchEvent(new w.Event("input", { bubbles: true }));
}
const draftSource = `import {createRoot} from 'react-dom/client';import {useState,useCallback} from 'react';import {useCensusDraft} from './src/hooks/useCensusDraft';import {censusDraftPayload} from './src/lib/censusDraft';
function Test(){const [payload,setPayload]=useState({first_name:'Initial',email_address:'locked@test.invalid',categories:[]});const restore=useCallback(p=>{window.__restores++;setPayload(old=>({...old,...p,email_address:'locked@test.invalid'}))},[]);const draft=useCensusDraft({userId:'u0',mode:window.__mode||'create',ready:true,disabled:false,baseVersion:window.__base||null,payload:censusDraftPayload(payload),onRestore:restore});window.__draft=draft;window.__payload=payload;window.__change=(p)=>setPayload(old=>({...old,...p}));return <p>{draft.error||draft.savedAt||'Draft'}</p>};window.__restores=0;const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<Test/>);window.__unmount=()=>root.unmount();`;
const draftApi = `window.__saves=[];window.__mode='update';window.__base='2026-10-07T00:00:00.123456+00:00';window.__row={user_id:'u0',mode:'update',revision:2,payload:{first_name:'Recovered',email_address:'attacker@test.invalid',philsys_number:'hidden',categories:[1,'unsafe']},base_resident_updated_at:window.__base,saved_at:'2026-10-07T00:01:00Z'};export const supabase={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:window.__row,error:null})}),rpc:async(name,args)=>{window.__saves.push({name,args});if(window.__fail)return{data:null,error:{code:window.__fail,message:'Draft conflict'}};const row={...window.__row,revision:args.p_expected_revision+1,payload:args.p_payload,saved_at:'2026-10-07T00:02:00Z'};return{data:row,error:null}}};`;
(async () => {
  const draft = await render(draftSource, draftApi);
  check(
    draft.w.__payload.first_name === "Recovered" && draft.w.__restores === 1,
    "Saved draft is recovered exactly once after loading",
  );
  check(
    draft.w.__payload.email_address === "locked@test.invalid" &&
      !("philsys_number" in draft.w.__payload),
    "Recovery cannot change account email or restore removed fields",
  );
  check(
    JSON.stringify(draft.w.__payload.categories) === "[1]",
    "Draft restoration filters invalid category identifiers",
  );
  check(
    draft.w.__saves.length === 0,
    "Hydration never overwrites saved draft with initial empty fields",
  );
  await draft.tick(() => draft.w.__change({ first_name: "Newer" }));
  await draft.w.__act(async () => {
    await new Promise((r) => setTimeout(r, 1300));
  });
  check(
    draft.w.__saves.length === 1 &&
      draft.w.__saves[0].args.p_expected_revision === 2,
    "Automatic save uses the recovered CAS revision",
  );
  check(
    draft.w.__saves[0].args.p_payload.first_name === "Newer" &&
      !("email_address" in draft.w.__saves[0].args.p_payload),
    "Only editable census fields are sent to Supabase",
  );
  await draft.tick(() => {
    draft.w.__fail = "40001";
    draft.w.__change({ first_name: "Conflict" });
  });
  await draft.tick(() => void draft.w.__draft.save());
  const saves = draft.w.__saves.length;
  await draft.tick(() => void draft.w.__draft.save());
  check(
    draft.w.__saves.length === saves &&
      draft.w.__draft.error === "Draft conflict",
    "A stale draft stops further writes and reports conflict",
  );
  check(
    draft.errors.length === 0,
    "Draft load/autosave/conflict checks have no React errors",
  );
  await draft.close();
  const old = await render(
    draftSource,
    draftApi.replace(
      "base_resident_updated_at:window.__base",
      'base_resident_updated_at:"2026-10-06T00:00:00Z"',
    ),
  );
  check(
    old.w.__draft.outdated && old.w.__payload.first_name === "Initial",
    "An older draft does not overwrite a newer census record",
  );
  await old.tick(() => void old.w.__draft.save());
  check(
    old.w.__saves.length === 0,
    "Outdated draft blocks autosaving until it is discarded",
  );
  await old.tick(() => void old.w.__draft.discardOutdated());
  check(
    !old.w.__draft.outdated && old.w.__saves[0].name === "delete_census_draft",
    "Discard uses server-scoped draft deletion",
  );
  check(old.errors.length === 0, "Outdated draft recovery has no React errors");
  await old.close();

  const paymentSource = (admin = true, fee = 130, status = "confirmed") =>
    `import {createRoot} from 'react-dom/client';import AppointmentPaymentPanel from './src/components/AppointmentPaymentPanel';const appointment={id:'a0',fee:${fee},status:'${status}'};const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<AppointmentPaymentPanel appointment={appointment} admin={${admin}}/>);window.__unmount=()=>root.unmount();`;
  const paymentApi = `window.__payments=[];window.__calls=[];export const supabase={from:()=>({select(){return this},eq(){return this},order(){return this},then(resolve){return Promise.resolve({data:window.__payments,error:window.__readFail?{message:'Network read failed'}:null}).then(resolve)}}),rpc:async(name,args)=>{window.__calls.push({name,args});if(name==='record_service_payment'){if(window.__delay)await new Promise(resolve=>window.__release=resolve);window.__payments=[{id:'p0',appointment_id:'a0',amount:args.p_amount,status:'posted',receipt_number:args.p_receipt_number,cashier_name:'Test Cashier',paid_at:'2026-10-07T17:00:00Z'}];return{data:window.__payments[0],error:null}}window.__payments[0]={...window.__payments[0],status:'voided',voided_at:'2026-10-07T17:10:00Z',void_reason:args.p_reason};return{data:window.__payments[0],error:null}}};`;
  const pay = await render(paymentSource(), paymentApi);
  check(
    pay.w.document.body.textContent.includes("Unpaid") &&
      pay.w.document.querySelector("form"),
    "Admin can record a collection on an unpaid service",
  );
  await pay.tick(() => {
    changeInput(
      pay.w,
      pay.w.document.querySelector('[aria-label="Official receipt number"]'),
      "OR-100",
    );
    pay.w.__delay = true;
  });
  await pay.tick(() => {
    const form = pay.w.document.querySelector("form");
    form.dispatchEvent(
      new pay.w.Event("submit", { bubbles: true, cancelable: true }),
    );
    form.dispatchEvent(
      new pay.w.Event("submit", { bubbles: true, cancelable: true }),
    );
  });
  check(
    pay.w.__calls.length === 1 && pay.w.__calls[0].args.p_amount === 130,
    "Double submission records only one request with the saved fee",
  );
  check(
    Boolean(pay.w.__calls[0].args.p_request_key),
    "Payment writes carry an idempotency key",
  );
  await pay.tick(() => pay.w.__release());
  check(
    pay.w.document.body.textContent.includes("Paid") &&
      pay.w.document.body.textContent.includes("OR-100") &&
      !pay.w.document.querySelector("form"),
    "Confirmed receipt replaces collection controls without changing appointment status",
  );
  await pay.tick(() =>
    Array.from(pay.w.document.querySelectorAll("button"))
      .find((b) => b.textContent.includes("Correct / void"))
      .click(),
  );
  await pay.tick(() =>
    Array.from(pay.w.document.querySelectorAll("button"))
      .find((b) => b.textContent === "Void record")
      .click(),
  );
  check(
    pay.w.__calls.length === 1 &&
      pay.w.document.body.textContent.includes("at least 3"),
    "Void requires a reason before calling Supabase",
  );
  await pay.tick(() =>
    changeInput(
      pay.w,
      pay.w.document.querySelector("textarea"),
      "Incorrect receipt entry",
    ),
  );
  await pay.tick(() =>
    Array.from(pay.w.document.querySelectorAll("button"))
      .find((b) => b.textContent === "Void record")
      .click(),
  );
  check(
    pay.w.__calls[1].name === "void_service_payment" &&
      pay.w.document.body.textContent.includes("Voided") &&
      pay.w.document.querySelector("form"),
    "Correction preserves the old receipt and allows a replacement collection",
  );
  check(
    pay.errors.length === 0,
    "Payment/void interactions have no React errors",
  );
  await pay.close();
  const resident = await render(
    paymentSource(false),
    paymentApi.replace(
      "window.__payments=[]",
      'window.__payments=[{id:"p0",amount:130,status:"posted",receipt_number:"OR-200",cashier_name:"Cashier",paid_at:"2026-10-07T17:00:00Z"}]',
    ),
  );
  check(
    resident.w.document.body.textContent.includes("OR-200") &&
      !resident.w.document.querySelector("form") &&
      !resident.w.document.body.textContent.includes("Correct / void"),
    "Resident sees their receipt with no collection or correction controls",
  );
  await resident.close();
  const free = await render(paymentSource(true, 0), paymentApi);
  check(
    free.w.document.body.textContent.includes("Free — no payment required") &&
      !free.w.document.querySelector("form"),
    "Free requests never offer a payment collection form",
  );
  await free.close();
  const cancelled = await render(
    paymentSource(true, 230, "cancelled"),
    paymentApi,
  );
  check(
    !cancelled.w.document.querySelector("form"),
    "Cancelled requests cannot collect a payment",
  );
  await cancelled.close();
  const failed = await render(
    paymentSource(),
    paymentApi + "window.__readFail=true;",
  );
  check(
    failed.w.document.body.textContent.includes("Payment status unavailable") &&
      !failed.w.document.querySelector("form"),
    "A failed read never pretends the request is unpaid or allows collection",
  );
  await failed.close();

  const lazy = await render(
    `import {createRoot} from 'react-dom/client';import {useState} from 'react';import FaceVerificationLoader from './src/components/FaceVerificationLoader';function Test(){const [file,setFile]=useState(null);window.__addId=()=>setFile(new File(['image'],'id.jpg',{type:'image/jpeg'}));return <FaceVerificationLoader idFrontFile={file} autoStart={Boolean(file)} onVerified={()=>{}}/>};const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<Test/>);window.__unmount=()=>root.unmount();`,
  );
  check(
    !lazy.w.__faceLoads,
    "Initial page does not initialize face verification",
  );
  await lazy.tick(() => lazy.w.__addId());
  check(
    lazy.w.__faceLoads === 1 &&
      lazy.w.__faceProps.autoStart &&
      lazy.w.document.body.textContent.includes("Loaded face verification"),
    "Adding ID automatically loads the verification chunk once",
  );
  check(
    lazy.errors.length === 0,
    "Deferred verification loads without React errors",
  );
  await lazy.close();
  const history = await render(
    `import {createRoot} from 'react-dom/client';import ResidentRecordHistory from './src/components/ResidentRecordHistory';const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<ResidentRecordHistory residentId='r0'/>);window.__unmount=()=>root.unmount();`,
    `window.__ranges=[];export const supabase={from:()=>({select(){return this},eq(){return this},order(){return this},range(from,to){window.__ranges.push([from,to]);return Promise.resolve({count:10,error:null,data:[{id:'h1',actor_name:'Reviewer',action:'reject',created_at:'2026-10-07T00:00:00Z',details:{status:'rejected',remark:'Please correct ID'}},{id:'h2',actor_name:'Resident',action:'census_updated',created_at:'2026-10-07T00:00:00Z',details:{changes:{education_status:{before:'Currently Studying',after:'Not Currently Studying'},philsys_number:{before:'legacy',after:'hidden'}}}}]})}})};`,
  );
  check(
    history.w.document.body.textContent.includes("Reviewer") &&
      history.w.document.body.textContent.includes("Rejected") &&
      history.w.document.body.textContent.includes("Please correct ID"),
    "Record history displays stored reviewer, decision and reason",
  );
  check(
    history.w.document.body.textContent.includes("Not Currently Enrolled") &&
      !history.w.document.body.textContent.includes("legacy"),
    "History uses current labels and hides removed identity fields",
  );
  check(
    JSON.stringify(history.w.__ranges[0]) === "[0,7]" &&
      history.w.document.querySelector('[aria-label="Pagination"]'),
    "Audit history fetches one bounded page and provides pagination",
  );
  check(history.errors.length === 0, "History renders without React errors");
  await history.close();
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
