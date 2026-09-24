/* Local input -> validated matching -> proposed content. No shop writes. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const state = { baseline: null, supplier: null, output: null, selected: null, query: "", images: {}, imageLoads: {}, reviews: {} };
  const engine = window.PiktorEngine;
  const node = (tag, text, css) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = String(text); if (css) item.className = css; return item; };
  const safeUrl = (value) => { try { const url = new URL(String(value)); return ["http:", "https:"].includes(url.protocol) ? url.href : null; } catch (_) { return null; } };
  function link(text, url) { const href = safeUrl(url); const item = node(href ? "a" : "span", text); if (href) { item.href = href; item.target = "_blank"; item.rel = "noopener noreferrer"; } return item; }
  function message(text, error = false) { $("message").textContent = text; $("message").classList.toggle("error", error); }
  function prose(container, value) { container.replaceChildren(); String(value || "").split(/\n\s*\n/).filter(Boolean).forEach((part) => container.append(node("p", part))); }
  function products() { return state.output ? state.output.products : state.baseline.products; }
  function selected() { return products().find((product) => product.id === state.selected); }
  function records() { return Array.isArray(state.supplier) ? state.supplier : state.supplier.records; }
  function normalize(value) { return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function renderList() {
    const list = $("product-list"); list.replaceChildren();
    const query = normalize(state.query);
    products().filter((product) => normalize([product.name, product.shop_sku, product.manufacturer_sku].join(" ")).includes(query)).forEach((product) => {
      const button = node("button", undefined, "product-option" + (product.id === state.selected ? " active" : ""));
      button.type = "button"; button.setAttribute("aria-pressed", String(product.id === state.selected));
      button.append(node("span", product.name), node("small", product.shop_sku));
      button.addEventListener("click", () => { state.selected = product.id; renderList(); renderProduct(); });
      list.append(button);
    });
    if (!list.children.length) list.append(node("p", "Nincs ilyen termék a mintában.", "small muted"));
  }
  function renderProduct() {
    const product = selected(); if (!product) return;
    $("product-brand").textContent = product.brand_display || product.brand;
    $("product-name").textContent = product.name; $("shop-sku").textContent = product.shop_sku;
    $("manufacturer-sku").textContent = product.manufacturer_sku || "Nem igazolt";
    const shop = safeUrl(product.shop_url); if (shop) $("shop-link").href = shop; else $("shop-link").removeAttribute("href");
    const matched = product.processing?.status === "matched";
    $("match-status").textContent = !state.output ? "Még nincs feldolgozva" : matched ? "Párosított rekord" : "Nem dolgozható fel";
    $("match-status").classList.toggle("warning", !matched);
    $("output-placeholder").hidden = matched;
    $("output-placeholder").textContent = state.output ? "Ehhez a termékhez nem készült szövegjavaslat. A feldolgozási megjegyzés mutatja az okot." : "A feldolgozás után itt jelenik meg a gyártói adatokból összeállított szöveg.";
    $("generated-content").hidden = !matched;
    prose($("proposed-short"), matched ? product.proposed_short : ""); prose($("proposed-long"), matched ? product.proposed_long : "");
    prose($("current-description"), product.current_description);
    const messages = product.processing?.messages || [];
    $("processing-messages").hidden = !messages.length; $("processing-messages").open = false; prose($("processing-message-body"), messages.join("\n\n"));
    $("fact-list").replaceChildren();
    (state.output ? product.facts || [] : []).forEach((fact) => {
      const row = node("div"); const value = node("dd", fact.value); const source = link("↗", fact.source_url);
      source.setAttribute("aria-label", fact.label + " forrása"); value.append(source); row.append(node("dt", fact.label), value); $("fact-list").append(row);
    });
    if (!state.output) $("fact-list").append(node("p", "A feldolgozás után jelennek meg.", "muted"));
    const weight = product.processing?.shipping_weight_kg;
    $("shipping-weight").textContent = Number.isFinite(weight) && weight > 0 ? "Igazolt szállítási tömeg: " + weight + " kg" : "Szállítási tömeg: nincs igazolt adat.";
    $("unknown-list").replaceChildren();
    $("observation-title").textContent = "A korábbi adatfelvétel megjegyzései · " + (product.observation_date || state.baseline.observed_at);
    const observationNotes = (state.output ? product.observation_notes : product.unknowns) || [];
    observationNotes.forEach((note) => $("unknown-list").append(node("li", note)));
    if (!observationNotes.length) $("unknown-list").append(node("li", "Nincs külön megjegyzés rögzítve."));
    $("source-list").replaceChildren();
    (product.sources || []).forEach((source) => { const item = node("li"); item.append(link(source.title || source.url, source.url)); $("source-list").append(item); });
    $("review-button").disabled = !matched; $("source-confirmation").checked = false;
    $("review-message").textContent = state.reviews[product.id] ? "Ellenőrizte: " + state.reviews[product.id].reviewer + ". Az eredmény exportjával menthető." : "A rögzítés az eredmény exportjával menthető. Új feldolgozás után újra kell ellenőrizni a szöveget.";
    $("load-image-button").disabled = !safeUrl(product.image?.url);
    const manufacturerImage = product.manufacturer_image;
    $("load-manufacturer-image-button").hidden = !(safeUrl(manufacturerImage?.preview_url) || safeUrl(manufacturerImage?.url));
    $("manufacturer-image-info").hidden = $("load-manufacturer-image-button").hidden;
    $("manufacturer-image-info").textContent = manufacturerImage ? "Gyártói képjelölt, rögzített fájlmérés: " + manufacturerImage.width + " × " + manufacturerImage.height + " px, " + new Intl.NumberFormat("hu-HU").format(manufacturerImage.bytes) + " bájt. " + (manufacturerImage.identity_note || "A változathoz való egyezés külön ellenőrizendő.") + " Felhasználási jog: nincs ellenőrizve." : "";
    renderImage();
  }
  function renderProcessing() {
    $("supplier-json").textContent = JSON.stringify(state.supplier, null, 2);
    $("output-json").textContent = state.output ? JSON.stringify(state.output, null, 2) : "Még nem futott feldolgozás.";
    $("processing-rows").replaceChildren();
    products().forEach((product) => {
      const row = node("tr");
      [product.shop_sku, product.manufacturer_sku || "—", !product.processing ? "Még nincs feldolgozva" : product.processing.status === "matched" ? "Párosítva" : "Blokkolva", (product.processing?.messages || []).join(" ") || "—"].forEach((value) => row.append(node("td", value)));
      $("processing-rows").append(row);
    });
  }
  function processData() {
    try {
      const result = engine.processProducts(state.baseline.products, state.supplier);
      if (!result || !Array.isArray(result.products) || result.products.length !== state.baseline.products.length) throw new Error("A feldolgozó nem adott teljes eredményt.");
      state.output = result; state.reviews = {}; $("export-button").disabled = false;
      const matched = result.products.filter((product) => product.processing?.status === "matched").length;
      message("Feldolgozva: " + matched + " / " + result.products.length + " termék. Blokkolt: " + (result.products.length - matched) + ".");
      renderList(); renderProduct(); renderProcessing();
      result.products.filter((product) => product.processing?.status === "matched").forEach((product) => {
        if (!state.images[product.id] && !state.imageLoads[product.id]) loadImages(remoteImageCandidates(product), product.id, "automatic");
      });
    } catch (error) { message("A feldolgozás sikertelen: " + error.message + " A korábbi eredmény változatlan.", true); }
  }
  async function importSupplier(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("A JSON-fájl legfeljebb 5 MB lehet.");
      const candidate = JSON.parse(await file.text());
      const validation = engine.validateSupplierData(candidate);
      if (!validation.valid) throw new Error(validation.errors.join(" "));
      state.supplier = candidate; state.output = null; state.reviews = {};
      $("supplier-label").textContent = "Gyártói adatok: " + file.name;
      $("supplier-summary").textContent = records().length + " gyártói rekord betöltve. A párosításhoz indítsa el a feldolgozást.";
      $("export-button").disabled = true;
      message("A gyártói JSON betöltve. Az új adatokból még nem készült szövegjavaslat.");
      renderList(); renderProduct(); renderProcessing();
    } catch (error) { message("A JSON nem tölthető be: " + error.message + " A korábbi adatok és eredmények változatlanok.", true); }
    event.target.value = "";
  }
  function renderImage() {
    const product = selected(); const item = state.images[product.id]; const request = state.imageLoads[product.id]; const img = $("product-image");
    img.hidden = !item; $("image-placeholder").hidden = Boolean(item);
    if (item) { if (img.getAttribute("src") !== item.display_url) img.src = item.display_url; img.alt = product.name + " – megnyitott kép"; }
    else { img.removeAttribute("src"); img.alt = ""; }
    $("image-placeholder").textContent = request?.status === "loading" ? "Kép betöltése…" : request?.status === "error" ? "A kép nem tölthető be." : "A termékkép nincs betöltve.";
    $("image-frame").setAttribute("aria-busy", String(request?.status === "loading"));
    $("image-status").textContent = request?.message || "";
    $("image-status").classList.toggle("error", request?.status === "error");
    $("retry-image-button").hidden = request?.status !== "error";
    const result = $("image-result"); result.replaceChildren();
    if (!item) { result.append(node("p", "Mért képméret: nincs adat. A felhasználási jog nincs ellenőrizve.")); return; }
    result.append(node("strong", item.width + " × " + item.height + " px"));
    result.append(node("p", item.bytes === null ? "Fájlméret: nem mért (külső kép)." : (item.bytes_source === "recorded_download" ? "Fájlméret a rögzített letöltésből: " : "Fájlméret: ") + new Intl.NumberFormat("hu-HU").format(item.bytes) + " bájt."));
    const labels = { pass: "A mért műszaki adatok megfelelnek.", fail: "A mért műszaki adatok nem felelnek meg.", unknown: "A műszaki ellenőrzéshez hiányzó adat maradt." };
    result.append(node("p", labels[item.audit.status] || "Ellenőrzendő kép."));
    const list = node("ul"); (item.audit.messages || []).forEach((entry) => list.append(node("li", entry))); result.append(list);
    if (item.width < 500 || item.height < 500) result.append(node("p", "A kép a 2027. január 31-től érvényes 500 × 500 px minimumot nem éri el."));
    result.append(node("p", "A vizsgálat nem igazol képhasználati jogot vagy Google-elfogadást."));
  }
  function remoteImageCandidates(product, preferred = "preview") {
    const candidates = [], manufacturer = product.manufacturer_image;
    if (preferred !== "shop" && manufacturer) {
      const metadata = { source: "manufacturer_candidate", bytes: null, recorded_measurement: { source_url: manufacturer.url, width: manufacturer.width, height: manufacturer.height, bytes: manufacturer.bytes, measured_at: manufacturer.measured_at, sha256: manufacturer.sha256 }, identity_note: manufacturer.identity_note, rights: "unknown" };
      const urls = preferred === "original" ? [manufacturer.url, manufacturer.preview_url] : [manufacturer.preview_url, manufacturer.url];
      urls.forEach((value) => { const url = safeUrl(value); if (url) candidates.push({ url, metadata: { ...metadata, source_url: url } }); });
    }
    const shopUrl = safeUrl(product.image?.url);
    if (shopUrl) candidates.push({ url: shopUrl, metadata: { source: "remote_url", source_url: shopUrl, bytes: null, rights: "unknown" } });
    return candidates.filter((candidate, index) => candidates.findIndex((entry) => entry.url === candidate.url) === index);
  }
  function loadImages(candidates, productId, mode = "manual") {
    const previousRequest = state.imageLoads[productId];
    const token = (previousRequest?.token || 0) + 1;
    const request = { token, status: "loading", mode, message: "Kép betöltése…", candidates };
    state.imageLoads[productId] = request;
    const current = () => state.imageLoads[productId] === request;
    const refresh = () => { if (current() && state.selected === productId) renderImage(); };
    const fail = (text) => { if (!current()) return; request.status = "error"; request.message = text + (state.images[productId] ? " A korábban betöltött kép megmaradt." : ""); refresh(); };
    if (!candidates.length) { fail("Nincs elérhető képforrás ehhez a termékhez."); return; }
    refresh();
    function attempt(index) {
      if (!current()) return;
      const { url, metadata } = candidates[index]; const probe = new Image();
      request.message = index ? "Másik képforrás betöltése…" : metadata.source === "local_file" ? "Helyi kép betöltése…" : "Termékkép betöltése…";
      refresh();
      const releaseLocal = () => { if (metadata.source === "local_file") URL.revokeObjectURL(url); };
      probe.onload = () => {
        if (!current()) { releaseLocal(); return; }
        const width = probe.naturalWidth, height = probe.naturalHeight;
        if (!width || !height) { releaseLocal(); fail("A betöltött kép mérete nem olvasható. Válasszon másik képet."); return; }
        const previous = state.images[productId];
        if (previous?.source === "local_file" && previous.display_url !== url) URL.revokeObjectURL(previous.display_url);
        const measuredAt = new Date().toISOString();
        state.images[productId] = { ...metadata, display_url: url, width, height, measured_at: measuredAt, audit: engine.imageRules(width, height, metadata.bytes, measuredAt.slice(0, 10)) };
        request.status = "loaded"; request.message = metadata.source === "local_file" ? "Helyi kép betöltve." : metadata.source === "manufacturer_candidate" ? "Gyártói képjelölt betöltve." : "A webshop képe betöltve.";
        refresh();
      };
      probe.onerror = () => {
        releaseLocal(); if (!current()) return;
        if (index + 1 < candidates.length) attempt(index + 1);
        else fail("A képforrások nem tölthetők be. Próbálja újra, vagy válasszon helyi képet.");
      };
      probe.src = url;
    }
    attempt(0);
  }
  function importImage(event) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) { message("JPEG, PNG, WebP vagy GIF képfájlt válasszon.", true); event.target.value = ""; return; }
    loadImages([{ url: URL.createObjectURL(file), metadata: { source: "local_file", name: file.name, bytes: file.size, rights: "unknown" } }], state.selected);
    event.target.value = "";
  }
  function reviewProduct() {
    const product = selected(); const reviewer = $("reviewer-name").value.trim();
    if (product.processing?.status !== "matched") return;
    if (!reviewer || !$("source-confirmation").checked) { $("review-message").textContent = "Adja meg a nevét, és erősítse meg a források ellenőrzését."; return; }
    state.reviews[product.id] = { product_id: product.id, reviewer, reviewed_at: new Date().toISOString(), source_review_confirmed: true, proposal_snapshot: JSON.parse(JSON.stringify(product)) };
    $("review-message").textContent = "Ellenőrizte: " + reviewer + ". Az eredmény exportjával menthető.";
  }
  function exportResult() {
    if (!state.output) return;
    const imageChecks = Object.entries(state.images).map(([product_id, entry]) => { const { display_url, ...metadata } = entry; return { product_id, ...metadata }; });
    const payload = { format: "piktor_content_result_v1", schema_version: 1, generated_at: new Date().toISOString(), observed_at: state.baseline.observed_at, purpose: "content_proposal_not_unas_import", products: state.output.products, categories: state.baseline.categories, supplier_data: state.supplier, image_checks: imageChecks, editorial_reviews: Object.values(state.reviews), note: "Szövegjavaslat és adatellenőrzési eredmény. Nem közvetlen UNAS-importfájl és nem feltöltési engedély. A képhasználati jogot külön kell ellenőrizni." };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json;charset=utf-8" }));
    const anchor = node("a"); anchor.href = url; anchor.download = "eredmeny.json"; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); message("Az eredmeny.json letöltése elindult.");
  }
  function renderCategories() {
    const container = $("category-content"); container.replaceChildren();
    (state.baseline.categories || []).forEach((category) => {
      const card = node("section", undefined, "category-card"); card.append(node("h3", category.name), link("Meglévő kategóriaoldal ↗", category.url));
      const description = node("div", undefined, "prose"); prose(description, category.proposed_description); card.append(description);
      const observation = node("details"); observation.append(node("summary", "A meglévő oldal megfigyelése"), node("p", category.current_description)); card.append(observation);
      const sources = node("details"); sources.append(node("summary", "A kategóriaszöveg forrásai")); const list = node("ul");
      (category.sources || []).forEach((source) => { const entry = node("li"); entry.append(link(source.title || source.url, source.url)); list.append(entry); }); sources.append(list); card.append(sources); container.append(card);
    });
  }
  function activateTab(name, focus = false) {
    document.querySelectorAll("[data-tab]").forEach((tab) => { const active = tab.dataset.tab === name; tab.classList.toggle("active", active); tab.setAttribute("aria-selected", String(active)); tab.tabIndex = active ? 0 : -1; $("panel-" + tab.dataset.tab).hidden = !active; if (active && focus) tab.focus(); });
  }
  function bindEvents() {
    $("process-button").addEventListener("click", processData); $("supplier-file").addEventListener("change", importSupplier);
    $("export-button").addEventListener("click", exportResult); $("image-file").addEventListener("change", importImage);
    $("review-button").addEventListener("click", reviewProduct); $("print-button").addEventListener("click", () => window.print());
    $("product-search").addEventListener("input", (event) => { state.query = event.target.value; renderList(); });
    $("load-image-button").addEventListener("click", () => { const product = selected(); loadImages(remoteImageCandidates(product, "shop"), product.id); });
    $("load-manufacturer-image-button").addEventListener("click", () => { const product = selected(); loadImages(remoteImageCandidates(product, "original"), product.id); });
    $("retry-image-button").addEventListener("click", () => { const product = selected(); loadImages(remoteImageCandidates(product), product.id); });
    const tabs = Array.from(document.querySelectorAll("[data-tab]"));
    tabs.forEach((tab, index) => { tab.addEventListener("click", () => activateTab(tab.dataset.tab)); tab.addEventListener("keydown", (event) => { const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null; if (next !== null) { event.preventDefault(); activateTab(tabs[next].dataset.tab, true); } }); });
  }
  function init() {
    try {
      if (!window.PILOT_DATA || !Array.isArray(window.PILOT_DATA.products) || !window.PILOT_DATA.products.length) throw new Error("A webshop-mintaadatok hiányoznak.");
      if (!engine?.processProducts || !engine?.validateSupplierData || !engine?.imageRules) throw new Error("A feldolgozómodul (engine.js) hiányzik.");
      const validation = engine.validateSupplierData(window.SUPPLIER_DATA); if (!validation.valid) throw new Error("A gyártói mintaadatok hiányoznak vagy hibásak: " + validation.errors.join(" "));
      state.baseline = window.PILOT_DATA; state.supplier = window.SUPPLIER_DATA; state.selected = state.baseline.products[0].id;
      $("observed-at").textContent = "Forrásmegfigyelés: " + state.baseline.observed_at;
      $("supplier-summary").textContent = records().length + " gyártói rekord. Párosítás cikkszám alapján; felhasználás csak rögzített forrással.";
      renderList(); renderProduct(); renderProcessing(); renderCategories(); bindEvents();
    } catch (error) { $("load-error").hidden = false; $("load-error").textContent = error.message + " Ellenőrizze a README-ben leírt fájlokat."; $("process-button").disabled = true; message("A feldolgozás nem indítható.", true); }
  }
  init();
}());
