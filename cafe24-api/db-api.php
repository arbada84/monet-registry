<?php
/**
 * Cafe24 PHP API Gateway for MySQL
 * =========================================================
 * 배포 위치 : Cafe24 /www/db-api.php
 * 목적      : Vercel(Next.js)에서 직접 MySQL 접속 불가 문제 해결
 *            (Vercel IP 동적 → Cafe24 IP 화이트리스트 우회)
 * 방식      : Vercel → 이 PHP API(HTTPS, Bearer 인증) → MySQL localhost
 *
 * [설치 방법]
 * 1. 이 파일을 FTP로 Cafe24 /www/db-api.php 에 업로드
 * 2. Cafe24에 .htaccess가 있고 curpy.cafe24.com 을 다른 도메인으로 리다이렉트한다면
 *    .htaccess 에 아래 예외 추가:
 *    RewriteCond %{REQUEST_URI} !^/db-api\.php [NC]
 * 3. Vercel 환경변수 설정:
 *    PHP_API_URL  = https://curpy.cafe24.com/db-api.php
 *    PHP_API_SECRET = cfa45728a7e35c9bab1f292c890fefb0dc8c95ac88e0be369272369287d3424f
 * =========================================================
 */

// ── 설정 ──────────────────────────────────────────────────────────────────────
define('DB_HOST',      'localhost');
define('DB_NAME',      'curpy');
define('DB_USER',      'curpy');
define('DB_PASS',      'yrsr0611!');
// Vercel PHP_API_SECRET 환경변수와 동일하게 맞추세요
define('API_SECRET',   'cfa45728a7e35c9bab1f292c890fefb0dc8c95ac88e0be369272369287d3424f');

// ── CORS / 헤더 ────────────────────────────────────────────────────────────────
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ── 인증 ───────────────────────────────────────────────────────────────────────
// Apache 공유호스팅에서 Authorization 헤더가 스트리핑되는 경우 대비 (REDIRECT_* 폴백)
$authHeader = $_SERVER['HTTP_AUTHORIZATION']
           ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
           ?? (function_exists('apache_request_headers') ? (apache_request_headers()['Authorization'] ?? '') : '');
if ($authHeader !== 'Bearer ' . API_SECRET) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

