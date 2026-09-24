# Piktor 94 · Termékadat-minta

Három valódi Schuller-termék és egy kategória működő mintája. A feldolgozó gyártói cikkszám alapján párosít, ellenőrzött tényekből magyar leírást állít össze, és jelzi a hiányokat. A felület egyszerű termékoldalként mutatja az eredményt.

## Kipróbálás

1. Nyisd meg a `dist/Piktor94_bemutato.html` fájlt böngészőben.
2. Kattints az **Adatok feldolgozása** gombra. A párosított termékek leírása elkészül, és képeik automatikusan betöltődnek; ezután válts a termékek között.
3. A **Feldolgozás** lapon hasonlítsd össze a bemeneti gyártói rekordokat és a létrejött szövegeket.
4. Tölts be saját másolatot a `data/supplier_records.json` fájlból, módosíts egy forrással rendelkező tényt, és futtasd újra. A leírás ténylegesen a bemenetből készül.
5. A **Helyi kép vizsgálata** gombbal válassz képfájlt. A program a dekódolt kép pixelméretét és fájlméretét ellenőrzi.
6. Az **Eredmény letöltése** JSON-fájlt ad a javaslatokkal és forrásokkal.

A feldolgozás offline működik, telepítés és API-kulcs nélkül. Külső képek és forrásoldalak megnyitásához internet szükséges. A termékképek külső forrásból töltődnek; a csomag nem másolja újra őket.

| Webshop-cikkszám | Gyártói cikkszám | Termék |
|---|---|---|
| S50707 | 50707 | KAI 2K festőspatulya, 100 mm |
| S50086 | 50086 | KAI 5 IN ONE 2K multifunkciós spatulya, 75 mm |
| S50080 | 50080 | KAI PATCH üvegező gittkés |

A kategóriaszöveg a **Spatulyák, glettvasak** kategóriához készült, külön szerkesztett minta.

## Mi történik a feldolgozásban?

- Márka és pontos cikkszám szerinti illesztés. Schuller: egy `S` előtag leválasztása; Abraboro: egy `ABR`; Festa: a gyári `L` megmarad.
- A gyártói adatokból kizárólag forráshivatkozással rendelkező tény kerül a leírásba. Duplikált találat vagy eltérő méretváltozat blokkolja a tételt.
- Típusonkénti magyar szövegsablonok használják a tényleges adatokat; a hiányzó szélességet, anyagot és tömeget nem találják ki.
- Igazolt szállítási tömeg esetén g → kg átváltás történik. A három valódi terméknél ilyen adat nincs, ezért üres marad. A nettó tömeg nem helyettesíti automatikusan a szállítási tömeget.
- A képvizsgálat mér, nem nagyít. Külön jelzi a jelenlegi és a 2027. január 31-től érvényes Google-mérethatárt.

A gyártói bemeneteket a nyilvános oldalakból és dokumentumokból kézzel ellenőriztük és strukturáltuk 2026. szeptember 24-én. Az alkalmazás ezek feldolgozását automatizálja; nem futtat rejtett AI-hívást vagy élő webes adatgyűjtést. Egy érvényes URL önmagában nem igazolja egy tetszőlegesen importált állítás igazságát.

## Fejlesztés és ellenőrzés

Python 3.10+ és Node.js 20+. Az alkalmazásnak nincs futásidejű csomagfüggősége.

```bash
python build_demo.py
python -m unittest discover -s tests -v
node --test tests/test_engine.cjs
python -m pilot audit --input data/pilot.json --strict
```

A DOM-tesztekhez `jsdom@26.1.0` szükséges:

```bash
npm install --prefix .qa --no-save --ignore-scripts jsdom@26.1.0
NODE_PATH="$PWD/.qa/node_modules" node --test web/review.test.cjs
```

Fő fájlok: `data/pilot.json` (webshopos termékek és megfigyelések), `data/supplier_records.json` (strukturált gyártói bemenet), `web/engine.js` (feldolgozás), `web/app.js` (felület). A build a böngészős adatfájlokat, az egyfájlos HTML-t és az ugyanabból a feldolgozásból származó `dist/Piktor94_mintatartalom.md` fájlt készíti el.

## Export és UNAS

A böngészős eredmény JSON javaslatcsomag, nem natív UNAS-import. A böngészőből letöltött `eredmeny.json` a külön Python eszköz bemeneteként is használható. Így ugyanaz a szöveg kerül az exportba, amelyet a felületen ellenőriztél:

```bash
python -m pilot approve --input eredmeny.json --sku S50707 --reviewer "Ellenőrző neve" --confirm-source-review --out approvals.json
python -m pilot export --input eredmeny.json --approvals approvals.json --out-dir out
```

A jóváhagyás termékenként, az ellenőrzött rekord lenyomatához kötött. A kimenet ellenőrző CSV, JSON és UNAS API XML-előnézet. Éles UNAS-kapcsolat nincs; az ERP ár- és készletadatait a program nem írja. A `current_description` megfigyelési jegyzet, nem visszaállítható UNAS-mentés.

További részletek: [módszerválasztás](docs/megoldasi_dontes.md), [partner és mintavétel](docs/partner_es_audit.md), [UNAS és Google források](docs/unas_es_google.md), [ellenőrzések](docs/ellenorzes.md).

## GitHub Pages közzététel

A `.github/workflows/pages.yml` a `main` ág változásakor vagy kézi indításkor ellenőrzi és újraépíti a mintát. A Pages beállításában a **GitHub Actions** forrást kell kiválasztani. A publikált csomag kizárólag a hordozható minta `index.html` fájlját tartalmazza.

A képek külső gyártói és webshopos hivatkozásról érkeznek. Feldolgozás után a párosított termékek képei automatikusan betöltődnek. Ha egy forrás nem elérhető, a program a következő rögzített képforrást próbálja; teljes hiba esetén a kép helyén jelzés és újrapróbálási lehetőség jelenik meg. A saját képfájlt az automatikus betöltés nem írja felül.
