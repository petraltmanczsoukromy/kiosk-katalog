<?php
/**
 * Export celého katalogu z Feedco API do products.json.
 * Trvá cca 5 minut (API limituje 200 produktů/stránku).
 *
 * Spustit z příkazové řádky: php export-catalog.php
 * (webové PHP by mohlo narazit na timeout, CLI ho nemá)
 */

// Přístup k API se načítá z config-api.php (není v gitu)
$api      = require __DIR__ . '/config-api.php';
$base_url = rtrim($api['base_url'], '/');
$login    = $api['login'];
$heslo    = $api['password'];
$page_size = 200;
$output_file = __DIR__ . '/products.json';

function api_get(string $url, string $login, string $heslo): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 30,
        CURLOPT_USERPWD        => "$login:$heslo",
        CURLOPT_HTTPAUTH       => CURLAUTH_BASIC,
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);
    $body   = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err    = curl_error($ch);
    curl_close($ch);
    return ['status' => $status, 'body' => $body, 'error' => $err];
}

echo "Start: " . date('Y-m-d H:i:s') . "\n";
$start = microtime(true);

$all_products = [];
$page = 1;

while (true) {
    $r = api_get("$base_url/products?page=$page&page_size=$page_size", $login, $heslo);

    if ($r['status'] !== 200) {
        echo "Chyba na stránce $page: HTTP {$r['status']} {$r['error']}\n";
        break;
    }

    $data = json_decode($r['body'], true);
    $items = $data['products'] ?? [];

    if (count($items) === 0) {
        echo "Stránka $page prázdná, konec dat.\n";
        break;
    }

    $all_products = array_merge($all_products, $items);

    if ($page % 10 === 0) {
        $elapsed = round(microtime(true) - $start, 1);
        echo "  stránka $page hotová, celkem staženo: " . count($all_products) . " produktů, čas: {$elapsed}s\n";
    }

    $page++;
    if ($page > 200) {
        echo "Pojistka: zastavuji po 200 stránkách.\n";
        break;
    }
}

$fetch_elapsed = round(microtime(true) - $start, 1);
echo "\nStaženo celkem: " . count($all_products) . " produktů za {$fetch_elapsed}s\n";

// ── Sjednocení formátu polí na stejnou strukturu jako dosavadní products.json ──
$normalized = array_map(function ($p) {
    return [
        'id'                   => $p['product_id'] ?? null,
        'code'                 => $p['code'] ?? null,
        'stock_qty'            => (float)($p['stock_qty'] ?? 0),
        'available_qty'        => (float)($p['available_qty'] ?? 0),
        'reserved_qty'         => (float)($p['reserved_qty'] ?? 0),
        'ordered_qty'          => (float)($p['ordered_qty'] ?? 0),
        'group_code'           => $p['group_code'] ?? null,
        'name'                 => $p['name'] ?? null,
        'ceka_na_dodani_avg'   => $p['avg_delivery_days'] ?? null,
        'manufacturer'         => $p['manufacturer'] ?? null,
        'unit'                 => $p['unit'] ?? null,
        'product_url'          => $p['url'] ?? null,
        'price'                => (float)($p['price'] ?? 0),
        'assortment_category'  => $p['assortment_code'] ?? null,
        'assortment_name'      => $p['assortment_name'] ?? null,
        'assortment_root'      => $p['assortment_root_code'] ?? null,
        'assortment_root_name' => $p['assortment_root_name'] ?? null,
    ];
}, $all_products);

// ── Uložení ──
file_put_contents($output_file, json_encode($normalized, JSON_UNESCAPED_UNICODE));

$total_elapsed = round(microtime(true) - $start, 1);
echo "\nUloženo: $output_file (" . round(filesize($output_file) / 1024 / 1024, 2) . " MB)\n";
echo "Celkový čas: {$total_elapsed}s\n";
echo "Konec: " . date('Y-m-d H:i:s') . "\n";