SET NAMES utf8;

-- Create tables
CREATE TABLE IF NOT EXISTS articles (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    category VARCHAR(50) NOT NULL,
    `date` VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT '게시',
    views INT DEFAULT 0,
    body TEXT,
    thumbnail TEXT,
    tags VARCHAR(500) DEFAULT '',
    author VARCHAR(100) DEFAULT '',
    summary TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS comments (
    id VARCHAR(50) PRIMARY KEY,
    articleId VARCHAR(50),
    articleTitle VARCHAR(500),
    author VARCHAR(100),
    content TEXT,
    `date` VARCHAR(20),
    status VARCHAR(20) DEFAULT 'pending',
    ip VARCHAR(50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS categories (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100),
    parentId VARCHAR(50) DEFAULT '',
    sortOrder INT DEFAULT 0,
    visible TINYINT DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE IF NOT EXISTS reporters (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(50),
    department VARCHAR(50),
    title VARCHAR(50),
    bio TEXT,
    active TINYINT DEFAULT 1,
    articleCount INT DEFAULT 0,
    joinDate VARCHAR(20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Insert categories
INSERT IGNORE INTO categories (id, name, slug, parentId, sortOrder, visible) VALUES
('cat-1', '뉴스', 'news', '', 1, 1),
('cat-2', '연예', 'entertainment', '', 2, 1),
('cat-3', '스포츠', 'sports', '', 3, 1),
('cat-4', '문화', 'culture', '', 4, 1),
('cat-5', '라이프', 'life', '', 5, 1),
('cat-6', '포토', 'photo', '', 6, 1),
('cat-7', '경제', 'economy', '', 7, 1);

-- Insert reporters
INSERT IGNORE INTO reporters (id, name, email, phone, department, title, bio, active, articleCount, joinDate) VALUES
('rpt-1', '김문화', 'kim@culturepeople.co.kr', '010-1234-5678', '문화부', '부장', '문화예술 분야 10년 경력 기자', 1, 120, '2024-01-01'),
('rpt-2', '이연예', 'lee@culturepeople.co.kr', '010-2345-6789', '연예부', '기자', 'K-POP, 드라마, 영화 담당', 1, 85, '2024-03-15'),
('rpt-3', '박스포츠', 'park@culturepeople.co.kr', '010-3456-7890', '스포츠부', '기자', '축구, 야구 등 스포츠 전문', 1, 67, '2024-05-01');

-- Insert comments
INSERT IGNORE INTO comments (id, articleId, articleTitle, author, content, `date`, status, ip) VALUES
('cmt-1', 'sample-1', '2024 한국 문화예술 트렌드 분석', '문화사랑', '좋은 기사 감사합니다. 올해 문화계 동향을 한눈에 볼 수 있어서 유익합니다.', '2024-12-02', 'approved', '192.168.1.10'),
('cmt-2', 'sample-2', '신인 배우 김하늘 인터뷰', '드라마팬', '앞으로 활약이 기대됩니다!', '2024-12-06', 'approved', '192.168.1.20'),
('cmt-3', 'sample-1', '2024 한국 문화예술 트렌드 분석', '스팸봇', '최고의 수익 기회! 지금 바로 클릭하세요...', '2024-12-03', 'spam', '10.0.0.99'),
('cmt-4', 'sample-4', '겨울 여행지 추천 BEST 10', '여행러', '5번 여행지 정보가 좀 다른 것 같은데 확인 부탁드립니다.', '2024-12-13', 'pending', '192.168.1.30');

-- Insert articles (admin sample)
INSERT IGNORE INTO articles (id, title, category, `date`, status, views, body) VALUES
('sample-1', '2024 한국 문화예술 트렌드 분석', '문화', '2024-12-01', '게시', 1520, '올해 한국 문화예술계는 다양한 변화를 겪었습니다...'),
('sample-2', '신인 배우 김하늘 인터뷰', '연예', '2024-12-05', '게시', 3200, '올해 가장 주목받는 신인 배우 김하늘을 만나보았습니다...'),
('sample-3', 'K리그 2025 시즌 전망', '스포츠', '2024-12-10', '임시저장', 870, '2025 시즌 K리그의 전력 변화를 분석합니다...'),
('sample-4', '겨울 여행지 추천 BEST 10', '라이프', '2024-12-12', '게시', 4100, '올 겨울 가볼 만한 국내 여행지를 소개합니다...'),
('sample-5', '국립중앙박물관 특별전 포토', '포토', '2024-12-14', '게시', 2300, '국립중앙박물관에서 열린 특별전의 현장 사진입니다...');

-- Insert articles (news grid)
INSERT IGNORE INTO articles (id, title, category, `date`, status, views) VALUES
('grid-1', '정부, 2026년 하반기 경제 정책 방향 발표', '뉴스', '2026-02-14', '게시', 0),
('grid-2', '서울시, 대규모 도시 재생 프로젝트 착수', '뉴스', '2026-02-14', '게시', 0),
('grid-3', 'IT 업계, AI 인재 확보 전쟁 심화', '뉴스', '2026-02-14', '게시', 0),
('grid-4', '주요 대학 입시 제도 개편안 확정', '뉴스', '2026-02-14', '게시', 0),
('grid-5', '한국은행, 기준금리 동결 결정 배경', '경제', '2026-02-14', '게시', 0),
('grid-6', '글로벌 반도체 수급 안정세 전망', '경제', '2026-02-14', '게시', 0);

-- Insert articles (best)
INSERT IGNORE INTO articles (id, title, category, `date`, status, views) VALUES
('best-1', '2026년 부동산 시장 전망과 투자 전략', '경제', '2026-02-14', '게시', 0),
('best-2', '건강보험 개편안, 달라지는 혜택 총정리', '뉴스', '2026-02-14', '게시', 0),
('best-3', 'AI가 바꾸는 일상: 생활 속 인공지능 활용법', '뉴스', '2026-02-14', '게시', 0),
('best-4', '올해 주목할 해외여행 트렌드 5가지', '라이프', '2026-02-14', '게시', 0),
('best-5', '퇴직 후 재취업, 성공하는 사람들의 비결', '라이프', '2026-02-14', '게시', 0);

-- Insert articles (sports/region)
INSERT IGNORE INTO articles (id, title, category, `date`, status, views) VALUES
('sports-1', '프로야구 2026 시즌 개막전 일정 확정', '스포츠', '2026-02-14', '게시', 0),
('sports-2', '손흥민, 리그 10호 골 폭발적 활약', '스포츠', '2026-02-14', '게시', 0),
('sports-3', '여자 배구 올스타전 팬 투표 시작', '스포츠', '2026-02-14', '게시', 0),
('region-1', '부산 해운대 관광특구 야간 축제 개최', '뉴스', '2026-02-14', '게시', 0),
('region-2', '제주도 감귤 수확량 역대 최고 기록', '뉴스', '2026-02-14', '게시', 0),
('region-3', '대구 도심 재개발 사업 주민 설명회', '뉴스', '2026-02-14', '게시', 0);

-- Insert articles (category news - 뉴스)
INSERT IGNORE INTO articles (id, title, category, `date`, status, views) VALUES
('cn-1', '국회, 2026년 추경 예산안 심사 착수', '뉴스', '2026-02-14', '게시', 0),
('cn-2', '수도권 신도시 교통 대책 마련 촉구', '뉴스', '2026-02-14', '게시', 0),
('cn-3', '중소기업 디지털 전환 지원 정책 확대', '뉴스', '2026-02-13', '게시', 0),
('cn-4', '환경부, 탄소중립 실행 계획 2단계 발표', '뉴스', '2026-02-13', '게시', 0),
('cn-5', '지방자치단체 재정 건전성 평가 결과 공개', '뉴스', '2026-02-12', '게시', 0),
('cn-6', '외교부, 한미 정상회담 일정 조율 중', '뉴스', '2026-02-12', '게시', 0);

-- Insert articles (category news - 연예)
INSERT IGNORE INTO articles (id, title, category, `date`, status, views) VALUES
('ce-1', '신예 배우 김하늘, 칸 영화제 초청작 주연 발탁', '연예', '2026-02-14', '게시', 0),
('ce-2', '아이돌 그룹 스타라이즈 월드투어 전석 매진', '연예', '2026-02-14', '게시', 0),
('ce-3', '넷플릭스 한국 오리지널 시리즈 글로벌 1위', '연예', '2026-02-13', '게시', 0),
('ce-4', '예능 프로그램 함께 살아요 시청률 20% 돌파', '연예', '2026-02-13', '게시', 0),
('ce-5', '베테랑 가수 이정현, 30주년 기념 콘서트 개최', '연예', '2026-02-12', '게시', 0),
('ce-6', '한국 웹툰 원작 할리우드 영화 제작 확정', '연예', '2026-02-12', '게시', 0);
