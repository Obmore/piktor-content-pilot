# Piktor94 tartalombővítés – integrációs döntés és ellenőrzési terv

Ellenőrizve: 2026-09-24. Ez kutatási és tervezési anyag, éles UNAS- vagy Merchant Center-fiókhoz nem történt hozzáférés. Az API-kompatibilitás dokumentáció alapján tervezhető; konkrét áruházi importként csak teszt után nevezhető késznek.

## Ajánlott döntés

**Első körben forrásokkal igazolt, ember által ellenőrizhető tartalomcsomag + helyben futó, módosításokat előkészítő pipeline.** A meglévő UNAS felület és ERP-kapcsolat marad. A pilot demonstrálja a leírások minőségét, a cikkszám-egyeztetést és az adatellenőrzést; az éles adapter külön bevezetési lépés.

| Megoldás | Mikor megfelelő? | Korlát / kockázat | Döntés |
|---|---|---|---|
| UNAS export/import + kézi, AI-val támogatott szövegírás | Egyszeri, néhány tucat jól dokumentált termék | Kézi forrásegyeztetés, hibás cikkszám vagy importbeállítás; ismétlődő feladatnál nem méretezhető kényelmesen | A pilot átvitelének jó alapja, nem szabad újraépíteni a már létező importot |
| Könnyű, auditálható tartalombővítő pipeline | Több gyártó, sok hiányzó adat, folyamatos frissítés | Forrásadapterek karbantartása; az automatizmus nem helyettesíti a termékazonosság ellenőrzését | Ajánlott; a haszna az ellenőrizhető adatminőség és változáskövetés |
| Teljes PIM-rendszer + többcsatornás publikálás | Több webshop, ország, csapat, összetett jogosultság és termékadat-gazdálkodás | Jelentős bevezetés és adatmodell-migráció; a jelenlegi igény alapján korai | Későbbi opció; a pilot nem indokolja |

A megkülönböztető érték: egy gyártói cikkszámhoz visszakereshető állítások, bizonytalan adatok visszatartása, hiánylisták, emberi jóváhagyás, szűk mezőkör és visszaellenőrzés. Pusztán hosszabb AI-szöveg nem jelent megbízható tartalomjavítást.

## Ellenőrzött UNAS-képességek

- Az API PREMIUM/VIP csomagban érhető el, XML-alapú POST-kérésekkel. A kihagyott node általában változatlan marad; az üres node törölhet. A feldolgozás soros: hibánál az azt követő entitásokat nem dolgozza fel. [U1]
- `getProduct`: cikkszámmal, kategóriával, idővel és lapszámozással szűrhető; a `CategoryId` csak az elsődleges besorolásra vonatkozik. `ContentType=full` szükséges például az összes további kép lekéréséhez. [U2, U3]
- `setProduct`: `Action=modify`; azonosító a meglévő `Sku` vagy megfelelő áruházi azonosító. Szöveg: `Description.Short`, `Description.Long`, HTML-jelzők. SEO: `Meta.Title`, `Meta.Description`. A `Weight` mértékegysége kg. [U3]
- A képimport aszinkron. Új kép: `Images.Image.Import.Url` vagy `Encoded`; fő kép `Type=base`, további `Type=alt`. Meglévő kép cseréjénél `Images.Version` kezelendő; ismételt verzióküldést az UNAS egyre erősebben korlátoz. [U3]
- Kategória: `setCategory`, `Texts.Top`, `Texts.Bottom`, `Meta.Title`, `Meta.Description`, képhez `Image.Import.Url`; meglévő kép változásakor `Image.Version`. [U4]
- A válasz termékenként `Status=ok/error` és hibaleírás; a HTTP 200 önmagában nem elég a teljes siker megállapításához. [U5]

### Kapacitás és import

| Művelet | PREMIUM | VIP |
|---|---:|---:|
| `getProduct`, kérésenként 1 termék | 1000 hívás/óra | 3000 hívás/óra |
| `getProduct`, kérésenként több termék | 30 hívás/óra | 90 hívás/óra |
| `setProduct`, legfeljebb 100 termék/kérés | 1000 hívás/óra | 3000 hívás/óra |
| `setProduct`, több mint 100 termék/kérés | 30 hívás/óra | 90 hívás/óra |
| Általános korlát egy IP-címről | 2000 hívás/óra | 6000 hívás/óra |

Források: U6–U7. A többi, ugyanazon áruházat vagy IP-címet használó integráció terhelésével együtt kell méretezni. Nem célszerű a plafonon járatni; 20 egymást követő hibás végpont-hívás és hibás autentikáció külön tiltást is okozhat. Éjfél körül ±10 perc karbantartás lehetséges. A set XML felső mérete 128 MB. [U7]

Az admin termékadatbázis export/import XLS/XLSX/XML/CSV/TXT formátumokat támogat; meglévő terméket cikkszámmal azonosít, importáláskor felülírhat adatokat. A feltöltési állomány 20 MB-os limitje nem azonos az API XML-limitjével. [U8] A `setProductDB` rendelkezik teljes és fordított törlési módokkal is; a pilotban csak `DelType=no` jöhetne szóba. [U9]

