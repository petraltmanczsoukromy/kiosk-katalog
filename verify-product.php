<?php
/**
 * Proxy pro ověření dostupnosti/ceny produktu přes Feedco API.
 * Kiosek (JS v prohlížeči) volá tento soubor, ne API přímo —
 * login/heslo k API tak zůstanou jen na serveru.
 *
 * Přístupové údaje se načítají z config-api.php (není v gitu).
 *
 * Použití:  GET verify-product.php?id=897
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// ── Načtení konfigurace ──────────────────────────────────────
$configFile = __DIR__ . '/config-api.php';
if (!is_file($configFile)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Chybí konfigurace API']);
    exit;
}
$api = require $configFile;

$product_id = filter_input(INPUT_GET, 'id', FILTER_VALIDATE_INT);

if (!$product_id) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Chybí nebo neplatné id produktu']);
    exit;
}

$ch = curl_init(rtrim($api['base_url'], '/') . "/products/$product_id");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT        => $api['timeout'] ?? 6,
    CURLOPT_USERPWD        => $api['login'] . ':' . $api['password'],
    CURLOPT_HTTPAUTH       => CURLAUTH_BASIC,
    CURLOPT_HTTPHEADER     => ['Accept: application/json'],
]);
$body   = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err    = curl_error($ch);
curl_close($ch);

if ($err || $status !== 200) {
    // Detail chyby jen do logu serveru, ne ven do prohlížeče
    error_log("verify-product.php: id=$product_id " . ($err ?: "HTTP $status"));
    http_response_code(502);
    echo json_encode(['ok' => false, 'error' => 'API nedostupné']);
    exit;
}

$data = json_decode($body, true);
$p = $data['product'] ?? null;

if (!$p) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Produkt nenalezen']);
    exit;
}

// Vrátíme jen to, co kiosek potřebuje
echo json_encode([
    'ok'             => true,
    'product_id'     => $p['product_id'],
    'price'          => (float) $p['price'],
    'available_qty'  => (float) $p['available_qty'],
    'stock_qty'      => (float) $p['stock_qty'],
    'updated_at'     => $p['updated_at'],
], JSON_UNESCAPED_UNICODE);