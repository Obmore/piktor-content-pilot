/* Offline, deterministic enrichment from curated manufacturer records. No fetch or LLM. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PiktorEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const BRANDS = { schuller: "Schuller", abraboro: "Abraboro", festa: "Festa" };
  const TYPES = { painter_spatula: "festőspatulya", multi_spatula: "multifunkciós spatulya", glazing_knife: "üvegező gittkés" };
  const SKU = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/;
  const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const text = value => typeof value === "string" && value.trim().length > 0 && value.length <= 1000 && !/[<>\u0000-\u001f\u007f]/.test(value);
  const positive = value => typeof value === "number" && Number.isFinite(value) && value > 0;
  const numberText = value => String(value).replace(".", ",");
  function safeUrl(value) {
    if (typeof value !== "string" || !/^https?:\/\//.test(value) || /[\s\u0000-\u001f]/.test(value)) return false;
    try { const parsed = new URL(value); return !!parsed.hostname && !parsed.username && !parsed.password; } catch (_) { return false; }
  }
  function brand(value) { const key = typeof value === "string" ? value.toLowerCase() : ""; return Object.hasOwn(BRANDS, key) ? BRANDS[key] : null; }
  function identity(product) {
    if (!isObject(product)) return null;
    const maker = brand(product.brand), sku = product.shop_sku;
    if (!maker || typeof sku !== "string" || !SKU.test(sku)) return null;
    let normalized = sku;
    if (maker === "Schuller") { if (!sku.startsWith("S")) return null; normalized = sku.slice(1); }
    if (maker === "Abraboro") { if (!sku.startsWith("ABR")) return null; normalized = sku.slice(3); }
    if (maker === "Festa" && !sku.startsWith("L")) return null;
    return SKU.test(normalized) ? { brand: maker, sku: normalized, key: maker + "|" + normalized } : null;
  }
  function supplierRecords(value) { return Array.isArray(value) ? value : isObject(value) ? value.records : null; }
  function validateSupplierData(value) {
    const errors = [], records = supplierRecords(value);
    if (!Array.isArray(value) && (!isObject(value) || value.schema_version !== 1)) errors.push("A beszállítói dokumentum schema_version értéke 1 legyen.");
    if (!Array.isArray(records)) return { valid: false, errors: errors.concat("Hiányzik a records tömb.") };
    if (records.length > 20000) errors.push("Legfeljebb 20 000 beszállítói rekord dolgozható fel ebben a pilotban.");
    records.forEach((record, index) => {
      const at = `${index + 1}. rekord: `;
      if (!isObject(record)) { errors.push(at + "objektum szükséges."); return; }
      const maker = brand(record.brand);
      if (!maker) errors.push(at + "ismeretlen márka.");
      if (typeof record.manufacturer_sku !== "string" || !SKU.test(record.manufacturer_sku) || (maker === "Festa" && !record.manufacturer_sku.startsWith("L"))) errors.push(at + "hibás gyártói cikkszám.");
      if (!text(record.type)) errors.push(at + "hiányzó vagy hibás terméktípus.");
      if (record.family !== undefined && !text(record.family)) errors.push(at + "hibás termékcsalád.");
      if (!safeUrl(record.identity_source_url)) errors.push(at + "hiányzó vagy hibás identity_source_url; a termékazonosság alapforrása kötelező.");
      if (!isObject(record.facts)) errors.push(at + "a facts értéke objektum legyen.");
      if (!Array.isArray(record.sources)) errors.push(at + "a sources értéke tömb legyen.");
      else record.sources.forEach(source => {
        if (!isObject(source) || !safeUrl(source.url) || !text(source.title) || !text(source.kind)) errors.push(at + "hibás vagy nem biztonságos forráshivatkozás.");
      });
    });
    return { valid: errors.length === 0, errors };
  }
  function observedCopy(original) {
    const copy = isObject(original) ? JSON.parse(JSON.stringify(original)) : {};
    copy.observation_notes = Array.isArray(copy.unknowns) ? copy.unknowns : (Array.isArray(copy.observation_notes) ? copy.observation_notes : []);
    copy.observation_date = copy.source_reviewed_at || null;
    delete copy.unknowns;
    return copy;
  }
  function block(original, messages) {
    const copy = observedCopy(original);
    return Object.assign(copy, { proposed_short: "", proposed_long: "", facts: [], sources: [], match_status: "unverified", processing: { status: "blocked", messages, source_refs: [], shipping_weight_kg: null } });
  }
  function processProducts(products, supplierData) {
    const validation = validateSupplierData(supplierData), list = Array.isArray(products) ? products : [];
    const index = new Map(), localKeys = new Map();
    if (validation.valid) supplierRecords(supplierData).forEach(record => {
      const key = brand(record.brand) + "|" + record.manufacturer_sku;
      index.set(key, (index.get(key) || []).concat(record));
    });
    list.forEach(product => { const id = identity(product); if (id) localKeys.set(id.key, (localKeys.get(id.key) || 0) + 1); });
    const result = list.map(original => {
      if (!validation.valid) return block(original, validation.errors);
      const id = identity(original);
      if (!id) return block(original, ["Hibás márka vagy bolti cikkszám; nincs részleges és hasonlósági párosítás."]);
      if (localKeys.get(id.key) !== 1) return block(original, ["Több bolti termék ugyanarra a gyártói kulcsra mutat."]);
      if (original.manufacturer_sku && original.manufacturer_sku !== id.sku) return block(original, ["A megadott gyártói cikkszám ellentmond a bolti előtag szabályának."]);
      const candidates = index.get(id.key) || [];
      if (candidates.length !== 1) return block(original, [candidates.length ? "Több beszállítói rekord egyezik; a párosítás nem egyértelmű." : "Nincs pontos gyártói cikkszámegyezés."]);
      if (original.match_status === "conflict") return block(original, ["A bolti adatban korábban feljegyzett ellentmondást embernek kell feloldania."]);
      const record = candidates[0], label = Object.hasOwn(TYPES, record.type) ? TYPES[record.type] : null;
      if (!label) return block(original, ["Ehhez a terméktípushoz nincs ellenőrzött szövegsablon."]);
      const sources = record.sources.filter(source => ["manufacturer", "manufacturer_catalog"].includes(source.kind));
      if (!sources.length) return block(original, ["Hiányzik a termékazonosságot és típust alátámasztó gyártói forrás."]);
      const sourceMap = new Map(sources.map(source => [source.url, source])), facts = [], messages = [], values = {};
      if (!sourceMap.has(record.identity_source_url)) return block(original, ["A termékazonosság alapforrása hiányzik a gyártói források közül; nem helyettesíthető más hivatkozással."]);
      const add = (key, labelText, valid, display) => {
        const fact = record.facts[key];
        if (fact === undefined) return;
        if (!isObject(fact) || !sourceMap.has(fact.source_url) || !safeUrl(fact.source_url) || !valid(fact.value)) {
          messages.push(`${labelText}: a tény kimaradt, mert nincs érvényes érték és hozzá tartozó gyártói forrás.`); return;
        }
        values[key] = fact.value;
        facts.push({ label: labelText, value: display(fact.value), source_url: fact.source_url });
      };
      add("width_mm", "Munkaszélesség", positive, value => numberText(value) + " mm");
      add("material", "Anyag", text, value => value);
      add("handle", "Markolat", text, value => value);
      add("uses", "Felhasználás", value => Array.isArray(value) && value.length > 0 && value.length <= 20 && value.every(text), value => value.join("; "));
      if (isObject(original.variant) && positive(original.variant.width_mm)) {
        if (values.width_mm !== undefined && original.variant.width_mm !== values.width_mm) return block(original, ["A bolti és gyártói munkaszélesség eltér; variánsütközés miatt nincs javaslat."]);
        if (values.width_mm === undefined) messages.push("A bolti szélességhez nincs forrással igazolt gyártói érték; szélesség nem kerül a javaslatba.");
      }
      let weight = null;
      const suppliedWeight = record.facts.shipping_weight;
      if (suppliedWeight !== undefined) {
        if (isObject(suppliedWeight) && positive(suppliedWeight.value) && ["g", "kg"].includes(suppliedWeight.unit) && safeUrl(suppliedWeight.source_url) && sourceMap.has(suppliedWeight.source_url)) {
          weight = suppliedWeight.unit === "g" ? suppliedWeight.value / 1000 : suppliedWeight.value;
          if (!positive(weight)) weight = null;
          else facts.push({ label: "Csomagolt szállítási tömeg", value: numberText(weight) + " kg", source_url: suppliedWeight.source_url });
        }
        if (weight === null) messages.push("A szállítási tömeg kimaradt: pozitív szám, g/kg mértékegység és gyártói forrás szükséges.");
      }
      if (weight === null) messages.push("A csomagolt szállítási tömeg ismeretlen; nettó tömegből és terméknévből nem becsülhető.");
      const baseSource = record.identity_source_url;
      facts.unshift({ label: "Terméktípus", value: label, source_url: baseSource });
      if (record.family) facts.push({ label: "Termékcsalád", value: record.family, source_url: baseSource });
      const width = values.width_mm === undefined ? "" : numberText(values.width_mm) + " mm széles, ";
      const material = values.material ? values.material + " " : "";
      let short = width + material + label + (values.handle ? ", " + values.handle + " markolattal" : "") + ".";
      short = short[0].toLocaleUpperCase("hu-HU") + short.slice(1);
      if (values.width_mm === undefined && !values.material && values.uses) short += " Felhasználási területe: " + values.uses[0] + ".";
      let opening = (record.family ? record.family + " " : "") + material + label;
      if (values.width_mm !== undefined) opening += ", " + numberText(values.width_mm) + " mm munkaszélességgel";
      if (values.handle) opening += (values.width_mm !== undefined ? " és " : ", ") + values.handle + " markolattal";
      opening = opening[0].toLocaleUpperCase("hu-HU") + opening.slice(1) + ".";
      const long = [opening];
      if (values.uses) long.push("Felhasználási területei: " + values.uses.join("; ") + ".");
      long.push("Gyártói cikkszám: " + id.sku + ".");
      const usedUrls = [...new Set([baseSource, ...facts.map(fact => fact.source_url)])];
      messages.unshift("Pontos cikkszám alapján, előkészített gyártói rekordból készült; a szöveg emberi ellenőrzést igényel.");
      return Object.assign(observedCopy(original), {
        manufacturer_sku: id.sku, proposed_short: short, proposed_long: long.join("\n\n"), facts,
        sources: usedUrls.map(url => ({ ...sourceMap.get(url) })), match_status: "exact",
        processing: { status: "matched", messages, source_refs: usedUrls, shipping_weight_kg: weight },
      });
    });
    const matched = result.filter(product => product.processing.status === "matched").length;
    return { products: result, summary: { total: result.length, matched, blocked: result.length - matched }, errors: Array.isArray(products) ? validation.errors : ["A products értéke tömb legyen."] };
  }
  function imageRules(width, height, bytes, date) {
    const messages = [], day = typeof date === "string" ? date.slice(0, 10) : "";
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
    const minimum = validDate ? (day >= "2027-01-31" ? 500 : 100) : null;
    const dimensions = Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0;
    const fileSize = Number.isInteger(bytes) && bytes > 0;
    let failed = false;
    if (!validDate) messages.push("Az ellenőrzési dátum hiányzik vagy hibás.");
    if (!dimensions) messages.push("A kép tényleges pixelmérete ismeretlen.");
    if (!fileSize) messages.push("A képfájl tényleges bájtmérete ismeretlen.");
    if (dimensions && minimum !== null && (width < minimum || height < minimum)) { failed = true; messages.push(`A kép mindkét oldala legalább ${minimum} pixel legyen.`); }
    if (dimensions && width * height > 64000000) { failed = true; messages.push("A kép meghaladja a 64 megapixelt."); }
    if (fileSize && bytes > 16000000) { failed = true; messages.push("A képfájl nagyobb 16 000 000 bájtnál."); }
    const complete = validDate && dimensions && fileSize;
    if (complete && !failed) messages.push("A vizsgált pixel- és fájlméret-határok teljesülnek; ez nem Google-elfogadási garancia.");
    const future = dimensions && fileSize ? width >= 500 && height >= 500 && width * height <= 64000000 && bytes <= 16000000 : null;
    return { status: failed ? "fail" : complete ? "pass" : "unknown", minimum_pixels: minimum, future_minimum_pixels: 500, future_ready: future, width: dimensions ? width : null, height: dimensions ? height : null, bytes: fileSize ? bytes : null, messages, scope: "technical_dimensions_and_size_only" };
  }
  return Object.freeze({ processProducts, validateSupplierData, imageRules });
});
