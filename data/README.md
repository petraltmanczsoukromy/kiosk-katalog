# V3 prototype - automatická angličtina pro produkty

Tento ZIP je první technický prototyp pro V3. Vychází z reálného `products.json` a ukazuje, jak by fungovala překladová cache mimo Helios.

## Důležité

V tomto prototypu nebylo voláno žádné online AI ani DeepL API. Anglické názvy ve vzorku jsou ukázkové, vytvořené jednoduchým pravidlovým demo překladačem. Smyslem ZIPu je ověřit strukturu dat a workflow, ne finální kvalitu překladu.

## Soubory

- `products.v3.sample.json` - ukázka produktů obohacených o `name_en`, `keywords_en` a `translation_status`.
- `translations.sample.json` - ukázková překladová cache podle `itemId` a hashe českého názvu.
- `glossary.sample.json` - první návrh firemního slovníku pro laboratorní sortiment.
- `translator-cache.config.sample.json` - návrh pravidel pro produkční generátor.
- `translator_cache_prototype.py` - jednoduchý demonstrační skript cache mechaniky.

## Navržené pravidlo V3

1. Helios / API dodá český produktový JSON.
2. Importní služba ověří položku podle `id`.
3. Spočítá `sourceNameHash` z českého názvu.
4. Pokud položka v cache existuje a hash sedí, použije stávající překlad.
5. Pokud chybí nebo se název změnil, přeloží se pouze tato položka.
6. Výsledný JSON pro kiosk obsahuje:

```json
{
  "name": "Petriho miska plastová 90 mm",
  "name_en": "Plastic Petri dish 90 mm",
  "keywords_en": ["petri dish", "culture dish"]
}
```

## Doporučený další krok

Vybrat překladový engine:

- OpenAI - lepší pro laboratorní názvosloví a generování `keywords_en`.
- DeepL - velmi dobrý obecný překlad, jednodušší režim.

Pro VERKON bych doporučil nejdřív otestovat OpenAI na 50-100 reálných položkách a ručně zkontrolovat chemikálie, laboratorní sklo a plasty.

## Poznámka k výkonu

Kiosek nebude překládat za běhu. Překlad se provede při importu dat a jen pro nové nebo změněné položky. Kiosek pak čte hotový `products.json` s anglickými poli.
