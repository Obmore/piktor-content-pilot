"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const engine = require("../web/engine.js");
const load = name => JSON.parse(fs.readFileSync(path.join(__dirname, "../data", name), "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));
const fixture = () => ({ products: load("pilot.json").products, supplier: load("supplier_records.json") });

test("real manufacturer fixture creates three distinct drafts without invented weights", () => {
  const { products, supplier } = fixture(), before = JSON.stringify({ products, supplier });
  assert.equal(engine.validateSupplierData(supplier).valid, true);
  const result = engine.processProducts(products, supplier);
  assert.deepEqual(result.summary, { total: 3, matched: 3, blocked: 0 });
  assert.match(result.products[0].proposed_short, /100 mm/);
  assert.match(result.products[1].proposed_short, /75 mm/);
  assert.match(result.products[1].proposed_long, /festőhengerek tisztítása/);
  assert.match(result.products[2].proposed_short, /Üvegező gittkés/);
  assert.match(result.products[2].proposed_short, /üvegtábláinak beillesztése/);
  assert.doesNotMatch(result.products[2].proposed_long, /rozsdamentes|munkaszélesség|markolat/);
  assert.doesNotMatch(result.products[1].proposed_long, /gyártói adatokban|Anyag:|Markolat:|Munkaszélesség:/);
  assert.ok(result.products.every(product => product.processing.shipping_weight_kg === null));
  assert.equal(JSON.stringify({ products, supplier }), before, "Processing must not mutate its inputs");
});

test("changing a source-backed fact changes generated copy", () => {
  const { products, supplier } = fixture();
  const first = engine.processProducts(products, supplier).products[0];
  supplier.records[0].facts.material.value = "új ellenőrzött anyag";
  const changed = engine.processProducts(products, supplier).products[0];
  assert.notEqual(first.proposed_short, changed.proposed_short);
  assert.match(changed.proposed_short, /új ellenőrzött anyag/);
  assert.doesNotMatch(changed.proposed_long, /rozsdamentes/);
});

test("shop/manufacturer width conflict blocks the entire draft", () => {
  const { products, supplier } = fixture();
  supplier.records[0].facts.width_mm.value = 125;
  const product = engine.processProducts(products, supplier).products[0];
  assert.equal(product.processing.status, "blocked");
  assert.equal(product.proposed_short, "");
  assert.equal(product.proposed_long, "");
  assert.match(product.processing.messages.join(" "), /variánsütközés/);
});

test("prefix stripping is exactly once and Festa preserves its L", () => {
  const { products, supplier } = fixture();
  for (const [brand, shop, factory] of [["Schuller", "SS17", "S17"], ["Abraboro", "ABRABR17", "ABR17"], ["Festa", "L17", "L17"]]) {
    const product = { ...clone(products[0]), brand, shop_sku: shop, manufacturer_sku: factory };
    const record = { ...clone(supplier.records[0]), brand, manufacturer_sku: factory };
    const result = engine.processProducts([product], [record]).products[0];
    assert.equal(result.processing.status, "matched", shop);
    assert.equal(result.manufacturer_sku, factory);
  }
});

test("bad SKU and unknown exact matches clear stale draft content", () => {
  const { products, supplier } = fixture();
  for (const sku of ["S", "50707", "s50707", "S50708", "S<script>"]) {
    const result = engine.processProducts([{ ...products[0], shop_sku: sku }], supplier).products[0];
    assert.equal(result.processing.status, "blocked", sku);
    assert.equal(result.proposed_short, "");
    assert.equal(result.proposed_long, "");
  }
});

test("duplicate supplier records and duplicate shop products block generation", () => {
  const { products, supplier } = fixture();
  supplier.records.push(clone(supplier.records[0]));
  assert.equal(engine.processProducts(products, supplier).products[0].processing.status, "blocked");
  supplier.records.pop();
  const duplicate = engine.processProducts([products[0], clone(products[0])], supplier);
  assert.equal(duplicate.summary.blocked, 2);
});

test("removing a field's manufacturer source removes that claim", () => {
  const { products, supplier } = fixture();
  const handleUrl = supplier.records[1].facts.handle.source_url;
  supplier.records[1].sources = supplier.records[1].sources.filter(source => source.url !== handleUrl);
  const product = engine.processProducts(products, supplier).products[1];
  assert.equal(product.processing.status, "matched");
  assert.doesNotMatch(product.proposed_short, /markolattal/);
  assert.doesNotMatch(product.proposed_long, /markolattal/);
  assert.ok(!product.facts.some(fact => fact.label === "Markolat"));
  assert.ok(!product.processing.source_refs.includes(handleUrl));
});

test("removing every manufacturer source blocks all generation", () => {
  const { products, supplier } = fixture();
  supplier.records[0].sources = [];
  const result = engine.processProducts(products, supplier).products[0];
  assert.equal(result.processing.status, "blocked");
  assert.deepEqual(result.facts, []);
});

test("removing identity source cannot silently reattribute type and family to another PDF", () => {
  const { products, supplier } = fixture();
  const record = supplier.records[1];
  record.sources = record.sources.filter(source => source.url !== record.identity_source_url);
  assert.ok(record.sources.length > 0, "Other fact sources remain available");
  const result = engine.processProducts(products, supplier).products[1];
  assert.equal(result.processing.status, "blocked");
  assert.equal(result.proposed_short, "");
  assert.equal(result.proposed_long, "");
  assert.match(result.processing.messages.join(" "), /alapforrása hiányzik/);
});

test("identity_source_url is mandatory in schema version 1", () => {
  const { supplier } = fixture();
  delete supplier.records[0].identity_source_url;
  assert.equal(engine.validateSupplierData(supplier).valid, false);
});

test("unsafe source URLs are rejected; unsupported or unsafe facts are omitted", () => {
  const { products, supplier } = fixture();
  for (const url of ["javascript:alert(1)", "data:text/html,x", "https://user:pass@example.com/", "https://example.com/\nattack"]) {
    const mutated = clone(supplier);
    mutated.records[0].sources[0].url = url;
    assert.equal(engine.validateSupplierData(mutated).valid, false, url);
    assert.equal(engine.processProducts(products, mutated).summary.matched, 0);
  }
  supplier.records[0].facts.material.source_url = "javascript:alert(1)";
  supplier.records[0].facts.handle = { value: "<script>alert(1)</script>", source_url: supplier.records[0].sources[0].url };
  const result = engine.processProducts(products, supplier).products[0];
  assert.equal(result.processing.status, "matched");
  assert.doesNotMatch(result.proposed_long, /rozsdamentes|markolattal|script/);
});

test("unlisted sources never silently borrow evidence from another source", () => {
  const { products, supplier } = fixture();
  supplier.records[0].facts.width_mm.source_url = "https://unlisted.example/100";
  const result = engine.processProducts(products, supplier).products[0];
  assert.doesNotMatch(result.proposed_short, /100 mm/);
  assert.ok(!result.facts.some(fact => fact.label === "Munkaszélesség"));
});

test("shipping weights convert g to kg only with a matching source", () => {
  const { products, supplier } = fixture();
  const source_url = supplier.records[0].sources[0].url;
  for (const [value, unit, expected] of [[125, "g", 0.125], [0.25, "kg", 0.25]]) {
    supplier.records[0].facts.shipping_weight = { value, unit, source_url };
    const result = engine.processProducts(products, supplier).products[0];
    assert.equal(result.processing.shipping_weight_kg, expected);
    assert.ok(result.facts.some(fact => fact.label === "Csomagolt szállítási tömeg"));
  }
});

test("fresh shipping evidence is separate from dated baseline observations", () => {
  const { products, supplier } = fixture();
  const originalNotes = clone(products[0].unknowns);
  supplier.records[0].facts.shipping_weight = { value: 125, unit: "g", source_url: supplier.records[0].identity_source_url };
  const matched = engine.processProducts(products, supplier).products[0];
  assert.equal(matched.processing.shipping_weight_kg, 0.125);
  assert.equal(Object.hasOwn(matched, "unknowns"), false);
  assert.deepEqual(matched.observation_notes, originalNotes);
  assert.equal(matched.observation_date, products[0].source_reviewed_at);
  supplier.records.push(clone(supplier.records[0]));
  const blocked = engine.processProducts(products, supplier).products[0];
  assert.equal(blocked.processing.status, "blocked");
  assert.equal(Object.hasOwn(blocked, "unknowns"), false);
  assert.deepEqual(blocked.observation_notes, originalNotes);
  assert.equal(blocked.observation_date, products[0].source_reviewed_at);
  assert.deepEqual(products[0].unknowns, originalNotes, "Input observations remain unchanged");
});

test("invalid units, numeric strings, zero and missing weight sources remain unknown", () => {
  const { products, supplier } = fixture();
  const source_url = supplier.records[0].sources[0].url;
  for (const weight of [
    { value: 125, unit: "lb", source_url }, { value: "125", unit: "g", source_url },
    { value: 0, unit: "g", source_url }, { value: -5, unit: "g", source_url },
    { value: 125, unit: "g" },
  ]) {
    supplier.records[0].facts.shipping_weight = weight;
    assert.equal(engine.processProducts(products, supplier).products[0].processing.shipping_weight_kg, null);
  }
});

test("net weight is never used as packaged shipping weight", () => {
  const { products, supplier } = fixture();
  supplier.records[0].facts.net_weight = { value: 125, unit: "g", source_url: supplier.records[0].sources[0].url };
  const product = engine.processProducts(products, supplier).products[0];
  assert.equal(product.processing.shipping_weight_kg, null);
  assert.ok(!product.facts.some(fact => /tömeg/.test(fact.label)));
});

test("unsupported type and prototype keys cannot select a template or a brand", () => {
  const { products, supplier } = fixture();
  for (const type of ["unknown_type", "constructor", "__proto__"]) {
    supplier.records[0].type = type;
    assert.equal(engine.processProducts(products, supplier).products[0].processing.status, "blocked");
  }
  supplier.records[0].brand = "__proto__";
  assert.equal(engine.validateSupplierData(supplier).valid, false);
});

test("invalid supplier document reports errors without a partial result", () => {
  const { products } = fixture();
  for (const invalid of [null, {}, { schema_version: 2, records: [] }, { schema_version: 1, records: {} }]) {
    assert.equal(engine.validateSupplierData(invalid).valid, false);
    assert.equal(engine.processProducts(products, invalid).summary.blocked, 3);
  }
});

test("previously recorded unresolved shop conflicts remain blocked", () => {
  const { products, supplier } = fixture();
  products[0].match_status = "conflict";
  assert.equal(engine.processProducts(products, supplier).products[0].processing.status, "blocked");
});

test("image rules switch from 100 to 500 pixels on the verified date", () => {
  const before = engine.imageRules(600, 277, 100000, "2027-01-30");
  assert.equal(before.status, "pass");
  assert.equal(before.minimum_pixels, 100);
  assert.equal(before.future_ready, false);
  const after = engine.imageRules(600, 277, 100000, "2027-01-31");
  assert.equal(after.status, "fail");
  assert.equal(after.minimum_pixels, 500);
  assert.equal(engine.imageRules(500, 500, 100000, "2027-01-31").status, "pass");
});

test("image pixel and byte limits are enforced; missing measurements stay unknown", () => {
  assert.equal(engine.imageRules(8000, 8000, 16000000, "2026-09-24").status, "pass");
  assert.equal(engine.imageRules(8001, 8000, 100000, "2026-09-24").status, "fail");
  assert.equal(engine.imageRules(500, 500, 16000001, "2026-09-24").status, "fail");
  assert.equal(engine.imageRules(null, null, null, "2026-09-24").status, "unknown");
  assert.equal(engine.imageRules(500, 500, null, "2026-09-24").status, "unknown");
  assert.equal(engine.imageRules(500, 500, 100000, "2027-02-30").status, "unknown");
});

test("engine exposes the same API in a browser without CommonJS", () => {
  const context = { URL };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../web/engine.js"), "utf8"), context);
  assert.equal(typeof context.PiktorEngine.processProducts, "function");
  assert.equal(context.PiktorEngine.imageRules(500, 500, 10000, "2027-01-31").status, "pass");
});
