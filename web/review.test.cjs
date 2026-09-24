"use strict";
// Optional DOM behavior QA. Install jsdom@26.1.0 separately and set NODE_PATH.
// No browser rendering or visual QA is claimed by these tests.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");
const baseline = JSON.parse(read("../data/pilot.json"));
const supplier = JSON.parse(read("../data/supplier_records.json"));
const clone = (value) => JSON.parse(JSON.stringify(value));
function setup(options = {}) {
  const dom = new JSDOM(read("index.html"), { url: "https://piktor-pilot.example/", runScripts: "outside-only" });
  const w = dom.window, downloads = [], imageRequests = [], revoked = []; let closed = false;
  const RealDate = Date;
  w.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [options.now || "2026-09-24T10:00:00Z"])); } static now() { return new RealDate(options.now || "2026-09-24T10:00:00Z").getTime(); } };
  w.PILOT_DATA = clone(options.data || baseline); w.SUPPLIER_DATA = clone(supplier); w.Blob = Blob;
  w.URL.createObjectURL = (blob) => { downloads.push({ blob }); return "blob:local-test-" + downloads.length; };
  w.URL.revokeObjectURL = (url) => revoked.push(url);
  w.HTMLAnchorElement.prototype.click = function () { if (downloads.length) downloads[downloads.length - 1].filename = this.download; };
  w.Image = class {
    set src(url) { this.url = url; imageRequests.push(this); if (!options.deferImages) queueMicrotask(() => this.succeed()); }
    succeed(width = options.imageWidth || 320, height = options.imageHeight || 240) { if (closed) return; this.naturalWidth = width; this.naturalHeight = height; this.onload(); }
    fail() { if (!closed) this.onerror(); }
  };
  w.eval(read("engine.js")); w.eval(read("app.js"));
  return { window: w, document: w.document, downloads, imageRequests, revoked, close: () => { closed = true; dom.window.close(); } };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function importFile(ui, id, file) {
  const input = ui.document.getElementById(id);
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  input.dispatchEvent(new ui.window.Event("change", { bubbles: true })); await tick();
}
const process = (ui) => ui.document.getElementById("process-button").click();

test("starts as a functional product sample without pre-generated output or marketing sections", () => {
  const ui = setup();
  try {
    assert.equal(ui.document.getElementById("load-error").hidden, true);
    assert.equal(ui.document.querySelectorAll(".product-option").length, baseline.products.length);
    assert.equal(ui.document.getElementById("generated-content").hidden, true);
    assert.equal(ui.document.getElementById("export-button").disabled, true);
    assert.equal(ui.document.querySelector(".hero"), null);
    assert.doesNotMatch(ui.document.body.textContent, /A közös munka|Díjmentes mintakör|vásárlói segítség/);
  } finally { ui.close(); }
});

test("processing calls the real engine and creates source-backed descriptions without mutating input", () => {
  const ui = setup();
  try {
    const before = JSON.stringify(ui.window.PILOT_DATA); process(ui);
    assert.equal(ui.document.getElementById("generated-content").hidden, false);
    assert.match(ui.document.getElementById("proposed-short").textContent, /100 mm/);
    assert.match(ui.document.getElementById("message").textContent, /3 \/ 3/);
    assert.ok(ui.document.querySelectorAll("#fact-list a").length > 0);
    assert.equal(JSON.stringify(ui.window.PILOT_DATA), before);
    assert.equal(ui.document.getElementById("export-button").disabled, false);
  } finally { ui.close(); }
});

test("valid JSON import changes the input; generated text changes only after processing", async () => {
  const ui = setup();
  try {
    process(ui); const candidate = clone(supplier); delete candidate.records[0].facts.material;
    await importFile(ui, "supplier-file", { name: "valtozott.json", size: 1000, text: async () => JSON.stringify(candidate) });
    assert.equal(ui.document.getElementById("generated-content").hidden, true);
    assert.equal(ui.document.getElementById("export-button").disabled, true);
    process(ui);
    assert.match(ui.document.getElementById("proposed-short").textContent, /100 mm/);
    assert.doesNotMatch(ui.document.getElementById("proposed-short").textContent, /rozsdamentes/);
    assert.match(ui.document.getElementById("supplier-label").textContent, /valtozott.json/);
  } finally { ui.close(); }
});

