const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  esbuild = require("esbuild");
const { JSDOM, VirtualConsole } = require("jsdom");
const project = path.resolve(__dirname, ".."),
  checks = [];
function check(value, label) {
  assert.ok(value, label);
  checks.push(label);
}
async function render(
  component,
  api = "export const supabase={}",
  setup = () => {},
) {
  const built = await esbuild.build({
    stdin: {
      contents: `import {act} from 'react';import {createRoot} from 'react-dom/client';window.__act=act;${component};const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<Test/>);window.__unmount=()=>root.unmount();`,
      loader: "tsx",
      resolveDir: project,
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
        name: "api",
        setup(b) {
          b.onResolve({ filter: /\/lib\/supabase$/ }, () => ({
            path: "api",
            namespace: "mock",
          }));
          b.onResolve({ filter: /\/context\/AuthContext$/ }, () => ({
            path: "auth",
            namespace: "mock",
          }));
          b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
            loader: "tsx",
            contents:
              a.path === "api"
                ? api
                : `export const useAuth=()=>({user:{id:'u0'},adminProfile:{is_active:true},loading:false,signOut:async()=>{window.__logouts++;return{error:null}}});`,
          }));
        },
      },
    ],
  });
  const errors = [],
    vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  vc.on("error", (...e) => errors.push(e.join(" ")));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://test.invalid/",
    pretendToBeVisual: true,
    runScripts: "dangerously",
    virtualConsole: vc,
    beforeParse(w) {
      w.IS_REACT_ACT_ENVIRONMENT = true;
      w.__logouts = 0;
      w.ResizeObserver = class {
        observe() {}
        disconnect() {}
      };
      w.matchMedia = () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      });
      w.URL.createObjectURL = () => "blob:fixture";
      w.URL.revokeObjectURL = () => {};
      w.MessageChannel = require("node:worker_threads").MessageChannel;
      setup(w);
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
    tick,
    errors,
    close: async () => {
      await tick(() => w.__unmount());
      dom.window.close();
    },
  };
}
const button = (w, text) =>
  [...w.document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === text,
  );
