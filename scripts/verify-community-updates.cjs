const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  esbuild = require("esbuild");
const { render, button, change, submit, api } = require("./verify-brims.cjs");
const root = path.resolve(__dirname, ".."),
  checks = [];
function check(value, label) {
  assert.ok(value, label);
  checks.push(label);
}
const featureApi =
  `import {EMPTY_ADMIN_SUMMARY as featureEmptySummary} from './src/lib/adminData';` +
  api +
  `
const originalFeatureRpc=supabase.rpc;
supabase.rpc=async(name,args)=>{
 if(name==='admin_dashboard_summary')return{data:featureEmptySummary,error:null};
 if(name==='review_community_case'&&args.p_kind==='incident'){
  window.__calls.push({name,args});if(window.__reviewConflict)return{data:null,error:{message:'This item changed. Reload it before saving.',code:'40001'}};
  const row={...window.__rows.incident_reports[0],status:args.p_status,response:args.p_response,updated_at:'2026-11-02T13:30:00Z'};window.__rows.incident_reports=[row];return{data:row,error:null};
 }
 if(name==='submit_incident_with_location'){
  const r=await originalFeatureRpc(name,args);if(r.error)return r;
  const row={...r.data,landmark:args.p_landmark,latitude:args.p_latitude,longitude:args.p_longitude,location_accuracy:args.p_accuracy,language_flagged:window.__reportFlag??false};window.__rows.incident_reports=[row];return{data:row,error:null};
 }
 if(!['add_incident_follow_up','save_resident_update_feedback','resident_record_history'].includes(name))return originalFeatureRpc(name,args);
 window.__calls.push({name,args});
 if(window.__featureHold)await new Promise(resolve=>window.__releaseFeature=resolve);
 if(window.__featureError)return{data:null,error:{message:window.__featureError,code:window.__featureCode}};
 if(name==='resident_record_history')return{data:{items:(window.__rows.admin_resident_history??[]).filter(row=>row.resident_id===args.p_resident_id).slice(args.p_offset,args.p_offset+args.p_limit),total:(window.__rows.admin_resident_history??[]).filter(row=>row.resident_id===args.p_resident_id).length},error:null};
 if(name==='add_incident_follow_up'){
  const row={...window.__rows.incident_reports.find(row=>row.id===args.p_incident_id),updated_at:'2026-11-02T13:10:01.123456Z'};
  const updates=window.__rows.community_case_updates??[];
  if(!updates.some(update=>update.request_key===args.p_request_key))updates.unshift({id:'follow1',incident_id:row.id,user_id:'u0',status:row.status,message:args.p_message,entry_type:window.__adminReply?'admin_reply':'resident_follow_up',created_at:row.updated_at,request_key:args.p_request_key,language_flagged:window.__reportFlag??false});
  window.__rows.community_case_updates=updates;window.__rows.incident_reports=[row];return{data:row,error:null};
 }
 const row={id:'uf1',history_id:args.p_history_id,resident_id:args.p_resident_id,message:args.p_message,version:args.p_expected_version+1,updated_at:'2026-11-02T13:10:00Z'};
 window.__rows.resident_update_feedback=[row];return{data:row,error:null};
};`;
const incidentRow = {
  id: "case1",
  user_id: "u0",
  resident_id: "r0",
  status: "resolved",
  description: "A reported obstruction near the barangay road.",
  tracking_reference: "IR-PRIVATE",
  location: "Test Community Road",
  landmark: "Beside the test hall",
  latitude: 16.42,
  longitude: 120.59,
  location_accuracy: 15,
  response: "The road was cleared.",
  created_at: "2026-11-02T12:00:00Z",
  updated_at: "2026-11-02T13:00:00.123456Z",
};
(async () => {
  const moduleBuild = await esbuild.build({
    stdin: {
      contents: `export * from './src/lib/profanity';export * from './src/lib/incidents';`,
      loader: "ts",
      resolveDir: root,
    },
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
  });
  const mod = { exports: {} };
  new Function("module", "exports", moduleBuild.outputFiles[0].text)(
    mod,
    mod.exports,
  );
  const { hasProfanity, parseIncidentPin, incidentMapUrl } = mod.exports;
  const terms = JSON.parse(
    fs.readFileSync(path.join(root, "src/lib/profanity-terms.json")),
  );
  for (const term of terms)
    check(
      hasProfanity(`Message: ${term}!`),
      `The bilingual checker recognizes its configured whole word: ${term}`,
    );
  for (const value of [
    "F.U.C.K",
    "fuuuuuck",
    "Sh!t!",
    "g@go!",
    "PÚTÁNG ÍNA MO",
    "P0T4",
    "p u t a",
    "B0B0",
    "ＦＵＣＫ",
  ])
    check(
      hasProfanity(value),
      "Case, spacing, accents, punctuation, and common substitutions are detected",
    );
  for (const value of [
    "class assistance",
    "Please put a streetlight near the crossing.",
    "We can pot a new plant outside.",
    "He reported a dispute about a missing sign.",
    "Putatan crossing",
    "Please address the flooding.",
    "May hayop sa kalsada.",
    "Report submitted",
    "shiitake mushrooms",
    "Thank you for your assistance.",
  ])
    check(!hasProfanity(value), `Ordinary text is not blocked: ${value}`);
  const migration = fs.readFileSync(
    path.join(
      root,
      "supabase/migrations",
      fs
        .readdirSync(path.join(root, "supabase/migrations"))
        .find((name) =>
          name.endsWith(
            "_grouped_admin_private_messages_incident_followups_update_feedback.sql",
          ),
        ),
    ),
    "utf8",
  );
  const sqlPattern =
    "(^|[^a-z])(" +
    terms
      .map((word) => [...word].map((letter) => letter + "+").join(""))
      .join("|") +
    ")($|[^a-z])";
  check(
    migration.includes(sqlPattern),
    "The database checker contains the exact same configured word list as the client",
  );
  check(
    parseIncidentPin({ latitude: "", longitude: "", accuracy: null })
      .latitude === null,
    "An incident does not require a GPS pin",
  );
  assert.throws(
    () =>
      parseIncidentPin({ latitude: "16.42", longitude: "", accuracy: null }),
    /both valid/,
  );
  checks.push("A partial pin is rejected");
  assert.throws(
    () =>
      parseIncidentPin({ latitude: "95", longitude: "120", accuracy: null }),
    /valid/,
  );
  checks.push("Out-of-range pins are rejected");
  check(
    incidentMapUrl(16.42, 120.59).startsWith(
      "https://www.openstreetmap.org/",
    ) && !incidentMapUrl(NaN, 120),
    "Map links use a fixed external destination with valid coordinates only",
  );

  let t = await render(
    `import A from './src/pages/AdminDashboard';function Test(){return <A onLogout={()=>{}} onReview={()=>{}}/>}`,
    featureApi,
    (w) => w.history.replaceState({}, "", "#/admin/dashboard?tab=housing"),
  );
  const primary = [...t.w.document.querySelectorAll("a.nav-item")];
  check(
    primary.some((a) => a.textContent === "Boarding Houses") &&
      !primary.some((a) => a.textContent === "Landlord Messages"),
    "Boarding messages are grouped under the one Boarding Houses navigation item",
  );
  check(
    t.w.document
      .querySelector('[aria-label="Boarding Houses sections"]')
      ?.textContent.includes("Landlord Messages"),
    "Boarding management and private messages share a clear secondary navigation",
  );
  check(
    !primary.some((a) => a.textContent === "Completed Appointments") &&
      primary.some((a) => a.textContent === "Services & Appointments"),
    "Appointment status pages are grouped under Services & Appointments",
  );
  check(
    t.errors.length === 0,
    "Grouped navigation renders without runtime errors",
  );
  await t.close();
  t = await render(
    `import A from './src/pages/AdminDashboard';function Test(){return <A onLogout={()=>{}} onReview={()=>{}}/>}`,
    featureApi,
    (w) => w.history.replaceState({}, "", "#/admin/dashboard?tab=feedback"),
  );
  check(
    t.w.document
      .querySelector('[aria-label="Community sections"]')
      ?.textContent.includes("Announcements") &&
      t.w.document
        .querySelector('[aria-label="Community sections"]')
        .textContent.includes("Incident Reports"),
    "Announcements, incidents, and written feedback share the Community section",
  );
  await t.close();
  t = await render(
    `import A from './src/pages/AdminDashboard';function Test(){return <A onLogout={()=>{}} onReview={()=>{}}/>}`,
    featureApi,
    (w) => w.history.replaceState({}, "", "#/admin/dashboard?tab=completed"),
  );
  const appointmentPage = [...t.w.document.querySelectorAll("select")].find(
    (select) => select.parentElement.textContent.includes("Appointment Page"),
  );
  check(
    t.w.document
      .querySelector('[aria-label="Services & Appointments sections"]')
      .querySelectorAll("a").length === 4 &&
      appointmentPage?.value === "completed",
    "Appointment statuses use one page selector under four related service tools",
  );
  await t.tick(() => {
    appointmentPage.value = "cancelled";
    appointmentPage.dispatchEvent(new t.w.Event("change", { bubbles: true }));
  });
  check(
    t.w.location.hash.includes("tab=cancelled") &&
      appointmentPage.value === "cancelled",
    "Completed and cancelled pages retain their dedicated routes through grouped navigation",
  );
  check(
    t.errors.length === 0,
    "Grouped appointment navigation has no runtime errors",
  );
  await t.close();
  for (const props of ["", "admin"]) {
    t = await render(
      `import A from './src/components/BoardingMessages';function Test(){return <A ${props}/>}`,
      featureApi,
      () => {},
      `export const useAuth=()=>({user:{id:'u0'},adminProfile:null});`,
    );
    check(
      !t.w.document.querySelector("textarea") &&
        t.w.__calls.length === 0 &&
        t.w.__queries.length === 0,
      "An ordinary resident cannot load chat data by rendering or linking to the chat panel",
    );
    await t.close();
  }
  t = await render(
    `import A from './src/components/BoardingMessages';function Test(){return <A admin/>}`,
    featureApi,
    (w) => {
      w.__houses = [
        {
          id: "h1",
          name: "Old House",
          owner_name: "Former Owner",
          active: true,
          can_send: false,
          unread_count: 0,
        },
      ];
    },
  );
  check(
    t.w.document.querySelector("textarea").disabled &&
      button(t.w, "Send Message").disabled &&
      t.w.document.body.textContent.includes("read-only"),
    "An administrator can read historical conversations but cannot message a former landlord",
  );
  await t.close();
  t = await render(
    `import A from './src/components/BoardingMessages';function Test(){return <A landlord/>}`,
    featureApi,
    (w) => {
      w.__houses = [
        {
          id: "h1",
          name: "Assigned House",
          owner_name: "Owner",
          active: true,
          can_send: true,
          unread_count: 0,
        },
      ];
    },
  );
  await t.tick(() => {
    change(t.w, t.w.document.querySelector("textarea"), "G@go! Do this now.");
    submit(t.w, t.w.document.querySelector("form"));
  });
  check(
    !t.w.__calls.some((call) => call.name === "send_boarding_message") &&
      t.w.document.querySelector("textarea").value.includes("G@go") &&
      t.w.document.body.textContent.includes("Your text has been kept"),
    "Offensive chat is blocked before sending without erasing the draft",
  );
  check(
    t.errors.length === 0,
    "Chat permission/moderation states have no runtime errors",
  );
  await t.close();

  t = await render(
    `import A from './src/components/CommunityCases';function Test(){return <A kind="feedback"/>}`,
    featureApi,
  );
  await t.tick(() => {
    change(
      t.w,
      t.w.document.querySelector("textarea"),
      "This is fucking bad feedback.",
    );
    submit(t.w, t.w.document.querySelector("form"));
  });
  check(
    !t.w.__calls.some((call) => call.name === "submit_resident_feedback") &&
      t.w.document.querySelector("textarea").value.includes("fucking"),
    "Offensive general feedback is blocked and preserved for editing",
  );
  await t.close();
  t = await render(
    `import A from './src/components/CommunityCases';function Test(){return <A kind="incident"/>}`,
    featureApi,
    (w) => (w.__reportFlag = true),
  );
  await t.tick(() => {
    change(
      t.w,
      t.w.document.querySelector("textarea"),
      'The person shouted "gago" during the reported disturbance.',
    );
    change(
      t.w,
      t.w.document.querySelector('input[type="datetime-local"]'),
      "2026-10-26T09:00",
    );
    const textInputs = t.w.document.querySelectorAll("form input:not([type])");
    change(t.w, textInputs[0], "Community Road Crossing");
    change(t.w, textInputs[1], "Beside the barangay hall");
    const coordinates = t.w.document.querySelectorAll('input[type="number"]');
    change(t.w, coordinates[0], "16.42");
    change(t.w, coordinates[1], "120.59");
  });
  check(
    t.w.document.body.textContent.includes(
      "quoted evidence can still be submitted",
    ),
    "An incident explains how quoted offensive evidence is preserved and flagged",
  );
  await t.tick(() => submit(t.w, t.w.document.querySelector("form")));
  await t.tick();
  const reportCall = t.w.__calls.find(
    (call) => call.name === "submit_incident_with_location",
  );
  check(
    reportCall?.args.p_landmark === "Beside the barangay hall" &&
      reportCall.args.p_latitude === 16.42 &&
      reportCall.args.p_longitude === 120.59,
    "The submitted report includes the checked landmark and coordinate values",
  );
  check(
    Boolean(t.w.document.querySelector('[aria-label="Incident progress"]')) &&
      t.w.document
        .querySelector('[role="dialog"]')
        .textContent.includes("Location Pin"),
    "Resident incident details display location and recorded progress",
  );
  check(
    t.errors.length === 0,
    "Incident location/create/detail flow has no runtime errors",
  );
  await t.close();

  t = await render(
    `import {useState} from 'react';import A from './src/components/IncidentLocation';function Test(){const [pin,setPin]=useState({latitude:'',longitude:'',accuracy:null});return <A pin={pin} onChange={setPin} landmark="" onLandmark={()=>{}} disabled={false}/>}`,
    featureApi,
    (w) => {
      Object.defineProperty(w.navigator, "geolocation", {
        value: {
          getCurrentPosition(success, error) {
            w.__gpsSuccess = success;
            w.__gpsError = error;
          },
        },
      });
    },
  );
  check(
    !t.w.__gpsSuccess,
    "Location permission is requested only after the user selects the location action",
  );
  await t.tick(() => button(t.w, "Use My Current Location").click());
  await t.tick(() => t.w.__gpsError({ code: 1 }));
  check(
    t.w.document.body.textContent.includes("permission was denied") &&
      !t.w.document.querySelector('input[type="number"]').disabled,
    "Denied geolocation leaves manual location entry available",
  );
  await t.tick(() => button(t.w, "Use My Current Location").click());
  await t.tick(() =>
    change(t.w, t.w.document.querySelector('input[type="number"]'), "16.5"),
  );
  await t.tick(() =>
    t.w.__gpsSuccess({
      coords: { latitude: 16.42, longitude: 120.59, accuracy: 12 },
    }),
  );
  check(
    t.w.document.querySelector('input[type="number"]').value === "16.5",
    "A late GPS result cannot overwrite coordinates edited manually",
  );
  await t.tick(() => button(t.w, "Use My Current Location").click());
  await t.tick(() =>
    t.w.__gpsSuccess({
      coords: { latitude: 16.42, longitude: 120.59, accuracy: 12 },
    }),
  );
  check(
    t.w.document.body.textContent.includes("±12 metres") &&
      t.w.document.querySelector("a").href.includes("mlat=16.42"),
    "Successful geolocation shows its accuracy and a user-opened map link",
  );
  await t.close();

  t = await render(
    `import A from './src/components/CommunityCases';function Test(){return <A kind="incident"/>}`,
    featureApi,
    (w) => {
      w.history.replaceState(
        {},
        "",
        "#/resident/dashboard?tab=incidents&item=case1",
      );
      w.__rows = { incident_reports: [incidentRow] };
    },
  );
  const followForm = t.w.document.querySelector('[role="dialog"] form');
  check(
    !t.w.document.querySelector('[role="dialog"] select') &&
      followForm &&
      t.w.document.body.textContent.includes(
        "only an administrator can reopen",
      ),
    "A resident may follow up on a closed report without gaining status controls",
  );
  await t.tick(() => {
    change(
      t.w,
      followForm.querySelector("textarea"),
      "Can you clarify the action taken?",
    );
    t.w.__featureError = "Response lost after save";
    submit(t.w, followForm);
  });
  const firstFollow = t.w.__calls.find(
    (call) => call.name === "add_incident_follow_up",
  );
  check(
    followForm.querySelector("textarea").value.includes("clarify"),
    "A failed follow-up keeps the unsent text",
  );
  await t.tick(() => {
    t.w.__featureError = null;
    t.w.__featureHold = true;
    submit(t.w, followForm);
    submit(t.w, followForm);
  });
  check(
    t.w.__calls.filter((call) => call.name === "add_incident_follow_up")
      .length === 2 &&
      t.w.__calls.at(-1).args.p_request_key === firstFollow.args.p_request_key,
    "Follow-up retries reuse the original key and suppress a double-click",
  );
  await t.tick(() => {
    t.w.__featureHold = false;
    t.w.__releaseFeature();
  });
  await t.tick();
  check(
    t.w.document
      .querySelector('[role="dialog"]')
      .textContent.includes("Resident Follow-up") &&
      t.w.__rows.incident_reports[0].status === "resolved",
    "The follow-up appears in history without changing a closed status",
  );
  check(
    t.errors.length === 0,
    "Closed incident follow-up and retry have no runtime errors",
  );
  await t.close();

  t = await render(
    `import {useState} from 'react';import A from './src/components/ResidentUpdateFeedback';function Test(){const [value,setValue]=useState();return <A residentId="r0" historyId="history1" feedback={value} loading={false} admin onSaved={v=>{window.__savedFeedback=v;setValue(v)}} onReload={()=>window.__feedbackReloaded=true}/>}`,
    featureApi,
  );
  await t.tick(() => {
    change(t.w, t.w.document.querySelector("textarea"), "Bobo ang update mo.");
    submit(t.w, t.w.document.querySelector("form"));
  });
  check(
    !t.w.__calls.some((call) => call.name === "save_resident_update_feedback"),
    "Offensive admin feedback is blocked before saving",
  );
  await t.tick(() => {
    change(
      t.w,
      t.w.document.querySelector("textarea"),
      "Please confirm the corrected street address.",
    );
    t.w.__featureError = "Connection lost";
    submit(t.w, t.w.document.querySelector("form"));
  });
  const firstSave = t.w.__calls.find(
    (call) => call.name === "save_resident_update_feedback",
  );
  check(
    t.w.document.querySelector("textarea").value.includes("corrected street"),
    "Failed update feedback keeps its draft",
  );
  await t.tick(() => {
    t.w.__featureError = null;
    t.w.__featureHold = true;
    submit(t.w, t.w.document.querySelector("form"));
    submit(t.w, t.w.document.querySelector("form"));
  });
  check(
    t.w.__calls.filter((call) => call.name === "save_resident_update_feedback")
      .length === 2 &&
      t.w.__calls.at(-1).args.p_request_key === firstSave.args.p_request_key,
    "Update-feedback retries reuse their key and allow one in-flight save",
  );
  await t.tick(() => {
    t.w.__featureHold = false;
    t.w.__releaseFeature();
  });
  await t.tick();
  check(
    t.w.__savedFeedback?.history_id === "history1" &&
      t.w.__savedFeedback?.resident_id === "r0" &&
      t.w.document.body.textContent.includes("sent to the resident"),
    "Admin feedback remains linked to the exact saved update and confirms its recipient",
  );
  await t.tick(() => {
    change(
      t.w,
      t.w.document.querySelector("textarea"),
      "A second review note for the same update.",
    );
    t.w.__featureError =
      "Feedback changed. Reload the history before saving again.";
    t.w.__featureCode = "40001";
    submit(t.w, t.w.document.querySelector("form"));
  });
  check(
    t.w.__calls.at(-1).args.p_expected_version === 1 &&
      t.w.document.querySelector("textarea").value.includes("second review"),
    "Editing feedback sends its actual version and retains a stale draft",
  );
  check(
    t.errors.length === 0,
    "Versioned update feedback create/edit/retry has no runtime errors",
  );
  await t.close();
  t = await render(
    `import A from './src/components/ResidentRecordHistory';function Test(){return <A residentId="r0" admin={false}/>}`,
    featureApi,
    (w) => {
      w.__rows = {
        admin_resident_history: [
          {
            id: "history1",
            resident_id: "r0",
            action: "census_updated",
            actor_name: "You",
            created_at: "2026-11-02T12:00:00Z",
            details: {
              changes: {
                residential_address: {
                  before: "Old street",
                  after: "New street",
                },
              },
            },
          },
          {
            id: "foreign",
            resident_id: "other",
            action: "census_updated",
            actor_name: "Other Resident",
            created_at: "2026-11-02T12:00:00Z",
            details: {},
          },
        ],
        resident_update_feedback: [
          {
            id: "uf1",
            resident_id: "r0",
            history_id: "history1",
            message: "Please confirm your updated street.",
            version: 1,
            updated_at: "2026-11-02T13:00:00Z",
          },
        ],
      };
    },
  );
  check(
    t.w.__calls.some(
      (call) =>
        call.name === "resident_record_history" &&
        call.args.p_resident_id === "r0" &&
        call.args.p_limit === 8,
    ) &&
      !t.w.__queries.some((query) => query.table === "admin_resident_history"),
    "A resident history view uses the owner-guarded paginated RPC",
  );
  check(
    t.w.document.body.textContent.includes(
      "Please confirm your updated street.",
    ) &&
      !t.w.document.querySelector("textarea") &&
      !t.w.document.body.textContent.includes("Other Resident"),
    "A resident reads feedback on their own update without admin editing controls",
  );
  check(
    t.w.__queries
      .filter((query) => query.table === "resident_update_feedback")
      .every((query) =>
        query.filters.some(
          ([key, value]) => key === "resident_id" && value === "r0",
        ),
      ),
    "Feedback reads stay explicitly scoped to the current resident record",
  );
  check(
    t.errors.length === 0,
    "Resident update history and feedback render without runtime errors",
  );
  await t.close();

  t = await render(
    `import A from './src/components/ResidentRecordHistory';function Test(){return <A residentId="r0"/>}`,
    featureApi,
    (w) => {
      w.__rows = {
        admin_resident_history: [
          {
            id: "history1",
            resident_id: "r0",
            action: "census_updated",
            actor_name: "Resident",
            created_at: "2026-11-02T12:00:00Z",
            details: {},
          },
        ],
        resident_update_feedback: [
          {
            id: "uf1",
            resident_id: "r0",
            history_id: "history1",
            message: "Original saved feedback.",
            version: 1,
            updated_at: "2026-11-02T13:00:00Z",
          },
        ],
      };
    },
  );
  const editor = t.w.document.querySelector("textarea");
  await t.tick(() => change(t.w, editor, "My unsaved feedback draft."));
  await t.tick(() => {
    t.w.__rows.resident_update_feedback[0] = {
      ...t.w.__rows.resident_update_feedback[0],
      message: "A newer saved note from another admin.",
      version: 2,
    };
    t.w.dispatchEvent(new t.w.Event("focus"));
  });
  await t.tick();
  check(
    t.w.document.querySelector("textarea") === editor &&
      editor.value === "My unsaved feedback draft.",
    "Background history/feedback refresh keeps the same editor and its unsaved text",
  );
  check(
    t.w.document.body.textContent.includes(
      "Saved feedback changed while you were editing",
    ),
    "A concurrent feedback edit is visible without overwriting the local draft",
  );
  await t.tick(() => {
    t.w.__featureError =
      "Feedback changed. Reload the history before saving again.";
    t.w.__featureCode = "40001";
    submit(t.w, t.w.document.querySelector("form"));
  });
  check(
    t.w.__calls.at(-1).args.p_expected_version === 1 &&
      editor.value === "My unsaved feedback draft.",
    "A dirty feedback draft retains its original version after a background update",
  );
  await t.tick(() => {
    t.w.__featureError = null;
    button(t.w, "Reload Saved Feedback").click();
  });
  await t.tick();
  check(
    t.w.document.querySelector("textarea").value ===
      "A newer saved note from another admin.",
    "Explicit Reload Saved Feedback replaces the draft only when the admin chooses it",
  );
  check(
    t.errors.length === 0,
    "Concurrent feedback refresh and draft recovery have no runtime errors",
  );
  await t.close();
  t = await render(
    `import A from './src/components/CommunityCases';function Test(){return <A kind="incident" admin/>}`,
    featureApi,
    (w) => {
      w.history.replaceState(
        {},
        "",
        "#/admin/dashboard?tab=incidents&item=case1",
      );
      w.__rows = {
        incident_reports: [
          { ...incidentRow, status: "submitted", response: "" },
        ],
      };
    },
  );
  const reviewForm = t.w.document.querySelector('[role="dialog"] form'),
    reviewText = reviewForm.querySelector("textarea");
  await t.tick(() => {
    const select = reviewForm.querySelector("select");
    select.value = "in_progress";
    select.dispatchEvent(new t.w.Event("change", { bubbles: true }));
    submit(t.w, reviewForm);
  });
  check(
    !t.w.__calls.some((call) => call.name === "review_community_case") &&
      t.w.document.body.textContent.includes("short progress update"),
    "An incident status change requires an understandable action/progress note",
  );
  await t.tick(() => {
    change(t.w, reviewText, "My drafted progress note.");
    t.w.__reviewConflict = true;
    submit(t.w, reviewForm);
  });
  check(
    Boolean(button(t.w, "Reload Latest and Keep My Draft")) &&
      reviewText.value === "My drafted progress note.",
    "A stale incident review offers reload while keeping its response draft",
  );
  await t.tick(() => {
    t.w.__rows.incident_reports[0] = {
      ...t.w.__rows.incident_reports[0],
      status: "under_review",
      updated_at: "2026-11-02T13:22:00.123456Z",
    };
    button(t.w, "Reload Latest and Keep My Draft").click();
  });
  check(
    reviewText.value === "My drafted progress note." &&
      t.w.document
        .querySelector('[aria-current="step"]')
        .textContent.includes("Under Review"),
    "Reloading a report refreshes its progress without replacing the admin draft",
  );
  await t.tick(() => {
    t.w.__reviewConflict = false;
    submit(t.w, reviewForm);
  });
  check(
    t.w.__calls.filter((call) => call.name === "review_community_case").at(-1)
      .args.p_expected_updated_at === "2026-11-02T13:22:00.123456Z",
    "The recovered incident review submits against the newly loaded database version",
  );
  check(
    t.errors.length === 0,
    "Progress-note validation and conflict recovery have no runtime errors",
  );
  await t.close();
  console.log(
    `Community organization and workflow verification passed (${checks.length} checks).`,
  );
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
