# Větev: feature/api-product-verification

## Co dělá
Napojuje detail produktu v kiosku na živé API (Feedco/Helios) — zobrazí
aktuální skladovou dostupnost a cenu, případně upozorní na změnu ceny
oproti statickému `products.json`.

Zakládání objednávek (`POST /v1/orders`) NENÍ součástí této větve —
to se ještě ladí s dodavatelem API (otevřený problém s konverzí datových
typů na straně Heliosu).

## Nové soubory
- `verify-product.php` — server-side proxy na Feedco API. Posílá Basic Auth
  (login/heslo), které NIKDY nesmí být v klientském JS. Kiosek volá jen
  tento soubor: `GET verify-product.php?id={product_id}`.

## Upravené soubory
- `app.js`
  - tlačítko „Ověřit aktuální dostupnost" je teď u KAŽDÉHO produktu
    (dřív bylo jen u produktů bez `url`)
  - nová funkce `verifyProductOnline(product)` — zavolá proxy, zobrazí
    výsledek (dostupnost + cena, případně upozornění na změnu ceny)
- `style.css`
  - styly pro `.verify-result` (3 stavy: ok / warning / error)

## Mapování dat
`products.json` pole `id` == API pole `product_id` (ověřeno testem,
shoduje se 1:1, žádné párování přes `code` není potřeba).

## Jak nasadit / otestovat
1. Nahrát celý obsah na server vedle sebe (kiosek + `verify-product.php`
   musí být ve STEJNÉ složce — `fetch()` v `app.js` používá relativní cestu).
2. Otevřít kiosek, kliknout na libovolný produkt → „Ověřit aktuální dostupnost".

## Návrh git příkazů
```bash
git checkout -b feature/api-product-verification
git add verify-product.php app.js style.css
git commit -m "Napojení ověření dostupnosti/ceny produktu na Feedco API

- nová proxy verify-product.php (schovává API credentials)
- app.js: tlačítko ověření u všech produktů, volání proxy
- style.css: styly pro výsledek ověření (ok/warning/error)"
git push -u origin feature/api-product-verification
```

## Co zbývá (další větev)
- `POST /v1/orders` — čeká se na vyřešení chyby
  `Error converting data type nvarchar to int.` ze strany Heliosu
- Případně napojení živého načítání katalogu (zatím záměrně neřešeno)
