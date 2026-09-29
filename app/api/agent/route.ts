import { requestSchema } from "@/lib/recall/core";
import {
  configIssues,
  runAgent,
  ServiceError,
  type Settings,
} from "@/lib/recall/live";
import {
  localRequest,
  sameOrigin,
  sessionFor,
  reserve,
} from "@/lib/recall/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function GET(request: Request) {
  const issues = configIssues(process.env as Settings);
  const authorized = !!sessionFor(request);
  return json({
    configured: !issues.length,
    authorized,
    issues: localRequest(request) ? issues : [],
    local: localRequest(request),
  });
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return json({ error: "Please open REcall directly and try again." }, 403);
  const session = sessionFor(request);
  if (!session)
    return json(
      {
        error:
          "Your workspace session has expired. Open a fresh access link from the owner.",
      },
      401,
    );
  const s = { ...process.env } as Settings;
  if (session.scope !== "local")
    s.HINDSIGHT_BANK_PREFIX =
      (s.HINDSIGHT_BANK_PREFIX || "recall").slice(0, 25) + "-" + session.scope;
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    return json({ error: "JSON is required." }, 415);
  let value: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Request body is required." }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16000) {
        await reader.cancel();
        return json({ error: "Request exceeds 16 KB." }, 413);
      }
      chunks.push(part.value);
    }
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return json({ error: "The request is not valid JSON." }, 400);
  }
  const parsed = requestSchema.safeParse(value);
  if (!parsed.success)
    return json(
      {
        error:
          parsed.error.issues[0]?.message || "Check the comparison fields.",
      },
      400,
    );
  const issues = configIssues(
    s,
    ["history", "seed", "remember"].includes(parsed.data.action),
  );
  if (issues.length)
    return json(
      {
        error:
          "Research is not ready yet. The workspace owner needs to complete the service setup.",
        issues: localRequest(request) ? issues : undefined,
      },
      503,
    );
  const release = reserve(session.scope, localRequest(request) ? 120 : 30);
  if (!release)
    return json(
      {
        error:
          "This workspace is busy or has reached its hourly request limit. Please try later.",
      },
      429,
    );
  try {
    return json(await runAgent(s, parsed.data));
  } catch (e) {
    return json(
      {
        error:
          e instanceof ServiceError
            ? e.message
            : "The operation failed. No purchase was made. Try again after checking the connection.",
      },
      e instanceof ServiceError ? e.status : 502,
    );
  } finally {
    release();
  }
}
