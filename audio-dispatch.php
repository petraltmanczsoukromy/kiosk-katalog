<?php
/**
 * audio-dispatch.php
 * Odešle hlášku do skladu přes AWS S3 AudioDispatch V2.
 * Konfigurace se načítá z config-aws.php (není v gitu).
 *
 * Voláno z submit-order.php po úspěšném odeslání objednávky.
 * Pokud selže, objednávka je již odeslána — chyba se jen zaloguje.
 */

$config_file = __DIR__ . '/config-aws.php';
if (!file_exists($config_file)) return; // config chybí, tiché přeskočení

require_once __DIR__ . '/vendor/autoload.php';

use Aws\S3\S3Client;
use Aws\Exception\AwsException;

$cfg = require $config_file;

$S3_PREFIX = 'audio-dispatch/v2/inbox/';
$HLAŠKA    = 'Nová objednávka z kiosku';
$REPEAT    = 1;

// ── Sestavení JSON payloadu ──────────────────────────────────
$dispatch_id = 'kiosk-' . bin2hex(random_bytes(8));

$payload = json_encode([
    'v'          => 2,
    'id'         => $dispatch_id,
    'createdUtc' => gmdate('Y-m-d\TH:i:s\Z'),
    'target'     => ['deviceId' => $cfg['device_id']],
    'payload'    => ['text' => $HLAŠKA, 'repeat' => $REPEAT],
], JSON_UNESCAPED_UNICODE);

$s3_key = $S3_PREFIX . $dispatch_id . '.json';

// ── Logování ─────────────────────────────────────────────────
$log_dir = __DIR__ . '/order-logs';
if (!is_dir($log_dir)) @mkdir($log_dir, 0777, true);

try {
    $s3 = new S3Client([
        'version'     => 'latest',
        'region'      => $cfg['aws_region'],
        'credentials' => [
            'key'    => $cfg['aws_key'],
            'secret' => $cfg['aws_secret'],
        ],
    ]);

    $s3->putObject([
        'Bucket'      => $cfg['aws_bucket'],
        'Key'         => $s3_key,
        'Body'        => $payload,
        'ContentType' => 'application/json',
    ]);

    @file_put_contents("$log_dir/audio-dispatch.log",
        sprintf("[%s] OK id=%s\n", date('c'), $dispatch_id),
        FILE_APPEND
    );

} catch (AwsException $e) {
    @file_put_contents("$log_dir/audio-dispatch.log",
        sprintf("[%s] CHYBA id=%s: %s\n", date('c'), $dispatch_id, $e->getMessage()),
        FILE_APPEND
    );
} catch (Exception $e) {
    @file_put_contents("$log_dir/audio-dispatch.log",
        sprintf("[%s] CHYBA id=%s: %s\n", date('c'), $dispatch_id, $e->getMessage()),
        FILE_APPEND
    );
}