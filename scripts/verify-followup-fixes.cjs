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

async function render(source, mock = "", cameraStub = false, options = {}) {
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
    },
    alias: { fs: path.join(project, "src/shims/fs.ts") },
    loader: { ".png": "dataurl", ".css": "empty" },
    plugins: mock
      ? [
          {
            name: "mock-supabase",
            setup(build) {
              if (options.camera) {
                build.onResolve({ filter: /VideoGuide$/ }, () => ({
                  path: "guide",
                  namespace: "guide-test",
                }));
                build.onLoad({ filter: /.*/, namespace: "guide-test" }, () => ({
                  contents: "export default function Guide(){return null}",
                  loader: "tsx",
                }));
                build.onResolve({ filter: /^face-api.js$/ }, () => ({
                  path: "faceapi",
                  namespace: "face-test",
                }));
                build.onLoad({ filter: /.*/, namespace: "face-test" }, () => ({
                  loader: "ts",
                  contents: `
                  export const nets={};export async function bufferToImage(){return null};export function euclideanDistance(){return 0};
                  export class TinyFaceDetectorOptions{}
                  export function detectAllFaces(){return {withFaceLandmarks(){return this},withFaceExpressions(){return this},
                    withFaceDescriptors(){return new Promise(resolve=>window.__facePending.push(resolve))}}}
                `,
                }));
                build.onLoad(
                  { filter: /FaceIdentityVerification\.tsx$/ },
                  (args) => ({
                    loader: "tsx",
                    resolveDir: path.dirname(args.path),
                    contents: fs.readFileSync(args.path, "utf8").replace(
                      "const currentAction = actions[actionIndex];",
                      `
                    window.__camera={start:()=>startCamera(['blink_twice','turn_left','smile']),reset:resetVerification,
                      capture:()=>captureAndCompare(['blink_twice','turn_left','smile']),complete:()=>complete,
                      seed:()=>{idQualityRef.current={brightness:128,blurVariance:100,faceAreaRatio:0.1,detectedFaces:0};
                        idFaceAvailableRef.current=false;idDescriptorRef.current=null;}};
                    const currentAction = actions[actionIndex];
                  `,
                    ),
                  }),
                );
              }
              if (options.registration) {
                build.onLoad(
                  { filter: /ResidentRegistration\.tsx$/ },
                  (args) => ({
                    loader: "tsx",
                    resolveDir: path.dirname(args.path),
                    contents: fs.readFileSync(args.path, "utf8").replace(
                      "function imageField(",
                      `
                    window.__registration={save:()=>saveVerification(window.__result),reset:resetSavedVerification,
                      seed:()=>{setIdType('PhilSys ID');setFrontImage(new File(['front'],'front.jpg',{type:'image/jpeg'}));
                        setBackImage(new File(['back'],'back.jpg',{type:'image/jpeg'}));}};
                    function imageField(
                  `,
                    ),
                  }),
                );
              }
              if (options.pages)
                build.onResolve({ filter: /^\.\/pages\// }, (args) => {
                  if (args.path.endsWith("ResidentRegistration")) return;
                  return { path: "page:" + args.path, namespace: "page-stub" };
                });
              build.onLoad(
                { filter: /.*/, namespace: "page-stub" },
                (args) => ({
                  contents: `export default function Page(){ return <p>${args.path}</p>; }`,
                  loader: "tsx",
                  resolveDir: project,
                }),
              );
              if (cameraStub) {
                build.onResolve(
                  { filter: /FaceIdentityVerification$|IdCameraCapture$/ },
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
      w.crypto.randomUUID = require("node:crypto").randomUUID;
      w.URL.createObjectURL = () => "blob:test-preview";
      w.URL.revokeObjectURL = () => {};
      if (options.camera) {
        w.__facePending = [];
        w.__verified = [];
        w.__trackStops = 0;
        const frames = [];
        w.requestAnimationFrame = (callback) => frames.push(callback);
        w.__paint = () => frames.splice(0).forEach((callback) => callback(0));
        Object.defineProperty(w.navigator, "mediaDevices", {
          value: {
            getUserMedia: () =>
              new Promise(
                (resolve) =>
                  (w.__releaseCamera = () =>
                    resolve({
                      getTracks: () => [
                        {
                          stop() {
                            w.__trackStops++;
                          },
                        },
                      ],
                    })),
              ),
          },
        });
        Object.defineProperty(w.HTMLVideoElement.prototype, "videoWidth", {
          get: () => 1280,
        });
        Object.defineProperty(w.HTMLVideoElement.prototype, "videoHeight", {
          get: () => 960,
        });
        w.HTMLMediaElement.prototype.play = () => Promise.resolve();
        w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
        w.HTMLCanvasElement.prototype.toBlob = function (callback) {
          const finish = () =>
            callback(
              w.__blobMode === "null"
                ? null
                : new w.Blob(w.__blobMode === "empty" ? [] : ["image"], {
                    type: "image/jpeg",
                  }),
            );
          if (w.__delayBlob) w.__finishBlob = finish;
          else finish();
        };
        w.__finishFace = () =>
          w.__facePending.shift()([
            {
              detection: { box: { x: 450, y: 250, width: 350, height: 440 } },
              descriptor: new Float32Array([0]),
            },
          ]);
      }
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

async function routeChecks() {
  const mock = `let listener;let held;let reads=0;
    const session=()=>({user:{id:'resident',email:'resident@test.invalid'}});
    window.__refresh=()=>{window.__hold=true;listener('TOKEN_REFRESHED',session())};
    window.__release=()=>held?.({data:null,error:null});window.__reads=()=>reads;
    export const supabase={auth:{getSession:async()=>({data:{session:session()},error:null}),
      onAuthStateChange:callback=>{listener=callback;return{data:{subscription:{unsubscribe(){}}}}}},
      from:table=>({select(){return this},eq(){return this},maybeSingle(){if(table==='residents'){
        reads++;if(window.__hold)return new Promise(resolve=>held=resolve)}return Promise.resolve({data:null,error:null})}})};`;
  const source = `import {createRoot} from 'react-dom/client';import App from './src/App';import {AuthProvider} from './src/context/AuthContext';
    window.location.hash='/resident/register';const root=createRoot(document.getElementById('root'));
    window.__mount=()=>root.render(<AuthProvider><App/></AuthProvider>);window.__unmount=()=>root.unmount();`;
  const t = await render(source, mock, true, { pages: true });
  for (let i = 0; i < 4; i++) await t.tick();
  const select = t.w.document.querySelector("select");
  await t.tick(() => {
    select.value = "PhilSys ID";
    select.dispatchEvent(new t.w.Event("change", { bubbles: true }));
  });
  const reads = t.w.__reads();
  await t.tick(() => t.w.__refresh());
  check(
    t.w.document.querySelector("select") === select &&
      select.value === "PhilSys ID",
    "Token refresh keeps actual ID registration mounted and preserves ID selection",
  );
  check(
    t.w.__reads() === reads,
    "Token refresh does not repeat resident route lookup",
  );
  await t.tick(() => t.w.__unmount());
  check(
    t.errors.length === 0,
    "Registration route has no React/runtime errors",
  );
  t.dom.window.close();

  const adminMock = `window.__fail=true;const session={user:{id:'admin',email:'admin@test.invalid'}};
    export const supabase={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from:()=>({select(){return this},eq(){return this},maybeSingle(){return window.__fail?
        Promise.reject(new Error('Temporary profile failure')):Promise.resolve({data:{user_id:'admin',is_active:true},error:null})}})};`;
  const a = await render(
    source.replace("'/resident/register'", "'/admin'"),
    adminMock,
    true,
    { pages: true },
  );
  for (let i = 0; i < 3; i++) await a.tick();
  check(
    a.w.location.hash === "#/admin" &&
      a.w.document
        .querySelector("[role=alert]")
        ?.textContent.includes("administrator access"),
    "Admin-profile request failure keeps selected admin portal and shows retry",
  );
  await a.tick(() => {
    a.w.__fail = false;
    [...a.w.document.querySelectorAll("button")]
      .find((b) => b.textContent === "Retry")
      .click();
  });
  for (let i = 0; i < 3; i++) await a.tick();
  check(
    a.w.location.hash === "#/admin/dashboard",
    "Retry restores admin dashboard after profile lookup succeeds",
  );
  check(
    a.errors.length === 0,
    "Rejected profile-query promise is handled without React/runtime errors",
  );
  await a.tick(() => a.w.__unmount());
  a.dom.window.close();

  const residentMock = adminMock
    .replace("window.__fail=true", "window.__fail=false")
    .replace("from:()=>", "from:table=>")
    .replace(
      "data:{user_id:'admin',is_active:true}",
      "data:table==='admin_profiles'?{user_id:'admin',is_active:true}:{id:'record'}",
    );
  const r = await render(
    source.replace("'/resident/register'", "'/resident'"),
    residentMock,
    true,
    { pages: true },
  );
  for (let i = 0; i < 4; i++) await r.tick();
  check(
    r.w.location.hash === "#/resident/dashboard",
    "Admin account choosing Resident still opens resident dashboard",
  );
  await r.tick(() => r.w.__unmount());
  r.dom.window.close();

  const lookupMock = residentMock
    .replace("window.__fail=false", "window.__fail=true")
    .replace(
      "return window.__fail?",
      "return table==='residents' && window.__fail?",
    );
  const f = await render(
    source.replace("'/resident/register'", "'/resident'"),
    lookupMock,
    true,
    { pages: true },
  );
  for (let i = 0; i < 4; i++) await f.tick();
  check(
    f.w.location.hash === "#/resident" &&
      f.w.document
        .querySelector("[role=alert]")
        ?.textContent.includes("census record"),
    "Failed resident-record lookup does not incorrectly open new registration",
  );
  await f.tick(() => {
    f.w.__fail = false;
    [...f.w.document.querySelectorAll("button")]
      .find((b) => b.textContent === "Retry")
      .click();
  });
  for (let i = 0; i < 3; i++) await f.tick();
  check(
    f.w.location.hash === "#/resident/dashboard",
    "Resident route lookup can recover through Retry",
  );
  await f.tick(() => f.w.__unmount());
  f.dom.window.close();
}

async function cameraChecks() {
  const source = `import {createRoot} from 'react-dom/client';import Face from './src/components/FaceIdentityVerification';
    const root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<Face idFrontFile={null}
      onVerified={result=>{window.__verified.push(result);return window.__saveMode==='wait'?new Promise(resolve=>window.__finishSave=resolve):
        window.__saveMode==='fail'?Promise.reject(new Error('Upload failed. Please retry.')):undefined}}/>);window.__unmount=()=>root.unmount();`;
  const t = await render(source, "export const supabase={}", false, {
    camera: true,
  });
  const { w, tick } = t;
  async function open() {
    await tick(() => {
      w.__opening = w.__camera.start();
    });
    await tick(() => w.__releaseCamera());
    await tick(() => w.__paint());
    await w.__opening;
    await tick(() => w.__camera.seed());
  }
  async function capture() {
    await tick(() => {
      w.__capture = w.__camera.capture();
    });
    await tick(() => w.__finishFace());
  }
  await tick(() => {
    w.__opening = w.__camera.start();
  });
  await tick(() => w.__camera.reset());
  await tick(() => w.__releaseCamera());
  await w.__opening;
  check(
    w.__trackStops === 1 && !w.document.querySelector("video"),
    "Permission result arriving after Reset is stopped and cannot reopen camera",
  );
  await open();
  await tick(() => {
    w.__capture = w.__camera.capture();
  });
  await tick(() => w.__camera.reset());
  await tick(() => w.__finishFace());
  await w.__capture;
  check(
    w.__verified.length === 0,
    "Face detection finishing after Reset cannot report successful verification",
  );
  await open();
  w.__delayBlob = true;
  await capture();
  await tick(() => w.__camera.reset());
  await tick(() => w.__finishBlob());
  await w.__capture;
  check(
    w.__verified.length === 0,
    "Image encoding finishing after Reset cannot advance verification",
  );
  w.__delayBlob = false;
  await open();
  w.__saveMode = "wait";
  await tick(() => {
    w.__capture = w.__camera.capture();
    void w.__camera.capture();
  });
  check(
    w.__facePending.length === 1,
    "Concurrent automatic captures produce only one final detection",
  );
  await tick(() => w.__finishFace());
  check(
    w.__verified.length === 1 &&
      w.__verified[0].file.size > 0 &&
      Boolean(w.__verified[0].idQuality),
    "Valid capture supplies a nonempty File and captured ID-quality snapshot",
  );
  check(
    !w.__camera.complete(),
    "Verification does not show complete while upload callback is pending",
  );
  await tick(() => w.__finishSave());
  await w.__capture;
  await tick();
  check(
    w.__camera.complete(),
    "Verification completes after successful upload callback",
  );
  await tick(() => w.__camera.reset());
  await open();
  w.__saveMode = "";
  w.__blobMode = "empty";
  await capture();
  await w.__capture;
  await tick();
  check(
    w.__verified.length === 1 && !w.__camera.complete(),
    "Empty image blob cannot advance or report successful verification",
  );
  await tick(() => w.__camera.reset());
  await open();
  w.__blobMode = "null";
  await capture();
  await w.__capture;
  await tick();
  check(
    w.__verified.length === 1 && !w.__camera.complete(),
    "Null image blob cannot advance or report successful verification",
  );
  await tick(() => w.__camera.reset());
  await open();
  w.__blobMode = "";
  w.__saveMode = "fail";
  await capture();
  await w.__capture;
  await tick();
  check(
    !w.__camera.complete() &&
      w.document.body.textContent.includes("Upload failed. Please retry."),
    "Failed upload leaves verification incomplete with a useful retry message",
  );
  await tick(() => w.__camera.reset());
  await tick(() => {
    w.__opening = w.__camera.start();
  });
  const stops = w.__trackStops;
  await tick(() => w.__unmount());
  await tick(() => w.__releaseCamera());
  await w.__opening;
  check(
    w.__trackStops === stops + 1,
    "Permission result arriving after unmount stops all returned camera tracks",
  );
  check(
    t.errors.length === 0,
    "Camera cancellation/capture tests have no React/runtime errors",
  );
  t.dom.window.close();
}

async function registrationSaveChecks() {
  const mock = `window.__uploads=[];window.__removals=[];const session={user:{id:'resident',email:'resident@test.invalid'}};
    export const supabase={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:null})}),
      storage:{from:()=>({upload:async path=>{window.__uploads.push(path);return window.__uploadMode==='hold'?new Promise(resolve=>window.__finishUpload=()=>resolve({error:null})):
        window.__uploadMode==='fail' && path.includes('id-back')?{error:new Error('Back photo upload failed')}:{error:null}},
        remove:async paths=>{window.__removals.push(...paths);return{error:null}}})}};`;
  const source = `import {createRoot} from 'react-dom/client';import {AuthProvider} from './src/context/AuthContext';
    import Registration from './src/pages/ResidentRegistration';const root=createRoot(document.getElementById('root'));
    window.__mount=()=>root.render(<AuthProvider><Registration email='' onDashboard={()=>{}} onBack={()=>{}}/></AuthProvider>);
    window.__unmount=()=>root.unmount();window.__result={file:new File(['face'],'face.jpg',{type:'image/jpeg'}),matched:false,
      matchDistance:0,similarityScore:0,livenessPassed:true,livenessActions:['blink_twice','turn_left','smile'],recommendation:'manual_review',
      verificationStatus:'passed',deviceType:'Mobile',idQuality:{brightness:128,blurVariance:100,faceAreaRatio:0.1,detectedFaces:0}};`;
  const t = await render(source, mock, true, { registration: true });
  const { w, tick } = t;
  await tick();
  await tick(() => w.__registration.seed());
  w.__uploadMode = "hold";
  await tick(() => {
    w.__saving = w.__registration.save().catch((e) => {
      w.__saveError = e.message;
    });
    void w.__registration.save();
  });
  check(
    w.__uploads.length === 1,
    "Registration prevents duplicate submissions while first upload is pending",
  );
  await tick(() => w.__registration.reset());
  await tick(() => w.__finishUpload());
  await w.__saving;
  check(
    !w.sessionStorage.getItem("pendingResidentVerification:resident") &&
      !w.document.body.textContent.includes("Identity files saved"),
    "Reset during upload cannot store cancelled verification or advance to completion",
  );
  check(
    w.__removals.length === 1,
    "Cancelled upload cleans up the unused uploaded file",
  );
  w.__uploadMode = "fail";
  await tick(() => {
    w.__saving = w.__registration.save().catch((e) => {
      w.__saveError = e.message;
    });
  });
  await w.__saving;
  await tick();
  check(
    !w.sessionStorage.getItem("pendingResidentVerification:resident") &&
      w.document.body.textContent.includes("Back photo upload failed"),
    "Partial upload failure leaves registration incomplete and displays the actual error",
  );
  w.__uploadMode = "";
  await tick(() => {
    w.__saving = w.__registration.save();
  });
  await w.__saving;
  await tick();
  const stored = JSON.parse(
    w.sessionStorage.getItem("pendingResidentVerification:resident"),
  );
  check(
    stored.frontImagePath &&
      stored.backImagePath &&
      stored.capturedFacePath &&
      w.document.body.textContent.includes("Identity files saved"),
    "Registration advances only after all three files have uploaded and paths are stored",
  );
  check(
    t.errors.length === 0,
    "Registration upload tests have no React/runtime errors",
  );
  await tick(() => w.__unmount());
  t.dom.window.close();
}

(async () => {
  await routeChecks();
  await cameraChecks();
  await registrationSaveChecks();
  console.log(
    JSON.stringify({ passed: results.length, checks: results }, null, 2),
  );
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