test("malformed or schema-invalid imports preserve the existing data and generated output", async () => {
  const ui = setup();
  try {
    process(ui); const previous = ui.document.getElementById("output-json").textContent;
    await importFile(ui, "supplier-file", { name: "hibas.json", size: 20, text: async () => "{broken" });
    assert.match(ui.document.getElementById("message").textContent, /nem tölthető be/);
    assert.equal(ui.document.getElementById("output-json").textContent, previous);
    await importFile(ui, "supplier-file", { name: "ures.json", size: 20, text: async () => '{"oops":1}' });
    assert.equal(ui.document.getElementById("output-json").textContent, previous);
    assert.equal(ui.document.getElementById("export-button").disabled, false);
  } finally { ui.close(); }
});

test("unknown identifiers are blocked and do not retain an old description", () => {
  const data = clone(baseline); data.products[0].shop_sku = "S99999"; data.products[0].manufacturer_sku = "99999";
  const ui = setup({ data });
  try {
    process(ui);
    assert.equal(ui.document.getElementById("generated-content").hidden, true);
    assert.equal(ui.document.getElementById("proposed-short").textContent, "");
    assert.equal(ui.document.getElementById("review-button").disabled, true);
    assert.match(ui.document.getElementById("match-status").textContent, /Nem dolgozható fel/);
  } finally { ui.close(); }
});

test("local image measurement uses decoded dimensions, byte count and dated real engine rules", async () => {
  const ui = setup({ imageWidth: 320, imageHeight: 240 });
  try {
    await importFile(ui, "image-file", { name: "termek.jpg", type: "image/jpeg", size: 24576 });
    assert.match(ui.document.getElementById("image-result").textContent, /320 × 240 px/);
    assert.match(ui.document.getElementById("image-result").textContent, /500 × 500 px minimumot nem éri el/);
    assert.match(ui.document.getElementById("image-result").textContent, /mért műszaki adatok megfelelnek/);
    process(ui); ui.document.getElementById("export-button").click();
    const payload = JSON.parse(await ui.downloads.at(-1).blob.text());
    assert.equal(payload.image_checks[0].width, 320); assert.equal(payload.image_checks[0].height, 240);
    assert.equal(payload.image_checks[0].bytes, 24576); assert.equal(payload.image_checks[0].rights, "unknown");
    assert.equal(payload.image_checks[0].display_url, undefined);
  } finally { ui.close(); }
});

test("manufacturer images are explicit candidates with recorded file evidence, not automatic previews", () => {
  const ui = setup();
  try {
    assert.equal(ui.document.getElementById("product-image").hasAttribute("src"), false);
    assert.equal(ui.document.getElementById("load-manufacturer-image-button").hidden, false);
    assert.match(ui.document.getElementById("manufacturer-image-info").textContent, /képjelölt.*rögzített fájlmérés/);
    assert.match(ui.document.getElementById("manufacturer-image-info").textContent, /Felhasználási jog: nincs ellenőrizve/);
  } finally { ui.close(); }
});

