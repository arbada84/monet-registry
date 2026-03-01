<?php
/**
 * 이미지 업로드 전용 API (DB 연결 없음)
 * POST ?action=upload-image  multipart/form-data { file }
 * POST ?action=upload-image  application/json    { url }
 *
 * 인증: Authorization: Bearer <UPLOAD_SECRET>
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');

// ── 인증 ──────────────────────────────────────────────────
$secret = getenv('UPLOAD_SECRET') ?: '';
if ($secret !== '') {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!hash_equals('Bearer ' . $secret, $auth)) {
        http_response_code(401);
        exit(json_encode(['success' => false, 'error' => 'Unauthorized']));
    }
}

function ok(array $data): never  { echo json_encode(['success' => true] + $data); exit; }
function fail(string $msg, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'POST') fail('Method not allowed', 405);

$allowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$extMap      = ['image/jpeg' => 'jpg', 'image/png' => 'png',
                'image/gif'  => 'gif', 'image/webp' => 'webp'];
$maxBytes    = 5 * 1024 * 1024; // 5 MB

// ── multipart 파일 업로드 ────────────────────────────────
if (!empty($_FILES['file'])) {
    $f    = $_FILES['file'];
    $mime = mime_content_type($f['tmp_name']) ?: $f['type'];
    if (!in_array($mime, $allowedMime, true)) fail('허용되지 않는 이미지 형식입니다.', 400);
    if ($f['size'] > $maxBytes)               fail('파일 크기는 5MB 이하여야 합니다.', 400);

    $ext  = $extMap[$mime] ?? 'jpg';
    $name = time() . '_' . substr(bin2hex(random_bytes(4)), 0, 8) . '.' . $ext;
    $dir  = __DIR__ . '/uploads/' . date('Y/m');
    if (!is_dir($dir)) mkdir($dir, 0755, true);
    if (!move_uploaded_file($f['tmp_name'], $dir . '/' . $name))
        fail('파일 저장에 실패했습니다.', 500);

    $url = '/uploads/' . date('Y/m') . '/' . $name;
    ok(['url' => $url]);
}

// ── JSON { url } — 외부 이미지 다운로드 후 저장 ────────
$body = json_decode(file_get_contents('php://input'), true) ?? [];
$src  = $body['url'] ?? null;
if (!$src) fail('file 또는 url 필드가 필요합니다.', 400);

// SSRF 방지
$parsed = parse_url($src);
$scheme = $parsed['scheme'] ?? '';
$host   = strtolower($parsed['host'] ?? '');
if (!in_array($scheme, ['http', 'https'], true)) fail('허용되지 않는 URL입니다.', 400);

$blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
if (in_array($host, $blocked, true))     fail('허용되지 않는 URL입니다.', 400);
if (str_starts_with($host, '10.'))       fail('허용되지 않는 URL입니다.', 400);
if (str_starts_with($host, '192.168.')) fail('허용되지 않는 URL입니다.', 400);
if ($host === '169.254.169.254')         fail('허용되지 않는 URL입니다.', 400);

$ctx  = stream_context_create(['http' => [
    'timeout'         => 15,
    'follow_location' => true,
    'header'          => "User-Agent: Mozilla/5.0\r\n",
]]);
$data = @file_get_contents($src, false, $ctx);
if ($data === false || strlen($data) === 0) fail('이미지 다운로드에 실패했습니다.', 400);
if (strlen($data) > $maxBytes)              fail('파일 크기는 5MB 이하여야 합니다.', 400);

$tmpFile = tempnam(sys_get_temp_dir(), 'img');
file_put_contents($tmpFile, $data);
$mime = mime_content_type($tmpFile) ?: 'image/jpeg';
unlink($tmpFile);

if (!in_array($mime, $allowedMime, true)) {
    $urlPath = strtolower(parse_url($src, PHP_URL_PATH) ?? '');
    if (str_ends_with($urlPath, '.png'))       $mime = 'image/png';
    elseif (str_ends_with($urlPath, '.gif'))   $mime = 'image/gif';
    elseif (str_ends_with($urlPath, '.webp'))  $mime = 'image/webp';
    else                                        $mime = 'image/jpeg';
}
$ext  = $extMap[$mime] ?? 'jpg';
$name = time() . '_' . substr(bin2hex(random_bytes(4)), 0, 8) . '.' . $ext;
$dir  = __DIR__ . '/uploads/' . date('Y/m');
if (!is_dir($dir)) mkdir($dir, 0755, true);
file_put_contents($dir . '/' . $name, $data);

$url = '/uploads/' . date('Y/m') . '/' . $name;
ok(['url' => $url]);
