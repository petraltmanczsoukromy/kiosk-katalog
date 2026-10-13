<?php
/**
 * sync-catalog.php
 * Proxy pro synchronizaci změn katalogu přes Feedco API.
 * Volá GET /v1/products?changed_since=DATUM a vrátí změněné produkty.
 *
 * Parametry (GET):
 *   since = ISO datum (např. 2026-08-08T10:00:00+02:00)
 *           pokud chybí, použije se "teď - 1 hodina"
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// Přístup k API se načítá z config-api.php (není v gitu)
$api      = require __DIR__ . '/config-api.php';
$base_url = rtrim($api['base_url'], '/');
$login    = $api['login'];
$heslo    = $api['password'];
$page_size = 200;

// Čas od kdy chceme změny
if (!empty($_GET['since'])) {
    $since = $_GET['since'];
} else {
    $since = date('c', strtotime('-1 hour'));
}

$since_encoded = urlencode($since);

$all_products = [];
$page = 1;

while (true) {
    $url = "$base_url/products?changed_since=$since_encoded&page=$page&page_size=$page_size";

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

    if ($err || $status !== 200) {
        echo json_encode([
            'ok'    => false,
            'error' => $err ?: "API vrátilo HTTP $status",
        ]);
        exit;
    }

    $data  = json_decode($body, true);
    $items = $data['products'] ?? [];

    if (count($items) === 0) break;

    $all_products = array_merge($all_products, $items);
    $page++;

    if ($page > 50) break; // pojistka
}

echo json_encode([
    'ok'       => true,
    'since'    => $since,
    'count'    => count($all_products),
    'products' => $all_products,
], JSON_UNESCAPED_UNICODE);