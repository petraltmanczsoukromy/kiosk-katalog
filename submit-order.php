<?php
/**
 * Proxy pro založení objednávky přes Feedco API (POST /v1/orders).
 * Kiosek (JS v prohlížeči) posílá tělo objednávky sem, ne přímo na
 * API - login/heslo tak zůstanou jen na serveru.
 *
 * Použití: POST submit-order.php, tělo = JSON objednávky (viz app.js
 * buildOrderPayload()).
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// Přístup k API se načítá z config-api.php (není v gitu)
$api      = require __DIR__ . '/config-api.php';
// Objednávky mohou jít jinam než čtení katalogu (orders_base_url v configu)
$base_url = rtrim($api['orders_base_url'] ?? $api['base_url'], '/');
$login    = $api['login'];
$heslo    = $api['password'];

// ── Načtení a základní validace vstupu ──────────────────────
$raw_body = file_get_contents('php://input');
$order = json_decode($raw_body, true);

if (!is_array($order)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Neplatné tělo požadavku (očekáván JSON).']);
    exit;
}

if (empty($order['items']) || !is_array($order['items'])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Objednávka neobsahuje žádné položky.']);
    exit;
}

// Pojistka: product_id musí být integer, ne string (API to vyžaduje striktně)
foreach ($order['items'] as &$item) {
    if (isset($item['product_id'])) {
        $item['product_id'] = (int) $item['product_id'];
    }
}
unset($item);

// ── Testovací režim ──────────────────────────────────────────
// Pokud config.json má order.testMode: true, objednávka se jen zaloguje
// ale neodešle do Heliosu. Pro ostré nasazení nastavit testMode: false.
if (!empty($order['test_mode'])) {
    $log_dir = __DIR__ . '/order-logs';
    if (!is_dir($log_dir)) @mkdir($log_dir, 0750, true);
    $log_line = sprintf(
        "[%s] TEST MODE - order_id=%s\nrequest_full=%s\n\n",
        date('c'),
        $order['order_id'] ?? '?',
        json_encode($order, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)
    );
    @file_put_contents("$log_dir/orders.log", $log_line, FILE_APPEND);

    echo json_encode([
        'ok'          => true,
        'order_id'    => $order['order_id'] ?? null,
        'orderNumber' => 'TEST-' . date('His'),
        'message'     => 'TEST MODE: objednávka nebyla odeslána do Heliosu.',
    ]);
    @include_once __DIR__ . '/audio-dispatch.php';
    exit;
}

// ── Odeslání na Feedco API ──────────────────────────────────
$ch = curl_init("$base_url/orders");
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_USERPWD        => "$login:$heslo",
    CURLOPT_HTTPAUTH       => CURLAUTH_BASIC,
    CURLOPT_CUSTOMREQUEST  => 'POST',
    CURLOPT_POSTFIELDS     => json_encode($order, JSON_UNESCAPED_UNICODE),
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json; charset=utf-8',
        'Accept: application/json',
    ],
]);
$body   = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err    = curl_error($ch);
curl_close($ch);

// ── Log pro dohledatelnost (testovací provoz) ───────────────
$log_dir = __DIR__ . '/order-logs';
$log_write_error = null;
if (!is_dir($log_dir)) {
    if (!@mkdir($log_dir, 0750, true) && !is_dir($log_dir)) {
        $log_write_error = 'Nepodařilo se vytvořit složku order-logs (chybí práva zápisu?)';
    }
}
if (!$log_write_error) {
    $log_line = sprintf(
        "[%s] order_id=%s http=%s curl_err=%s\nrequest_full=%s\nresponse=%s\n\n",
        date('c'),
        $order['order_id'] ?? '?',
        $status,
        $err ?: '-',
        json_encode($order, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT),
        $body
    );
    if (@file_put_contents("$log_dir/orders.log", $log_line, FILE_APPEND) === false) {
        $log_write_error = 'Nepodařilo se zapsat do order-logs/orders.log (chybí práva zápisu?)';
    }
}

// ── Vyhodnocení odpovědi ─────────────────────────────────────
if ($err) {
    http_response_code(502);
    echo json_encode([
        'ok' => false,
        'error' => 'Spojení s API selhalo: ' . $err,
        'debug_log_warning' => $log_write_error,
    ]);
    exit;
}

$data = json_decode($body, true);

if ($status !== 201 && $status !== 200) {
    http_response_code(502);
    echo json_encode([
        'ok' => false,
        'error' => $data['error'] ?? $data['message'] ?? "API vrátilo HTTP $status",
        'debug_http_status' => $status,
        'debug_raw_body' => $body,
        'debug_log_warning' => $log_write_error,
    ]);
    exit;
}

// POZOR: pole "ok" v odpovědi API NENÍ spolehlivý indikátor úspěchu -
// v dřívějších testech jsme viděli "ok": true i u objednávek, které
// v Heliosu reálně selhaly (např. "Error converting data type nvarchar
// to int."). Používáme proto dočasnou heuristiku podle obsahu textu
// v poli "error" - TODO: ověřit s Jakubem spolehlivé pole (zmiňoval
// "byla_chyba" v původním zadání API, ale v praxi ho odpověď neobsahuje).
$error_text = $data['error'] ?? '';
$looks_like_failure = $error_text !== '' && (
    stripos($error_text, 'error') !== false ||
    stripos($error_text, 'chyb') !== false && stripos($error_text, 'úspěšně') === false ||
    stripos($error_text, 'cannot') !== false ||
    stripos($error_text, 'fails') !== false ||
    stripos($error_text, 'null') !== false
);

if (empty($data['ok']) || $looks_like_failure) {
    http_response_code(422);
    echo json_encode([
        'ok' => false,
        'error' => $error_text ?: ($data['message'] ?? 'Objednávku se nepodařilo založit.'),
    ]);
    exit;
}

echo json_encode([
    'ok'              => true,
    'order_id'        => $order['order_id'] ?? null,
    'orderNumber'     => $data['orderNumber'] ?? null,
    'externalOrderId' => $data['externalOrderId'] ?? null,
    'message'         => $error_text ?: null,
]);

// Hláška do skladu — selže tiše, neovlivní odpověď objednávky
@include_once __DIR__ . '/audio-dispatch.php';