(async () => {
  let t = await render(
    `import {useIdleSession,activityKey} from './src/hooks/useIdleSession';function Test(){const idle=useIdleSession('resident',async()=>{window.__expired++},120000);window.__idle=idle;window.__key=activityKey('resident');return <p>{idle.remaining??'active'}</p>}`,
    undefined,
    (w) => {
      w.__now = 1_000_000;
      w.Date.now = () => w.__now;
      w.__expired = 0;
      w.__timers = [];
      w.setInterval = (f) => {
        w.__timers.push(f);
        return w.__timers.length;
      };
      w.clearInterval = () => {};
    },
  );
  check(t.w.__idle.remaining === null, "Fresh resident session starts active");
  await t.tick(() => {
    t.w.__now += 61000;
    t.w.__timers.forEach((f) => f());
  });
  check(
    t.w.__idle.remaining === 59,
    "Warning uses actual elapsed time and a 60 second countdown",
  );
  await t.tick(() => t.w.__idle.stay());
  check(
    t.w.__idle.remaining === null,
    "Stay Signed In resets warning and shared activity timestamp",
  );
  await t.tick(() => {
    t.w.__now += 119000;
    t.w.__timers.forEach((f) => f());
  });
  check(
    t.w.__idle.remaining === 1,
    "Countdown reaches the last second without logging out early",
  );
  await t.tick(() => {
    t.w.__now += 2000;
    t.w.dispatchEvent(new t.w.Event("focus"));
  });
  check(
    t.w.__expired === 1 && t.w.__idle.expiring,
    "Resumed tab expires immediately after elapsed inactivity",
  );
  await t.tick(() => t.w.__timers.forEach((f) => f()));
  check(t.w.__expired === 1, "Expiry runs once while signout is processing");
  await t.close();
  t = await render(
    `import {useIdleSession,activityKey} from './src/hooks/useIdleSession';function Test(){const idle=useIdleSession('admin',async()=>{window.__expired++},120000);window.__idle=idle;window.__key=activityKey('admin');return <p>Admin</p>}`,
    undefined,
    (w) => {
      w.__now = 1_000_000;
      w.Date.now = () => w.__now;
      w.__expired = 0;
      w.__timers = [];
      w.setInterval = (f) => {
        w.__timers.push(f);
        return 1;
      };
      w.clearInterval = () => {};
    },
  );
  await t.tick(() => {
    t.w.__now += 65000;
    t.w.localStorage.setItem(t.w.__key, String(t.w.__now));
    t.w.dispatchEvent(new t.w.StorageEvent("storage", { key: t.w.__key }));
  });
  check(
    t.w.__idle.remaining === null,
    "Activity in another tab keeps an admin session active",
  );
  await t.tick(() => {
    t.w.localStorage.setItem("barangay:expired:admin", String(t.w.__now));
    t.w.dispatchEvent(
      new t.w.StorageEvent("storage", { key: "barangay:expired:admin" }),
    );
  });
  check(t.w.__expired === 1, "An expiry marker logs out other tabs");
  await t.close();
  t = await render(
    `import Detail from './src/components/AnnouncementDetail';import {useState} from 'react';function Test(){const [open,setOpen]=useState(true);return open?<Detail announcement={{title:'Important notice',message:'Complete text '.repeat(60),imageUrl:'https://test.invalid/photo.jpg'}} onClose={()=>setOpen(false)}/>:<p>Closed</p>}`,
  );
  check(
    t.w.document
      .querySelector("[role=dialog]")
      ?.textContent.includes("Complete text ".repeat(60).trim()),
    "Announcement details render the full long text",
  );
  check(
    t.w.document.querySelector("img").className.includes("object-contain"),
    "Detail image retains its natural aspect ratio",
  );
  await t.tick(() =>
    t.w.document.querySelector("img").dispatchEvent(new t.w.Event("error")),
  );
  check(
    t.w.document.body.textContent.includes("Attached image unavailable"),
    "Broken announcement images show a fallback",
  );
  await t.tick(() =>
    t.w.document.dispatchEvent(
      new t.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  check(
    t.w.document.body.textContent === "Closed",
    "Announcement detail closes with Escape",
  );
  await t.close();
  const canvasSetup = (w) => {
    w.__draws = [];
    w.__orientation = null;
    w.createImageBitmap = async (_file, opts) => {
      w.__orientation = opts.imageOrientation;
      return { width: 1200, height: 800, close() {} };
    };
    w.HTMLCanvasElement.prototype.getContext = () => ({
      drawImage(...args) {
        w.__draws.push(args.slice(1));
      },
      fillRect() {},
      set fillStyle(_) {},
    });
    w.HTMLCanvasElement.prototype.toBlob = function (fn) {
      fn(new w.Blob(["crop"], { type: "image/jpeg" }));
    };
  };
  t = await render(
    `import Crop,{cropRectangle} from './src/components/ImageCropDialog';import {useState} from 'react';function Test(){const [open,setOpen]=useState(true);window.__rect=cropRectangle;return open?<Crop file={window.__file??(window.__file=new File(['photo'],'id.jpg',{type:'image/jpeg'}))} kind="id" onCancel={()=>setOpen(false)} onConfirm={file=>{window.__confirmed=file;setOpen(false)}}/>:<p>Closed</p>}`,
    undefined,
    canvasSetup,
  );
  check(
    t.w.__orientation === "from-image",
    "Image decoding applies EXIF orientation before cropping",
  );
  let r = t.w.__rect(1200, 800, 1.5, 1, 0.5, 0.5);
  check(
    r.x === 0 && r.y === 0 && r.width === 1200 && r.height === 800,
    "ID crop initially preserves the entire image",
  );
  const zoom = t.w.document.querySelector('[aria-label="Crop zoom"]');
  await t.tick(() => {
    const set = Object.getOwnPropertyDescriptor(
      t.w.HTMLInputElement.prototype,
      "value",
    ).set;
    set.call(zoom, "2");
    zoom.dispatchEvent(new t.w.Event("input", { bubbles: true }));
    zoom.dispatchEvent(new t.w.Event("change", { bubbles: true }));
  });
  const c = t.w.document.querySelector("canvas");
  await t.tick(() =>
    c.dispatchEvent(
      new t.w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    ),
  );
  check(
    t.w.__draws.at(-1)[0] > 0,
    "Crop supports accessible positioning with arrow keys",
  );
  await t.tick(() => button(t.w, "Reset").click());
  check(t.w.__draws.at(-1)[2] === 1200, "Reset restores the full ID image");
  await t.tick(() => button(t.w, "Confirm Crop").click());
  check(
    t.w.__confirmed?.type === "image/jpeg" && t.w.__confirmed.size > 0,
    "Confirmed crop produces a nonempty image file",
  );
  await t.close();
  t = await render(
    `import {useImageCrop} from './src/components/ImageCropDialog';import {useState} from 'react';function Test(){const {crop,cropDialog}=useImageCrop();const [name,setName]=useState('previous.jpg');window.__open=async()=>{const f=await crop(new File(['photo'],'new.jpg',{type:'image/jpeg'}),'announcement');if(f)setName(f.name)};return <><p>{name}</p>{cropDialog}</>}`,
    undefined,
    canvasSetup,
  );
  await t.tick(() => {
    void t.w.__open();
  });
  r = t.w.__draws.at(-1);
  check(
    Math.abs(r[2] / r[3] - 16 / 7) < 0.01,
    "Announcement crop uses a banner aspect ratio",
  );
  await t.tick(() => button(t.w, "Cancel").click());
  check(
    t.w.document.body.textContent === "previous.jpg",
    "Cancelling a crop preserves the previous image",
  );
  await t.close();
  t = await render(
    `import Crop from './src/components/ImageCropDialog';function Test(){return <Crop file={window.__file??(window.__file=new File(['bad'],'bad.jpg',{type:'image/jpeg'}))} kind="id" onCancel={()=>{}} onConfirm={()=>{}}/>}`,
    undefined,
    (w) => {
      w.createImageBitmap = async () => {
        throw new Error("bad image");
      };
    },
  );
  check(
    t.w.document.body.textContent.includes("Unable to read this image"),
    "Undecodable images show a useful error",
  );
  check(
    button(t.w, "Confirm Crop").disabled,
    "Failed image decode cannot be confirmed",
  );
  await t.close();
  t = await render(
    `import IdCamera from './src/components/IdCameraCapture';function Test(){return <IdCamera side="front" onCapture={()=>{}}/>}`,
    undefined,
    (w) => {
      w.requestAnimationFrame = (fn) => w.setTimeout(fn, 1);
      w.__stops = 0;
      Object.defineProperty(w.navigator, "mediaDevices", {
        value: {
          getUserMedia: () =>
            new Promise(
              (resolve) =>
                (w.__cameraResolve = () =>
                  resolve({
                    getTracks: () => [
                      {
                        stop() {
                          w.__stops++;
                        },
                      },
                    ],
                  })),
            ),
        },
      });
    },
  );
  await t.tick(() => button(t.w, "Take live photo").click());
  check(
    t.w.document
      .querySelector("[role=dialog]")
      ?.className.includes("fixed inset-0"),
    "Camera is fullscreen while permission is still pending",
  );
  await t.tick(() =>
    t.w.document.querySelector('[aria-label="Close camera"]').click(),
  );
  await t.tick(() => t.w.__cameraResolve());
  check(
    t.w.__stops === 1 && !t.w.document.querySelector("[role=dialog]"),
    "Camera permission arriving after close releases returned tracks",
  );
  await t.close();
  const fixture = fs.readFileSync(
    path.join(project, "scripts/fixtures/admin-api.js"),
    "utf8",
  );
  for (const mode of ["completed", "cancelled"]) {
    t = await render(
      `import A from './src/components/AdminAppointments';function Test(){return <A mode="${mode}"/>}`,
      fixture,
    );
    check(
      t.w.document.body.textContent.includes(
        `${mode === "completed" ? "Completed" : "Cancelled"} Appointments`,
      ),
      `Admin ${mode} page has its own title`,
    );
    check(
      t.w.__requests
        .filter((r) => r.table === "admin_service_records")
        .every((r) =>
          r.filters?.some(
            ([key, values]) =>
              key === "status" &&
              Array.isArray(values) &&
              values.length === 1 &&
              values[0] === mode,
          ),
        ),
      `Admin ${mode} query stays within its status scope`,
    );
    await t.close();
  }
  t = await render(
    `import App from './src/App';function Test(){return <App/>}`,
    fixture,
    (w) => {
      w.location.hash = "#/admin/dashboard?tab=records";
    },
  );
  await t.tick(() =>
    t.w.document
      .querySelector('[aria-label="Back to previous application page"]')
      .click(),
  );
  check(
    t.w.document.body.textContent.includes("Are you sure you want to log out?"),
    "Back without an earlier application page asks before ending the session",
  );
  await t.tick(() => button(t.w, "Cancel").click());
  check(
    t.w.location.hash === "#/admin/dashboard?tab=records" &&
      t.w.__logouts === 0,
    "Cancel keeps the protected page and valid authentication",
  );
  await t.tick(() => {
    t.w.location.hash = "/admin/dashboard?tab=analytics";
  });
  await t.tick(() => t.w.history.back());
  await t.tick();
  check(
    t.w.location.hash === "#/admin/dashboard?tab=records" &&
      !t.w.document.body.textContent.includes("Administrator Login"),
    "Browser Back restores the earlier application page without another login",
  );
  await t.tick(() => (t.w.location.hash = "/admin"));
  await t.tick();
  check(
    t.w.location.hash === "#/admin/dashboard",
    "An authenticated admin reaching login is redirected without a login form",
  );
  check(
    t.errors.length === 0,
    "Back navigation and auth route tests have no runtime errors",
  );
  await t.close();
  const residentApi = `window.__status='pending';window.__owners=[];export const supabase={rpc:async name=>({data:name==='get_service_catalog'?[]:230,error:null}),from:()=>({select(){return this},eq(k,v){if(k==='user_id')window.__owners.push(v);return this},order(){return this},then(resolve){return Promise.resolve({data:[{id:'a1',resident_id:'r0',user_id:'u0',service_type:'barangay_clearance',purpose:'Employment request',fee:230,status:window.__status,appointment_date:'2026-11-02',appointment_time:'09:00',completed_at:window.__status==='completed'?'2026-10-10T03:00:00Z':null}],error:null}).then(resolve)}})};`;
  t = await render(
    `import A from './src/components/ResidentAppointments';import {useHashRoute} from './src/hooks/useHashRoute';function Test(){const route=useHashRoute(),mode=route.includes('completed')?'completed':'active';return <A key={mode} mode={mode} resident={{id:'r0'}}/>}`,
    residentApi,
  );
  check(
    t.w.document.body.textContent.includes("Employment request") ||
      t.w.document.querySelector("article"),
    "Resident active page displays the owned active appointment",
  );
  check(
    t.w.__owners.length > 0 && t.w.__owners.every((id) => id === "u0"),
    "Every resident appointment read is account scoped",
  );
  await t.tick(() => {
    t.w.__status = "completed";
    t.w.dispatchEvent(new t.w.Event("focus"));
  });
  check(
    t.w.document.body.textContent.includes("No appointments in this category."),
    "A background status change removes a completed request from the active page",
  );
  await t.tick(() => {
    t.w.location.hash = "/resident/dashboard?tab=completed";
  });
  check(
    t.w.document.body.textContent.includes("Completed Appointments") &&
      t.w.document.querySelector("article"),
    "Completed request appears on its dedicated page without manual refresh",
  );
  check(
    t.w.document.body.textContent.includes("Completed:"),
    "Resident history includes its completion timestamp",
  );
  check(
    t.errors.length === 0,
    "Resident page transition checks have no runtime errors",
  );
  await t.close();
  console.log(`Enhancement verification passed (${checks.length} checks).`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
