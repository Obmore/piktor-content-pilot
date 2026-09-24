"""Rebuild embedded demo data and a single-file handoff from reviewed JSON."""
from pathlib import Path
import json
import subprocess

from pilot.model import load_dataset


def main():
    root = Path(__file__).resolve().parent
    data = load_dataset(root / "data" / "pilot.json")
    supplier = json.loads((root / "data" / "supplier_records.json").read_text(encoding="utf-8"))
    result = subprocess.run(
        ["node", "-e", "const fs=require('node:fs');const e=require('./web/engine.js');const x=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(e.processProducts(x.products,x.supplier)));"],
        input=json.dumps({"products": data["products"], "supplier": supplier}),
        text=True, capture_output=True, check=True, cwd=root,
    )
    processed = json.loads(result.stdout)
    if processed["errors"] or processed["summary"]["blocked"]:
        raise ValueError("The built-in sample must process without blocked records")
    web = root / "web"
    embedded = "window.PILOT_DATA = " + json.dumps(data, ensure_ascii=False, indent=2).replace("<", "\\u003c") + ";\n"
    (web / "data.js").write_text(embedded, encoding="utf-8")
    supplier_script = "window.SUPPLIER_DATA = " + json.dumps(supplier, ensure_ascii=False, indent=2).replace("<", "\\u003c") + ";\n"
    (web / "supplier-data.js").write_text(supplier_script, encoding="utf-8")
    page = (web / "index.html").read_text(encoding="utf-8")
    page = page.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + (web / "styles.css").read_text(encoding="utf-8") + "\n</style>")
    scripts = []
    for filename in ["data.js", "supplier-data.js", "engine.js", "app.js"]:
        tag = f'<script defer src="{filename}"></script>'
        if tag not in page:
            raise ValueError(f"Missing expected script tag: {filename}")
        page = page.replace(tag, "")
        scripts.append((web / filename).read_text(encoding="utf-8").replace("</script", "<\\/script"))
    page = page.replace("</body>", "\n".join("<script>\n" + script + "\n</script>" for script in scripts) + "\n</body>")
    dist = root / "dist"
    dist.mkdir(exist_ok=True)
    (dist / "Piktor94_bemutato.html").write_text("\n".join(line.rstrip() for line in page.splitlines()) + "\n", encoding="utf-8")
    lines = ["# Piktor 94 – mintatartalom", "", f"Forrásellenőrzés: {data['observed_at']}. Három termékleírás a minta tényleges feldolgozójából és egy szerkesztett kategórialeírás.", ""]
    for product in processed["products"]:
        lines.extend([f"## {product['name']}", "", f"Webshop: **{product['shop_sku']}** · Gyártó: **{product['manufacturer_sku']}**", "", f"Eredeti termékoldal: {product['shop_url']}", "", "### Rövid leírás", "", product["proposed_short"], "", "### Részletes leírás", "", product["proposed_long"], "", "### Források", ""])
        for s in product["sources"]:
            lines.append(f"- {s['title']}: {s['url']}")
        lines.extend(["", "### A korábbi adatfelvétel megjegyzései", "", "A megfigyelés idején ismert hiányok; a feldolgozás új adatai ettől eltérhetnek.", ""])
        for note in product.get("observation_notes", product.get("unknowns", [])):
            lines.append("- " + note)
        lines.append("")
    for cat in data["categories"]:
        lines.extend([f"## Kategória: {cat['name']}", "", cat["url"], "", cat["proposed_description"], "", "### Források", ""])
        for s in cat["sources"]:
            lines.append(f"- {s['title']}: {s['url']}")
    (dist / "Piktor94_mintatartalom.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Built browser data, standalone HTML and content Markdown from the processing engine")


if __name__ == "__main__":
    main()
