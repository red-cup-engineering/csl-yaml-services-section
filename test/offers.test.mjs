// Held x402 offers: schema-valid against the vendored offer.schema.json, bound to real exports that
// produce output matching their own declared output schema, and (when X402_OFFER_MODULE points at the
// x402 package's src/offer.mjs) admitted by the x402 package's own declareOffer.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { validateJsonSchema } from "@red-cup-engineering/json-schema-services-section/validation";
import { fixture, json, root } from "./helpers.mjs";

const offerSchema = JSON.parse(fixture("offer.schema.json"));
const files = readdirSync(join(root, "data/records/offers")).filter((name) => name.endsWith(".json")).sort();
const PRICES = {
  "encode-csl-items-as-yaml": "$0.002",
  "decode-csl-yaml": "$0.002",
  "project-bibliography-records-as-csl-yaml": "$0.005",
};

test("one offer per operation, priced", () => {
  assert.deepEqual(files.map((name) => name.replace(/\.json$/u, "")), Object.keys(PRICES).sort());
});

for (const file of files) {
  const operation = file.replace(/\.json$/u, "");
  const offer = json(`data/records/offers/${file}`);

  test(`${operation}: offer is schema-valid, held, and sold by the engineering enterprise`, () => {
    const result = validateJsonSchema(offer, offerSchema);
    assert.deepEqual(result.issues, []);
    assert.equal(offer.operation, operation);
    assert.equal(offer.saleStatus, "held");
    assert.equal(offer.price, PRICES[operation]);
    assert.deepEqual(offer.markets, ["x402-bazaar", "402index", "house-capability-market", "house-seller-catalog"]);
    assert.equal(offer.seller.enterprise, "engineering");
    assert.equal(offer.seller.record.sha256, "6af4ed9d1e4612b0383267e7ffe0ad028c52164ee3c5136110d434384a29c39f");
    assert.equal(offer.gatewayPackageName, "@red-cup-engineering/csl-yaml-services-section");
    assert.equal(offer.ledgerAccount, "Income:Sales:X402:Csl-yaml");
    assert.equal(offer.route, `/v1/${operation}`);
  });

  test(`${operation}: compute binding resolves to an export whose output satisfies the offer's output schema`, async () => {
    const module = await import(`@red-cup-engineering/csl-yaml-services-section${offer.compute.subpath.slice(1)}`);
    assert.equal(typeof module[offer.compute.export], "function");
    const output = module[offer.compute.export](offer.bodyExample);
    const result = validateJsonSchema(output, offer.output.schema);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(JSON.parse(JSON.stringify(output)), offer.output.example);
  });

  test(`${operation}: x402's own declareOffer admits the offer`, { skip: process.env.X402_OFFER_MODULE ? false : "set X402_OFFER_MODULE to the x402 package's src/offer.mjs to run declareOffer" }, async () => {
    const { declareOffer } = await import(pathToFileURL(process.env.X402_OFFER_MODULE).href);
    const declared = declareOffer(offer);
    assert.equal(declared.declaration.saleStatus, "held");
  });
}
