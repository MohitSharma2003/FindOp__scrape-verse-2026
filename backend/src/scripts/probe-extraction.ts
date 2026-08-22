import "dotenv/config";

const API = "https://api.brightdata.com";
const TOKEN = process.env.BRIGHT_DATA_API_TOKEN;
const COLLECTOR = process.env.BRIGHT_DATA_EXTRACTION_COLLECTOR_ID ?? "c_mszs3rnj1j4xohocjq";
const VERSION = process.env.BRIGHT_DATA_EXTRACTION_COLLECTOR_VERSION || undefined;

async function triggerAndDump(url: string): Promise<void> {
  console.log(`\n=== ${url}${VERSION ? ` (version=${VERSION})` : ""} ===`);
  const triggerRes = await fetch(`${API}/dca/trigger?collector=${COLLECTOR}&queue_next=1${VERSION ? `&version=${VERSION}` : ""}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify([{ url }]),
  });
  const triggerBody = await triggerRes.text();
  if (!triggerRes.ok) { console.log("TRIGGER FAILED:", triggerRes.status, triggerBody.slice(0, 300)); return; }
  const snapshotId = (JSON.parse(triggerBody) as { collection_id?: string }).collection_id;
  console.log("snapshot:", snapshotId);

  const deadline = Date.now() + 240000;
  let emptyCount = 0;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const res = await fetch(`${API}/dca/dataset?id=${snapshotId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const text = await res.text();
    if (!res.ok) { console.log("POLL FAILED:", res.status, text.slice(0, 300)); continue; }
    if (!text.trim()) { emptyCount += 1; console.log(`HTTP ${res.status} EMPTY BODY (#${emptyCount})`); if (emptyCount > 10) return; continue; }
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { console.log(`HTTP ${res.status} NON-JSON BODY:`, text.slice(0, 400)); return; }
    if (Array.isArray(payload)) {
      console.log(`DONE — ${payload.length} record(s)`);
      for (const record of payload.slice(0, 2)) {
        console.log("KEYS:", Object.keys(record as object).join(", "));
        console.log(JSON.stringify(record, null, 2).slice(0, 2200));
      }
      return;
    }
    if (payload && typeof payload === "object") {
      const status = (payload as { status?: string }).status;
      const looksLikeRecord = ["title", "url", "source_url", "opportunity_type"].some((key) => key in (payload as object));
      if (!status || looksLikeRecord) {
        console.log("DONE — 1 record(s)");
        console.log(JSON.stringify(payload, null, 2).slice(0, 2200));
        return;
      }
      console.log("status:", status);
      if (!["building", "collecting", "pending", "queued", "processing", "running", "in_progress"].includes(status)) {
        console.log("FINAL PAYLOAD:", JSON.stringify(payload, null, 2).slice(0, 1200));
        return;
      }
      continue;
    }
    console.log("PRIMITIVE PAYLOAD:", String(payload).slice(0, 400));
    return;
  }
  console.log("TIMED OUT");
}

const targets = process.argv.slice(2);
async function main(): Promise<void> {
  for (const target of targets.length ? targets : ["https://hackspire26.devfolio.co/", "https://ethkochi.devfolio.co/", "https://www.tcs.com/careers/india/internship"]) {
    await triggerAndDump(target).catch(error => console.log("PROBE ERROR:", error instanceof Error ? error.message : error));
  }
}
main();
