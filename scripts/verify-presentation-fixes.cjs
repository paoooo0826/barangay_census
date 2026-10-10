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
      "import.meta.env.VITE_SESSION_TIMEOUT_MINUTES": '"15"',
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
  await draft.tick(() => draft.w.__change({ first_name: "Last edit" }));
  let flushed;
  await draft.tick(() => { void draft.w.__draft.flush().then(value => { flushed = value; }); });
  check(flushed && draft.w.__saves.length === 1 && draft.w.__saves[0].args.p_payload.first_name === "Last edit",
    "Leaving before the autosave delay flushes the latest draft");
  await draft.close();

  const concurrent = await render(draftSource, draftApi + `
window.__pending=[];const rpc=supabase.rpc;supabase.rpc=(name,args)=>new Promise(resolve=>window.__pending.push(()=>rpc(name,args).then(resolve)));`);
  await concurrent.tick(() => concurrent.w.__change({ first_name: "First edit" }));
  await concurrent.tick(() => { void concurrent.w.__draft.save(); });
  await concurrent.tick(() => concurrent.w.__change({ first_name: "Second edit" }));
  let finished = false;
  await concurrent.tick(() => { void concurrent.w.__draft.flush().then(value => { finished = value; }); });
  check(!finished && concurrent.w.__pending.length === 1,
    "Navigation waits for a draft request already in flight");
  await concurrent.tick(() => concurrent.w.__pending[0]());
  check(concurrent.w.__pending.length === 2 && !finished,
    "An edit made during a draft request gets its own confirmed save");
  await concurrent.tick(() => concurrent.w.__pending[1]());
  check(finished && concurrent.w.__saves[1].args.p_payload.first_name === "Second edit" &&
    concurrent.w.__saves[1].args.p_expected_revision === 3,
    "Draft flush preserves newer input and the server revision");
  await concurrent.close();

  const appSource = `import {createRoot} from 'react-dom/client';import App from './src/App';const root=createRoot(document.getElementById('root'));window.location.hash='/resident/census';window.__mount=()=>root.render(<App/>);window.__unmount=()=>root.unmount();`;
  const appApi = `window.__draftCalls=[];window.__pending=[];window.__failDraft=false;window.confirm=()=>false;
export const supabase={from:table=>({select(){return this},eq(){return this},order(){return this},maybeSingle:async()=>({data:null,error:null}),then:resolve=>Promise.resolve({data:[],error:null}).then(resolve)}),rpc:(name,args)=>{window.__draftCalls.push({name,args});return new Promise(resolve=>window.__pending.push(()=>resolve(window.__failDraft?{data:null,error:{message:'Connection lost'}}:{data:{revision:args.p_expected_revision+1,saved_at:'2026-10-09T00:00:00Z'},error:null})))}};`;
  const app = await render(appSource, appApi);
  await app.tick(() => changeInput(app.w, app.w.document.querySelector('#census-first_name'), "Saved before exit"));
  const unload = new app.w.Event('beforeunload', { cancelable: true });
  app.w.dispatchEvent(unload);
  check(unload.defaultPrevented, "Reloading with unsaved changes triggers the browser warning");
  await app.tick(() => { app.w.location.hash = '/'; });
  check(app.w.location.hash === '#/resident/census' && app.w.document.querySelector('#census-first_name') && app.w.__pending.length === 1,
    "Hash navigation keeps the form mounted until draft saving finishes");
  await app.tick(() => app.w.__pending[0]());
  check(app.w.location.hash === '#/' && app.w.document.body.textContent.includes('Choose your portal') &&
    app.w.__draftCalls[0].args.p_payload.first_name === 'Saved before exit',
    "Navigation continues only after the current text is saved");
  check(app.errors.length === 0, "Guarded census navigation has no React errors");
  await app.close();

  const failure = await render(appSource, appApi);
  await failure.tick(() => changeInput(failure.w, failure.w.document.querySelector('#census-first_name'), "Keep my edit"));
  await failure.tick(() => { failure.w.__failDraft = true; failure.w.location.hash = '/'; });
  await failure.tick(() => failure.w.__pending[0]());
  check(failure.w.location.hash === '#/resident/census' &&
    failure.w.document.querySelector('#census-first_name').value === 'Keep my edit' &&
    failure.w.document.body.textContent.includes('Connection lost'),
    "A failed save and declined discard keep the form and latest edits");
  check(failure.errors.length === 0, "Draft failure recovery has no React errors");
  await failure.close();

  const reviewApi = `window.__old=[];export const supabase={from:table=>{let id;const q={select(){return q},eq(k,v){if(k==='id')id=v;return q},order(){return q},single(){const row={id,user_id:id,first_name:id==='r0'?'OLD_RESIDENT':'NEW_RESIDENT',last_name:'Test',status:'pending_review',updated_at:'2026-10-08T00:00:00Z',birth_date:'2000-01-01'};return id==='r0'?new Promise(resolve=>window.__old.push(error=>resolve({data:error?null:row,error:error?{message:'Old request failed'}:null}))):Promise.resolve({data:row,error:null})},maybeSingle(){return Promise.resolve({data:null,error:null})},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};return q}};`;
  const reviewSource = `import {createRoot} from 'react-dom/client';import AdminReview from './src/pages/AdminReview';const root=createRoot(document.getElementById('root'));window.__show=id=>root.render(<AdminReview residentId={id} onBack={()=>{}} onDecisionComplete={()=>{}}/>);window.__mount=()=>window.__show('r0');window.__unmount=()=>root.unmount();`;
  const review = await render(reviewSource, reviewApi);
  await review.tick(() => review.w.__show('r1'));
  await review.tick(() => review.w.__old[0](false));
  check(review.w.document.body.textContent.includes('NEW_RESIDENT') && !review.w.document.body.textContent.includes('OLD_RESIDENT'),
    "A late previous-resident response cannot replace the current review");
  await review.tick(() => review.w.__show('r0'));
  await review.tick(() => review.w.__show('r1'));
  await review.tick(() => review.w.__old[1](true));
  check(review.w.document.body.textContent.includes('NEW_RESIDENT') && !review.w.document.body.textContent.includes('Failed to load resident information'),
    "A previous-resident failure cannot clear the current review");
  check(review.errors.length === 0, "Review switching has no React errors");
  await review.close();

  const appointmentApi = `window.__status='pending';window.__reads=0;window.__timers=new Map();let timer=0;window.setInterval=fn=>{window.__timers.set(++timer,fn);return timer};window.clearInterval=id=>window.__timers.delete(id);window.__defer=false;window.__pending=[];window.__cancelCalls=0;window.confirm=()=>false;
export const supabase={from:table=>({select(){return this},eq(){return this},order(){return this},then(resolve){if(table==='appointments'){window.__reads++;const row={id:'a0',user_id:'u0',resident_id:'r0',status:window.__status,service_type:'barangay_clearance',fee:230,appointment_date:'2026-10-12',appointment_time:'09:00:00',purpose:'Test service'};const result={data:[row],error:window.__readError?{message:'Appointment connection lost'}:null};return window.__defer?new Promise(done=>window.__pending.push(()=>done(result))).then(resolve):Promise.resolve(result).then(resolve)}return Promise.resolve({data:[],error:null}).then(resolve)}}),rpc:async(name)=>{if(name==="get_service_catalog")return{data:[],error:null};window.__cancelCalls++;return {data:{cancelled:true},error:null}}};`;
  const appointmentSource = `import {createRoot} from 'react-dom/client';import ResidentAppointments from './src/components/ResidentAppointments';const root=createRoot(document.getElementById('root'));const resident={id:'r0',user_id:'u0'};window.__mount=()=>root.render(<ResidentAppointments resident={resident}/>);window.__unmount=()=>root.unmount();`;
  const appointments = await render(appointmentSource, appointmentApi);
  Object.defineProperty(appointments.w.document, 'hidden', { configurable:true, value:false });
  await appointments.tick(() => { appointments.w.__status='confirmed'; appointments.w.dispatchEvent(new appointments.w.Event('focus')); });
  check(appointments.w.__reads === 2 && appointments.w.document.body.textContent.includes('confirmed'),
    "Returning to the resident page refreshes an administrator status update");
  const open = [...appointments.w.document.querySelectorAll('button')].find(b=>b.textContent.includes('View Details'));
  open.focus();
  await appointments.tick(() => open.click());
  const dialog = appointments.w.document.querySelector('[role=dialog]');
  check(dialog.contains(appointments.w.document.activeElement) && appointments.w.document.body.style.overflow === 'hidden',
    "Appointment details receive focus and lock background scrolling");
  const buttons = [...dialog.querySelectorAll('button:not([disabled])')];
  buttons.at(-1).focus();
  await appointments.tick(() => appointments.w.document.dispatchEvent(new appointments.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));
  check(appointments.w.document.activeElement === buttons[0], "Tab stays inside appointment details");
  await appointments.tick(() => appointments.w.document.dispatchEvent(new appointments.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  check(!appointments.w.document.querySelector('[role=dialog]') && appointments.w.document.activeElement === open && appointments.w.document.body.style.overflow === '',
    "Escape closes details and restores focus and scrolling");
  await appointments.tick(() => [...appointments.w.document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Cancel').click());
  await appointments.tick(() => changeInput(appointments.w,appointments.w.document.querySelector('textarea'),'Keep this reason'));
  await appointments.tick(() => appointments.w.document.dispatchEvent(new appointments.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  check(appointments.w.document.querySelector('[role=dialog]') && appointments.w.__cancelCalls === 0,
    "Declining discard preserves an unsaved cancellation reason");
  await appointments.tick(() => { appointments.w.confirm=()=>true; appointments.w.document.dispatchEvent(new appointments.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})); });
  check(!appointments.w.document.querySelector('[role=dialog]') && appointments.w.__cancelCalls === 0,
    "Escape can discard the cancellation form without cancelling the appointment");
  Object.defineProperty(appointments.w.document, 'hidden', { configurable:true, value:true });
  const before = appointments.w.__reads;
  await appointments.tick(() => appointments.w.__timers.forEach(fn=>fn()));
  check(appointments.w.__reads === before, "Appointment polling pauses while the page is hidden");
  Object.defineProperty(appointments.w.document, 'hidden', { configurable:true, value:false });
  await appointments.tick(() => { appointments.w.__defer=true; appointments.w.__status='pending'; appointments.w.dispatchEvent(new appointments.w.Event('focus')); });
  await appointments.tick(() => { appointments.w.__status='confirmed'; appointments.w.dispatchEvent(new appointments.w.Event('online')); });
  await appointments.tick(() => appointments.w.__pending[1]());
  await appointments.tick(() => appointments.w.__pending[0]());
  check(appointments.w.document.body.textContent.includes('confirmed') && !appointments.w.document.body.textContent.includes('pending'),
    "A late appointment response cannot overwrite newer status data");
  await appointments.tick(() => { appointments.w.__defer=false; appointments.w.__readError=true; appointments.w.dispatchEvent(new appointments.w.Event('focus')); });
  check(appointments.w.document.body.textContent.includes('Appointment connection lost') && appointments.w.document.body.textContent.includes('confirmed'),
    "A failed background refresh reports the error and preserves the last confirmed status");
  await appointments.tick(() => { appointments.w.__readError=false; appointments.w.dispatchEvent(new appointments.w.Event('online')); });
  check(!appointments.w.document.body.textContent.includes('Appointment connection lost'),
    "A successful background retry clears the connection error");
  check(appointments.errors.length === 0, "Appointment refresh and dialog changes have no React errors");
  await appointments.close();
  check(appointments.w.__timers.size === 0, "Appointment polling is cleaned up on unmount");

  const setup = await render(`import {createRoot} from 'react-dom/client';import AdminSetup from './src/pages/AdminSetup';const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<AdminSetup onNavigate={p=>window.__destination=p}/>);window.__unmount=()=>root.unmount();`);
  check(!setup.w.document.querySelector('input,form') && setup.w.document.body.textContent.includes('accounts are managed'),
    "The retired administrator setup page cannot create accounts");
  await setup.tick(() => [...setup.w.document.querySelectorAll('button')].find(b=>b.textContent.includes('administrator login')).click());
  check(setup.w.__destination === '/admin', "Retired setup directs authorized staff to administrator login");
  check(setup.errors.length === 0, "Retired setup renders without React errors");
  await setup.close();
  console.log(JSON.stringify({passed:checks.length,checks},null,2));
  process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