test("result export contains generated content, provenance and optional review, never UNAS approval", async () => {
  const ui = setup();
  try {
    process(ui); ui.document.getElementById("review-button").click();
    assert.match(ui.document.getElementById("review-message").textContent, /Adja meg/);
    ui.document.getElementById("reviewer-name").value = "Teszt Ellenőrző";
    ui.document.getElementById("source-confirmation").checked = true; ui.document.getElementById("review-button").click();
    ui.document.getElementById("export-button").click();
    let payload = JSON.parse(await ui.downloads.at(-1).blob.text());
    assert.equal(ui.downloads.at(-1).filename, "eredmeny.json");
    assert.equal(payload.purpose, "content_proposal_not_unas_import");
    assert.equal(payload.products.length, 3); assert.equal(payload.editorial_reviews.length, 1);
    assert.ok(payload.products[0].processing.source_refs.length > 0);
    assert.deepEqual(payload.supplier_data, supplier); assert.equal(payload.approvals, undefined);
    process(ui); ui.document.getElementById("export-button").click();
    payload = JSON.parse(await ui.downloads.at(-1).blob.text());
    assert.equal(payload.editorial_reviews.length, 0);
  } finally { ui.close(); }
});

test("unsafe data is rendered as text, while search and keyboard tabs work", () => {
  const data = clone(baseline); data.products[0].name = '<img src=x onerror="window.pwned=1">'; data.products[0].shop_url = "javascript:alert(1)";
  const ui = setup({ data });
  try {
    assert.equal(ui.document.getElementById("product-name").textContent, data.products[0].name);
    assert.equal(ui.document.querySelectorAll('img[onerror],a[href^="javascript:"]').length, 0);
    const input = ui.document.getElementById("product-search"); input.value = "S50080"; input.dispatchEvent(new ui.window.Event("input"));
    assert.equal(ui.document.querySelectorAll(".product-option").length, 1); ui.document.querySelector(".product-option").click();
    assert.equal(ui.document.getElementById("shop-sku").textContent, "S50080");
    ui.document.getElementById("tab-product").dispatchEvent(new ui.window.KeyboardEvent("keydown", { key: "ArrowRight" }));
    assert.equal(ui.document.getElementById("panel-processing").hidden, false); assert.equal(ui.document.activeElement.id, "tab-processing");
  } finally { ui.close(); }
});

test("conflicting variant width imports successfully but blocks that product on processing", async () => {
  const ui = setup();
  try {
    const candidate = clone(supplier); candidate.records[0].facts.width_mm.value = 120;
    await importFile(ui, "supplier-file", { name: "meretutkozes.json", size: 1000, text: async () => JSON.stringify(candidate) });
    process(ui);
    assert.equal(ui.document.getElementById("generated-content").hidden, true);
    assert.equal(ui.document.getElementById("proposed-short").textContent, "");
    assert.match(ui.document.getElementById("match-status").textContent, /Nem dolgozható fel/);
  } finally { ui.close(); }
});

test("image rules use the actual measurement date, not the old source observation date", async () => {
  const ui = setup({ now: "2027-02-01T10:00:00Z", imageWidth: 320, imageHeight: 240 });
  try {
    await importFile(ui, "image-file", { name: "termek.jpg", type: "image/jpeg", size: 20000 });
    assert.match(ui.document.getElementById("image-result").textContent, /mért műszaki adatok nem felelnek meg/);
    process(ui); ui.document.getElementById("export-button").click();
    const payload = JSON.parse(await ui.downloads.at(-1).blob.text());
    assert.equal(payload.image_checks[0].audit.minimum_pixels, 500);
    assert.equal(payload.observed_at, baseline.observed_at);
  } finally { ui.close(); }
});

test("live manufacturer preview never combines fresh pixels with old recorded file bytes", async () => {
  const ui = setup({ imageWidth: 1000, imageHeight: 900 });
  try {
    ui.document.getElementById("load-manufacturer-image-button").click(); await tick();
    assert.match(ui.document.getElementById("image-result").textContent, /Fájlméret: nem mért/);
    process(ui); ui.document.getElementById("export-button").click();
    const payload = JSON.parse(await ui.downloads.at(-1).blob.text());
    assert.equal(payload.image_checks[0].bytes, null);
    assert.equal(payload.image_checks[0].recorded_measurement.bytes, baseline.products[0].manufacturer_image.bytes);
    assert.equal(payload.image_checks[0].audit.status, "unknown");
  } finally { ui.close(); }
});