**A saját belső CSV nem nevezhető automatikusan UNAS-importnak.** Előbb valódi áruházi export kell: fejléc, elválasztó, kódolás, HTML-kezelés, nyelv és mezőkör alapján készülhet ellenőrzött konverzió. Meglévő termékekhez az ár/készlet mezőket a publikálási kimenetben kihagyjuk; nem az exportált régi értékeket küldjük vissza.

## Mezőgazdák és adatmodell – tervezési javaslat

| Adatcsoport | Gazda | Pipeline teendő |
|---|---|---|
| Ár, készlet, kedvezmény, áfa, rendelhetőség | Meglévő ERP-integráció | Kimenetből tiltani; mintában ellenőrizni, hogy nem módosult |
| Webshopos cikkszám | Meglévő webshop/ERP | Azonosításra használni, soha nem átírni |
| Gyártói cikkszám | Gyártói/beszállítói törzs | Külön mezőben őrizni; az egyeztetési szabály nem változtatja a webshopos cikkszámot |
| Leírás és SEO-tervezet | Ellenőrzött gyártói adat + szerkesztő | Mezőnként forrás, régi/új érték, döntési állapot |
| Kép | Jogosult gyártó/beszállító vagy partner | Azonos termékváltozat, használati jogosultság, technikai ellenőrzés |
| Termék nettó / csomagolt tömege | Dokumentált műszaki adat / mérés | Külön kezelni; a Google szállítási tömeghez megfelelő jelentést igazolni |
| Kategóriastruktúra | Partner | Tervezet és jóváhagyás; kategória-áthelyezést első körben nem automatizálni |

A levélben adott normalizálás: Schuller esetén egy kezdő `S` elhagyása a gyártói kereséshez; Abraboro esetén kezdő `ABR` elhagyása; Festa/Levior esetén a gyári `L` megtartása. Ezt gyártónként, szigorú előtagként kell megvalósítani, általános betűlevágás nélkül. Az exact kód mellett ellenőrizendő a méret, kiszerelés és termékcsalád, lehetőleg GTIN/EAN is. Duplikált vagy ellentmondó azonosítás -> kézi ellenőrzés.

Javasolt lépések:

1. Áruházi pillanatkép és kiválasztott gyártói források beolvasása, eredeti értékek tárolása.
2. Cikkszám-egyeztetés; minden releváns állításhoz forrás URL, dátum és rövid bizonyíték.
3. Determinisztikus validáció: szükséges adatok, dimenziók, kiszerelés, egység, HTML, tiltott túlzó vagy alá nem támasztott állítások.
4. Szövegtervezet; a hiányzó adat mezője üres/bizonytalan marad, nem kap becslést.
5. Áttekintő felület vagy HTML-jelentés régi/új szöveggel és kifejezett jóváhagyással.
6. Kizárólag jóváhagyott mezők diffje, előzetes változáslista és visszaállítási terv.
7. Friss adatlekérés közvetlenül írás előtt: ha a céltartalom időközben változott, ütközésként megállítjuk. A kiválasztott API-n nincs dokumentált atomi compare-and-swap: a friss olvasás csökkenti, nem szünteti meg a versenyhelyzetet. Publikálási időablak és mezőgazda-egyezség szükséges.
8. Kis tesztadag; válaszok SKU-szintű feldolgozása; újraolvasás, weboldali megjelenés és az ERP következő szinkronja utáni ellenőrzés.

Ne legyen a pilotban önműködő, folyamatos webscraping vagy éles publikálás. Javasolt alap: helyi Python CLI, JSON-adatmodell, HTML/CSV review-export; később külön UNAS-adapter. AI csak a megfogalmazásban segít; a validáció és a mezőlista programozott.

## Google-képek és súly: a két lényeges pontosítás

1. **Képek.** A Google 500×500 minimumot 2027-01-31-től érvényesít minden termékre. Addig nem ruházatnál 100×100, ruházatnál 250×250 minimumot ír a hibaoldal; 2026 folyamán az 500×500 alatti képekre figyelmeztetések jelenhetnek meg. A hibaoldal júliust, a 2026-os változásjegyzék április 14-ét nevezi meg a figyelmeztetések indulásaként; a 2027-01-31-es kötelező határidő egyezik. [G1] A fő specifikáció 1500×1500 vagy nagyobb képet ajánl; 16 MB és 64 megapixel felső korlátot ad. A teljes, megfelelő terméket kell mutatni, a kép URL-jének feltérképezhetőnek kell lennie. [G2]
2. **Tömeg.** A `shipping_weight` nem minden termékre általánosan kötelező: tömegalapú szállítási beállításoknál szükséges. A tényleges szállítási tömeget kell megadni számmal és egységgel (`g`, `kg`, `oz`, `lb`); literből nem következik közvetlenül kg. [G3, G4]

