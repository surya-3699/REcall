# REcall

REcall helps business teams compare laptops, monitors and meeting headsets using web evidence and Hindsight purchasing memory. A human reviews sources and makes the final decision. The agent does not place orders.

## Local setup

Use Node.js 22.12 or later. Run `npm ci`, copy `.env.example` to `.env.local`, configure the selected services, then run `npm run dev`. Open http://localhost:3000. Provider keys stay on the server. Do not commit `.env.local`.

Hindsight is required. Gemini or Groq also requires Tavily. The OpenAI path uses Responses web search; configure accessible models supporting its search and structured-output operations. Leave unused keys blank. Set a private random SESSION_SECRET before hosting; the local development session can work without one.

## User workflow

1. Open Service status and check research services.
2. Choose Design studio or Operations team and a comparison example.
3. Enter exact product variants, market and business requirements; compare.
4. Inspect sources, unknowns and the views with and without saved memory.
5. Save a confirmed requirement, decision or correction under Team memory.
6. Reload, refresh memory and repeat the comparison to inspect its effect.

The eight packaged history records are synthetic requirements and lessons, not current product prices or approvals. Loading sample history uses stable document IDs. The history action recalls relevant memory; it does not provide a complete comparison archive.

## Implementation

- `components/recall-workspace.tsx`: comparison, memory and service-status UI.
- `lib/recall/live.ts`: research, Hindsight retain/recall, model calls and response handling.
- `lib/recall/core.ts`: request/output schemas and citation validation.
- `lib/recall/session.ts`: signed access, same-origin checks and process-local limits.
- `app/api/agent/route.ts`: authenticated actions and request handling.

See ARCHITECTURE.md and DEPLOYMENT.md for the actual data flow and hosting requirements.

## Verification and limitations

<<< HEAD
Run `npm test`, `npm run typecheck` and `npm run build`. The regression tests cover comparison validation, one bounded regeneration attempt, and provider-error propagation. Invalid comparisons are retried once against the same evidence without weakening citation validation. Server logs record only a request ID, provider, memory-view indicator, attempt and fixed validation reason, never the generated text or secrets. Build and mocked regression checks do not prove live service access, factual accuracy or persistence. Demonstrate retain, reload, recall and a useful later comparison with your configured account before presenting.
===
Run `npm run typecheck` and `npm run build`. No test files are included in this delivery. Build and mocked regression checks do not prove live service access, factual accuracy or persistence. Demonstrate retain, reload, recall and a useful later comparison with your configured account before presenting.
>>> cf32482ed85e0a5be268c6f4b90c00a04f4322eb

Research uses current web sources, but excerpts may be stale, incomplete or describe another regional variant. Citation-ID validation is not semantic fact checking. A correction is retained context, not guaranteed deletion of an earlier record. The memory/no-memory views share evidence within one request but are not a controlled benchmark. An evidence-only outage preview is not a completed AI recommendation.

## References

- https://github.com/vectorize-io/hindsight
- https://hindsight.vectorize.io/
- https://vectorize.io/what-is-agent-memory
- https://developers.openai.com/api/docs/guides/tools-web-search
