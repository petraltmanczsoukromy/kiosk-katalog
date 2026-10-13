<?php
/**
 * VZOR konfigurace přístupu k Feedco API.
 *
 * Postup:
 *   1. Zkopíruj tento soubor jako  config-api.php
 *   2. Do config-api.php doplň skutečné údaje
 *   3. config-api.php NIKDY necommituj (je v .gitignore)
 *
 * Proč .php a ne .json / .ini?
 *   Když někdo otevře config-api.php v prohlížeči, PHP ho spustí,
 *   "return [...]" nic nevypíše a návštěvník uvidí prázdnou stránku.
 *   Soubor .json nebo .ini by server poslal jako obyčejný text
 *   - i s heslem.
 */

return [
    'base_url' => 'http://ADRESA-API:PORT/v1',   // bez lomítka na konci
    'login'    => 'DOPLNIT',
    'password' => 'DOPLNIT',
    // Objednávky (submit-order.php). Když chybí, použije se base_url.
    // 8091 = cvičná DB (Jakub) - před ostrým provozem změnit!
    'orders_base_url' => 'http://ADRESA-API:PORT/v1',
    'timeout'  => 6,                              // sekundy
];