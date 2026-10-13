<?php
/**
 * xml-to-products.php
 * Převede XML export z Heliosu (přehled kiosku) na products.json.
 *
 * Použití:
 *   1. Exportuj přehled z Heliosu jako XML
 *   2. Nahraj XML soubor na server do stejné složky jako tento skript
 *   3. Otevři v prohlížeči: xml-to-products.php?file=nazev-souboru.xml
 *      nebo spusť z CLI: php xml-to-products.php nazev-souboru.xml
 *
 * Výstup: products.json ve stejné složce jako kiosek (o složku výš,
 *         nebo nastav $output_file podle potřeby)
 */

header('Content-Type: text/plain; charset=utf-8');

// ── Konfigurace ──────────────────────────────────────────────
$output_file = __DIR__ . '/products.json';

// Vstupní soubor - z URL parametru nebo CLI argumentu
if (php_sapi_name() === 'cli') {
    $input_file = $argv[1] ?? null;
} else {
    $input_file = isset($_GET['file']) ? __DIR__ . '/' . basename($_GET['file']) : null;
}

if (!$input_file || !file_exists($input_file)) {
    echo "Chyba: Soubor nenalezen.\n";
    echo "Použití: xml-to-products.php?file=nazev-souboru.xml\n";
    exit(1);
}

echo "Načítám: $input_file\n";
$start = microtime(true);

// ── Parsování XML ────────────────────────────────────────────
$xml = simplexml_load_file($input_file, 'SimpleXMLElement', LIBXML_NOCDATA);
if (!$xml) {
    echo "Chyba: Nepodařilo se načíst XML soubor.\n";
    exit(1);
}

$lines = $xml->LINES->LINE ?? [];
$total_lines = count($lines);
echo "Řádků v XML: $total_lines\n";

// ── Pomocné funkce ───────────────────────────────────────────

// Převede českou čárku na desetinnou tečku a vrátí float
function parse_number(string $s): float {
    // Odstranit mezery a pevné mezery (nezlomitelná mezera = \xc2\xa0 v UTF-8)
    $s = preg_replace('/[\s\xc2\xa0\x{00a0}]/u', '', $s);
    // Nahradit českou čárku tečkou
    $s = str_replace(',', '.', $s);
    return (float) $s;
}

// ── Zpracování řádků ─────────────────────────────────────────

// První řádek = hlavička (názvy sloupců jako HTML entity)
$header_line = $lines[0];
$headers = [];
foreach ($header_line->CELL as $cell) {
    // html_entity_decode dekóduje &#91;id&#93; → [id] → odebereme závorky
    $h = html_entity_decode((string)$cell, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $headers[] = trim($h, '[]');
}
echo "Sloupce: " . implode(', ', $headers) . "\n\n";

// Číselná pole
$numeric_fields = ['stock_qty', 'available_qty', 'reserved_qty', 'ordered_qty', 'price', 'ceka_na_dodani_avg'];

$products = [];
$skipped = 0;

for ($i = 1; $i < $total_lines; $i++) {
    $line = $lines[$i];
    $cells = $line->CELL ?? [];

    if (count($cells) === 0) {
        $skipped++;
        continue;
    }

    $values = [];
    foreach ($cells as $cell) {
        $values[] = html_entity_decode((string)$cell, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    // Doplnit chybějící hodnoty
    while (count($values) < count($headers)) {
        $values[] = '';
    }

    $rec = [];
    foreach ($headers as $idx => $key) {
        $val = trim($values[$idx] ?? '');

        if (in_array($key, $numeric_fields)) {
            $rec[$key] = $val !== '' ? parse_number($val) : 0.0;
        } elseif ($key === 'ico_only') {
            $rec[$key] = $val === '1' || strtolower($val) === 'true';
        } else {
            $rec[$key] = $val;
        }
    }

    $products[] = $rec;
}

$parse_elapsed = round(microtime(true) - $start, 2);
echo "Zpracováno: " . count($products) . " produktů ($skipped prázdných řádků přeskočeno) za {$parse_elapsed}s\n";

// ── Statistiky ───────────────────────────────────────────────
$has_image     = count(array_filter($products, fn($p) => !empty($p['image_url'])));
$has_detail    = count(array_filter($products, fn($p) => !empty($p['image_url_detail'])));
$ico_only_count = count(array_filter($products, fn($p) => !empty($p['ico_only'])));

echo "Obrázky (image_url): $has_image\n";
echo "Obrázky detail (image_url_detail): $has_detail\n";
echo "Jen IČ (ico_only): $ico_only_count\n\n";

// ── Uložení ──────────────────────────────────────────────────
$json = json_encode($products, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if (file_put_contents($output_file, $json) === false) {
    echo "Chyba: Nepodařilo se uložit $output_file (chybí práva zápisu?)\n";
    exit(1);
}

$size_mb = round(filesize($output_file) / 1024 / 1024, 2);
$total_elapsed = round(microtime(true) - $start, 2);

echo "Uloženo: $output_file ({$size_mb} MB)\n";
echo "Celkový čas: {$total_elapsed}s\n";
echo "\nUkázka prvního záznamu:\n";
echo json_encode($products[0], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";