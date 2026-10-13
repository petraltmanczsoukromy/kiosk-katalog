<?php
/**
 * Načte config.json a složí z něj nastavení pro zvolený režim.
 *
 * config.json má:
 *   - společná nastavení (nahoře),
 *   - "mode"  = PŘEPÍNAČ režimu (kiosk / skladem),
 *   - "modes" = rozdíly pro jednotlivé režimy (kiosk, skladem, ...).
 *
 * Režim se nastavuje natvrdo v config.json:
 *   "mode": "kiosk"    = prodejní kiosek s objednávkou
 *   "mode": "skladem"  = jen katalog
 */

// array_is_list() je až od PHP 8.1 - pro starší PHP si ji doplníme
if (!function_exists('array_is_list')) {
    function array_is_list(array $a): bool
    {
        return $a === [] || array_keys($a) === range(0, count($a) - 1);
    }
}

/**
 * Sloučí dvě pole: hodnoty z $override přepíšou $base.
 * Vnořené objekty (např. "data", "order") se slučují po klíčích,
 * seznamy (např. "stockIntervals") se nahradí celé.
 */
function kiosk_merge(array $base, array $override): array
{
    foreach ($override as $key => $value) {
        $bothAreObjects = is_array($value) && !array_is_list($value)
            && isset($base[$key]) && is_array($base[$key]) && !array_is_list($base[$key]);

        $base[$key] = $bothAreObjects ? kiosk_merge($base[$key], $value) : $value;
    }
    return $base;
}

function kiosk_load_config(): array
{
    $raw = json_decode((string) @file_get_contents(__DIR__ . '/config.json'), true);
    if (!is_array($raw)) {
        $raw = [];
    }

    $modes = (isset($raw['modes']) && is_array($raw['modes'])) ? $raw['modes'] : [];

    // Režim je natvrdo v config.json ("mode": "kiosk" / "skladem")
    $mode = $raw['mode'] ?? '';
    if (!isset($modes[$mode])) {
        $mode = array_key_first($modes) ?? 'kiosk';   // neznámá hodnota -> první režim
    }

    // Společná nastavení bez pomocných klíčů
    $common = $raw;
    unset($common['modes'], $common['mode'], $common['_napoveda']);

    $config = kiosk_merge($common, $modes[$mode] ?? []);
    $config['mode'] = $mode;

    return $config;
}
