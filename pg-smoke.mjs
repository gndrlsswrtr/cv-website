import EmbeddedPostgres from "embedded-postgres";

const pg = new EmbeddedPostgres({
  databaseDir: "C:/Users/denri/AppData/Local/Temp/pg-smoke-data",
  user: "postgres",
  password: "password",
  port: 55432,
  persistent: false,
});

try {
  await pg.initialise();
} catch (e) {
  console.log("initialise (may already exist):", e.message);
}
await pg.start();
const client = pg.getPgClient();
await client.connect();
const r = await client.query("SELECT version()");
console.log("VERSION:", r.rows[0].version);
const r2 = await client.query(
  "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user"
);
console.log("ROLE:", r2.rows[0]);
await client.end();
await pg.stop();
console.log("SMOKE OK");
