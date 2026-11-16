<?php
declare(strict_types=1);

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Vary: Origin');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$origins = ['https://intrawallet.nova-studios.ch', 'https://localhost'];
if ($origin !== '') {
    if (!in_array($origin, $origins, true)) stop(403);
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Headers: X-EODHD-Token');
    header('Access-Control-Allow-Methods: GET, OPTIONS');
}
$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method === 'OPTIONS') stop(204);
if ($method !== 'GET') stop(405);
$path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);

function stop(int $status): never {
    http_response_code($status);
    exit;
}

function send(array $value): never {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($value, JSON_THROW_ON_ERROR);
    exit;
}

function upstream(string $url, string $accept = 'application/json', bool $stream = false): array {
    $body = '';
    $line = null;
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => ['Accept: ' . $accept],
        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body, &$line, $stream): int {
            $body .= $chunk;
            if (strlen($body) > ($stream ? 32768 : 5 * 1024 * 1024)) return 0;
            if ($stream && preg_match('/^data:[ \t]*([^\r\n]+)\r?\n/m', $body, $match)) {
                $line = trim($match[1]);
                return 0;
            }
            return strlen($chunk);
        },
    ]);
    $ok = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    return [$status ?: 502, $stream ? ($line ?? '') : ($ok ? $body : '')];
}

function loadJson(string $url): never {
    [$status, $body] = upstream($url);
    if ($status >= 400 && $status <= 599) stop($status);
    $value = json_decode($body, true);
    if ($status !== 200 || !is_array($value)) stop(502);
    send($value);
}

function tradegatePrice(mixed $value): ?float {
    if (is_string($value)) $value = str_replace(',', '.', trim($value));
    if (!is_numeric($value)) return null;
    $price = (float) $value;
    return is_finite($price) && $price > 0 ? $price : null;
}

function tradegateRows(string $html): array {
    preg_match_all('~<tr\b[^>]*>(.*?)</tr>~is', $html, $rows);
    return array_map(static function (string $row): array {
        preg_match_all('~<t[dh]\b[^>]*>(.*?)</t[dh]>~is', $row, $cells);
        return array_map(static fn(string $cell): string => trim(str_replace('&nbsp;', ' ', strip_tags($cell))), $cells[1]);
    }, $rows[1]);
}

try {
    if (preg_match('~^/market/eodhd/(search|eod)/([^/]+)$~D', $path ?? '', $route)) {
        $key = $_SERVER['HTTP_X_EODHD_TOKEN'] ?? '';
        $value = rawurldecode($route[2]);
        $search = $route[1] === 'search';
        if (!preg_match('/^[a-zA-Z0-9._-]{1,128}$/D', $key) || in_array($value, ['.', '..'], true)
            || !preg_match($search ? "/^[\p{L}\p{N} .&()'_-]{1,100}$/uD" : '/^[A-Z0-9][A-Z0-9._-]{0,63}$/D', $value)) stop(400);
        $params = ['api_token' => $key, 'fmt' => 'json'];
        foreach ($search ? ['limit'] : ['from', 'to', 'period', 'order'] as $name) {
            $arg = $_GET[$name] ?? '';
            if (is_string($arg) && preg_match('/^[a-z0-9-]{1,10}$/D', $arg)) $params[$name] = $arg;
        }
        loadJson('https://eodhd.com/api/' . $route[1] . '/' . rawurlencode($value) . '?' . http_build_query($params));
    }

    switch ($path) {
        case '/market/coinmarketcap/quotes':
            $rawIds = $_GET['id'] ?? '';
            if (!is_string($rawIds) || strlen($rawIds) > 32) stop(400);
            $ids = explode(',', $rawIds);
            if (array_diff($ids, ['1', '1027', '5426', '22974', '5690'])) stop(400);
            loadJson('https://pro-api.coinmarketcap.com/public-api/v3/cryptocurrency/quotes/latest?' .
                http_build_query(['id' => implode(',', array_unique($ids)), 'convert' => 'CHF']));
        case '/market/six/etf-closings':
            $query = http_build_query(['select' => 'ISIN,ValorSymbol,TradingBaseCurrency,ClosingPrice,LatestTradeDate,MarketDate,Exchange',
                'where' => 'ProductLine=ET', 'pagesize' => 10000]);
            foreach (['/fqs/closing.json', '/itf/fqs/delayed/closing.json'] as $endpoint) {
                [$status, $body] = upstream('https://www.six-group.com' . $endpoint . '?' . $query);
                if ($status === 429) stop(429);
                $data = json_decode($body, true);
                if ($status === 200 && is_array($data['colNames'] ?? null) && !empty($data['rowData'])) send($data);
            }
            stop(502);
        case '/market/xetra/nqse':
            [$status, $body] = upstream('https://api.boerse-frankfurt.de/v1/data/price_information?isin=IE00BYVQ9F29&mic=XETR',
                'text/event-stream', true);
            $data = json_decode($body, true);
            if ($status !== 200 || ($data['isin'] ?? '') !== 'IE00BYVQ9F29'
                || ($data['mic'] ?? '') !== 'XETR' || ($data['currency']['originalValue'] ?? '') !== 'EUR') stop(502);
            send($data);
        case '/market/tradegate/vusa':
            $base = 'https://www.tradegatebsx.com/';
            $query = '?isin=IE00B3XXRP09';
            $receivedAt = (int) (microtime(true) * 1000);
            [$status, $html] = upstream($base . 'orderbuch_umsaetze.php' . $query, 'text/html');
            if ($status === 200 && preg_match('~<tbody\b[^>]*\bid=["\']umsaetze_body["\'][^>]*>(.*?)</tbody>~is', $html, $match)) {
                foreach (tradegateRows($match[1]) as $row) {
                    if (count($row) !== 5 || !preg_match('/^\d{2}:\d{2}:\d{2}(?:,\d{3})?$/D', $row[1])) continue;
                    $clock = strlen($row[1]) === 8 ? $row[1] . ',000' : $row[1];
                    $at = DateTimeImmutable::createFromFormat('!d.m.Y H:i:s,v', $row[0] . ' ' . $clock, new DateTimeZone('Europe/Berlin'));
                    $price = tradegatePrice($row[4]);
                    if ($at && $at->format('d.m.Y H:i:s,v') === $row[0] . ' ' . $clock
                        && (int) $at->format('Uv') <= $receivedAt && $price !== null) {
                        send(['price' => $price, 'sourceAt' => (int) $at->format('Uv'), 'receivedAt' => $receivedAt]);
                    }
                }
            }
            [$status, $html] = upstream($base . 'orderbuch.php' . $query, 'text/html');
            $rows = tradegateRows($html);
            if ($status === 200 && preg_match('/ETF\s*\(transparent\)/i', $html)) {
                $verified = false;
                $price = null;
                foreach ($rows as $row) {
                    if (array_slice($row, 0, 4) === ['A1JX53', 'VUSA', 'IE00B3XXRP09', 'EUR']) $verified = true;
                    if (($row[0] ?? '') === 'Last') $price = tradegatePrice($row[1] ?? null);
                }
                if ($verified && $price !== null) send(['price' => $price, 'receivedAt' => $receivedAt]);
            }
            stop(502);
        default:
            stop(404);
    }
} catch (Throwable) {
    stop(502);
}
