import "dotenv/config";

const API = "https://api.brightdata.com";
const TOKEN = process.env.BRIGHT_DATA_API_TOKEN;
const COLLECTOR = process.env.BRIGHT_DATA_EXTRACTION_COLLECTOR_ID ?? "c_mszs3rnj1j4xohocjq";

async function main(): Promise<void> {
  for (const path of [`/dca/collectors/${COLLECTOR}`, `/dca/collectors/${COLLECTOR}/versions`, `/dca/collectors/${COLLECTOR}/production_version`, `/dca/collectors/${COLLECTOR}/dev_version`]) {
    const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const text = await res.text();
    console.log(`\nGET ${path} → ${res.status}`);
    console.log(text.slice(0, 1600));
  }
}
main();
