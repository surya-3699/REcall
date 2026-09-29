# REcall deployment

## Prepare

Use Node.js 22.12 or later. Install with `npm ci` and build with `npm run build`. Store credentials in the hosting platform's private environment settings. Do not upload `.env.local`, node_modules or .next from a development machine.

Set the account-provided Hindsight API URL/key, the selected provider settings, and Tavily for Gemini/Groq. Leave unused provider keys empty. Known placeholder strings are rejected for required credentials and session signing. Presence validation does not prove access: run the service checks.

Generate a private signing secret locally:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Set it as SESSION_SECRET on the host and in the owner's private local environment used to generate invitations. Never publish the generated value. Rotating it invalidates existing invitations and sessions.

## Host

Deploy as a Node.js Next.js application behind HTTPS. Start with `npm start`; a managed Next.js platform can run the corresponding build/start lifecycle. Confirm the host supports the route's request duration and can reach Hindsight and the selected research/model services. No specific platform plan or free-tier capacity is guaranteed.

This archive contains no Dockerfile. Docker deployment is not implemented in this package. Do not run docker build without first designing and validating an appropriate image.

## Give judges access

From the project folder with the same private SESSION_SECRET in .env.local:

```bash
npm run invite -- https://your-deployed-domain.example judges
```

Replace the example URL with the real HTTPS deployment. The final argument is the workspace ID; keep it consistent for shared team memory. Invitations expire after 15 minutes and create a seven-day browser session when opened successfully. Generate a fresh invitation near the demonstration. Do not post private invitations in a public repository or article. Arrange judge access through the permitted private submission channel.

## Verify deployment

Open the owner-provided access link, check services, compare exact products, save a new note, reload and recall it. Confirm the next explanation uses the note appropriately. Test a signed-out browser and the actual recording device. Connection checks alone are insufficient.

Do not clear memory or change team/workspace scopes between a save and its demonstration. Keep synthetic examples labelled. Record source URLs and unknowns rather than preselecting a winner.

## Operational limits

Per-process rate limits do not aggregate across replicas or survive restart. Establish a shared limiter before relying on multi-instance quota control. No throughput, memory-use, latency or availability benchmark is claimed.

Never display environment files while recording or debugging in public. Inspect missing-setting names in the interface, not secret values. If a key has been published, revoke and replace it at the provider.
