// Prints one rollback-only SQL transaction for the existing BRIMS test database.
const fs = require("node:fs"),
  path = require("node:path");
const read = (file) =>
  fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const cases = require("./fixtures/moderation-cases.json");
const terms = require("../src/lib/profanity-terms.json");
const repeated = terms.map((word) =>
  [...word]
    .map((letter) => letter.repeat(4))
    .join("")
    .toUpperCase(),
);
let sql =
  "begin;\n" +
  (process.argv.includes("--staged")
    ? read("supabase/migrations/20261122010100_messaging_moderation.sql") +
      read("supabase/migrations/20261122010200_messaging_identity_delivery.sql")
    : "") +
  "\n" +
  read("scripts/verify-brims.sql").split("\n").slice(0, 17).join("\n") +
  "\n" +
  read("scripts/verify-messaging-reliability.sql");
for (const [expected, values] of [
  [true, [...cases.blocked, ...repeated]],
  [false, cases.clean],
]) {
  const literal = JSON.stringify(values).replaceAll("'", "''");
  sql += `\ndo $$declare value text; begin for value in select jsonb_array_elements_text('${literal}'::jsonb) loop if private.contains_profanity(value) is distinct from ${expected} then raise exception 'Moderation parity failed for fixture: %',value; end if; end loop; end $$;\n`;
}
sql +=
  "select 'Messaging identities, access, delivery, unread persistence and central moderation parity passed' as verification;\nrollback;\n";
process.stdout.write(sql);
