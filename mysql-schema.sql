-- ============================================================
-- 컬처피플 뉴스 사이트 MySQL 스키마
-- 카페24 MySQL 호스팅 기준
-- 문자셋: utf8mb4 (한글 + 이모지 완전 지원)
-- ============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 1. 기사 테이블
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS articles (
  id                   VARCHAR(36)   NOT NULL,
  title                VARCHAR(500)  NOT NULL,
  category             VARCHAR(100)  DEFAULT '뉴스',
  date                 DATE          NOT NULL,
  status               VARCHAR(20)   DEFAULT '임시저장' COMMENT '게시|임시저장|예약',
  views                INT           DEFAULT 0,
  body                 LONGTEXT,
  thumbnail            LONGTEXT      COMMENT 'base64 또는 URL',
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
  INDEX idx_date     (date DESC),
  INDEX idx_status   (status),
  INDEX idx_category (category),
  INDEX idx_slug     (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────
-- 2. 조회수 로그 테이블
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS view_logs (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  article_id VARCHAR(36) NOT NULL,
  path       VARCHAR(500),
  created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_article_id (article_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────
-- 3. 포털 배포 로그 테이블
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS distribute_logs (
  id            VARCHAR(36)  NOT NULL,
  article_id    VARCHAR(36),
  article_title VARCHAR(500),
  portal        VARCHAR(100),
  status        VARCHAR(20)  COMMENT 'success|failed|pending',
  message       TEXT,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_article_id (article_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────
-- 4. 사이트 설정 테이블 (key-value JSON 스토어)
--    어드민 계정, AI 설정, 카테고리, 광고, 메뉴 등 모두 저장
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
  `key`      VARCHAR(200) NOT NULL,
  value      LONGTEXT,
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────
-- 5. 기존 DB 마이그레이션 (신규 컬럼 추가)
--    이미 테이블이 존재하는 경우에만 실행
-- ──────────────────────────────────────────────────────────
-- authorEmail 컬럼 추가 (기존 테이블에 누락된 경우)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_email VARCHAR(255) AFTER author;

-- FULLTEXT 인덱스 (MySQL 5.7+ InnoDB 지원)
-- 신규 테이블 생성 후 추가
ALTER TABLE articles ADD FULLTEXT INDEX ft_articles_search (title, summary, tags);

-- 기존 테이블 FULLTEXT 인덱스 추가 마이그레이션
-- (이미 인덱스가 있는 경우 IF NOT EXISTS로 중복 방지)
ALTER TABLE articles ADD FULLTEXT INDEX IF NOT EXISTS ft_articles_search (title, summary, tags);

-- ──────────────────────────────────────────────────────────
-- 6. 기본 어드민 계정 삽입
--    비밀번호는 첫 로그인 시 자동으로 bcrypt 해시로 변환됩니다.
--    반드시 로그인 후 [계정 관리]에서 비밀번호를 변경하세요.
-- ──────────────────────────────────────────────────────────
INSERT IGNORE INTO site_settings (`key`, value) VALUES (
  'cp-admin-accounts',
  '[{"id":"acc-1","username":"admin","password":"admin1234","name":"관리자","role":"superadmin"}]'
);
