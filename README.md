# VERKON prodejni kiosek - pilot Search v2

Tato verze obsahuje kompletni `products.json` z XLSX exportu a upravene vyhledavani podle navrzeneho popisu.

## Spusteni

Nejspolehliveji pres lokalni server v teto slozce:

```bash
python -m http.server 8080
```

Pak otevrit:

```text
http://localhost:8080
```

## Vyhledavani Search v2

- hleda okamzite behem psani, bez Enteru
- ignoruje velka/mala pismena
- ignoruje diakritiku
- ignoruje mezery a bezne oddelovace
- nehleda libovolne odprostred slova
- radi vysledky podle relevance

Priklady:

- `kad` najde `Kadinka`
- `kyselinasirova` najde `Kyselina sirova`
- `phmetr` najde `pH metr`
- `adinka` nenajde `Kadinka`
- `irova` nenajde `Kyselina sirova`

## Relevance

Priorita shod:

1. kod produktu
2. zacatek nazvu produktu
3. zacatek slova v nazvu produktu
4. vyrobce
5. kategorie
6. doplnkova pole

Kvuli vykonu se renderuje prvnich 240 vysledku. Hledani probiha nad vsemi produkty.
