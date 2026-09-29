import { createHmac, randomBytes } from "node:crypto";
const key = (
  process.env.SESSION_SECRET ||
  process.env.DEMO_ACCESS_TOKEN ||
  ""
).trim();
const url = new URL(process.argv[2] || "https://example.invalid");
if (
  key.length < 24 ||
  /^(your[_-]|generate[_-]|replace[_-]|change[_-]?me|<)/i.test(key) ||
  url.protocol !== "https:" ||
  url.hostname === "example.invalid" ||
  url.username ||
  url.password
)
  throw new Error(
    "Set SESSION_SECRET (24+ characters), then run npm run invite -- https://your-site.example",
  );
const scope = process.argv[3] || randomBytes(12).toString("hex");
if (!/^[a-zA-Z0-9_-]{1,32}$/.test(scope))
  throw new Error(
    "Workspace ID must contain 1–32 letters, numbers, underscores, or hyphens.",
  );
const payload = Buffer.from(
  JSON.stringify({ scope, exp: Date.now() + 15 * 60000, purpose: "invite" }),
).toString("base64url");
url.pathname = "/";
url.search = "";
url.hash =
  "invite=" +
  payload +
  "." +
  createHmac("sha256", key).update(payload).digest("base64url");
console.log(
  "Access link (expires in 15 minutes; grants a 7-day workspace session):\n" +
    url.href +
    "\nWorkspace ID: " +
    scope,
);
