const assert = require("node:assert/strict");
const path = require("node:path");
const { JSDOM, VirtualConsole } = require("jsdom");
const esbuild = require("esbuild");
const project = path.resolve(__dirname, "..");
const fs = require("node:fs");
const results = [];
function check(value, label) {
  assert.ok(value, label);
  results.push(label);
}

async function render(source, mock = "", cameraStub = false) {
  const built = await esbuild.build({
    stdin: {
      contents: `import {act} from 'react'; window.__act=act; ${source}`,
      resolveDir: project,
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    format: "iife",
    platform: "browser",
    define: {
      "process.env.NODE_ENV": '"development"',
      "import.meta.env.BASE_URL": '"/"',
      "import.meta.env.VITE_SESSION_TIMEOUT_MINUTES": '"15"',
    },
    alias: { fs: path.join(project, "src/shims/fs.ts") },
    loader: { ".png": "dataurl", ".css": "empty" },
    plugins: mock
      ? [
          {
            name: "mock-supabase",
            setup(build) {
              if (cameraStub) {
                build.onResolve(
                  { filter: /FaceIdentityVerification$/ },
                  () => ({ path: "camera", namespace: "camera" }),
                );
                build.onLoad({ filter: /.*/, namespace: "camera" }, () => ({
                  contents: "export default function Camera(){ return null; }",
                  loader: "tsx",
                }));
              }
              build.onResolve({ filter: /\/lib\/supabase$/ }, () => ({
                path: "supabase",
                namespace: "mock",
              }));
              build.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
                contents: mock,
                loader: "ts",
              }));
            },
          },
        ]
      : [],
  });
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("error", (...values) => errors.push(values.join(" ")));
  virtualConsole.on("jsdomError", (error) => errors.push(error.message));
  const dom = new JSDOM('<div id="root"></div>', {
    runScripts: "dangerously",
    url: "http://test.invalid",
    virtualConsole,
    beforeParse(w) {
      w.IS_REACT_ACT_ENVIRONMENT = true;
      w.MessageChannel = require("node:worker_threads").MessageChannel;
    },
  });
  const w = dom.window;
  w.eval(built.outputFiles[0].text);
  const tick = (fn) =>
    w.__act(async () => {
      fn?.();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  await tick(() => w.__mount());
  return { w, dom, tick, errors };
}

async function authChecks() {
  const mock = `let listener, initialResolve; const held={}; let profileReads=0;
    const user=id=>({user:{id,email:id+'@test.invalid'}});
    window.__auth={emit:(event,id)=>listener(event,id?user(id):null),
      resolveInitial:id=>initialResolve({data:{session:id?user(id):null},error:null}),
      release:(id,data)=>held[id]?.({data,error:null}), reads:()=>profileReads};
    export const supabase={auth:{getSession:()=>new Promise(r=>initialResolve=r),
      onAuthStateChange:cb=>{listener=cb;return {data:{subscription:{unsubscribe(){}}}}}},
      from:()=>({select(){return this},eq(k,id){this.id=id;return this},maybeSingle(){
        profileReads++;return this.id==='late-admin'?new Promise(r=>held[this.id]=r):Promise.resolve({data:null,error:null});
      }})};`;
  const source = `import {createRoot} from 'react-dom/client';
    import {AuthProvider,useAuth} from './src/context/AuthContext';
    function Editor(){return <input defaultValue="Unfinished census"/>}
    function Guard(){const auth=useAuth();window.__state=auth;return auth.loading?<p>Loading</p>:auth.user?<Editor/>:<p>Login</p>}
    const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<AuthProvider><Guard/></AuthProvider>);`;
  const { w, dom, tick, errors } = await render(source, mock);
  await tick(() => w.__auth.emit("SIGNED_IN", "resident"));
  const form = w.document.querySelector("input");
  check(Boolean(form), "Valid session opens protected form after profile load");
  form.value = "Unsaved edited text";
  const reads = w.__auth.reads();
  await tick(() => w.__auth.emit("TOKEN_REFRESHED", "resident"));
  check(
    form === w.document.querySelector("input") &&
      form.value === "Unsaved edited text",
    "Token refresh preserves the mounted form and unsaved input",
  );
  check(
    w.__auth.reads() === reads,
    "Token refresh does not repeat admin-profile requests",
  );
  await tick(() => w.__auth.emit("SIGNED_IN", "resident"));
  check(
    form === w.document.querySelector("input"),
    "Repeated SIGNED_IN for same user preserves the form",
  );
  await tick(() => w.__auth.emit("SIGNED_IN", "late-admin"));
  check(
    w.__state.loading && !w.__state.adminProfile,
    "Account change waits for correct profile and removes old access",
  );
  await tick(() => w.__auth.emit("SIGNED_OUT", null));
  await tick(() =>
    w.__auth.release("late-admin", { user_id: "late-admin", is_active: true }),
  );
  check(
    !w.__state.user && !w.__state.adminProfile && !w.__state.loading,
    "Late admin response cannot restore access after sign-out",
  );
  await tick(() => w.__auth.resolveInitial("resident"));
  check(
    !w.__state.user,
    "Slow initial-session lookup cannot overwrite a newer sign-out",
  );
  check(
    errors.length === 0,
    "Auth regression checks have no React/runtime errors",
  );
  dom.window.close();
}

async function censusFormChecks() {
  const mock = `let listener; let reads=0;
    const session=()=>({user:{id:'resident',email:'resident@test.invalid'}});
    window.__refresh=()=>listener('TOKEN_REFRESHED',session());window.__residentReads=()=>reads;
    const record={id:'record',tracking_number:'TEST',first_name:'First',last_name:'Resident',birth_date:'2000-01-01',
      sex:'Male',civil_status:'Single',birth_place:'Baguio',residential_address:'Old Lucban',citizenship:'Filipino'};
    export const supabase={auth:{getSession:async()=>({data:{session:session()},error:null}),
      onAuthStateChange:cb=>{listener=cb;return{data:{subscription:{unsubscribe(){}}}}}},
      from:table=>({select(){return this},eq(){return this},is(){return this},order(){return this},
        maybeSingle(){if(table==='residents')reads++;return Promise.resolve({data:table==='residents'?record:null,error:null})},
        then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)}}),
      storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'https://test.invalid/image'},error:null})})}};`;
  const source = `import {createRoot} from 'react-dom/client';import {AuthProvider,useAuth} from './src/context/AuthContext';
    import CensusForm from './src/pages/CensusForm';
    window.location.hash='/resident/census?mode=edit';
    function Guard(){const {loading}=useAuth();return loading?<p>Loading auth</p>:<CensusForm onDashboard={()=>{}}/>}
    const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<AuthProvider><Guard/></AuthProvider>);`;
  const { w, dom, tick, errors } = await render(source, mock, true);
  await tick();
  const field = w.document.querySelector('[data-field="first_name"]');
  check(Boolean(field), "Existing census editor loads saved information");
  const reads = w.__residentReads();
  await tick(() => {
    Object.getOwnPropertyDescriptor(
      w.HTMLInputElement.prototype,
      "value",
    ).set.call(field, "Unsaved resident change");
    field.dispatchEvent(new w.Event("input", { bubbles: true }));
    field.dispatchEvent(new w.Event("change", { bubbles: true }));
  });
  await tick(() => w.__refresh());
  check(
    w.__residentReads() === reads,
    "Token refresh does not reload saved census data over edits",
  );
  check(
    field === w.document.querySelector('[data-field="first_name"]') &&
      field.value === "Unsaved resident change",
    "Real CensusForm keeps its input after token refresh",
  );
  check(
    errors.length === 0,
    "Census editor regression has no React/runtime errors",
  );
  dom.window.close();
}

async function pagingChecks() {
  const source = `import {useCallback,useState} from 'react';import {createRoot} from 'react-dom/client';
    import PaginationControls from './src/components/PaginationControls';
    import {usePagedQuery,searchPattern} from './src/hooks/usePagedQuery';
    window.__calls=[];window.__count=31;
    function Test(){const [page,setPage]=useState(3); const query=useCallback(async(from,to)=>{
      window.__calls.push([from,to]); return {data:Array.from({length:Math.max(0,Math.min(to+1,window.__count)-from)},(_,i)=>from+i+1),count:window.__count,error:null};
    },[]);const data=usePagedQuery({page,pageSize:10,onPageChange:setPage,query});window.__reload=data.reload;
    window.__pattern=searchPattern('name%_');window.__page=page;
    return <><p>{data.rows.join(',')}</p><PaginationControls page={page} totalItems={data.total} pageSize={10} onPageChange={setPage}/></>}
    const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<Test/>);`;
  const { w, dom, tick, errors } = await render(source);
  check(
    JSON.stringify(w.__calls[0]) === "[20,29]",
    "Server query requests only the selected page",
  );
  await tick(() => {
    w.__count = 11;
    void w.__reload();
  });
  await tick();
  check(
    w.__page === 2 && JSON.stringify(w.__calls.at(-1)) === "[10,19]",
    "Shrinking list clamps state and reloads the last valid server page",
  );
  check(
    w.document.querySelector('[aria-current="page"]')?.textContent === "2",
    "Pagination highlights the same page as the data",
  );
  const buttons = [...w.document.querySelectorAll("button")];
  check(
    buttons.at(-1).disabled && !buttons[0].disabled,
    "Previous and Next use the valid page boundaries",
  );
  check(
    w.__pattern === "%name\\%\\_%",
    "Search treats percent and underscore as literal text",
  );
  check(
    errors.length === 0,
    "Pagination regression checks have no React/runtime errors",
  );
  dom.window.close();
}

async function adminPageChecks() {
  const source = `import {useState} from 'react';import {createRoot} from 'react-dom/client';
    import {AuthProvider,useAuth} from './src/context/AuthContext';import AdminDashboard from './src/pages/AdminDashboard';
    function Guard(){const {loading}=useAuth();const [tab,setTab]=useState('records');window.__tab=setTab;
      return loading?<p>Loading auth</p>:<AdminDashboard tab={tab} onReview={()=>{}} onLogout={()=>{}}/>}
    const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<AuthProvider><Guard/></AuthProvider>);`;
  const { w, dom, tick, errors } = await render(
    source,
    fs.readFileSync(path.join(__dirname, "fixtures/admin-api.js"), "utf8"),
    true,
  );
  w.confirm = () => true;
  await tick();
  const button = (label) =>
    [...w.document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === label,
    );
  const click = async (target) => {
    assert.ok(target, "Expected admin control");
    await tick(() => target.click());
    await tick();
  };
  check(
    w.document.querySelectorAll("article").length === 8,
    "Resident Records renders only eight database rows per page",
  );
  await click(button("Next"));
  check(
    w.__requests.some(
      (r) =>
        r.table === "admin_resident_records" &&
        r.range?.[0] === 8 &&
        r.range?.[1] === 15,
    ),
    "Resident Next button fetches the next server range",
  );
  await tick(() => w.__tab("analytics"));
  check(w.document.body.textContent.includes("Residents by Registration Status"), "Analytics initially displays current resident status statistics");
  await click(button("Demographics"));
  check(["Residents by Age Group", "Residents by Sex", "Residents by Civil Status"].every(s=>w.document.body.textContent.includes(s)), "Demographic section renders specific chart titles");
  await click(button("Education and Work"));
  check(w.document.body.textContent.includes("Residents by Highest Education"), "Education statistics are organized in their own section");
  check(w.document.body.textContent.includes("Address groups are not verified household counts"), "Analytics explains the distinction between address groups and households");
  await tick(() => w.__tab("appointments"));
  check(
    w.__requests.some(
      (r) =>
        r.table === "admin_service_records" &&
        r.range?.[0] === 0 &&
        r.range?.[1] === 7,
    ),
    "Appointments queries a bounded server page",
  );
  check(
    w.__requests.some(
      (r) =>
        r.table === "admin_service_records" &&
        r.filters.some(
          ([k, v]) =>
            k === "status" && JSON.stringify(v) === '["pending","confirmed"]',
        ),
    ),
    "Active Appointments requests only active statuses",
  );
  await tick(() => w.__tab("announcements"));
  await tick();
  check(
    w.document.querySelectorAll("article").length === 6,
    "Announcement list renders only its current database page",
  );
  check(
    w.__signed.length === 6,
    "Only six visible announcement banners receive signed URLs",
  );
  const seeMore = button("See More") || button("View More");
  await click(seeMore);
  check(
    Boolean(w.document.querySelector('[aria-labelledby="announcement-detail-title"]')),
    "Long announcement opens a complete detail dialog",
  );
  await tick(() => w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await click(button("Archive"));
  check(
    w.document.body.textContent.includes("Announcement archived."),
    "Archive mutation refreshes the paged list",
  );
  await click(
    [...w.document.querySelectorAll("button")].find((b) =>
      b.textContent.trim().startsWith("Archived ("),
    ),
  );
  check(
    w.document.querySelectorAll("article").length === 2,
    "Archived tab loads the original and newly archived records",
  );
  await click(button("Restore"));
  check(
    w.document.body.textContent.includes("Announcement restored."),
    "Restore mutation works after pagination changes",
  );
  check(
    errors.length === 0,
    "Changed admin screens have no React/runtime errors in component checks",
  );
  dom.window.close();
}

function buildToolChecks() {
  const braces = require("braces");
  check(
    JSON.stringify(braces.expand("src/{pages,components}/*.tsx")) ===
      JSON.stringify(["src/pages/*.tsx", "src/components/*.tsx"]),
    "Normal Tailwind glob expansion still works",
  );
  const pattern = "{".repeat(3000) + "a,b" + "}".repeat(3000);
  for (const method of ["parse", "compile", "expand", "stringify"]) {
    assert.throws(
      () => braces[method](pattern),
      (error) =>
        error instanceof SyntaxError && /safe nesting/.test(error.message),
    );
    results.push(`Deep brace input is rejected safely by ${method}`);
  }
  let ast = { type: "text", value: "a" };
  for (let i = 0; i < 5000; i++) ast = { type: "root", nodes: [ast] };
  for (const method of ["compile", "expand", "stringify"]) {
    assert.throws(
      () => braces[method](ast),
      (error) =>
        error instanceof SyntaxError && /safe nesting/.test(error.message),
    );
    results.push(`Direct deeply nested AST is rejected safely by ${method}`);
  }
}

(async () => {
  await authChecks();
  await censusFormChecks();
  await pagingChecks();
  await adminPageChecks();
  buildToolChecks();
  console.log(
    JSON.stringify({ passed: results.length, checks: results }, null, 2),
  );
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
