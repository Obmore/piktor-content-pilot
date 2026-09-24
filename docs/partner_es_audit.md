# Piktor 94 – ellenőrzött kutatási feljegyzés

Vizsgálat: 2026. szeptember 24. Korlátozott nyilvános mintavétel; sem az UNAS adminisztrációjához, sem a Google Merchant Center hibajelentéseihez nem fér hozzá ez a kutatás. Az adatok nem tekinthetők a teljes termékállomány felmérésének.

## A partner üzlete és a valódi feladat

A Piktor 94 vasvári fizikai festék- és barkácsüzletet, valamint UNAS webáruházat működtet. A honlapon festékek, barkács- és építőipari szerszámok, kötőelemek, építőanyagok, munkavédelmi és autóápolási termékek láthatók. Személyes átvételt, csomagküldést és a telephely körüli saját kiszállítást is feltüntet. Következtetésként a tartalomnak a felújító lakossági vásárlót és a konkrét méretet, rendeltetést kereső szakembert is segítenie kell. A vásárlói csoportok forgalmi súlya nem ismert.

Források: [üzlet és szállítás](https://piktor94.hu/shop_contact.php), [építőanyagok](https://piktor94.hu/Epitoanyag), [kötőelemek](https://piktor94.hu/Kotoelem), [autóápolás](https://piktor94.hu/Auto-karbantartas-tisztitas), [munkavédelem](https://piktor94.hu/Munkavedelem).

A webshopban már van vásárlást segítő ismeretterjesztő tartalom, például [a festőhengerek kiválasztásáról](https://piktor94.hu/spg/620946/Festohengerekrol). Nem a teljes tartalmi stratégia hiányzik: a sok termékhez kell egységesen, visszakereshető forrásokkal eljuttatni a megfelelő adatokat.

## Mit mutatott a mintavétel?

| Terület | Tényleges megfigyelés | Következmény |
| --- | --- | --- |
| Abraboro fő kategória | Rövid, egymondatos bevezető és 30 kategórialink látható. | A meglevő szöveget választást segítő tartalommal érdemes bővíteni. |
| Schuller fő kategória | Van rövid általános leírás; 10 alkategórialink szerepel. | Nem állítható, hogy minden Schuller-kategórialeírás hiányzik. |
| Spatulyák, glettvasak | A kategória 123 terméket jelez; a letöltött első oldal 20 terméklinket tartalmaz. Önálló kategórialeírás nem látható. | Jó, szűk és üzletileg értelmezhető kezdő minta. |
| Három kiválasztott Schuller-termék | Mindhárom HTML-ben azonosítható SKU-val és képpel rendelkezik; külön termékleírás nem látható, a Product JSON-LD-ből hiányzik a description és a weight. | Konkrét leíráspótlás bemutatható; tömegadatot exportból vagy igazolt beszállítói adatból kell pótolni. |
| Festa | A kategória 911 terméket jelez; az első oldal 20 terméklinkjét vizsgáltuk. A levél szerinti alkategóriahiány összhangban áll a nyilvános lista szerkezetével. | Teljes kategorizálás előtt a teljes export szükséges; a márkanév önmagában nem rendeltetés. |
| Autókarbantartás | 38 termék jelzett; az infinite_page=2 válasz HTML-jében 38 terméklink található. Rövid kategóriaszöveg már van. | Vegyszerek részletes tartalmához pontos cikkszámú műszaki és biztonsági dokumentum szükséges. |

Darabszámok: a 123/911/38 az oldal által kijelzett kategóriadarabszám; nem független készletellenőrzés. Nem mértünk hiányarányt a teljes webshopra. A három Schuller-termék szándékosan választott, nem reprezentatív minta.

Források: [Abraboro](https://piktor94.hu/Abraboro-szerszamok), [Schuller](https://piktor94.hu/sct/607579/Schuller-termekek), [spatulyák](https://piktor94.hu/Spatulyak-glettvasak), [Festa](https://piktor94.hu/Festa-szerszamok), [autóápolás 2. oldal](https://piktor94.hu/Auto-karbantartas-tisztitas?infinite_page=2). A géppel olvasható megfigyelések az `../data/audit_evidence.json` fájlban szerepelnek.

## A három mintatermék

| Webshop SKU | Gyártói SKU | Termék | Elsődleges gyártói bizonyíték |
| --- | --- | --- | --- |
| S50707 | 50707 | KAI 2K 100 mm | [Méret és rozsdamentes kivitel](https://www.schuller.eu/hu/p/kai-2k) |
| S50086 | 50086 | KAI 5 IN ONE 2K 75 mm | [Termékoldal](https://www.schuller.eu/hu/p/kai-5-in-one-2k), [használati útmutató](https://www.schuller.eu/download/?file=3459), [ismertető](https://www.schuller.eu/download/?file=792) |
| S50080 | 50080 | KAI PATCH üvegező gittkés | [Rendeltetés és cikkszám](https://www.schuller.eu/hu/p/kai-patch) |

A shopazonosítókat nem a kép nevéből következtettük ki: a HTML `UNAS.shop["sku"]`, az oldal cikkszámmezője és a Product JSON-LD együtt támasztja alá őket. A prefix leválasztása után a gyártói termék és változat is egyezik. A Schuller táblázatában a cikkszám után látható külön számjegyet nem fűztük hozzá automatikusan az azonosítóhoz.

A böngészős mintaszövegeket a `../web/engine.js` állítja elő a `../data/supplier_records.json` adataiból. Nincs kitalált tömeg, anyagminőség, munkaszélesség, vásárlói értékelés vagy teljesítményígéret. A KAI PATCH leírása szándékosan rövidebb: a gyártói oldal nem közöl anyagminőséget és szélességet; ezt nem helyettesíti a másik KAI-termék adatainak átemelése.

## Kritikus ellenőrzések

1. **A kép fájlneve nem termékazonosító.** A KAI 2K 75 mm termék valódi SKU-ja S50706, miközben a kép URL-je S50707-t tartalmaz. Ez lehet szabályos családkép, de a kép alapján automatikus termékpárosítás hibás lenne. [75 mm-es oldal](https://piktor94.hu/SCHU-SPATULYA-ROZSDAMENTES-75MM-MUA-NYELLEL).
2. **A kép HTML-ben megadott mérete nem ténylegesen mért méret.** A minták galériája 600×277, 1000×506 és 1000×572 méretet deklarál. A webshop saját képfájljainak letöltését a hálózati proxy blokkolta, ezért azok dekódolt méretei ismeretlenek. Ezekből most nem minősítjük megfelelőnek vagy hibásnak a Merchant Center képet.
3. **A gyári letöltés nem automatikus felhasználási engedély.** A Schuller nagyobb felbontású JPG/EPS letöltést kínál, de a kereskedelmi újraközlés jogosultságát külön kell igazolni. A repóba nem szükséges harmadik fél képeit bemásolni.
4. **A régi ismertető képe eltérhet.** A 50086-os termék PDF-ismertetője sárga, a használati útmutató és a mai termékoldal piros markolatot ábrázol. A mintaszöveg nem állít színt vagy a markolatvég aktuális kialakítását. A műszaki állításokhoz a pontos cikkszámú dokumentumot használtuk.
5. **Nyilvános mezőhiány nem adatbázis-hiány.** Sem a description, sem a weight JSON-LD mező hiányából nem következik, hogy az UNAS adminisztrációban sincs adat. A Merchant Center szállítási konfigurációja és a termékfeed külön ellenőrzés tárgya.
6. **Nem minden meglevő leírás rossz vagy hiányos.** Az Abraboro Torx T15 25 mm terméknél szöveg és 50 g/csom feltüntetés látható; a HSS 6 mm GT50 fafúrónál leírás és 36 g/db. A jól kitöltött adatok védelme ugyanúgy része a feladatnak. [Torx](https://piktor94.hu/ABR-POWER-BIT-TORX-15X25MM-2DB-CSOM), [fafúró](https://piktor94.hu/ABR-FAFURO-HSS-6MM-GT50).

## Kiegészítő ellenőrzés: kategória és márka

A Festa-kategória első oldalán nem csak L kezdetű cikkszámok láthatók: például HSLX-100 és 5538 is szerepel, egy terméknév pedig SOLA megjelölést tartalmaz. Ez nem bizonyít hibás besorolást, de bizonyítja, hogy a kategóriacím alapján nem szabad minden terméket Festa gyártójúnak tekinteni. A márkát és az azonosítót termékenként kell ellenőrizni.

## Gyártói képfájlok tényleges mérése

A gyártó hivatalos letöltési hivatkozásairól elérhető három JPG-t letöltöttük és Pillow-val dekódoltuk. Az alábbiak ezeknek a fájloknak a mért adatai, nem a webshopon tárolt képeké:

| Termék | Gyártói letöltés | Mért pixelméret | Fájlméret |
|---|---|---|---|
| S50707 | [KAI 2K családkép](https://www.schuller.eu/download/?file=206&format=jpg&p=176) | 3758 × 1736 | 346 567 bájt |
| S50086 | [KAI 5 IN ONE 2K](https://www.schuller.eu/download/?file=194&format=jpg&p=164) | 3160 × 1599 | 371 548 bájt |
| S50080 | [KAI PATCH](https://www.schuller.eu/download/?file=192&p=162&format=jpg) | 2914 × 1345 | 375 966 bájt |

Mindhárom fájl teljesíti a vizsgált 500×500-as minimumot, valamint a 16 MB és 64 MP felső határt. Ez technikai képellenőrzés, nem teljes Merchant Center-minősítés. A letöltési URL, mérési dátum és SHA-256 lenyomat a termékek `manufacturer_image` mezőjében található. A KAI 2K képe termékcsaládkép; a 100 mm-es változathoz való megfelelést külön kell ellenőrizni. A képek kereskedelmi újrafelhasználási jogosultságát a nyilvános letöltés nem igazolja.
