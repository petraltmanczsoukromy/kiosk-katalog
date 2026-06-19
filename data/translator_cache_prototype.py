#!/usr/bin/env python3
"""
Prototype of V3 translation cache flow.
This demo does NOT call OpenAI/DeepL. It shows the cache mechanics only.
Production version will replace demo_translate() with a real translator call.
"""
import json, hashlib, datetime, pathlib

PRODUCTS = pathlib.Path('products.json')
CACHE = pathlib.Path('translations.json')
OUTPUT = pathlib.Path('products.v3.json')

def source_hash(text: str) -> str:
    return hashlib.sha256((text or '').encode('utf-8')).hexdigest()[:16]

def demo_translate(name: str) -> str:
    # Replace with real translator in production.
    return name

def main():
    products = json.loads(PRODUCTS.read_text(encoding='utf-8'))
    if CACHE.exists():
        translations = json.loads(CACHE.read_text(encoding='utf-8'))
    else:
        translations = []
    by_id = {str(t['itemId']): t for t in translations}
    now = datetime.datetime.now().replace(microsecond=0).isoformat()

    for p in products:
        item_id = str(p.get('id'))
        name = p.get('name') or ''
        h = source_hash(name)
        cached = by_id.get(item_id)
        if not cached or cached.get('sourceNameHash') != h:
            cached = {
                'itemId': p.get('id'),
                'code': p.get('code'),
                'sourceName': name,
                'sourceNameHash': h,
                'name_en': demo_translate(name),
                'keywords_en': [],
                'translator': 'demo',
                'translatedAt': now,
                'status': 'new-or-updated'
            }
            by_id[item_id] = cached
        p['name_en'] = cached.get('name_en') or name
        p['keywords_en'] = cached.get('keywords_en') or []

    new_cache = list(by_id.values())
    CACHE.write_text(json.dumps(new_cache, ensure_ascii=False, indent=2), encoding='utf-8')
    OUTPUT.write_text(json.dumps(products, ensure_ascii=False, indent=2), encoding='utf-8')

if __name__ == '__main__':
    main()