test("large image files fail without a false claim about sub-500 pixel dimensions", async () => {
  const ui = setup({ imageWidth: 1200, imageHeight: 1200 });
  try {
    await importFile(ui, "image-file", { name: "nagy.jpg", type: "image/jpeg", size: 17000000 });
    assert.match(ui.document.getElementById("image-result").textContent, /mért műszaki adatok nem felelnek meg/);
    assert.doesNotMatch(ui.document.getElementById("image-result").textContent, /500 × 500 px minimumot nem éri el/);
  } finally { ui.close(); }
});

test("new shipping weight is current data while old missing-weight notes stay explicitly historical", async () => {
  const ui = setup();
  try {
    const candidate = clone(supplier);
    candidate.records[0].facts.shipping_weight = { value: 250, unit: "g", source_url: candidate.records[0].identity_source_url };
    await importFile(ui, "supplier-file", { name: "sulyadat.json", size: 1000, text: async () => JSON.stringify(candidate) });
    process(ui);
    assert.match(ui.document.getElementById("shipping-weight").textContent, /0.25 kg/);
    assert.match(ui.document.getElementById("observation-title").textContent, /korábbi adatfelvétel/);
    const output = JSON.parse(ui.document.getElementById("output-json").textContent);
    assert.equal(output.products[0].unknowns, undefined);
    assert.ok(Array.isArray(output.products[0].observation_notes));
    assert.equal(ui.document.getElementById("processing-messages").open, false);
  } finally { ui.close(); }
});

test("processing automatically loads manufacturer previews for all matched products and switching shows them", () => {
  const ui = setup({ deferImages: true });
  try {
    process(ui);
    assert.equal(ui.imageRequests.length, 3);
    assert.match(ui.document.getElementById("image-status").textContent, /betöltése/);
    assert.equal(ui.document.getElementById("image-frame").getAttribute("aria-busy"), "true");
    ui.imageRequests.forEach((request, index) => {
      assert.equal(request.url, baseline.products[index].manufacturer_image.preview_url);
      request.succeed(800 + index, 600 + index);
    });
    assert.equal(ui.document.getElementById("product-image").getAttribute("src"), baseline.products[0].manufacturer_image.preview_url);
    ui.document.querySelectorAll(".product-option")[1].click();
    assert.equal(ui.document.getElementById("product-image").getAttribute("src"), baseline.products[1].manufacturer_image.preview_url);
    assert.match(ui.document.getElementById("image-result").textContent, /801 × 601 px/);
    assert.equal(ui.document.getElementById("image-frame").getAttribute("aria-busy"), "false");
  } finally { ui.close(); }
});

test("repeated processing reuses pending or loaded images without additional requests", () => {
  const ui = setup({ deferImages: true });
  try {
    process(ui); process(ui);
    assert.equal(ui.imageRequests.length, 3);
    ui.imageRequests.forEach((request) => request.succeed());
    process(ui); assert.equal(ui.imageRequests.length, 3);
  } finally { ui.close(); }
});

test("failed manufacturer sources fall back once in order; final error is visible and retry starts a fresh attempt", () => {
  const ui = setup({ deferImages: true });
  try {
    process(ui);
    ui.imageRequests[0].fail();
    assert.equal(ui.imageRequests[3].url, baseline.products[0].manufacturer_image.url);
    ui.imageRequests[3].fail();
    assert.equal(ui.imageRequests[4].url, baseline.products[0].image.url);
    ui.imageRequests[4].fail();
    assert.equal(ui.imageRequests.length, 5);
    assert.equal(ui.document.getElementById("retry-image-button").hidden, false);
    assert.match(ui.document.getElementById("image-status").textContent, /nem tölthetők be/);
    process(ui); assert.equal(ui.imageRequests.length, 5);
    ui.document.getElementById("retry-image-button").click();
    assert.equal(ui.imageRequests[5].url, baseline.products[0].manufacturer_image.preview_url);
    ui.imageRequests[5].succeed(640, 480);
    assert.equal(ui.document.getElementById("retry-image-button").hidden, true);
    assert.equal(ui.document.getElementById("product-image").hidden, false);
  } finally { ui.close(); }
});

