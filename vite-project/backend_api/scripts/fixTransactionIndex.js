// Repairs the transactions gatewayRef index.
//
// The old index was { unique: true, sparse: true }, but the schema also had
// `default: null` — and sparse only skips documents where the field is
// ABSENT. Every internal (wallet) transaction therefore stored an explicit
// null, took a slot in the unique index, and the second one failed with:
//
//   E11000 duplicate key error ... index: gatewayRef_1 dup key: { gatewayRef: null }
//
// This drops the old index, removes the explicit nulls, and rebuilds it as a
// partial index that only covers real string references.
//
//   node backend_api/scripts/fixTransactionIndex.js
//
// Safe to re-run.
import "../env.js";
import mongoose from "mongoose";
import { connectDB } from "../db.js";
import Transaction from "../models/Transaction.js";

await connectDB();
const collection = Transaction.collection;

const indexes = await collection.indexes();
const existing = indexes.find((i) => i.name === "gatewayRef_1");
if (existing) {
  console.log("Dropping old index:", JSON.stringify(existing.key), existing.sparse ? "(sparse)" : "");
  await collection.dropIndex("gatewayRef_1");
} else {
  console.log("No gatewayRef_1 index present.");
}

// Explicit nulls become absent, which is what an internal transaction means.
const cleared = await collection.updateMany({ gatewayRef: null }, { $unset: { gatewayRef: "" } });
console.log(`Cleared explicit nulls on ${cleared.modifiedCount} transaction(s).`);

// Rebuilds from the schema definition — now the partial index.
await Transaction.syncIndexes();

console.log("\nIndexes now:");
for (const i of await collection.indexes()) {
  console.log(`  ${i.name}`, JSON.stringify(i.key), i.partialFilterExpression ? "partial" : "", i.unique ? "unique" : "");
}

await mongoose.disconnect();
