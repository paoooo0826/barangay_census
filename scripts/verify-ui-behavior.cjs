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
  await c.close();
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
