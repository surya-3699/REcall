import {
  localRequest,
  readGrant,
  sameOrigin,
  sessionCookie,
  sessionFor,
} from "@/lib/recall/session";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const reply = (
    v: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ) =>
    Response.json(v, {
      status,
      headers: { "Cache-Control": "no-store", ...headers },
    });
  if (!sameOrigin(request))
    return reply({ error: "Please open REcall directly and try again." }, 403);
  if (sessionFor(request)) return reply({ ready: true });
  let scope: string | undefined;
  if (localRequest(request)) scope = "local";
  else {
    if (Number(request.headers.get("content-length") || 0) > 2000)
      return reply({ error: "Invalid access link." }, 400);
    const reader = request.body?.getReader();
    if (!reader)
      return reply(
        { error: "Open the access link shared by the workspace owner." },
        401,
      );
    let raw = "";
    const decoder = new TextDecoder();
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      raw += decoder.decode(part.value, { stream: true });
      if (raw.length > 2000) {
        await reader.cancel();
        return reply({ error: "Invalid access link." }, 400);
      }
    }
    try {
      scope = readGrant(JSON.parse(raw).invite || "", "invite")?.scope;
    } catch {}
  }
  if (!scope)
    return reply(
      {
        error: "Open a fresh access link from the workspace owner to continue.",
      },
      401,
    );
  try {
    return reply({ ready: true }, 200, {
      "Set-Cookie": sessionCookie(scope, !localRequest(request)),
    });
  } catch {
    return reply(
      { error: "The workspace owner needs to finish server setup." },
      503,
    );
  }
}
