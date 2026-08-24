import { config } from "dotenv";
config({ path: ".env.local" });
import { createAdminClient } from "../lib/supabase/admin";
import { syncCompany } from "../lib/sync/runSync";

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error("Usage: npx tsx scripts/sync-one.ts \"Company Name\"");
    process.exit(1);
  }
  const supabase = createAdminClient();
  const { data: company, error } = await supabase.from("companies").select("*").eq("name", name).single();
  if (error || !company) {
    console.error("Company not found:", name, error?.message);
    process.exit(1);
  }
  const result = await syncCompany(company);
  console.log(result);
}
main();
