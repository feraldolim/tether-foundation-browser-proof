# Tether Foundation deployment-template prototype

> THROWAWAY PROTOTYPE — this repository exists only to test Tether's browser-only Cloudflare installation gate.

It deploys one Worker with automatically provisioned D1 and R2 bindings,
Workers AI, Browser Run, a container-bound Durable Object, and an immutable
public Docker Hub image. The custom deploy script performs a first deploy to
materialize draft bindings, applies the D1 migration, and deploys again.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/feraldolim/tether-foundation-template-prototype)

After deployment, open the generated `workers.dev` URL. Enter the bootstrap
secret supplied during deployment, start setup, and run Deployment Doctor.
Doctor exercises D1, R2, Durable Objects, Workers AI, Browser Run, and
container start/HTTP health/stop. The container also has a one-minute idle
shutdown as a safety net.

The UI intentionally exposes product phases and outcomes, not Wrangler commands
or resource identifiers. Export is available before the destructive uninstall
handoff.
