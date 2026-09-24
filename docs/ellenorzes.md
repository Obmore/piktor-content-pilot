# Ellenőrzési eredmény

Dátum: 2026-09-24. Hatókör: három Schuller-termék, egy kategória, tényleges adatfeldolgozás, képellenőrzés és export-előkészítés.

## Működési próbák

- **26 Python-teszt:** cikkszámok, források, jóváhagyás lenyomata, megváltozott rekord, XML/CSV biztonság, bemenet védelme és kizárólag leírásokra korlátozott export.
- **22 motorteszt:** valódi gyártói rekordok feldolgozása, forrással rendelkező tény változtatása, forrás hiányában az állítás elhagyása, azonossági alapforrás, ismétlődő SKU, méretütközés, g/kg átváltás, nettó és szállítási tömeg elkülönítése, időfüggő képszabályok.
- **21 DOM-teszt:** feldolgozógomb, JSON-import és hibás import utáni állapotmegőrzés, szövegváltozás, export, termékkeresés, billentyűzetes lapváltás, képellenőrzési események, mai dátum és történeti megfigyelések kezelése.

A külön átadási próba a kész egyfájlos HTML-t töltötte be jsdom környezetben. Három terméket feldolgozott, a tényleges exportgomb kimenetét rögzítettük, majd ezt a JSON-t a Python eszköz validálta és tesztjóváhagyással exportálta. Az XML mindhárom cikkszámnál pontosan a böngészőben generált szöveget tartalmazta; ár- és készletmező nem került bele. A próbajóváhagyások ideiglenes adatok voltak, nem részei az átadásnak.

## A felülvizsgálat során javított hibák

1. A képvizsgálat kezdetben a régi forrásfelvételi dátumot használta. Most az aktuális mérési dátum dönti el a mérethatárt.
2. A frissen megnyitott külső képhez korábbi bájtméret társulhatott. Most az élő képvizsgálat és a korábbi letöltött fájl mérése külön adat.
3. A 2027-es méretfigyelmeztetés túl nagy fájlnál is kis felbontást jelzett. A figyelmeztetés most csak a tényleges pixelméretre vonatkozik.
4. Új, igazolt tömegadat mellett elavult hiányjegyzet maradhatott. A régi megjegyzések most dátumozott `observation_notes` adatok, elkülönítve a friss feldolgozástól.
5. A termékazonossági alapforrás törlése más PDF-re hivatkozhatott volna át. A külön `identity_source_url` kötelező; elvesztése blokkolja a tételt.
6. A dokumentált exportfolyamat a korábbi kézi szöveget használta. Most a felületről letöltött `eredmeny.json` a parancssori export bemenete.

A független végső review nem talált további ismert blokkoló hibát.

## Képek és adatok

A három gyártói képjelöltet ténylegesen letöltöttük és Pillow-val dekódoltuk: 3758×1736, 3160×1599 és 2914×1345 pixel. A pontos fájlméret és SHA-256 lenyomat a `data/pilot.json` rekordjaiban szerepel. Mindhárom teljesíti a vizsgált 500×500 pixel, 16 MB és 64 MP technikai határokat. Ez nem teljes Google-elfogadási bizonyíték. A KAI 2K kép termékcsaládhoz tartozik; a konkrét változat és az újraközlési jogosultság ellenőrzése megmarad.

A termékszövegekben nincs kitalált tömeg, a KAI PATCH-nél nincs nem igazolt szélesség vagy anyagminőség. A strukturált gyártói bemenet kézzel ellenőrzött forrásfelvétel; nincs élő scraper vagy LLM-szolgáltatás a mintában.

## A vizsgálat határa

A DOM-próbák nem helyettesítik a vizuális böngészős ellenőrzést. Ebben a környezetben a helyi HTML böngészős megnyitását a biztonsági szabály elutasította; képernyőkép-alapú ellenőrzés nem történt. A helyi képmérés DOM-tesztjeiben a dekódolási esemény kontrollált bemenetet kapott; a gyártói képek külön fájldekódolása valódi volt.

Éles UNAS-módosítás, Merchant Center-fiókellenőrzés és ERP-szinkron utáni visszaolvasás nem történt. A JSON javaslatcsomag, az XML API-előnézet, a CSV ellenőrző táblázat. A program nem tartalmaz éles webshopos hitelesítő adatot vagy hálózati írást.

## Képbetöltési javítás

Az „Adatok feldolgozása” után minden sikeresen párosított termék képe automatikusan betöltődik. Az automatikus sorrend: közvetlen gyártói JPG-előnézet, gyártói eredeti, webshop képe. A kézi „Gyártói kép megnyitása” az eredeti nagy felbontású fájlt részesíti előnyben. A feltüntetett élő pixelméret mindig a valóban megnyitott képé; az eredeti gyártói fájl korábbi mérése külön marad.

Hiba esetén a következő rögzített képforrás kerül sorra. Teljes sikertelenségnél látható hibajelzés és újrapróbálási gomb jelenik meg. Újrafeldolgozás nem okoz ismételt képbetöltést; későn megérkező automatikus válasz nem írhatja felül a kézzel választott helyi fájlt. A hét új DOM-próba ezeket a viselkedéseket ellenőrzi.

A GitHub Pages munkafolyamat a tesztek után kizárólag az egyfájlos mintát publikálja. A munkafolyamat megléte önmagában még nem jelent sikeres éles közzétételt.
