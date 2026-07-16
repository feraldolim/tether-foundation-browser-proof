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

The browser was authenticated to a different Cloudflare account from the
intended Feraldo account. No deploy was submitted there. The true browser-only
run remains pending until the intended account is authenticated and its Workers
Paid and R2 prerequisites are visible in the same flow.

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

Live proof URL: https://tether-foundation-template-prototype.feraldolim.workers.dev

## Current verdict

The template mechanics and complete capability Doctor are viable. The decision
gate is **not yet passed** because the browser-side Workers Builds deployment,
Git clone, secret prompt, update/rollback, export, and uninstall/cleanup must be
completed in the intended account. The browser observation also makes Workers
Paid and R2 entitlement preflight part of the product journey rather than an
implementation detail.

The public OAuth fallback is not justified yet: neither Containers nor the
bootstrap route failed. The remaining blocker is correct-account browser access,
not missing platform API coverage.
