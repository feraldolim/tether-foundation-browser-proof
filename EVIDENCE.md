# Browser-only deployment proof log

Date: 2026-07-16

## Question

Can Cloudflare's public Deploy flow install Tether from a browser, including the
container application and operator bootstrap, without a CLI or broad pasted
credential?

## Public artifact

- Template: https://github.com/feraldolim/tether-foundation-template-prototype
- Deploy URL: https://deploy.workers.cloudflare.com/?url=https://github.com/feraldolim/tether-foundation-template-prototype
- Immutable image: `docker.io/traefik/whoami@sha256:200689790a0a0ea48ca45992e0450bc26ccab5307375b41c84dfc4f2475937ab`

## Browser observation

The public Deploy URL redirected to Cloudflare authentication and preserved the
repository parameter. After authentication, Cloudflare opened **Create a
Worker** and correctly detected:

- Git-provider authorization and creation of a new connected repository;
- the project name;
- a new D1 database, including name and location controls;
- the R2 binding;
- `TETHER_BOOTSTRAP_SECRET` from `.dev.vars.example`;
- `npm run deploy` as the custom deploy command;
- non-production Workers Builds configuration;
- Browser Rendering as a Workers Paid prerequisite; and
- R2 subscription as a separate prerequisite.

An initial attempt exposed an account-mismatch hazard and was stopped before
submission. The completed run used the intended Feraldo account, where Workers
Paid, R2, Browser Run, and Containers were already enabled.

## Completed browser-only run

Cloudflare's browser flow successfully:

1. selected the existing `feraldolim` GitHub connection;
2. cloned the public template into the new public repository
   `feraldolim/tether-foundation-browser-proof`;
3. accepted an isolated project name plus new D1 and R2 names;
4. collected `TETHER_BOOTSTRAP_SECRET` without showing it in build logs;
5. created D1, R2, the Worker, both Durable Object classes, Workers AI and
   Browser Run bindings, and the container application from the pinned public
   image;
6. ran the custom first deploy, D1 migration, and second deploy through Workers
   Builds; and
7. published `tether-foundation-browser-proof.feraldolim.workers.dev`.

The first-run UI then exposed a real JavaScript escaping defect. A one-line fix
was committed to the browser-created Git repository. The Git push automatically
triggered Workers Builds and deployed the correction. After recovery:

- `Start or resume` created the versioned Provisioning Record at
  `doctor_pending`;
- Deployment Doctor reached `ready` after live D1, R2, Durable Object, Workers
  AI, Browser Run, container health, and container stop probes;
- Export returned the complete record and receipts;
- Cloudflare rolled Worker code back to the broken version while the D1 record
  remained `ready`;
- promoting the fixed version restored the UI without altering durable state;
  and
- `Prepare uninstall` exported first, stopped the runtime, and transitioned the
  record to `uninstall_prepared`.

## Live technical proof on the intended account

The existing scoped Wrangler authorization was used only to validate that the
template itself can deploy on the intended Cloudflare account.

Observed sequence:

1. Wrangler automatically created D1 database
   `tether-foundation-template-prototype`.
2. Wrangler automatically created R2 bucket
   `tether-foundation-template-prototype-files`.
3. The first deploy created the Worker, both SQLite Durable Object classes,
   Workers AI and Browser bindings, and the container application from the
   immutable public Docker Hub digest. Docker was not used.
4. The custom deploy script applied `0001_provisioning.sql` remotely and
   performed a second deploy with inherited bindings.
5. A secret-only Worker version was deployed for the bootstrap token.
6. The first request immediately after the secret version changed reached a
   stale version and returned `401`; the next authenticated request succeeded.
   The setup UI must describe propagation and make retry safe.
7. Deployment Doctor passed real D1 query, R2 put/read/delete, Durable Object
   transition, Workers AI inference, Browser launch/render/close, immutable
   container start/HTTP health, and explicit container stop.
8. Cloudflare reported the named `foundation-doctor` instance as `inactive`
   after the stop, proving final scale-to-zero.

Both the CLI-only preflight and browser-created deployments were deleted after
the proof. Their Workers, container applications, D1 databases, and R2 buckets
are absent; the former Worker URLs return 404. The public Git repositories remain
as the prototype's primary evidence and do not carry Cloudflare idle cost.

## Current verdict

The decision gate passes: **Deploy to Cloudflare should remain the Foundation
installation mechanism.** Workers Builds can deploy the pinned external
container, the secret prompt can establish one-time operator bootstrap, and the
complete flow is recoverable through Git-triggered updates and Cloudflare
version promotion/rollback. A Tether-hosted public OAuth installer is not needed
for the Foundation Release.

Production requirements exposed by the proof:

- entitlement preflight must explain Workers Paid and R2 before deployment;
- deterministic resource names must prevent accidental reuse across installs;
- the first deployed route must tolerate the short pre-migration window;
- setup actions and secret-version propagation must be idempotent and retryable;
- code rollback must explicitly say that D1/R2/Durable Object data is not rolled
  back;
- uninstall must export and stop first, then separate compute deletion from the
  explicit durable-data deletion choice; and
- Tether cannot self-delete its Cloudflare resources without retained management
  authority, so Foundation uninstall must hand off to Cloudflare's dashboard or
  a future narrowly scoped installer grant.
