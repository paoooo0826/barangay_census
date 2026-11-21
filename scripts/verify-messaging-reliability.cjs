const assert = require("node:assert/strict");
const { render, api, button, change, submit } = require("./verify-brims.cjs");
const esbuild = require("esbuild"),
  path = require("node:path");
let checks = 0;
const check = (value, label) => {
  assert.ok(value, label);
  checks++;
};
const realtime = `
window.__channels=[];
supabase.channel=name=>{
 const c={name,listeners:[],removed:false,on(type,filter,fn){this.listeners.push({filter,fn});return this},subscribe(fn){fn?.('SUBSCRIBED');return this}};
 window.__channels.push(c);return c;
};
supabase.removeChannel=async channel=>{channel.removed=true;};
window.__emit=table=>window.__channels.filter(c=>!c.removed).forEach(c=>c.listeners.filter(l=>l.filter.table===table).forEach(l=>l.fn({new:{},eventType:'INSERT'})));
`;
const mocked =
  api +
  realtime +
  `
const original=supabase.rpc;
supabase.rpc=async(name,args)=>{
 if(name==='resident_notification_feed'){
  window.__calls.push({name,args});return {data:window.__feed,error:null};
 }
 const result=await original(name,args);
 if(name==='mark_boarding_conversation_read'&&!result.error){
  window.__feed={...window.__feed,unread_count:0,items:window.__feed.items.map(n=>({...n,is_read:true}))};
  window.__houses=window.__houses.map(h=>({...h,unread_count:0}));
 }
 return result;
};`;
const settle = async (t, fn) => {
  await t.w.__act(async () => {
    fn?.();
    await new Promise((r) => setTimeout(r, 120));
  });
  await t.tick();
};
const setup = (w, admin, width) => {
  Object.defineProperty(w, "innerWidth", { configurable: true, value: width });
  w.history.replaceState(
    {},
    "",
    admin
      ? "#/admin/dashboard?tab=messages"
      : "#/resident/dashboard?tab=messages",
  );
  w.__showChat = false;
  w.__houses = [
    {
      id: "house",
      name: "Test House",
      owner_name: "Landlord Lina Example",
      owner_user_id: "owner",
      active: true,
      unread_count: 1,
      latest_body: "Good morning",
      latest_sender_name: "Admin Ana Example",
    },
  ];
  w.__rows = {
    boarding_messages: [
      {
        id: "reply",
        boarding_house_id: "house",
        sender_user_id: "admin-ana",
        sender_role: "admin",
        sender_name: "Admin Ana Example",
        body: "Good morning",
        created_at: "2026-11-21T10:00:00Z",
      },
    ],
  };
  w.__feed = {
    items: [
      {
        id: "notification",
        category: admin ? "landlord_message" : "message",
        entity_id: "house",
        related_entity_id: "house",
        resident_id: "r0",
        title: "New Message",
        message: "Admin Ana Example sent a message.",
        is_read: false,
        created_at: "2026-11-21T10:00:00Z",
      },
    ],
    unread_count: 1,
    total: 1,
  };
};
(async () => {
  const built = esbuild.buildSync({
    entryPoints: [path.join(__dirname, "../src/lib/profanity.ts")],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
  });
  const moduleCopy = { exports: {} };
  new Function("module", "exports", "require", built.outputFiles[0].text)(
    moduleCopy,
    moduleCopy.exports,
    require,
  );
  const { hasProfanity } = moduleCopy.exports;
  const cases = require("./fixtures/moderation-cases.json");
  for (const word of require("../src/lib/profanity-terms.json"))
    check(
      hasProfanity(
        [...word]
          .map((letter) => letter.repeat(4))
          .join("")
          .toUpperCase(),
      ),
      "Every configured term has consistent repeated-letter matching",
    );
  for (const text of cases.blocked)
    check(
      hasProfanity(text),
      "Configured case and separator bypass is blocked",
    );
  for (const text of cases.clean)
    check(
      !hasProfanity(text),
      "Clean lookalikes and legitimate repeated letters remain accepted",
    );
  for (const admin of [true, false])
    for (const width of [390, 1280]) {
      const component = `import Chat from './src/components/BoardingMessages';import AdminBell from './src/components/AdminNotifications';import ResidentBell from './src/components/ResidentNotifications';function Test(){return <><${admin ? "AdminBell" : 'ResidentBell residentId="r0" showLandlordMessages onOpenAppointments={()=>{}} onOpenRecord={()=>{}}'}/>{window.__showChat&&<Chat admin={${admin}} landlord={${!admin}}/>}</>}`;
      const t = await render(component, mocked, (w) => setup(w, admin, width));
      const bell = () =>
        t.w.document.querySelector(
          admin
            ? '[aria-label="Admin notifications"]'
            : '[aria-label="Open notifications"]',
        );
      await settle(t);
      check(
        bell().textContent.trim() === "1",
        `Saved unread badge loads (${admin},${width})`,
      );
      await t.tick(() => t.w.__remount());
      await settle(t);
      check(
        bell().textContent.trim() === "1",
        "Unread survives component reload",
      );
      await settle(t, () => {
        t.w.__feed = { ...t.w.__feed, unread_count: 2 };
        t.w.__emit(admin ? "admin_notifications" : "notifications");
        t.w.__emit(admin ? "admin_notifications" : "notifications");
      });
      check(
        bell().textContent.trim() === "2",
        "Repeated realtime deliveries re-fetch one authoritative count",
      );
      await t.tick(() => {
        t.w.__showChat = true;
        t.w.__mount();
      });
      await settle(t);
      check(
        t.w.document.querySelector("article strong").textContent ===
          "Admin Ana Example",
        "Incoming admin uses authenticated author name",
      );
      check(
        t.w.document
          .querySelector("aside")
          .textContent.includes("Admin Ana Example: Good morning"),
        "Conversation preview uses the same admin name",
      );
      check(
        bell().textContent.trim() === "",
        "Viewing the conversation synchronizes the bell",
      );
      const draft = t.w.document.querySelector("textarea");
      const before = t.w.__calls.filter(
        (c) => c.name === "send_boarding_message",
      ).length;
      await t.tick(() => change(t.w, draft, "IIIIDDDDIIIIOOOOTTTT"));
      await t.tick(() => submit(t.w, t.w.document.querySelector("form")));
      check(
        t.w.__calls.filter((c) => c.name === "send_boarding_message").length ===
          before,
        "Repeated-letter profanity never reaches the send API",
      );
      check(
        draft.value === "IIIIDDDDIIIIOOOOTTTT" &&
          t.w.document
            .querySelector('[role="alert"]')
            .textContent.includes("revise"),
        "Blocked draft remains editable with an explanation",
      );
      await t.tick(() => change(t.w, draft, "Hello, the book is good."));
      await t.tick(() => submit(t.w, t.w.document.querySelector("form")));
      const send = t.w.__calls.findLast(
        (c) => c.name === "send_boarding_message",
      );
      check(
        send.args.p_body === "Hello, the book is good." &&
          send.args.p_as_landlord === !admin,
        "Clean text preserves its original spelling and the correct panel context",
      );
      // A rejected backend save cannot clear the draft or synthesize a notification.
      await t.tick(() => {
        t.w.__error = "Message: Please remove inappropriate language.";
        change(t.w, draft, "Retained draft");
      });
      await t.tick(() => submit(t.w, t.w.document.querySelector("form")));
      check(
        draft.value === "Retained draft",
        "Server rejection keeps the draft",
      );
      t.w.__error = null;
      // Incoming messages update the selected conversation without manual refresh.
      await settle(t, () => {
        t.w.__rows.boarding_messages.unshift({
          id: "next",
          boarding_house_id: "house",
          sender_user_id: "admin-ben",
          sender_role: "admin",
          sender_name: "Admin Ben Example",
          body: "Latest reply",
          created_at: "2026-11-21T10:01:00Z",
        });
        t.w.__emit("boarding_messages");
      });
      check(
        t.w.document.querySelector("article:last-child strong").textContent ===
          "Admin Ben Example",
        "New message renders at the bottom with its actual admin name",
      );
      check(
        t.errors.length === 0,
        "Messaging components have no runtime errors",
      );
      const channels = t.w.__channels;
      await t.close();
      check(
        channels.every((c) => c.removed),
        "All realtime channels are removed on navigation or unmount",
      );
    }
  // Regular residents cannot mount landlord messaging, even through the component directly.
  const t = await render(
    `import Chat from './src/components/BoardingMessages';function Test(){return <Chat/>}`,
    mocked,
  );
  check(
    !t.w.document.querySelector("textarea") && t.w.__calls.length === 0,
    "A regular resident cannot query or send landlord messages",
  );
  await t.close();
  // An arrival must remain unread while the recipient is reading older content.
  const reader = await render(
    `import Chat from './src/components/BoardingMessages';function Test(){return <Chat landlord/>}`,
    mocked,
    (w) => setup(w, false, 390),
  );
  await settle(reader);
  const region = reader.w.document.querySelector(
    '[aria-label="Conversation messages"]',
  );
  Object.defineProperty(region, "scrollHeight", {
    configurable: true,
    value: 2000,
  });
  Object.defineProperty(region, "clientHeight", {
    configurable: true,
    value: 400,
  });
  const readCalls = () =>
    reader.w.__calls.filter((c) => c.name === "mark_boarding_conversation_read")
      .length;
  const priorReads = readCalls();
  await settle(reader, () => {
    region.scrollTop = 100;
    region.dispatchEvent(new reader.w.Event("scroll"));
    reader.w.__rows.boarding_messages.unshift({
      id: "unviewed",
      boarding_house_id: "house",
      sender_role: "admin",
      sender_name: "Admin Ben Example",
      sender_user_id: "admin-ben",
      body: "New unviewed message",
      created_at: "2026-11-21T10:02:00Z",
    });
    reader.w.__emit("boarding_messages");
  });
  check(
    readCalls() === priorReads,
    "An off-screen new message is not marked read while reading older content",
  );
  await settle(reader, () => {
    region.scrollTop = 1600;
    region.dispatchEvent(new reader.w.Event("scroll"));
  });
  check(
    readCalls() === priorReads + 1,
    "Scrolling to the new message marks its exact boundary once",
  );
  await settle(reader, () => {
    Object.defineProperty(reader.w.document, "hidden", {
      configurable: true,
      value: true,
    });
    reader.w.__rows.boarding_messages.unshift({
      id: "background",
      boarding_house_id: "house",
      sender_role: "admin",
      sender_name: "Admin Ben Example",
      sender_user_id: "admin-ben",
      body: "Background message",
      created_at: "2026-11-21T10:03:00Z",
    });
    reader.w.__emit("boarding_messages");
  });
  check(
    readCalls() === priorReads + 1,
    "A hidden tab does not mark incoming messages read",
  );
  await settle(reader, () => {
    Object.defineProperty(reader.w.document, "hidden", {
      configurable: true,
      value: false,
    });
    reader.w.document.dispatchEvent(new reader.w.Event("visibilitychange"));
  });
  check(
    readCalls() === priorReads + 2,
    "Returning to a visible conversation acknowledges the viewed boundary",
  );
  await reader.close();
  console.log(`Messaging reliability verification passed (${checks} checks).`);
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
