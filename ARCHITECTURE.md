# REcall architecture

The browser sends a validated JSON action through `/api/agent` using an HttpOnly signed session. The route checks Origin, access, body size and schema before calling the agent. Public responses do not return API keys.

## Memory lifecycle

`clientFor(settings)` returns a HindsightClient. `retain(bank, content, options)` stores a human note; `retainBatch(bank, items, options)` loads synthetic history; `recall(bank, query, options)` retrieves context. These are the methods used in lib/recall/live.ts. The app does not call a `memory.search` or `memory.history` API.

A note includes its type, timestamp, comparison context and document ID. A retry of the same pending note reuses its ID. The app requires a synchronous success receipt before reporting a confirmed write. A failed refresh after an accepted write is reported separately.

Studio and operations use separate banks. Hosted sessions add a workspace scope to the bank prefix. People sharing a workspace must use invitations generated with the same workspace ID.

## Comparison lifecycle

1. Recall relevant team context.
2. Retrieve web evidence through Tavily for Gemini/Groq, or Responses web search for OpenAI.
3. Produce one structured summary with memory and another with an empty memory list, sharing the request evidence.
4. Validate product identities, schema and source/memory citation IDs.
5. Return comparisons, sources, recalled records and research timestamp.

Memory represents preferences and experiences, not proof of current product facts. Source content is untrusted data. Prompt instructions and schema checks reduce specific errors but do not guarantee resistance to every injection or hallucination.

## Actions

- compare: research and generate two comparison views.
- remember: retain a confirmed note and attempt recall.
- seed: retain the selected team's synthetic records and attempt recall.
- history: recall relevant purchasing memories, not a full event log.
- verify: independently check memory, model and research service access.

Use the browser for normal operation. Direct POST examples require Origin, a valid session cookie and all schema-required fields, including a UUID requestId. The exact schemas are authoritative in core.ts.

## Reliability boundaries

The agent sets a 170-second overall budget with individual service timeouts. The route advertises maxDuration=240 seconds and the browser allows a longer request window. There is no environment variable named DEADLINE controlling this budget. Hosting limits may still terminate a request earlier.

Gemini transient failures may try configured supported fallback models. A usable explicitly configured Groq key can enable a secondary provider. The OpenAI path is separate. If supported Gemini/Groq temporary failures exhaust the comparison path, the result can be an explicitly labelled evidence-only preview. Authentication, quota and configuration failures can instead return errors.

The limiter uses an in-process Map, with one active request per scope and hourly limits. It is neither durable nor shared across replicas. Do not infer production capacity or distributed enforcement from it. No load benchmark is provided.
