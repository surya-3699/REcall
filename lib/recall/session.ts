import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
const localSecret = randomBytes(32).toString("hex");
const cookieName = "recall_session";
type Grant = { scope: string; exp: number; purpose: "invite" | "session" };
function secret() {
  const configured =
    process.env.SESSION_SECRET?.trim() || process.env.DEMO_ACCESS_TOKEN?.trim();
  if (
    configured &&
    /^(your[_-]|generate[_-]|replace[_-]|change[_-]?me|<)/i.test(configured)
  )
    return "";
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.DEMO_ACCESS_TOKEN?.trim() ||
    (process.env.NODE_ENV === "development" ? localSecret : "")
  );
}
export function localRequest(r: Request) {
  try {
    const host = r.headers.get("host");
    if (!host) return false;
    const u = new URL("http://" + host);
    return (
      process.env.NODE_ENV === "development" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) &&
      (!r.headers.has("x-forwarded-host") ||
        r.headers.get("x-forwarded-host") === host)
    );
  } catch {
    return false;
  }
}
export function sameOrigin(r: Request) {
  try {
    const raw = r.headers.get("origin");
    if (!raw || r.headers.get("sec-fetch-site") === "cross-site") return false;
    const origin = new URL(raw);
    if (origin.origin !== raw) return false;
    if (localRequest(r))
      return (
        origin.protocol === "http:" && origin.host === r.headers.get("host")
      );
    return (
      origin.protocol === "https:" &&
      origin.host === (r.headers.get("host") || new URL(r.url).host)
    );
  } catch {
    return false;
  }
}
export function signGrant(grant: Grant) {
  const key = secret();
  if (key.length < 24)
    throw new Error(
      "Set SESSION_SECRET to at least 24 random characters on the server.",
    );
  const payload = Buffer.from(JSON.stringify(grant)).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", key).update(payload).digest("base64url")
  );
}
export function readGrant(
  token: string,
  purpose: Grant["purpose"],
): Grant | null {
  try {
    const key = secret();
    if (key.length < 24 || token.length > 1500) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const expected = createHmac("sha256", key).update(payload).digest();
    const received = Buffer.from(sig, "base64url");
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      return null;
    const g = JSON.parse(Buffer.from(payload, "base64url").toString()) as Grant;
    if (
      g.purpose !== purpose ||
      !Number.isSafeInteger(g.exp) ||
      g.exp <= Date.now() ||
      !/^[a-zA-Z0-9_-]{1,32}$/.test(g.scope)
    )
      return null;
    return g;
  } catch {
    return null;
  }
}
export function sessionFor(r: Request) {
  const value = (r.headers.get("cookie") || "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  return value ? readGrant(value, "session") : null;
}
export function sessionCookie(scope: string, secure: boolean) {
  return `${cookieName}=${signGrant({ scope, purpose: "session", exp: Date.now() + 7 * 86400000 })}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure ? "; Secure" : ""}`;
}
const usage = new Map<
  string,
  { start: number; count: number; active: boolean }
>();
export function reserve(scope: string, limit = 30) {
  const now = Date.now();
  for (const [key, value] of usage)
    if (!value.active && now - value.start > 3600000) usage.delete(key);
  if (usage.size >= 1000 && !usage.has(scope)) return null;
  let item = usage.get(scope);
  if (!item) {
    item = { start: now, count: 0, active: false };
    usage.set(scope, item);
  }
  if (item.active || item.count >= limit) return null;
  item.count++;
  item.active = true;
  return () => {
    item!.active = false;
  };
}
