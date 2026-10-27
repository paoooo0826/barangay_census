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
const change=(w,element,value)=>{const setter=Object.getOwnPropertyDescriptor(element.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype,'value').set;setter.call(element,value);element.dispatchEvent(new w.Event('input',{bubbles:true}));};
const submit=(w,form)=>form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
const api=`window.__calls=[];window.__queries=[];window.__rows??={};window.__error=null;window.__hold=false;window.__feed??={items:[],total:0,unread_count:0};window.__houses??=[];
export const supabase={from(table){let filters=[],start=0,end=1000;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},ilike(){return q},in(k,v){filters.push([k,v]);return q},gte(){return q},lt(){return q},not(){return q},order(){return q},limit(){return q},range(a,b){start=a;end=b;return q},maybeSingle(){return result(true)},then(resolve){return result(false).then(resolve)}};function result(single){window.__queries.push({table,filters,start,end});let rows=(window.__rows[table]??[]).filter(row=>filters.every(([k,v])=>Array.isArray(v)?v.includes(row[k]):row[k]===v));return Promise.resolve({data:single?rows[0]??null:rows.slice(start,end+1),count:rows.length,error:null})}return q},rpc:async(name,args)=>{window.__calls.push({name,args});if(window.__hold)await new Promise(resolve=>window.__release=resolve);if(window.__error)return{data:null,error:{message:window.__error}};if(name==='admin_notification_feed')return{data:window.__feed,error:null};if(name==='mark_admin_notifications_read'){window.__feed={...window.__feed,unread_count:0,items:window.__feed.items.map(i=>({...i,is_read:true}))};return{data:1,error:null}}if(name==='boarding_conversations')return{data:window.__houses,error:null};if(name==='boarding_count_summary')return{data:{registered:{current:2,arrivals:1,departures:0},reported:{current:null,version:0,effective_date:null,arrivals:0,departures:0,corrections:0},can_manage:true,events:[],history_total:0},error:null};if(name==='submit_resident_feedback'||name==='submit_incident_report'){const incident=name==='submit_incident_report',row={id:'case1',user_id:'u0',resident_id:'r0',kind:args.p_kind,content:args.p_content,description:args.p_description,category:args.p_category,location:args.p_location,occurred_at:args.p_occurred_at,tracking_reference:incident?'IR-TEST':null,status:incident?'submitted':'new',response:'',created_at:'2026-10-27T02:00:00Z',updated_at:'2026-10-27T02:00:00.123456Z'};window.__rows[incident?'incident_reports':'resident_feedback']=[row];return{data:row,error:null}}if(name==='review_community_case'){const row={...window.__rows.resident_feedback[0],status:args.p_status,response:args.p_response,updated_at:'2026-10-27T03:00:00Z'};return{data:row,error:null}}if(name==='send_boarding_message')return{data:{id:'m1'},error:null};return{data:[],error:null}},storage:{from(){return{createSignedUrl:async()=>({data:{signedUrl:'https://test.invalid/private.jpg'},error:null})}}}};`;
(async()=>{
 let t=await render(`import A from './src/components/AdminNotifications';function Test(){return <A/>}`,api,w=>{w.__feed={items:[{id:'n1',category:'incident',entity_id:'case1',title:'Incident Update',message:'Review required',is_read:false,created_at:'2026-10-27T02:00:00Z'}],total:101,unread_count:101};});
 check(t.w.document.querySelector('[aria-label="Admin notifications"]').textContent.includes('99+'),'Admin badge uses server total beyond loaded notifications');
 await t.tick(()=>t.w.document.querySelector('[aria-label="Admin notifications"]').click());
 check(t.w.document.body.textContent.includes('101 Unread'),'Notification panel shows all unread records');
 await t.tick(()=>button(t.w,'Mark All as Read').click());
 check(t.w.__calls.some(c=>c.name==='mark_admin_notifications_read'&&c.args.p_notification_ids===null),'Mark all covers unloaded pages through the database');
 await t.tick(()=>button(t.w,'Next').click());
 check(t.w.__calls.some(c=>c.name==='admin_notification_feed'&&c.args.p_offset===20),'Admin notification pagination requests next server page');
 await t.tick(()=>[...t.w.document.querySelectorAll('button')].find(b=>b.textContent.includes('Incident Update')).click());
 check(t.w.location.hash.includes('tab=incidents&item=case1'),'Admin incident notification opens its exact report');check(t.errors.length===0,'Admin notification interactions have no runtime errors');await t.close();
 t=await render(`import A from './src/components/CommunityCases';function Test(){return <A kind="feedback"/>}`,api);
 const feedback=t.w.document.querySelector('textarea');
 await t.tick(()=>change(t.w,feedback,'short'));await t.tick(()=>submit(t.w,t.w.document.querySelector('form')));
 check(!t.w.__calls.some(c=>c.name==='submit_resident_feedback'),'Short feedback is rejected before sending');
 await t.tick(()=>{change(t.w,feedback,'Please consider an accessible service counter.');t.w.__error='Submission connection lost';});await t.tick(()=>submit(t.w,t.w.document.querySelector('form')));
 check(feedback.value.includes('accessible')&&t.w.document.body.textContent.includes('Submission connection lost'),'Failed feedback preserves the written draft and shows the error');
 const key=t.w.__calls.find(c=>c.name==='submit_resident_feedback').args.p_request_key;
 await t.tick(()=>{t.w.__error=null;t.w.__hold=true;submit(t.w,t.w.document.querySelector('form'));submit(t.w,t.w.document.querySelector('form'));});
 check(t.w.__calls.filter(c=>c.name==='submit_resident_feedback').length===2,'Feedback double-click starts one in-flight retry');
 check(t.w.__calls.filter(c=>c.name==='submit_resident_feedback')[1].args.p_request_key===key,'Feedback network retry reuses its idempotency key');
 await t.tick(()=>{t.w.__hold=false;t.w.__release();});await t.tick();
 check(t.w.location.hash.includes('item=case1')&&t.w.document.querySelector('[role="dialog"]'),'Successful feedback opens the stored submission');
 await t.tick(()=>t.w.document.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
 check(!t.w.document.querySelector('[role="dialog"]'),'Feedback details support Escape and release focus');check(t.errors.length===0,'Feedback create/retry/detail flows have no runtime errors');await t.close();
 t=await render(`import A from './src/components/CommunityCases';function Test(){return <A kind="feedback" admin/>}`,api,w=>{w.history.replaceState({},'','#/admin/dashboard?tab=feedback&item=case1');w.__rows={resident_feedback:[{id:'case1',user_id:'u0',status:'new',content:'Test resident feedback',response:'',created_at:'2026-10-27T02:00:00Z',updated_at:'2026-10-27T02:00:00.123456Z'}]};});
 check(t.w.document.querySelectorAll('form').length===1&&t.w.document.body.textContent.includes('Visible to Resident'),'Admin feedback has review controls with explicit response visibility');
 await t.tick(()=>change(t.w,t.w.document.querySelector('textarea'),'Thanks, we will review this.'));await t.tick(()=>submit(t.w,t.w.document.querySelector('form')));
 check(t.w.__calls.find(c=>c.name==='review_community_case').args.p_expected_updated_at==='2026-10-27T02:00:00.123456Z','Review preserves full database timestamp precision');check(t.errors.length===0,'Admin feedback review has no runtime errors');await t.close();
 t=await render(`import A from './src/components/CommunityCases';function Test(){return <A kind="incident"/>}`,api);
 check(t.w.document.body.textContent.includes('an allegation is not a verified incident'),'Incident form clearly states reports require review');
 const file=t.w.document.querySelector('input[type="file"]');await t.tick(()=>{Object.defineProperty(file,'files',{configurable:true,value:[new t.w.File(['gif'],'bad.gif',{type:'image/gif'})]});file.dispatchEvent(new t.w.Event('change',{bubbles:true}));});
 check(t.w.document.body.textContent.includes('Choose a JPEG, PNG, or WebP'),'Incident attachments reject unsupported image types');
 await t.tick(()=>{change(t.w,t.w.document.querySelector('textarea'),'There is a reported obstruction near the community road.');const inputs=t.w.document.querySelectorAll('form input');change(t.w,inputs[0],'Community Road Crossing');change(t.w,inputs[1],'2026-10-26T09:00');});
 await t.tick(()=>submit(t.w,t.w.document.querySelector('form')));await t.tick();
 const incident=t.w.__calls.find(c=>c.name==='submit_incident_report');check(incident.args.p_occurred_at==='2026-10-26T01:00:00.000Z','Incident date is interpreted in Asia/Manila');check(incident.args.p_image_paths.length===0&&t.w.document.body.textContent.includes('IR-TEST'),'Incident submission stores a tracking reference and allows no images');check(t.errors.length===0,'Incident create/detail flows have no runtime errors');await t.close();
 t=await render(`import A from './src/components/HousingManager';function Test(){return <A resident={{id:'r0',boarding_status:'landlord'}}/>}`,api,w=>w.__rows={boarding_houses:[{id:'h1',name:'Assigned House',address:'Test House Address',owner_name:'Test Owner',active:true}]});
 check(t.w.document.body.textContent.includes('Registered Stay Records')&&t.w.document.body.textContent.includes('My Reported Counts'),'Boarding screen distinguishes registered and reported sources');
 check(t.w.__queries.every(q=>!['boarder_stays','boarder_occupancy_history'].includes(q.table)),'Count-only housing never fetches identified stay records');
 check(t.w.document.body.textContent.includes('Not Reported'),'Missing count ledger is not silently treated as zero');check(t.errors.length===0,'Count-only housing renders without runtime errors');await t.close();
 t=await render(`import A from './src/components/BoardingMessages';function Test(){return <A/>}`,api,w=>{w.__houses=[{id:'h1',name:'Assigned House',owner_name:'Test Owner',active:true,unread_count:1}];w.__rows={boarding_messages:[{id:'m0',boarding_house_id:'h1',sender_user_id:'admin',sender_role:'admin',body:'Please review your count.',created_at:'2026-10-27T02:00:00.123456Z'}]};});
 check(t.w.document.body.textContent.includes('Please review your count.'),'Assigned conversation displays persistent history');
 check(t.w.__queries.filter(q=>q.table==='boarding_messages').every(q=>q.filters.some(([k,v])=>k==='boarding_house_id'&&v==='h1')),'Message reads stay scoped to the selected house');
 check(t.w.__calls.some(c=>c.name==='mark_boarding_conversation_read'&&c.args.p_through==='2026-10-27T02:00:00.123456Z'),'Message read marker stops at the latest fetched timestamp');
 await t.tick(()=>{change(t.w,t.w.document.querySelector('textarea'),'Current count has been checked.');t.w.__hold=true;submit(t.w,t.w.document.querySelector('form'));submit(t.w,t.w.document.querySelector('form'));});
 const sends=t.w.__calls.filter(c=>c.name==='send_boarding_message');check(sends.length===1&&sends[0].args.p_house_id==='h1','Message double-click sends one house-scoped request');check(!('sender_user_id' in sends[0].args)&&!('sender_role' in sends[0].args),'Message payload cannot choose sender identity or role');
 await t.tick(()=>{t.w.__hold=false;t.w.__release();});check(t.errors.length===0,'Message read/send flows have no runtime errors');await t.close();

 for(const kind of ['incident','feedback']) {
   t=await render(`import A from './src/components/CommunityCases';function Test(){return <A kind="${kind}"/>}`,api);
   check(!t.w.document.querySelector('input[type="search"]')&&!t.w.document.body.textContent.includes('Submitted From')&&!t.w.document.body.textContent.includes('All Statuses'),`Resident ${kind} has no administrator search, status or date controls`);
   check(t.w.document.body.textContent.includes(kind==='incident'?'My Reports':'My Feedback'),`Resident ${kind} retains a simple own-submission history`);
   check(t.w.__queries.filter(q=>['resident_feedback','incident_reports'].includes(q.table)).every(q=>q.filters.some(([k,v])=>k==='user_id'&&v==='u0')),`Resident ${kind} list explicitly scopes every read to its own account`);
   await t.close();
   t=await render(`import A from './src/components/CommunityCases';function Test(){return <A kind="${kind}" admin/>}`,api);
   check(Boolean(t.w.document.querySelector('input[type="search"]'))&&t.w.document.body.textContent.includes('Submitted Through')&&t.w.document.body.textContent.includes('All Statuses'),`Administrator ${kind} retains its management filters`);
   await t.close();
 }
 t=await render(`import A from './src/components/CommunityCases';function Test(){return <A kind="incident"/>}`,api,w=>{w.history.replaceState({},'','#/resident/dashboard?tab=incidents&item=case1');w.__rows={incident_reports:[{id:'case1',user_id:'u0',status:'submitted',description:'A report awaiting administrator review.',tracking_reference:'IR-OWN',created_at:'2026-10-27T02:00:00Z',updated_at:'2026-10-27T02:00:00Z'}]};});
 check(t.w.document.querySelector('[role="dialog"]').textContent.includes('Submitted'),'Resident report details initially show the recorded status');
 await t.tick(()=>{t.w.__rows.incident_reports[0]={...t.w.__rows.incident_reports[0],status:'under_review',response:'We are reviewing your report.',updated_at:'2026-10-27T03:00:00Z'};t.w.dispatchEvent(new t.w.Event('focus'));});
 check(t.w.document.querySelector('[role="dialog"]').textContent.includes('Under Review')&&t.w.document.body.textContent.includes('We are reviewing your report.'),'An open resident report refreshes its status and intended response on focus');
 check(!t.w.document.querySelector('[role="dialog"] form'),'Resident report details contain no administrator review controls');check(t.errors.length===0,'Role-specific report views and live detail refresh have no runtime errors');await t.close();
 const countApi=api.replace("if(name==='boarding_count_summary')return",`if(name==='record_boarding_count'){
  if(window.__savedKey===args.p_request_key)return{data:{id:'count1'},error:null};
  window.__savedKey=args.p_request_key;window.__firstArgs=args;window.__applied=(window.__applied??0)+1;
  window.__count=args.p_action==='baseline'?args.p_quantity:window.__count+args.p_quantity;window.__version++;
  return{data:null,error:{message:'Response lost after save'}};
 }if(name==='boarding_count_summary')return`).replace('current:null,version:0,effective_date:null','current:window.__count,version:window.__version,effective_date:null');
 for(const baseline of [false,true]){
  t=await render(`import A from './src/components/HousingManager';function Test(){return <A resident={{id:'r0',boarding_status:'landlord'}}/>}`,countApi,w=>{w.__count=baseline?null:5;w.__version=baseline?0:1;w.__rows={boarding_houses:[{id:'h1',name:'Assigned House',address:'Test House Address',owner_name:'Test Owner',active:true}]};});
  check(!t.w.document.body.textContent.includes('Landlord/Landlady: Test Owner'),'Landlord management does not display a self-facing landlord contact');
  await t.tick(()=>change(t.w,t.w.document.querySelector('input[type="number"]'),baseline?'0':'2'));await t.tick(()=>submit(t.w,t.w.document.querySelector('form')));
  check(t.w.document.body.textContent.includes('Retry Count Update'),'An uncertain count save offers an explicit retry');
  await t.tick(()=>t.w.dispatchEvent(new t.w.Event('focus')));
  await t.tick(()=>submit(t.w,t.w.document.querySelector('form')));
  const writes=t.w.__calls.filter(c=>c.name==='record_boarding_count');
  check(writes.length===2&&writes[0].args.p_request_key===writes[1].args.p_request_key&&writes[0].args.p_expected_version===writes[1].args.p_expected_version,`${baseline?'Initial zero count':'Arrival'} retry preserves the original key and version after a refresh`);
  check(t.w.__applied===1&&t.w.__count===(baseline?0:7),`${baseline?'Initial zero count':'Arrival'} is applied once after a lost response`);
  check(!t.w.document.querySelector('input[type="number"]').disabled&&!t.w.document.querySelector('input[type="number"]').value,'Confirmed retry clears the old entry and permits the next update');
  check(t.errors.length===0,'Count uncertainty and recovery have no runtime errors');await t.close();
 }
 const failedHouseApi=countApi.replace("if(name==='boarding_count_summary')return",`if(name==='boarding_count_summary'&&args.p_house_id==='h2')return{data:null,error:{message:'Second house unavailable'}};if(name==='boarding_count_summary')return`);
 t=await render(`import A from './src/components/HousingManager';function Test(){return <A resident={{id:'r0',boarding_status:'landlord'}}/>}`,failedHouseApi,w=>{w.__count=777;w.__version=1;w.__rows={boarding_houses:[{id:'h1',name:'First House',address:'First Address',owner_name:'Owner',active:true},{id:'h2',name:'Second House',address:'Second Address',owner_name:'Owner',active:true}]};});
 check(t.w.document.body.textContent.includes('777'),'First house starts with its own reported total');
 await t.tick(()=>{const select=t.w.document.querySelector('select');select.value='h2';select.dispatchEvent(new t.w.Event('change',{bubbles:true}));});
 check(t.w.document.body.textContent.includes('Second house unavailable')&&!t.w.document.body.textContent.includes('777')&&!t.w.document.querySelector('form'),'A failed house switch hides previous-house totals and prevents count updates');check(t.errors.length===0,'Failed house selection has no runtime errors');await t.close();
 for(const admin of [false,true]){
  t=await render(`import A from './src/components/BoardingMessages';function Test(){return <A admin={${admin}}/>}`,api,w=>w.__houses=[{id:'h1',name:'Assigned House',owner_name:'Specific Owner',active:true,unread_count:0}]);
  check(admin?t.w.document.body.textContent.includes('Landlord/Landlady: Specific Owner'):t.w.document.body.textContent.includes('Barangay Office')&&!t.w.document.body.textContent.includes('Landlord/Landlady: Specific Owner'),`${admin?'Admin':'Landlord'} messages show the appropriate conversation partner`);await t.close();
 }


 t=await render(`import A from './src/components/ResidentAppointments';function Test(){return <A resident={{id:'r0'}}/>}`,api,w=>{w.history.replaceState({},'','#/resident/dashboard?tab=appointments&appointment=a0');w.__rows={resident_appointment_records:[{id:'a0',user_id:'u0',resident_id:'r0',status:'pending',fee:230,service_type:'barangay_clearance',appointment_date:'2026-11-02',appointment_time:'09:00',purpose:'Census follow-up test request',created_at:'2026-10-27T02:00:00Z'}]};});
 await t.tick(()=>button(t.w,'Cancel Appointment').click());
 check(!t.w.location.hash.includes('appointment=a0')&&Boolean(t.w.document.querySelector('[aria-label="Close cancellation form"]')),'Cancellation clears the appointment detail deep link');
 await t.tick(()=>t.w.dispatchEvent(new t.w.Event('focus')));
 check(t.w.document.querySelectorAll('[role=dialog]').length===1&&!t.w.document.querySelector('[aria-label="Close appointment details"]'),'Appointment refresh does not reopen details over an unsaved cancellation');
 check(t.errors.length===0,'Deep-linked appointment cancellation refresh has no runtime errors');await t.close();

 console.log(`BRIMS component verification passed (${checks.length} checks).`);process.exit(0);
})().catch(e=>{console.error(e);process.exit(1)});
