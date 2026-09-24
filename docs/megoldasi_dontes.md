# Módszerválasztás a mintához

A partner fő feladata a festék- és barkácsüzlet kiszolgálása. A termékleírások és képek pótlása kézi munkát igényel, a korábbi AI-szövegekben szakmailag hibás állítások is megjelentek. Az ERP már kezeli az ár- és készletszinkront; a mintának a tartalmi hiányokra kell választ adnia.

| Módszer | Előny | Fő korlát | Döntés a mintában |
|---|---|---|---|
| Kézi másolás és szövegírás | Kis mennyiségnél egyszerű | Nem mutat újrafuttatható feldolgozást | Források egyszeri ellenőrzésére használjuk |
| Szabad AI-szövegírás terméknévből | Rugalmas megfogalmazás | A téves műszaki állítás nincs kizárva | Nem használjuk tényforrásként |
| Strukturált gyártói adatok + ellenőrzött sablonok | Pontos illesztés, követhető tények, reprodukálható eredmény | Típusonkénti sablon és tiszta bemenet szükséges | Ezt valósítottuk meg |
| Teljes PIM és integrációs platform | Nagy katalógus és több csatorna kezelhető | A három termékes mintához aránytalan bevezetés | Nem része a mintának |

A választott program valóban bemenetet dolgoz fel. A cikkszámok illesztése, az adatforrások megléte, a méretütközés és a kép pixelmérete géppel ellenőrizhető. A forrás tartalmának szakmai helyességét az adatátvételnél ellenőriztük; ezt az URL megléte nem automatizálja.

A böngészőben a termékleírás újrafuttatható, a gyártói JSON lecserélhető és az eredmény letölthető. A kategóriaszöveg külön szerkesztett minta. A képek vizsgálata valódi fájldekódolást használ. A tömeg egységkezelése működik, de a konkrét három termékhez nincs igazolt tömegadat, ezért a minta nem állítja, hogy ezeket már pótolta.
