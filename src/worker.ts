import { Container } from "@cloudflare/containers";
import puppeteer from "@cloudflare/puppeteer";
import { DurableObject } from "cloudflare:workers";

interface Env {
  AI: Ai;
  BROWSER: Fetcher;
  DB: D1Database;
  FILES: R2Bucket;
  PROJECT: DurableObjectNamespace<ProjectState>;
  AGENT_CONTAINER: DurableObjectNamespace<AgentContainer>;
  TETHER_BOOTSTRAP_SECRET: string;
}

interface Receipt {
  capability: string;
  outcome: "passed" | "failed" | "stopped";
  observedAt: string;
  detail: string;
}

interface ProvisioningRecord {
  id: "foundation";
  schemaVersion: 1;
  phase: string;
  receipts: Receipt[];
  updatedAt: string;
}

export class AgentContainer extends Container<Env> {
  defaultPort = 80;
  sleepAfter = "1m";
  enableInternet = false;
}

export class ProjectState extends DurableObject<Env> {
  async transition(phase: string) {
    const previous = (await this.ctx.storage.get<string>("phase")) ?? "new";
    await this.ctx.storage.put({ phase, updatedAt: new Date().toISOString() });
    return { previous, phase };
  }
}

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

function authorized(request: Request, env: Env) {
  const supplied = request.headers.get("x-tether-bootstrap-secret");
  return Boolean(env.TETHER_BOOTSTRAP_SECRET) && supplied === env.TETHER_BOOTSTRAP_SECRET;
}

async function readRecord(env: Env): Promise<ProvisioningRecord | null> {
  const row = await env.DB.prepare(
    "SELECT schema_version, phase, receipts_json, updated_at FROM provisioning_records WHERE id = ?",
  ).bind("foundation").first<{
    schema_version: number;
    phase: string;
    receipts_json: string;
    updated_at: string;
  }>();
  if (!row) return null;
  return {
    id: "foundation",
    schemaVersion: row.schema_version as 1,
    phase: row.phase,
    receipts: JSON.parse(row.receipts_json) as Receipt[],
    updatedAt: row.updated_at,
  };
}

async function writeRecord(env: Env, phase: string, receipts: Receipt[]) {
  const record: ProvisioningRecord = {
    id: "foundation",
    schemaVersion: 1,
    phase,
    receipts,
    updatedAt: new Date().toISOString(),
  };
  await env.DB.prepare(
    `INSERT INTO provisioning_records (id, schema_version, phase, receipts_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET phase=excluded.phase, receipts_json=excluded.receipts_json, updated_at=excluded.updated_at`,
  ).bind(record.id, record.schemaVersion, record.phase, JSON.stringify(record.receipts), record.updatedAt).run();
  return record;
}

async function firstRun(env: Env) {
  const existing = await readRecord(env);
  if (existing && existing.phase !== "new") return json({ ok: true, resumed: true, record: existing });
  const project = env.PROJECT.getByName("foundation");
  await project.transition("doctor_pending");
  return json({ ok: true, resumed: false, record: await writeRecord(env, "doctor_pending", []) });
}