Következmény: a képaudit két külön eredményt mutasson: a 2026-os kötelező minimum és a 2027-re felkészített 500×500 cél teljesül-e; az 1500-as érték ajánlás. A hiányzó tömeg diagnózisához Merchant Center-problémaexport és szállítási beállítás kell. Ne állítsuk, hogy a partner konkrét hibáit már ezzel diagnosztizáltuk; csak a levelét és a publikus weboldalt ismerjük. Az eredeti, megfelelő felbontású kép beszerzése az első út, puszta felnagyítás nem tekinthető új minőségnek. Termékképhez nem generálunk műszaki részleteket.

## Célzott tesztek és elfogadás

- Prefix-kezelés: csak adott gyártó, egyszeri előtag; Festa `L` megmarad; vezető nullák és belső karakterek megőrzése.
- Ismeretlen, duplikált vagy eltérő méretű termék nem jut publikálható állapotba.
- XML/HTML biztonság: ékezet, `&`, `<`, idézőjel, XML-vezérlőkarakter, Unicode; aktív script/iframe/event handler tiltása. XML-parsernél külső entitás feloldás tiltva.
- A módosítási kimenetben nincs ár, készlet, áfa, státusz, SKU-csere, törlés vagy ismeretlen mező. Ez engedélyezési lista legyen, nem véges tiltólista.
- Hiányzó érték nem alakítható automatikusan törlő üres node-dá. Kifejezett törlési művelet nincs a pilotban.
- Jóváhagyatlan mező kimarad; jóváhagyás után változó tartalom új ellenőrzést igényel. Review-hash kösse a döntést a konkrét értékhez.
- Újrafuttatás nem készít új változást, ha az érték már egyezik. Sikertelen részbatch után csak igazoltan kimaradt elemek folytathatók; timeout után előbb állapotlekérés, nem vak újraküldés.
- Képvalóság: a letöltött bájtok dekódolható képet alkotnak, mért pixelméret/állományméret, megfelelő változat és forrásjog; csak a fájlnév vagy URL alapján nem fogadható el kép.
- Tömeg: forrás és jelentés kötelező; 500 ml nem válik 0,5 kg-ra, g -> kg konverzió ellenőrzött; ismeretlen érték kimarad.
- Tesztáruházban az ár/készlet és más védett mezők változatlansága; hiányos input, részhiba, időtúllépés, hitelesítési és limit-hiba külön eset.
- Kategóriafrissítés előtt tényleges áruházi azonosító szükséges; az URL-ből találgatott ID-t nem publikáljuk.
- Éles pilot után: azonosítható napló, célmezők visszaolvasva egyeznek, nem célzott mezők nem változtak, következő ERP-szinkron nem írja vissza a régi tartalmat.

## Bevezetéshez kért, konkrét inputok

UNAS-csomag és 5–20 kiválasztott termék valódi exportja; a jelenlegi ERP-szinkron által írt mezők; gyártói/beszállítói adat- és képhasználati hozzáférés; kategóriaexport; Merchant Center konkrét hibajegyzéke és szállítási beállításai. Első technikai hozzáférés olvasási jogosultság; írás később, külön kulccsal és csak a szükséges funkciókkal. Az UNAS kulcs funkciónként korlátozható és a login token két óráig használható. [U10]

## Elsődleges források

- U1: https://unas.hu/tudastar/api — protokoll, kihagyott/üres node, soros feldolgozás.
- U2: https://unas.hu/tudastar/api/termekek-getProduct-keres — szűrők, lapozás, részletesség.
- U3: https://unas.hu/tudastar/api/termekek-adatszerkezet — termékmezők, kg, szövegek, képek.
- U4: https://unas.hu/tudastar/api/kategoriak-adatszerkezet — kategóriaszöveg és kép.
- U5: https://unas.hu/tudastar/api/termekek-setProduct-valasz — SKU-szintű eredmény.
- U6: https://unas.hu/tudastar/api/termekek — végpontspecifikus híváskorlátok.
- U7: https://unas.hu/tudastar/api/limitaciok — globális korlátok és tiltások.
- U8: https://unas.hu/tudastar/admin/termek-adatbazis — natív export/import.
- U9: https://unas.hu/tudastar/api/termekek-setProductDB-keres — adatbázis import és törlési módok.
- U10: https://unas.hu/tudastar/api/azonositas — kulcs és token.
- G1: https://support.google.com/merchants/answer/12159030?hl=en — Image too small, átmeneti dátumok.
- G2: https://support.google.com/merchants/answer/6324350?hl=en — image_link specifikáció.
- G3: https://support.google.com/merchants/answer/6324503?hl=en — shipping_weight.
- G4: https://support.google.com/merchants/answer/12577710?hl=en — fiókszintű szállítási beállítások.


- G5: https://support.google.com/merchants/answer/16989427?hl=en — 2026-os változásjegyzék; a figyelmeztetés kezdődátuma eltér a hibaoldaltól.
