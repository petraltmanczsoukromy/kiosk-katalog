<?php
/**
 * Vrátí čas poslední změny katalogu (products.json apod.).
 * Použití: catalog-info.php?file=products.json
 *          catalog-info.php?file=../kiosk/products.json   (režim skladem)
 *
 * Bezpečnost: povolen je jen soubor .json, který leží v této složce
 * nebo v sousední složce (tedy uvnitř nadřazené složky webu).
 * realpath() převede cestu na skutečnou a "../../" triky tím odhalí.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$requested = (string) ($_GET['file'] ?? 'products.json');
$file      = realpath(__DIR__ . '/' . $requested);
$allowed   = realpath(dirname(__DIR__)) . DIRECTORY_SEPARATOR;

if (!$file || strpos($file, $allowed) !== 0 || strtolower(pathinfo($file, PATHINFO_EXTENSION)) !== 'json' || !is_file($file)) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'Katalog nenalezen']);
    exit;
}

echo json_encode([
    'ok'         => true,
    'updated_at' => date('c', filemtime($file)),
    'size_mb'    => round(filesize($file) / 1024 / 1024, 2),
]);
