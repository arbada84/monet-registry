-- =============================================
-- 컬처피플 CMS Supabase 스키마
-- =============================================

-- 기사 테이블
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '뉴스',
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '게시',
  views INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL DEFAULT '',
  thumbnail TEXT DEFAULT '',
  tags TEXT DEFAULT '',
  author TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  slug TEXT DEFAULT '',
  meta_description TEXT DEFAULT '',
  og_image TEXT DEFAULT '',
  scheduled_publish_at TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 댓글 테이블
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  article_id TEXT REFERENCES articles(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 기자 테이블
CREATE TABLE IF NOT EXISTS reporters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  beat TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 카테고리 테이블
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 배포 로그 테이블
CREATE TABLE IF NOT EXISTS distribute_logs (
  id TEXT PRIMARY KEY,
  article_id TEXT REFERENCES articles(id) ON DELETE SET NULL,
  article_title TEXT NOT NULL,
  portal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 조회 로그 테이블
CREATE TABLE IF NOT EXISTS view_logs (
  id BIGSERIAL PRIMARY KEY,
  article_id TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 뉴스레터 구독자
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 사이트 설정 (key-value)
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 광고 슬롯
CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  code TEXT DEFAULT '',
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 팝업/배너
CREATE TABLE IF NOT EXISTS popups (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  enabled BOOLEAN DEFAULT false,
  start_date TEXT,
  end_date TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 메뉴
CREATE TABLE IF NOT EXISTS menus (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  parent_id TEXT REFERENCES menus(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 헤드라인 기사 (순서가 있는 목록)
CREATE TABLE IF NOT EXISTS headline_articles (
  id SERIAL PRIMARY KEY,
  article_id TEXT REFERENCES articles(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date DESC);
CREATE INDEX IF NOT EXISTS idx_view_logs_article_id ON view_logs(article_id);
CREATE INDEX IF NOT EXISTS idx_view_logs_created_at ON view_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_distribute_logs_created_at ON distribute_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_article_id ON comments(article_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);

-- 조회수 원자적 증가 함수
CREATE OR REPLACE FUNCTION increment_views(article_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE articles SET views = views + 1 WHERE id = article_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS (Row Level Security) 정책
-- 기본적으로 모든 테이블에 RLS 활성화하되, 서비스 키 사용 시 우회 가능
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE view_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE distribute_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- 공개 읽기 정책 (기사, 댓글은 모두 읽기 가능)
CREATE POLICY "articles_public_read" ON articles FOR SELECT USING (true);
CREATE POLICY "comments_public_read" ON comments FOR SELECT USING (true);
CREATE POLICY "view_logs_public_insert" ON view_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "view_logs_public_read" ON view_logs FOR SELECT USING (true);

-- 댓글은 누구나 작성 가능 (관리자 승인 필요)
CREATE POLICY "comments_public_insert" ON comments FOR INSERT WITH CHECK (true);

-- 사이트 설정은 공개 읽기 가능 (프론트엔드에서 설정 로드)
CREATE POLICY "site_settings_public_read" ON site_settings FOR SELECT USING (true);

-- 인증된 사용자만 쓰기 가능
CREATE POLICY "articles_auth_write" ON articles FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "comments_auth_write" ON comments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "distribute_logs_auth_all" ON distribute_logs FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "site_settings_auth_all" ON site_settings FOR ALL USING (auth.role() = 'authenticated');
