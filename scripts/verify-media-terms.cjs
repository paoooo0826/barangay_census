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
  auth = `export const useAuth=()=>({user:{id:'u0'},adminProfile:{is_active:true},loading:false,signOut:async()=>{window.__logouts++;return{error:null}}});`,
) {
  const built = await esbuild.build({
    stdin: {
      contents: `import {act} from 'react';import {createRoot} from 'react-dom/client';window.__act=act;${component};let root=createRoot(document.getElementById('root'));window.__mount=()=>root.render(<Test/>);window.__unmount=()=>root.unmount();window.__remount=()=>{root.unmount();root=createRoot(document.getElementById('root'));root.render(<Test/>)};`,
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
          b.onResolve({ filter: /(?:^\.\/|\/lib\/)supabase$/ }, () => ({
            path: "api",
            namespace: "mock",
          }));
          b.onResolve({ filter: /\/context\/AuthContext$/ }, () => ({
            path: "auth",
            namespace: "mock",
          }));
          b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
            loader: "tsx",
            resolveDir: project,
            contents:
              a.path === "api"
                ? api
                : auth,
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
      w.scrollTo = () => {};
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

const NOTICE = "New Lucban values your privacy. Your personal information and identification documents will be kept confidential and used only for authorized barangay services, resident verification, and census purposes. Only authorized personnel may access your records. Your information will be protected and handled in accordance with the Data Privacy Act of 2012 (RA 10173).\n\nPlease read and understand this notice before proceeding.";
const fixture = fs.readFileSync(path.join(project, "scripts/fixtures/admin-api.js"), "utf8");
const termsApi = fixture.replace('    order(key, options) {','    or() { return q; },\n    order(key, options) {') + `
  window.__termsReads=0;window.__acceptCalls=[];
  const baseRpc=supabase.rpc;
  supabase.rpc=async(name,args)=>{
    if(name==='get_account_terms'){
      window.__termsReads++;
      return {data:window.__failRead?null:{document:window.__missingTerms?null:{id:'document',title:'Terms and Conditions',version:'2026-10-12',content:${JSON.stringify(NOTICE)}},acceptance:window.__receipt??null},error:window.__failRead?{message:'Network failed'}:null};
    }
    if(name==='accept_account_terms'){
      window.__acceptCalls.push(args);
      if(window.__failSave)return{data:null,error:{message:'Acceptance connection failed'}};
      if(window.__deferSave)await new Promise(resolve=>window.__resolveSave=resolve);
      window.__receipt={user_id:window.__wrongAccount?'other':'u0',terms_document_id:'document',accepted_at:'2026-10-12T12:00:00Z'};
      return{data:window.__receipt,error:null};
    }
    return baseRpc(name,args);
  };
`;
const authFor = role => `export const useAuth=()=>({user:{id:'u0',email:'fixture@test.invalid'},adminProfile:${role==='admin'?'{is_active:true,full_name:"Test Admin"}':'null'},loading:false,signOut:async()=>{window.__logouts++;return{error:null}}});`;
const change = (w, element, value) => {
  const proto = element.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);
  element.dispatchEvent(new w.Event(element.tagName === 'SELECT' ? 'change' : 'input',{bubbles:true}));
};
const pointer = (w, target, name, id, x, y) => {
  const event = new w.Event(name,{bubbles:true});
  Object.assign(event,{pointerId:id,clientX:x,clientY:y});
  target.dispatchEvent(event);
};
const canvasSetup = w => {
  w.__draws=[];
  w.createImageBitmap=async (_file,options)=>{w.__orientation=options.imageOrientation;return {width:1200,height:800,close(){}}};
  w.HTMLCanvasElement.prototype.getContext = () => ({drawImage(...args){w.__draws.push(args.slice(1))},fillRect(){},set fillStyle(_) {}});
  w.HTMLCanvasElement.prototype.toBlob=function(fn){if(w.__deferCrop)w.__resolveCrop=()=>fn(new w.Blob(['crop'],{type:'image/jpeg'}));else fn(new w.Blob(['crop'],{type:'image/jpeg'}))};
};

(async () => {
  let t;
  const uploadApi=fixture
    .replace('    update(value) {','    insert(value) { operation="insert";values=value;return q; },\n    update(value) {')
    .replace('  async function run(single) {','  async function run(single) { if(operation==="insert"){window.__savedAnnouncement=values;return {data:{id:values.id},error:null};}') + `
      window.__uploads=[];window.__removed=[];
      const originalStorage=supabase.storage.from;
      supabase.storage.from=bucket=>({...originalStorage(bucket),
        upload:async(path,file,options)=>{window.__uploads.push({path,name:file.name,type:file.type,options});return{error:window.__failOriginal&&path.includes('-original.')?{message:'Original upload failed'}:null}},
        remove:async(paths)=>{window.__removed.push(...paths);return{error:null}}
      });
    `;
  for (const failure of [false,true]) {
    t=await render(`import A from './src/components/AdminAnnouncements';function Test(){return <A adminProfileId="profile"/>}`,uploadApi,w=>{canvasSetup(w);w.__failOriginal=failure},authFor('admin'));
    await t.tick(()=>button(t.w,'Add Announcement').click());
    await t.tick(()=>{
      const fields=t.w.document.querySelector('form');
      change(t.w,fields.querySelector('input'),'Full poster upload test');
      change(t.w,fields.querySelector('textarea'),'Complete synthetic announcement text.');
      const input=fields.querySelector('input[type=file]');
      Object.defineProperty(input,'files',{value:[new t.w.File(['original'],'portrait.png',{type:'image/png'})]});
      input.dispatchEvent(new t.w.Event('change',{bubbles:true}));
    });
    check(t.w.__uploads.length===0 && Boolean(t.w.document.querySelector('[aria-labelledby=crop-title]')),'Selecting an announcement image always opens cropping before any storage upload');
    await t.tick(()=>button(t.w,'Crop / Save').click());
    await t.tick(()=>t.w.document.querySelector('form').dispatchEvent(new t.w.Event('submit',{bubbles:true,cancelable:true})));
    if(failure){
      check(!t.w.__savedAnnouncement && t.w.__removed.length===1 && t.w.document.body.textContent.includes('Original upload failed'),'A failed original upload prevents publishing and cleans the staged banner with a clear error');
    } else {
      check(t.w.__uploads.length===2 && t.w.__uploads[0].name.startsWith('announcement-') && t.w.__uploads[1].name==='portrait.png','Announcement publishing uploads the confirmed banner and the complete original file separately');
      check(t.w.__savedAnnouncement.image_path===t.w.__uploads[0].path && t.w.__savedAnnouncement.image_original_path===t.w.__uploads[1].path,'The published record references both the displayed crop and the uncropped full picture');
      check(t.w.document.body.textContent.includes('Announcement published successfully.'),'Announcement creation completes only after both uploads and the record save');
    }
    check(t.errors.length===0,'Announcement original/banner upload flow has no runtime errors');
    await t.close();
  }
  const imageApi=fixture
    .replace('    order(key, options) {','    or() { return q; },\n    order(key, options) {')
    .replace('  image_path: `test/${i}.jpg`,','  image_path: `test/${i}.jpg`,\n  image_original_path: `test/${i}-original.png`,');
  for (const role of ['admin','resident']) {
    t=await render(role==='admin'?`import A from './src/components/AdminAnnouncements';function Test(){return <A adminProfileId="profile"/>}`:`import A from './src/pages/ResidentDashboard';function Test(){return <A onLogout={()=>{}} onEdit={()=>{}}/>}`,imageApi,w=>w.history.replaceState({},'',`#/${role}/dashboard`),authFor(role));
    await t.tick(()=>t.w.document.querySelector('[aria-label^="View Full Screen:"]').click());
    const picture=t.w.document.querySelector('[role=dialog] img');
    check(picture?.src.includes('-original.png'),`${role}: the panel's View Full Screen action loads the uncropped original`);
    check(t.w.__signed.some(path=>picture.src.endsWith(path) && path.endsWith('-original.png')),`${role}: original images load through the same authorized signed-storage URLs`);
    await t.tick(()=>picture.dispatchEvent(new t.w.Event('load')));
    await t.tick(()=>t.w.document.querySelector('[aria-label="Zoom In"]').click());
    check(picture.style.transform.includes('scale(1.25)'),`${role}: fullscreen zoom is available from the panel`);
    await t.tick(()=>{t.w.innerWidth=375;t.w.innerHeight=667;t.w.dispatchEvent(new t.w.Event('resize'))});
    check(picture.style.transform.includes('scale(1)') && t.w.document.querySelector('[role=dialog]').className.includes('h-[100dvh]'),`${role}: viewport changes fit the whole picture in the responsive fullscreen container`);
    await t.tick(()=>t.w.document.querySelector('[aria-label="Close full-screen image"]').click());
    check(!t.w.document.querySelector('[role=dialog]') && t.w.document.body.style.overflow==='',`${role}: the X button closes the viewer and releases the panel`);
    check(t.errors.length===0,`${role}: full-image panel flow has no runtime errors`);
    await t.close();
  }
  for (const [role, route] of [['resident','/resident/dashboard'],['admin','/admin/dashboard'],['new','/resident/census']]) {
    t=await render(`import App from './src/App';function Test(){return <App/>}`,termsApi,w=>w.history.replaceState({},'',`#${route}`),authFor(role));
    check(t.w.document.querySelector('[role=dialog]')?.textContent.includes(NOTICE),`${role}: the complete approved notice appears before protected content`);
    check(t.w.document.querySelectorAll('form').length===0 && button(t.w,'Confirm and Continue').disabled,`${role}: dashboard/census controls remain unmounted until explicit agreement`);
    await t.tick(()=>t.w.document.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    check(Boolean(t.w.document.querySelector('[role=dialog]')) && t.w.__acceptCalls.length===0,`${role}: Escape cannot bypass the mandatory notice or record consent`);
    await t.tick(()=>button(t.w,'Log Out').click());
    const logout=t.w.document.querySelector('[aria-labelledby=logout-title]');
    check(Boolean(logout),`${role}: leaving unaccepted terms opens the existing logout confirmation`);
    await t.tick(()=>t.w.document.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    check(!t.w.document.querySelector('[aria-labelledby=logout-title]') && Boolean(t.w.document.querySelector('[aria-labelledby=terms-title]')) && t.w.__logouts===0,`${role}: Escape closes only the top logout dialog and preserves the terms gate`);
    await t.tick(()=>t.w.document.querySelector('input[type=checkbox]').click());
    await t.tick(()=>{t.w.__failSave=true;button(t.w,'Confirm and Continue').click()});
    check(t.w.document.body.textContent.includes('Acceptance connection failed') && t.w.__acceptCalls.length===1,`${role}: a failed consent save keeps the notice and gives a clear retry error`);
    await t.tick(()=>{t.w.__failSave=false;t.w.__deferSave=true;button(t.w,'Confirm and Continue').click()});
    check(button(t.w,'Saving Acceptance…').disabled && Boolean(t.w.document.querySelector('[aria-labelledby=terms-title]')),`${role}: protected content waits for server confirmation`);
    await t.tick(()=>t.w.__resolveSave());
    check(!t.w.document.querySelector('[aria-labelledby=terms-title]') && t.w.__acceptCalls.at(-1).p_agreed===true && t.w.__acceptCalls.at(-1).p_document_id==='document',`${role}: successful explicit acceptance releases the authorized page`);
    check(t.w.document.body.style.overflow==='',`${role}: accepting terms after a nested logout dialog restores page scrolling`);
    await t.tick(()=>t.w.__remount());
    await t.tick();
    check(!t.w.document.querySelector('[aria-labelledby=terms-title]') && t.w.__termsReads>=2,`${role}: remount/device-style lookup uses the saved database receipt without another popup`);
    check(t.errors.length===0,`${role}: consent and nested-dialog scenarios have no runtime errors`);
    await t.close();
  }
  t=await render(`import App from './src/App';function Test(){return <App/>}`,termsApi.replace('  async function run(single) {','  async function run(single) { if(table==="residents")return{data:null,error:null};'),w=>w.history.replaceState({},'','#/resident/register'),authFor('resident'));
  check(!t.w.document.querySelector('select') && Boolean(t.w.document.querySelector('[aria-labelledby=terms-title]')),'A newly registered account without a census row accepts terms before ID verification or census entry');
  await t.tick(()=>t.w.document.querySelector('input[type=checkbox]').click());
  await t.tick(()=>button(t.w,'Confirm and Continue').click());
  check(t.w.location.hash==='#/resident/register' && Boolean(t.w.document.querySelector('select')) && !t.w.document.querySelector('[aria-labelledby=terms-title]'),'Acceptance preserves the new account registration route and releases the existing verification flow');
  check(t.errors.length===0,'New-account registration and terms integration have no runtime errors');
  await t.close();
  for(const role of ['admin','resident']){
    t=await render(`import App from './src/App';function Test(){return <App/>}`,termsApi,w=>{w.history.replaceState({},'',`#/${role}/dashboard`);w.__receipt={user_id:'u0',terms_document_id:'document',accepted_at:'2026-10-12T12:00:00Z'}},authFor(role));
    check(!t.w.document.querySelector('[aria-labelledby=terms-title]') && t.w.__acceptCalls.length===0,`${role}: an account accepted on an earlier device enters its dashboard without another agreement`);
    check(!t.w.document.body.textContent.includes('Unable to load') && t.errors.length===0,`${role}: the already-accepted dashboard loads without a terms or data error`);
    await t.close();
  }
  for (const scenario of ['missing','read_error','wrong_account']) {
    t=await render(`import Gate from './src/components/TermsGate';function Test(){return <Gate userId="u0" onLeave={()=>{}}><p>Protected child</p></Gate>}`,termsApi,w=>{w.__missingTerms=scenario==='missing';w.__failRead=scenario==='read_error';w.__receipt=scenario==='wrong_account'?{user_id:'other',terms_document_id:'document',accepted_at:'2026-10-12T12:00:00Z'}:null});
    check(!t.w.document.body.textContent.includes('Protected child') && Boolean(t.w.document.querySelector('[role=alert]')),`${scenario}: unavailable content, failed reads and foreign receipts cannot release protected children`);
    if(scenario==='missing')check(!t.w.document.querySelector('input[type=checkbox]') && t.w.__acceptCalls.length===0,'Missing approved terms is flagged without invented text or empty acceptance');
    await t.close();
  }
  t=await render(`import Gate from './src/components/TermsGate';function Test(){return <Gate userId="u0" onLeave={()=>{}}><p>Protected child</p></Gate>}`,termsApi,w=>{w.__failRead=true});
  await t.tick(()=>{t.w.__failRead=false;button(t.w,'Retry').click()});
  check(Boolean(t.w.document.querySelector('[aria-labelledby=terms-title]')),'A failed initial terms read can recover using Retry');
  await t.tick(()=>{t.w.__receipt={user_id:'u0',terms_document_id:'document',accepted_at:'2026-10-12T12:00:00Z'};t.w.dispatchEvent(new t.w.Event('focus'))});
  check(t.w.document.body.textContent==='Protected child' && t.w.__acceptCalls.length===0,'Another device accepting terms is picked up on focus without fabricating a local acceptance');
  await t.close();

  t=await render(`import Viewer from './src/components/FullscreenImageViewer';import {useState} from 'react';function Test(){const [open,setOpen]=useState(true);return open?<Viewer src="https://test.invalid/original.png" title="Original Picture" onClose={()=>setOpen(false)}/>:<p>Closed</p>}`);
  let img=t.w.document.querySelector('img'), stage=t.w.document.querySelector('[aria-label^="Full image;"]');
  await t.tick(()=>{
    Object.defineProperties(img,{offsetWidth:{value:600},offsetHeight:{value:400}});
    Object.defineProperties(stage,{clientWidth:{value:600},clientHeight:{value:500}});
    img.dispatchEvent(new t.w.Event('load'));
  });
  check(img.className.includes('object-contain') && img.style.transform.includes('scale(1)') && t.w.document.querySelector('[role=dialog]').className.includes('fixed inset-0'),'Fullscreen initially fits the entire image at its original proportions');
  await t.tick(()=>change(t.w,t.w.document.querySelector('[aria-label="Image Zoom"]'),'2'));
  await t.tick(()=>{pointer(t.w,stage,'pointerdown',1,300,250);pointer(t.w,stage,'pointermove',1,400,280);pointer(t.w,stage,'pointerup',1,400,280)});
  check(img.style.transform.includes('100px, 30px') && img.style.transform.includes('scale(2)'),'Zoomed images can be dragged while preserving their proportions');
  await t.tick(()=>button(t.w,'Fit Image').click());
  check(img.style.transform==='translate(0px, 0px) scale(1)','Fit Image restores the whole picture and resets panning');
  await t.tick(()=>{pointer(t.w,stage,'pointerdown',1,200,250);pointer(t.w,stage,'pointerdown',2,400,250);pointer(t.w,stage,'pointermove',2,500,250);pointer(t.w,stage,'pointerup',1,200,250);pointer(t.w,stage,'pointerup',2,500,250)});
  check(img.style.transform.includes('scale(1.5)'),'Two touch pointers provide pinch zoom for mobile');
  await t.tick(()=>t.w.document.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  check(t.w.document.body.textContent==='Closed' && t.w.document.body.style.overflow==='','Escape closes fullscreen and releases the scroll lock');
  await t.close();
  t=await render(`import Detail from './src/components/AnnouncementDetail';function Test(){return <Detail announcement={{title:'Long Notice',message:'Complete text',imageUrl:'https://test.invalid/banner.jpg',originalImageUrl:'https://test.invalid/original.png'}} onClose={()=>{window.__closed=true}}/>}`);
  await t.tick(()=>t.w.document.querySelector('[aria-label="Open full announcement image"]').click());
  check(t.w.document.querySelector('[aria-label="Long Notice full-screen image"] img')?.src==='https://test.invalid/original.png','Announcement details open the original picture, rather than the cropped banner');
  await t.tick(()=>t.w.document.querySelector('[aria-label="Close full-screen image"]').click());
  check(!t.w.document.querySelector('[aria-label="Long Notice full-screen image"]') && !t.w.__closed && t.w.document.body.style.overflow==='hidden','Closing fullscreen returns to the readable announcement detail without closing it');
  await t.tick(()=>t.w.document.querySelector('[aria-label="Open full announcement image"]').click());
  await t.tick(()=>t.w.document.querySelector('[aria-label^="Full image;"]').click());
  check(!t.w.document.querySelector('[aria-label="Long Notice full-screen image"]') && !t.w.__closed,'Clicking outside the image closes only fullscreen');
  check(t.errors.length===0,'Image and nested announcement dialogs have no runtime errors');
  await t.close();
  t=await render(`import Viewer from './src/components/FullscreenImageViewer';function Test(){return <Viewer src="https://test.invalid/missing.jpg" title="Missing" onClose={()=>{}}/>}`);
  await t.tick(()=>t.w.document.querySelector('img').dispatchEvent(new t.w.Event('error')));
  check(Boolean(t.w.document.querySelector('[role=alert]')) && Boolean(button(t.w,'Retry Image')),'Fullscreen failed-image loading has a recovery message and Retry');
  await t.close();

  t=await render(`import Crop from './src/components/ImageCropDialog';function Test(){return <Crop file={window.__file??(window.__file=new File(['image'],'id.png',{type:'image/png'}))} kind="id" onCancel={()=>{window.__cancelled=true}} onConfirm={file=>{window.__saved=file}}/>}`,undefined,canvasSetup);
  await t.tick(()=>change(t.w,t.w.document.querySelector('[aria-label="Crop Aspect Ratio"]'),'free'));
  await t.tick(()=>change(t.w,t.w.document.querySelector('[aria-label="Crop Width"]'),'0.8'));
  await t.tick(()=>change(t.w,t.w.document.querySelector('[aria-label="Crop Height"]'),'0.5'));
  const rectangle=t.w.__draws.at(-1).slice(0,4);
  check(rectangle[2]===960 && rectangle[3]===400,'Free ID cropping adjusts width and height independently instead of imposing a banner/profile ratio');
  await t.tick(()=>button(t.w,'Crop / Save').click());
  check(JSON.stringify(t.w.__draws.at(-1).slice(0,4))===JSON.stringify(rectangle) && t.w.__saved?.type==='image/jpeg','The saved crop uses exactly the same source rectangle as the preview');
  check(t.w.__orientation==='from-image','Image orientation is corrected before cropping');
  await t.close();
  t=await render(`import {useState} from 'react';import {useImageCrop} from './src/components/ImageCropDialog';function Test(){const {crop,cropDialog}=useImageCrop();const [name,setName]=useState('previous.jpg');window.__open=async()=>{const result=await crop(new File(['image'],'id.jpg',{type:'image/jpeg'}),'id');if(result)setName(result.name)};return <>{name}{cropDialog}</>}`,undefined,w=>{canvasSetup(w);w.__deferCrop=true});
  await t.tick(()=>void t.w.__open());
  await t.tick(()=>button(t.w,'Crop / Save').click());
  await t.tick(()=>button(t.w,'Cancel').click());
  await t.tick(()=>t.w.__resolveCrop());
  check(t.w.document.body.textContent==='previous.jpg','Cancel during image encoding preserves the previous photo and ignores late results');
  await t.close();

  t=await render(`import {drawCameraFrame} from './src/lib/cameraFrame';function Test(){window.__draw=drawCameraFrame;return <p>Camera pixels</p>}`);
  const calls=[],pixels=['ID','123','→','RIGHT'];let transform=[-1,0,0,1,4,0],drawn;
  const context={save(){calls.push('save')},setTransform(...matrix){transform=matrix;calls.push(matrix)},drawImage(video,...args){drawn=transform[0]<0?[...video.pixels].reverse():[...video.pixels];calls.push(args)},restore(){calls.push('restore')}};
  t.w.__draw(context,{pixels},{x:0,y:0,width:4,height:1},4,1);
  check(JSON.stringify(drawn)===JSON.stringify(pixels) && JSON.stringify(calls[1])==='[1,0,0,1,0,0]','Camera capture removes stale transforms and keeps asymmetric text/right-side pixels in their true order');
  await t.close();
  t=await render(`import {useState} from 'react';import Camera from './src/components/IdCameraCapture';import Admin from './src/pages/AdminDashboard';function Test(){const [admin,setAdmin]=useState(false);window.__goAdmin=()=>setAdmin(true);return admin?<Admin onLogout={()=>{}} onReview={()=>{}}/>:<Camera side="front" onCapture={()=>{}}/>}`,fixture,w=>{
    Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:()=>new Promise(resolve=>w.__cameraPermission=()=>resolve({getTracks:()=>[{stop(){w.__stopped=true}}]}))}});
  });
  await t.tick(()=>button(t.w,'Take live photo').click());
  check(t.w.document.querySelector('video')?.style.transform==='none' && t.w.document.querySelector('video').className.includes('object-contain'),'Live ID camera preview explicitly uses unmirrored orientation and preserves the source aspect ratio');
  await t.tick(()=>t.w.document.querySelector('[aria-label="Close camera"]').click());
  check(t.w.document.body.style.overflow==='', 'Closing the ID camera restores page scrolling before another panel is opened');
  await t.tick(()=>t.w.__cameraPermission());
  check(t.w.__stopped && !t.w.document.querySelector('[role=dialog]'),'Camera closure still releases a stream that arrives after permission was pending');
  await t.tick(()=>t.w.__goAdmin());
  check(Boolean(t.w.document.querySelector('#admin-main')) && t.w.document.body.style.overflow==='','Navigating from a closed camera to the real admin dashboard leaves main content scrollable');
  check(t.errors.length===0,'Camera closure and admin navigation have no runtime errors');
  await t.close();

  t=await render(`import {mirrorCameraPreview,detectsHeadTurn} from './src/lib/cameraOrientation';function Test(){window.__orientation={mirrorCameraPreview,detectsHeadTurn};return null}`);
  const orientation=t.w.__orientation;
  const stream=facingMode=>({getVideoTracks:()=>[{getSettings:()=>({facingMode})}]});
  check(orientation.mirrorCameraPreview(stream('user')) && !orientation.mirrorCameraPreview(stream('environment')),'The actual front/rear camera settings determine the default preview direction');
  check(orientation.mirrorCameraPreview(stream(undefined)),'Desktop webcams without facing-mode metadata use the expected selfie direction');
  check(orientation.detectsHeadTurn('turn_left',0.2) && !orientation.detectsHeadTurn('turn_left',-0.2) && orientation.detectsHeadTurn('turn_right',-0.2) && !orientation.detectsHeadTurn('turn_right',0.2),'Liveness left/right prompts use the person’s own direction in raw landmarks, independent of preview mirroring');
  check(!orientation.detectsHeadTurn('turn_left',0.05) && !orientation.detectsHeadTurn('turn_right',-0.05),'Small neutral head movement does not satisfy a turn challenge');
  await t.close();

  t=await render(`import Camera from './src/components/IdCameraCapture';function Test(){return <Camera side="front" onCapture={file=>window.__confirmedFile=file}/>} `,undefined,w=>{
    w.__deviceFacing='user';w.__trackStops=0;w.__transforms=[];
    Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){w.__trackStops++}}],getVideoTracks:()=>[{getSettings:()=>({facingMode:w.__deviceFacing})}]})}});
    w.HTMLMediaElement.prototype.play=async()=>{};
    Object.defineProperties(w.HTMLVideoElement.prototype,{videoWidth:{get:()=>1920},videoHeight:{get:()=>1080},readyState:{get:()=>w.__captureReady?2:0}});
    w.HTMLCanvasElement.prototype.getContext=()=>({save(){},restore(){},setTransform(...matrix){w.__transforms.push(matrix)},drawImage(){},getImageData:()=>({width:480,height:270,data:new w.Uint8ClampedArray(480*270*4)})});
    w.HTMLCanvasElement.prototype.toBlob=fn=>fn(new w.Blob(['asymmetric ID text'],{type:'image/jpeg'}));
  });
  await t.tick(()=>button(t.w,'Take live photo').click());
  await t.tick();await t.tick();
  let video=t.w.document.querySelector('video'), mirror=t.w.document.querySelector('[aria-label="Mirror Preview"]');
  check(video?.style.transform==='scaleX(-1)' && mirror?.getAttribute('aria-pressed')==='true','A desktop front camera mirrors the live ID preview even when the initial rear-camera preference is ignored');
  await t.tick(()=>mirror.click());
  check(video.style.transform==='none' && mirror.getAttribute('aria-pressed')==='false','The user can turn selfie mirroring off to read ID text in the live preview');
  await t.tick(()=>mirror.click());
  await t.tick(()=>{t.w.__deviceFacing='environment';button(t.w,'Switch camera').click()});
  await t.tick();await t.tick();
  video=t.w.document.querySelector('video');
  check(video?.style.transform==='none' && t.w.__trackStops===1,'Switching to an actual rear camera restores normal preview direction and releases the previous stream');
  await t.tick(()=>t.w.document.querySelector('[aria-label="Mirror Preview"]').click());
  await t.tick(()=>{t.w.__captureReady=true;button(t.w,'Capture').click()});
  await t.w.__act(async()=>{await new Promise(resolve=>setTimeout(resolve,250))});
  check(Boolean(t.w.document.querySelector('[alt="Captured ID preview"]')) && JSON.stringify(t.w.__transforms.at(-1))==='[1,0,0,1,0,0]','Capturing from a mirrored preview uses raw image pixels and shows the readable saved-photo review');
  await t.tick(()=>button(t.w,'Confirm Photo').click());
  check(t.w.__confirmedFile?.type==='image/jpeg' && !t.w.document.querySelector('[role=dialog]') && t.w.document.body.style.overflow==='','Confirming the photo returns the saved file and releases the camera scroll lock');
  check(t.errors.length===0,'Preview toggling, device switching, capture and confirmation have no runtime errors');
  await t.close();
  console.log(`Media and terms verification passed (${checks.length} checks).`);
  process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