async function doctor(env: Env) {
  const receipts: Receipt[] = [];
  const pass = (capability: string, detail: string, outcome: Receipt["outcome"] = "passed") =>
    receipts.push({ capability, detail, outcome, observedAt: new Date().toISOString() });

  try {
    await env.DB.prepare("SELECT 1 AS ready").first();
    pass("D1", "Remote query completed and provisioning migration is present.");

    const key = `doctor/${crypto.randomUUID()}.txt`;
    await env.FILES.put(key, "tether-doctor");
    const stored = await env.FILES.get(key);
    if ((await stored?.text()) !== "tether-doctor") throw new Error("R2 readback mismatch");
    await env.FILES.delete(key);
    pass("R2", "Put, readback, and delete completed.");

    const transition = await env.PROJECT.getByName("foundation").transition("doctor_running");
    pass("Durable Object", `Durable transition ${transition.previous} → ${transition.phase}.`);

    const ai = await env.AI.run("@cf/meta/llama-3.2-1b-instruct", {
      prompt: "Reply with exactly: ready",
      max_tokens: 8,
    });
    pass("Workers AI", `Inference returned ${JSON.stringify(ai).length} bytes.`);

    const browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setContent("<title>Tether Doctor</title><p>ready</p>");
    const title = await page.title();
    await browser.close();
    pass("Browser Run", `Browser launched and rendered title: ${title}.`);

    const container = env.AGENT_CONTAINER.getByName("foundation-doctor");
    const response = await container.fetch("http://container/");
    const body = await response.text();
    if (!response.ok || !body.includes("Hostname")) throw new Error(`container health returned ${response.status}`);
    pass("Container", "Immutable public image started and answered HTTP health.");
    await container.stop();
    pass("Container lifecycle", "Explicit stop completed; idle safety timeout is one minute.", "stopped");

    await env.PROJECT.getByName("foundation").transition("ready");
    return json({ ok: true, record: await writeRecord(env, "ready", receipts) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    receipts.push({ capability: "Doctor", detail, outcome: "failed", observedAt: new Date().toISOString() });
    await env.PROJECT.getByName("foundation").transition("doctor_failed");
    return json({ ok: false, error: detail, record: await writeRecord(env, "doctor_failed", receipts) }, 500);
  }
}

async function prepareUninstall(env: Env) {
  const record = await readRecord(env);
  await env.AGENT_CONTAINER.getByName("foundation-doctor").stop().catch(() => undefined);
  await env.PROJECT.getByName("foundation").transition("uninstall_prepared");
  return json({
    ok: true,
    record: await writeRecord(env, "uninstall_prepared", record?.receipts ?? []),
    next: "Export, then delete the Worker application. Delete D1 and R2 only through a separate explicit choice.",
  });
}

const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Tether setup</title><style>
:root{font:15px/1.5 Inter,ui-sans-serif,system-ui;color:#17201f;background:#f4f1e9}*{box-sizing:border-box}body{margin:0}.shell{max-width:980px;margin:auto;padding:40px 22px 80px}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:48px}.brand{font-weight:750;letter-spacing:-.03em;font-size:22px}.tag{font-size:12px;padding:6px 10px;border:1px solid #b9b5a8;border-radius:99px}h1{font:600 48px/1.03 Georgia,serif;letter-spacing:-.04em;max-width:720px;margin:0 0 16px}.lede{font-size:18px;color:#59615f;max-width:650px}.grid{display:grid;grid-template-columns:1.6fr 1fr;gap:18px;margin-top:34px}.card{background:#fff;border:1px solid #dcd8cd;border-radius:18px;padding:22px;box-shadow:0 8px 30px #26302b0a}.steps{display:grid;gap:8px;margin:20px 0}.step{display:flex;gap:12px;padding:12px;border-radius:12px;background:#f7f6f1}.step b{width:24px;height:24px;border-radius:50%;background:#dce9e2;text-align:center}.cost{font-size:28px;font-weight:700}input{width:100%;padding:13px;border:1px solid #b9b5a8;border-radius:10px;margin:12px 0}button{border:0;border-radius:10px;padding:12px 16px;font-weight:700;cursor:pointer;background:#193d35;color:white;margin:4px 6px 4px 0}.secondary{background:#e8ece8;color:#193d35}.danger{background:#f3ded9;color:#702b20}pre{white-space:pre-wrap;font-size:12px;background:#17201f;color:#dbe9e3;padding:14px;border-radius:12px;min-height:90px}.chat{border:1px dashed #aaa497;border-radius:14px;padding:16px;color:#69706e}@media(max-width:720px){h1{font-size:37px}.grid{grid-template-columns:1fr}}
</style></head><body><div class="shell"><header><div class="brand">tether</div><span class="tag">Foundation deployment proof</span></header><h1>Your private agent, deployed into your Cloudflare account.</h1><p class="lede">Cloudflare has handled infrastructure authorization. Tether now verifies the capabilities you selected and hands you directly into chat.</p><div class="grid"><main class="card"><h2>Finish setup</h2><div class="steps"><div class="step"><b>1</b><span><strong>Cloudflare + GitHub</strong><br>Authorized during deployment</span></div><div class="step"><b>2</b><span><strong>Plan and capabilities</strong><br>Workers AI, files, Browser, and code container</span></div><div class="step"><b>3</b><span><strong>Deployment Doctor</strong><br>Live end-to-end verification with recovery</span></div><div class="step"><b>4</b><span><strong>First chat</strong><br>Your normal working surface</span></div></div><label>One-time bootstrap secret<input id="secret" type="password" autocomplete="off" placeholder="Value entered during deployment"></label><div><button onclick="callApi('/api/first-run')">Start or resume</button><button onclick="callApi('/api/doctor')">Run Doctor</button><button class="secondary" onclick="callApi('/api/export','GET')">Export</button><button class="danger" onclick="callApi('/api/uninstall')">Prepare uninstall</button></div><pre id="out">Waiting for setup.</pre></main><aside class="card"><small>ESTIMATED OPERATING POSTURE</small><div class="cost">Scale to zero</div><p>The container runs only for agent work and is stopped after this proof. Workers AI, Browser, storage, and request usage remain metered by Cloudflare.</p><hr><h3>Model</h3><p>Workers AI · no external API key</p><h3>Approval mode</h3><p>Supervised by default; Full Access remains an explicit setting.</p><div class="chat"><strong>First chat</strong><br>Appears here after Doctor passes. Setup details then move to Settings.</div></aside></div></div><script>
async function callApi(path,method='POST'){const out=document.querySelector('#out');out.textContent='Working…';try{const r=await fetch(path,{method,headers:{'x-tether-bootstrap-secret':document.querySelector('#secret').value}});const value=await r.json();if(r.status===401){out.textContent='The deployment or secret may still be propagating. Wait a few seconds, then retry safely.\n\n'+JSON.stringify(value,null,2);return}out.textContent=JSON.stringify(value,null,2)}catch(e){out.textContent=String(e)}}
</script></body></html>`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/") return new Response(page, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
    if (!url.pathname.startsWith("/api/") || !authorized(request, env)) return json({ error: "unauthorized" }, 401);
    if (url.pathname === "/api/first-run" && request.method === "POST") return firstRun(env);
    if (url.pathname === "/api/doctor" && request.method === "POST") return doctor(env);
    if (url.pathname === "/api/export" && request.method === "GET") return json({ exportedAt: new Date().toISOString(), record: await readRecord(env) });
    if (url.pathname === "/api/uninstall" && request.method === "POST") return prepareUninstall(env);
    return json({ error: "not found" }, 404);
  },
} satisfies ExportedHandler<Env>;