test("successful shop fallback is displayed with its real source and measured preview dimensions", async () => {
  const ui = setup({ deferImages: true });
  try {
    process(ui); ui.imageRequests[0].fail(); ui.imageRequests[3].fail(); ui.imageRequests[4].succeed(400, 300);
    assert.equal(ui.document.getElementById("product-image").getAttribute("src"), baseline.products[0].image.url);
    assert.equal(ui.document.getElementById("image-status").textContent, "A webshop képe betöltve.");
    ui.document.getElementById("export-button").click();
    const payload = JSON.parse(await ui.downloads.at(-1).blob.text());
    assert.equal(payload.image_checks[0].source_url, baseline.products[0].image.url);
    assert.equal(payload.image_checks[0].width, 400);
    assert.equal(payload.image_checks[0].bytes, null);
  } finally { ui.close(); }
});

test("a late automatic response cannot replace a manually selected local image or trigger stale fallback", async () => {
  const ui = setup({ deferImages: true });
  try {
    process(ui); const auto = ui.imageRequests[0];
    await importFile(ui, "image-file", { name: "sajat.jpg", type: "image/jpeg", size: 12000 });
    assert.equal(ui.imageRequests.length, 4);
    const local = ui.imageRequests[3];
    process(ui); assert.equal(ui.imageRequests.length, 4);
    auto.succeed(3000, 2000);
    assert.equal(ui.document.getElementById("product-image").hidden, true);
    local.succeed(900, 800); const localUrl = local.url;
    auto.fail(); assert.equal(ui.imageRequests.length, 4);
    assert.equal(ui.document.getElementById("product-image").getAttribute("src"), localUrl);
    process(ui); assert.equal(ui.imageRequests.length, 4);
    assert.equal(ui.document.getElementById("product-image").getAttribute("src"), localUrl);
    assert.ok(!ui.revoked.includes(localUrl));
  } finally { ui.close(); }
});

test("a local image selected before processing is preserved and blocked products do not auto-load", async () => {
  const data = clone(baseline); data.products[2].shop_sku = "S99999"; data.products[2].manufacturer_sku = "99999";
  const ui = setup({ data, deferImages: true });
  try {
    await importFile(ui, "image-file", { name: "sajat.jpg", type: "image/jpeg", size: 12000 });
    ui.imageRequests[0].succeed(); const localUrl = ui.imageRequests[0].url;
    process(ui);
    assert.equal(ui.imageRequests.length, 2);
    assert.equal(ui.imageRequests[1].url, data.products[1].manufacturer_image.preview_url);
    assert.equal(ui.document.getElementById("product-image").getAttribute("src"), localUrl);
  } finally { ui.close(); }
});

test("the manual manufacturer button prioritizes the full-resolution original while automatic loading uses previews", () => {
  const ui = setup({ deferImages: true });
  try {
    process(ui);
    assert.equal(ui.imageRequests[0].url, baseline.products[0].manufacturer_image.preview_url);
    ui.imageRequests[0].succeed(250, 180);
    ui.document.getElementById("load-manufacturer-image-button").click();
    assert.equal(ui.imageRequests[3].url, baseline.products[0].manufacturer_image.url);
    ui.imageRequests[3].fail();
    assert.equal(ui.imageRequests[4].url, baseline.products[0].manufacturer_image.preview_url);
    ui.imageRequests[4].succeed(250, 180);
    assert.equal(ui.document.getElementById("product-image").getAttribute("src"), baseline.products[0].manufacturer_image.preview_url);
  } finally { ui.close(); }
});
