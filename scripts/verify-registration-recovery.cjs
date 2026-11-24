const assert = require("node:assert/strict");
const { render, button, change, submit } = require("./verify-brims.cjs");

const email = "resident@example.invalid";
const password = "FixturePassword2026";
const guestAuth = `
export const useAuth=()=>({
 signIn:async()=>{window.__calls.push("signIn");return {error:window.__signInError}},
 signUp:async(address)=>{window.__calls.push(["signup",address]);return window.__signupResult},
});
`;
const mailApi = `
export const supabase={
 rpc(){throw new Error("Signup must not call the old account lookup")},
 auth:{
  resend:async(options)=>{window.__calls.push(["resend",options]);return {error:null}},
  resetPasswordForEmail:async()=>{window.__calls.push("reset");return {error:null}},
 },
};
`;
const loginSource = `import ResidentAuth from './src/pages/ResidentAuth';function Test(){return <ResidentAuth onBack={()=>{}}/>}`;
const appSource = `import App from './src/App';function Test(){return <App/>}`;
const appAuth = `
import {useSyncExternalStore} from 'react';
const user={id:'resident',email:'resident@example.invalid'};
const listeners=new Set();
const subscribe=(fn)=>{listeners.add(fn);return ()=>listeners.delete(fn)};
const read=()=>window.__signedIn?user:null;
const signIn=async()=>{window.__signedIn=true;listeners.forEach(fn=>fn());return{error:null}};
export const useAuth=()=>({
 user:useSyncExternalStore(subscribe,read),adminProfile:null,loading:false,signIn,
 canResetPassword:window.__recovery===true,signOut:async()=>({error:null}),
});
`;
const appApi = `
export const supabase={
 rpc:async(name)=>({data:name==='get_account_terms'?
  {document:null,acceptance:{user_id:'resident',terms_document_id:'terms',accepted_at:'2026-11-01T00:00:00.000Z'}}:null,error:null}),
 from(table){const q={select(){return q},eq(){return q},order(){return q},range(){return q},limit(){return q},
  maybeSingle:async()=>({data:table==='residents'&&window.__hasCensus?{id:'existing'}:null,error:null}),
  then(resolve){return Promise.resolve({data:[],error:null,count:0}).then(resolve)}};
  return q},
 storage:{from:()=>({createSignedUrl:async()=>({data:null,error:null})})},
 auth:{updateUser:async()=>{window.__passwordChanges=(window.__passwordChanges||0)+1;return {error:null}}},
};
`;
async function submitLogin(t, confirm = false) {
  const d = t.w.document;
  await t.tick(() => {
    change(t.w, d.querySelector("#resident-email"), email);
    change(t.w, d.querySelector("#resident-password"), password);
    if (confirm)
      change(t.w, d.querySelector("#resident-confirm-password"), password);
  });
  await t.tick(() => submit(t.w, d.querySelector("form")));
}
function appSetup(
  hash,
  { signedIn, hasCensus, pending, recovery, reset } = {},
) {
  return (w) => {
    w.history.replaceState(
      {},
      "",
      `${reset ? "?password-reset=1" : "/"}${hash}`,
    );
    w.__signedIn = Boolean(signedIn);
    w.__hasCensus = Boolean(hasCensus);
    w.__recovery = Boolean(recovery);
    if (pending) {
      w.sessionStorage.setItem(
        "pendingResidentVerification:resident",
        JSON.stringify({
          userId: pending === "other" ? "other" : "resident",
          verificationStatus: "passed",
          livenessPassed: true,
          idType: "PhilSys ID",
          frontImagePath: "resident/attempt/front.jpg",
          backImagePath: "resident/attempt/back.jpg",
          capturedFacePath: "resident/attempt/face.jpg",
        }),
      );
    }
  };
}
async function close(t) {
  assert.deepEqual(t.errors, [], "No unexpected component errors");
  await t.close();
}

