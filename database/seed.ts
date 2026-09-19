import { getDb } from "../backend/queries/connection";
import { ensureLocalMerchant } from "../backend/queries/local-data";

async function seed() {
  getDb();
  console.log("Seeding database...");

  await ensureLocalMerchant();

  console.log("Done.");
  process.exit(0); // close MySQL connection pool
}

seed();
