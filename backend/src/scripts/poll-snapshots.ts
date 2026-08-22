import "dotenv/config";

const API = "https://api.brightdata.com";
const TOKEN = process.env.BRIGHT_DATA_API_TOKEN;

async function dump(id: string): Promise<void> {
  const res = await fetch(`${API}/dca/dataset?id=${id}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  const text = await res.text();
  console.log(`\n=== ${id} (HTTP ${res.status}) ===`);
  if (!text.trim()) { console.log("EMPTY BODY"); return; }
  try {
    const payload = JSON.parse(text) as unknown;
    if (Array.isArray(payload)) {
      console.log(`${payload.length} record(s)`);
      for (const record of payload.slice(0, 3)) {
        console.log("KEYS:", Object.keys(record as object).join(", "));
        console.log(JSON.stringify(record, null, 2).slice(0, 1500));
      }
    } else {
      console.log(JSON.stringify(payload, null, 2).slice(0, 800));
    }
  } catch {
    console.log("NON-JSON:", text.slice(0, 400));
  }
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2);
  for (const id of ids) await dump(id);
}
void main();