(async () => {
  const unconfirmed = await render(
    loginSource,
    mailApi,
    (w) => {
      w.__calls = [];
      w.__signInError = {
        code: "email_not_confirmed",
        message: "Email not confirmed",
      };
    },
    guestAuth,
  );
  await submitLogin(unconfirmed);
  assert.match(
    unconfirmed.w.document.querySelector("[role=alert]").textContent,
    /Confirm your email before signing in/,
  );
  await unconfirmed.tick(() => unconfirmed.w.__remount());
  const d = unconfirmed.w.document;
  await unconfirmed.tick(() =>
    button(unconfirmed.w, "Resend verification email").click(),
  );
  assert.equal(
    unconfirmed.w.__calls.length,
    1,
    "Missing email cannot trigger a resend",
  );
  await unconfirmed.tick(() =>
    change(
      unconfirmed.w,
      d.querySelector("#resident-email"),
      " Resident@Example.Invalid ",
    ),
  );
  await unconfirmed.tick(() => {
    const resend = button(unconfirmed.w, "Resend verification email");
    resend.click();
    resend.click();
  });
  const resends = unconfirmed.w.__calls.filter((call) => call[0] === "resend");
  assert.equal(resends.length, 1);
  assert.equal(resends[0][1].email, email);
  assert.equal(
    resends[0][1].options.emailRedirectTo,
    "https://test.invalid/#/resident",
  );
  await unconfirmed.tick(() => unconfirmed.w.__remount());
  assert.equal(
    button(unconfirmed.w, "Resend verification email").disabled,
    true,
    "Email cooldown survives reload",
  );
  assert.equal(
    button(unconfirmed.w, "Sign In").disabled,
    false,
    "Resend cooldown never prevents sign-in",
  );
  await close(unconfirmed);

  for (const result of [
    { needsEmailConfirmation: true },
    {
      error: {
        code: "user_already_exists",
        message: "User already registered",
      },
    },
    {
      error: {
        code: "over_email_send_rate_limit",
        message: "email rate limit exceeded",
        status: 429,
      },
    },
  ]) {
    const t = await render(
      loginSource,
      mailApi,
      (w) => {
        w.__calls = [];
        w.__signupResult = result;
      },
      guestAuth,
    );
    await t.tick(() => button(t.w, "Register").click());
    await submitLogin(t, true);
    assert.equal(t.w.__calls.length, 1);
    assert.equal(t.w.__calls[0][0], "signup");
    assert.equal(t.w.__calls[0][1], email);
    if (result.error?.status === 429) {
      assert.match(
        t.w.document.querySelector("[role=alert]").textContent,
        /email service is limiting requests/,
      );
      assert.equal(button(t.w, "Create Account").disabled, true);
    } else {
      assert.match(
        t.w.document.querySelector("[role=status]").textContent,
        /^If this account still needs verification/,
      );
      assert.ok(button(t.w, "Resend verification email"));
    }
    await close(t);
  }

  const validLink =
    "#access_token=fixture-only&refresh_token=fixture-only&expires_in=3600&token_type=bearer&type=signup";
  for (const [entry, options, expected] of [
    ["#/resident", {}, "#/resident/register"],
    ["#/resident", { pending: "other" }, "#/resident/register"],
    ["#/resident", { pending: "valid" }, "#/resident/census"],
    ["#/resident", { hasCensus: true }, "#/resident/dashboard"],
    [validLink, { signedIn: true }, "#/resident/register"],
    [validLink, { signedIn: true, hasCensus: true }, "#/resident/dashboard"],
    [validLink, {}, "#/resident"],
    [
      "#error=access_denied&error_code=otp_expired&error_description=expired",
      {},
      "#/resident",
    ],
  ]) {
    const t = await render(
      appSource,
      appApi,
      appSetup(entry, options),
      appAuth,
    );
    if (entry === "#/resident" && !options.signedIn) await submitLogin(t);
    await t.tick();
    assert.equal(
      t.w.location.hash,
      expected,
      "Sign-in and confirmation choose the right registration step",
    );
    if (expected === "#/resident") {
      assert.match(
        t.w.document.querySelector("[role=alert]").textContent,
        /link is invalid or has expired/,
      );
      assert.ok(button(t.w, "Resend verification email"));
    }
    assert.doesNotMatch(
      JSON.stringify(t.w.history.state),
      /fixture-only|access_token=/,
    );
    await close(t);
  }

  for (const route of [
    "#/resident/dashboard",
    "#/resident/dashboard?tab=profile",
  ]) {
    const t = await render(
      appSource,
      appApi,
      appSetup(route, { signedIn: true }),
      appAuth,
    );
    await t.tick(() => button(t.w, "Continue Registration").click());
    assert.equal(
      t.w.location.hash,
      "#/resident/register",
      "A direct dashboard link can resume new registration",
    );
    await close(t);
  }

  const resetWithoutRecovery = await render(
    appSource,
    appApi,
    appSetup("#/resident", { signedIn: true, reset: true }),
    appAuth,
  );
  assert.match(
    resetWithoutRecovery.w.document.body.textContent,
    /password-reset link is invalid or has expired/,
  );
  assert.equal(
    resetWithoutRecovery.w.document.querySelectorAll("input[type=password]")
      .length,
    0,
  );
  await close(resetWithoutRecovery);
  const reset = await render(
    appSource,
    appApi,
    appSetup("#/resident", { signedIn: true, recovery: true, reset: true }),
    appAuth,
  );
  const inputs = [...reset.w.document.querySelectorAll("input[type=password]")];
  assert.equal(inputs.length, 2, "Recovery event allows the password form");
  await reset.tick(() =>
    inputs.forEach((input) => change(reset.w, input, password)),
  );
  await reset.tick(() =>
    submit(reset.w, reset.w.document.querySelector("form")),
  );
  assert.equal(reset.w.__passwordChanges, 1);
  assert.match(
    reset.w.document.body.textContent,
    /password was changed successfully/,
  );
  await close(reset);
  const provider = await render(
    `import {AuthProvider,useAuth} from './src/context/AuthContext.tsx';
    function Probe(){const auth=useAuth();return <output>{auth.canResetPassword?"recovery":"ordinary"}</output>}
    function Test(){return <AuthProvider><Probe/></AuthProvider>}`,
    `const session={user:{id:"resident"}};
    export const supabase={
      from(){return{select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:null})}},
      auth:{
        getSession:async()=>({data:{session},error:null}),
        onAuthStateChange(callback){
          window.__authEvent=(event,active)=>callback(event,active?session:null);
          return {data:{subscription:{unsubscribe(){}}}};
        },
      },
    };`,
  );
  const recoveryState = () =>
    provider.w.document.querySelector("output").textContent;
  assert.equal(recoveryState(), "ordinary");
  await provider.tick(() => provider.w.__authEvent("PASSWORD_RECOVERY", true));
  assert.equal(recoveryState(), "recovery");
  await provider.tick(() => provider.w.__authEvent("TOKEN_REFRESHED", true));
  assert.equal(recoveryState(), "recovery");
  await provider.tick(() => provider.w.__authEvent("SIGNED_OUT", false));
  assert.equal(recoveryState(), "ordinary");
  await close(provider);

  console.log(
    "Registration recovery: resend, duplicate signup, rate limits, callbacks, routing, and password recovery passed.",
  );
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