// ── DB 연결 ────────────────────────────────────────────────────────────────────
try {
    $pdo = new PDO(
        'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4, time_zone='+09:00'",
        ]
    );
} catch (Exception $e) {
    error_log('[db-api] DB connection failed: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit;
}

// ── 요청 파싱 ─────────────────────────────────────────────────────────────────
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$body   = json_decode(file_get_contents('php://input'), true) ?? [];

// ── 헬퍼 함수 ─────────────────────────────────────────────────────────────────
function ok(array $data = []): void
{
    echo json_encode(array_merge(['success' => true], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $msg, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── 라우터 ────────────────────────────────────────────────────────────────────
switch ($action) {

    // =========================================================================
    // ARTICLES
    // =========================================================================
    case 'articles':
        $LIST_COLS = "id, no, title, category, date, status, views, thumbnail, thumbnail_alt, tags, "
                   . "author, author_email, summary, slug, meta_description, og_image, "
                   . "scheduled_publish_at, created_at, updated_at";

        // GET - 목록 or 단건
        if ($method === 'GET') {
            $id  = $_GET['id']  ?? null;
            $no  = isset($_GET['no']) ? (int)$_GET['no'] : null;
            if ($id) {
                $stmt = $pdo->prepare("SELECT * FROM articles WHERE id = ? LIMIT 1");
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) fail('Not found', 404);
                // date/datetime 직렬화
                $row = normalizeArticleRow($row);
                ok(['article' => $row]);
            }
            if ($no !== null) {
                $stmt = $pdo->prepare("SELECT * FROM articles WHERE no = ? LIMIT 1");
                $stmt->execute([$no]);
                $row = $stmt->fetch();
                if (!$row) fail('Not found', 404);
                $row = normalizeArticleRow($row);
                ok(['article' => $row]);
            }
            $stmt = $pdo->query("SELECT {$LIST_COLS} FROM articles ORDER BY date DESC, created_at DESC");
            $articles = $stmt->fetchAll();
            $articles = array_map('normalizeArticleRow', $articles);
            ok(['articles' => $articles]);
        }

        // POST - 기사 생성
        if ($method === 'POST') {
            $a = $body;
            $stmt = $pdo->prepare(
                "INSERT INTO articles
                    (id, no, title, category, date, status, views, body, thumbnail, thumbnail_alt, tags,
                     author, author_email, summary, slug, meta_description, og_image,
                     scheduled_publish_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
            );
            $stmt->execute([
                $a['id']                ?? null,
                isset($a['no']) ? (int)$a['no'] : null,
                $a['title']             ?? '',
                $a['category']          ?? '',
                $a['date']              ?? date('Y-m-d'),
                $a['status']            ?? '임시저장',
                $a['views']             ?? 0,
                $a['body']              ?? '',
                $a['thumbnail']         ?? null,
                $a['thumbnailAlt']      ?? null,
                $a['tags']              ?? null,
                $a['author']            ?? null,
                $a['authorEmail']       ?? null,
                $a['summary']           ?? null,
                $a['slug']              ?? null,
                $a['metaDescription']   ?? null,
                $a['ogImage']           ?? null,
                $a['scheduledPublishAt'] ?? null,
            ]);
            ok();
        }

        // PATCH - 기사 수정
        if ($method === 'PATCH') {
            $id = $body['id'] ?? null;
            if (!$id) fail('id required');

            // camelCase → snake_case 매핑
            $map = [
                'title'                => 'title',
                'category'             => 'category',
                'date'                 => 'date',
                'status'               => 'status',
                'views'                => 'views',
                'body'                 => 'body',
                'thumbnail'            => 'thumbnail',
                'thumbnail_alt'        => 'thumbnailAlt',
                'tags'                 => 'tags',
                'author'               => 'author',
                'author_email'         => 'authorEmail',
                'summary'              => 'summary',
                'slug'                 => 'slug',
                'meta_description'     => 'metaDescription',
                'og_image'             => 'ogImage',
                'scheduled_publish_at' => 'scheduledPublishAt',
            ];

            $fields = [];
            $values = [];
            foreach ($map as $col => $prop) {
                if (array_key_exists($prop, $body)) {
                    $fields[] = "{$col} = ?";
                    $values[] = $body[$prop] ?? null;
                }
            }
            if (empty($fields)) ok();
            $values[] = $id;
            $pdo->prepare("UPDATE articles SET " . implode(', ', $fields) . " WHERE id = ?")
                ->execute($values);
            ok();
        }

        // DELETE - 기사 삭제
        if ($method === 'DELETE') {
            $id = $_GET['id'] ?? null;
            if (!$id) fail('id required');
            $pdo->prepare("DELETE FROM articles WHERE id = ?")->execute([$id]);
            ok();
        }

        fail('Method not allowed', 405);

    // =========================================================================
    // ARTICLE VIEWS (조회수 증가)
    // =========================================================================
    case 'article-views':
        if ($method === 'POST') {
            $id = $body['id'] ?? $_GET['id'] ?? null;
            if (!$id) fail('id required');
            $pdo->prepare("UPDATE articles SET views = views + 1 WHERE id = ?")
                ->execute([$id]);
            ok();
        }
        fail('Method not allowed', 405);

    // =========================================================================
    // SETTINGS (site_settings 키-값 저장소)
    // =========================================================================
    case 'settings':
        if ($method === 'GET') {
            $key = $_GET['key'] ?? null;
            if (!$key) fail('key required');
            $stmt = $pdo->prepare("SELECT value FROM site_settings WHERE `key` = ? LIMIT 1");
            $stmt->execute([$key]);
            $row = $stmt->fetch();
            $value = $row ? json_decode($row['value'], true) : null;
            ok(['value' => $value]);
        }
        if ($method === 'PUT') {
            $key   = $body['key']   ?? null;
            $value = $body['value'] ?? null;
            if (!$key) fail('key required');
            $json = json_encode($value, JSON_UNESCAPED_UNICODE);
            $pdo->prepare(
                "INSERT INTO site_settings (`key`, value) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP"
            )->execute([$key, $json]);
            ok();
        }
        fail('Method not allowed', 405);

    // =========================================================================
    // VIEW LOGS
    // =========================================================================
    case 'view-logs':
        if ($method === 'GET') {
            $stmt = $pdo->query(
                "SELECT article_id, path, created_at
                 FROM view_logs ORDER BY created_at DESC LIMIT 10000"
            );
            $rows = $stmt->fetchAll();
            $logs = array_map(fn($r) => [
                'articleId' => $r['article_id'],
                'timestamp' => is_object($r['created_at'])
                    ? $r['created_at']->format('c')
                    : (string)$r['created_at'],
                'path'      => $r['path'],
            ], $rows);
            ok(['logs' => $logs]);
        }
        if ($method === 'POST') {
            $articleId = $body['articleId'] ?? null;
            $path      = $body['path'] ?? '/';
            if (!$articleId) fail('articleId required');
            $pdo->prepare("INSERT INTO view_logs (article_id, path) VALUES (?, ?)")
                ->execute([$articleId, $path]);
            ok();
        }
        fail('Method not allowed', 405);

    // =========================================================================
    // DISTRIBUTE LOGS
    // =========================================================================
    case 'distribute-logs':
        if ($method === 'GET') {
            $stmt = $pdo->query(
                "SELECT * FROM distribute_logs ORDER BY created_at DESC LIMIT 100"
            );
            $rows = $stmt->fetchAll();
            $logs = array_map(fn($r) => [
                'id'           => $r['id'],
                'articleId'    => $r['article_id'],
                'articleTitle' => $r['article_title'],
                'portal'       => $r['portal'],
                'status'       => $r['status'],
                'timestamp'    => is_object($r['created_at'])
                    ? $r['created_at']->format('c')
                    : (string)$r['created_at'],
                'message'      => $r['message'],
            ], $rows);
            ok(['logs' => $logs]);
        }
        if ($method === 'POST') {
            $logs = $body['logs'] ?? [];
            if (!is_array($logs) || empty($logs)) fail('logs array required');
            $stmt = $pdo->prepare(
                "INSERT INTO distribute_logs
                    (id, article_id, article_title, portal, status, message)
                 VALUES (?,?,?,?,?,?)"
            );
            foreach ($logs as $l) {
                $stmt->execute([
                    $l['id']           ?? '',
                    $l['articleId']    ?? '',
                    $l['articleTitle'] ?? '',
                    $l['portal']       ?? '',
                    $l['status']       ?? 'pending',
                    $l['message']      ?? '',
                ]);
            }
            ok();
        }
        if ($method === 'DELETE') {
            $pdo->exec("DELETE FROM distribute_logs");
            ok();
        }
        fail('Method not allowed', 405);

    // =========================================================================
    // 이미지 업로드 (multipart/form-data POST)
    // Vercel 서버리스는 파일시스템 쓰기 불가 → PHP가 Cafe24에 저장
    // =========================================================================
    case 'upload-image':
        if ($method !== 'POST') fail('Method not allowed', 405);

        $allowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        $extMap      = ['image/jpeg' => 'jpg', 'image/png' => 'png',
                        'image/gif' => 'gif',  'image/webp' => 'webp'];
        $maxBytes    = 5 * 1024 * 1024; // 5MB

        // multipart 파일 업로드
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

        // JSON {url} — 외부 이미지 다운로드 후 저장
        $src = $body['url'] ?? null;
        if (!$src) fail('file 또는 url 필드가 필요합니다.', 400);

        // SSRF 방지
        $parsed = parse_url($src);
        if (!in_array($parsed['scheme'] ?? '', ['http', 'https'], true)) fail('허용되지 않는 URL입니다.', 400);
        $host = strtolower($parsed['host'] ?? '');
        if (in_array($host, ['localhost', '127.0.0.1', '::1'], true)) fail('허용되지 않는 URL입니다.', 400);

        $ctx  = stream_context_create(['http' => ['timeout' => 15, 'follow_location' => true]]);
        $data = @file_get_contents($src, false, $ctx);
        if ($data === false || strlen($data) === 0) fail('이미지 다운로드에 실패했습니다.', 400);
        if (strlen($data) > $maxBytes)              fail('파일 크기는 5MB 이하여야 합니다.', 400);

        $tmpFile = tempnam(sys_get_temp_dir(), 'img');
        file_put_contents($tmpFile, $data);
        $mime = mime_content_type($tmpFile) ?: 'image/jpeg';
        unlink($tmpFile);

        if (!in_array($mime, $allowedMime, true)) {
            // URL 확장자로 추측
            $urlPath = strtolower(parse_url($src, PHP_URL_PATH) ?? '');
            if (str_ends_with($urlPath, '.png'))  $mime = 'image/png';
            elseif (str_ends_with($urlPath, '.gif'))  $mime = 'image/gif';
            elseif (str_ends_with($urlPath, '.webp')) $mime = 'image/webp';
            else $mime = 'image/jpeg';
        }
        $ext  = $extMap[$mime] ?? 'jpg';
        $name = time() . '_' . substr(bin2hex(random_bytes(4)), 0, 8) . '.' . $ext;
        $dir  = __DIR__ . '/uploads/' . date('Y/m');
        if (!is_dir($dir)) mkdir($dir, 0755, true);
        file_put_contents($dir . '/' . $name, $data);

        $url = '/uploads/' . date('Y/m') . '/' . $name;
        ok(['url' => $url]);

    // =========================================================================
    // DB 스키마 초기화 (테이블이 없을 때 한 번만 실행)
    // =========================================================================
    case 'migrate':
        if ($method !== 'POST') fail('Method not allowed', 405);
        $results = [];

        $sqls = [
            // articles
            "CREATE TABLE IF NOT EXISTS articles (
              id                   VARCHAR(36)   NOT NULL,
              no                   INT UNSIGNED  NULL,
              title                VARCHAR(500)  NOT NULL,
              category             VARCHAR(100)  DEFAULT '뉴스',
              date                 DATE          NOT NULL,
              status               VARCHAR(20)   DEFAULT '임시저장',
              views                INT           DEFAULT 0,
              body                 LONGTEXT,
              thumbnail            LONGTEXT,
              thumbnail_alt        VARCHAR(500),
              tags                 VARCHAR(500),
              author               VARCHAR(200),
              author_email         VARCHAR(255),
              summary              TEXT,
              slug                 VARCHAR(200),
              meta_description     VARCHAR(200),
              og_image             VARCHAR(500),
              scheduled_publish_at DATETIME,
              created_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
              updated_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              INDEX idx_no       (no),
              INDEX idx_date     (date DESC),
              INDEX idx_status   (status),
              INDEX idx_category (category),
              INDEX idx_slug     (slug)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            // view_logs
            "CREATE TABLE IF NOT EXISTS view_logs (
              id         BIGINT      NOT NULL AUTO_INCREMENT,
              article_id VARCHAR(36) NOT NULL,
              path       VARCHAR(500),
              created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              INDEX idx_article_id (article_id),
              INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            // distribute_logs
            "CREATE TABLE IF NOT EXISTS distribute_logs (
              id            VARCHAR(36)  NOT NULL,
              article_id    VARCHAR(36),
              article_title VARCHAR(500),
              portal        VARCHAR(100),
              status        VARCHAR(20),
              message       TEXT,
              created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              INDEX idx_article_id (article_id),
              INDEX idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            // site_settings
            "CREATE TABLE IF NOT EXISTS site_settings (
              `key`      VARCHAR(200) NOT NULL,
              value      LONGTEXT,
              updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`key`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            // 기본 어드민 계정
            "INSERT IGNORE INTO site_settings (`key`, value) VALUES (
              'cp-admin-accounts',
              '[{\"id\":\"acc-1\",\"username\":\"admin\",\"password\":\"admin1234\",\"name\":\"관리자\",\"role\":\"superadmin\"}]'
            )",

            // author_email 컬럼 추가 (마이그레이션)
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_email VARCHAR(255) AFTER author",
            // thumbnail_alt 컬럼 추가 (마이그레이션)
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS thumbnail_alt VARCHAR(500) AFTER thumbnail",
            // no 컬럼 추가 (마이그레이션) — 순서 번호
            "ALTER TABLE articles ADD COLUMN IF NOT EXISTS no INT UNSIGNED NULL AFTER id",
            // no 인덱스
            "ALTER TABLE articles ADD INDEX IF NOT EXISTS idx_no (no)",
        ];

        foreach ($sqls as $i => $sql) {
            try {
                $pdo->exec($sql);
                $results[] = ['sql' => $i, 'ok' => true];
            } catch (Exception $e) {
                $results[] = ['sql' => $i, 'ok' => false, 'error' => $e->getMessage()];
            }
        }

        // FULLTEXT 인덱스 (없는 경우에만 추가)
        try {
            $chk = $pdo->query("SHOW INDEX FROM articles WHERE Key_name = 'ft_articles_search'")->fetch();
            if (!$chk) {
                $pdo->exec("ALTER TABLE articles ADD FULLTEXT INDEX ft_articles_search (title, summary, tags)");
                $results[] = ['sql' => 'fulltext', 'ok' => true];
            } else {
                $results[] = ['sql' => 'fulltext', 'ok' => true, 'note' => 'already exists'];
            }
        } catch (Exception $e) {
            $results[] = ['sql' => 'fulltext', 'ok' => false, 'error' => $e->getMessage()];
        }

        ok(['results' => $results]);

    // =========================================================================
    // 기본 - 헬스체크
    // =========================================================================
    case 'ping':
        ok(['pong' => true, 'time' => date('c')]);

    default:
        fail('Unknown action', 404);
}

// ── 헬퍼: MySQL 행의 날짜/시간 타입 직렬화 ────────────────────────────────────
function normalizeArticleRow(array $r): array
{
    if (isset($r['date']) && $r['date'] instanceof DateTime) {
        $r['date'] = $r['date']->format('Y-m-d');
    }
    if (isset($r['scheduled_publish_at']) && $r['scheduled_publish_at'] instanceof DateTime) {
        $r['scheduled_publish_at'] = $r['scheduled_publish_at']->format('c');
    }
    if (isset($r['created_at']) && $r['created_at'] instanceof DateTime) {
        $r['created_at'] = $r['created_at']->format('c');
    }
    if (isset($r['updated_at']) && $r['updated_at'] instanceof DateTime) {
        $r['updated_at'] = $r['updated_at']->format('c');
    }
    return $r;
}
