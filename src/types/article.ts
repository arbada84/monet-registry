export type ArticleStatus = "게시" | "임시저장" | "예약" | "상신";

export interface Article {
  id: string;
  no?: number;
  title: string;
  category: string;
  date: string;
  status: ArticleStatus;
  views: number;
  body: string;
  thumbnail?: string;
  thumbnailAlt?: string;
  tags?: string;
  author?: string;
  authorEmail?: string;
  summary?: string;
  // SEO fields
  slug?: string;
  metaDescription?: string;
  ogImage?: string;
  // Scheduling
  scheduledPublishAt?: string;
  updatedAt?: string;
  // 보도자료 원문 URL
  sourceUrl?: string;
  // 상신 수정본의 원본 기사 ID
  parentArticleId?: string;
  // 반려 사유
  reviewNote?: string;
  // 상신/승인 이력
  auditTrail?: AuditEntry[];
  // 휴지통 (소프트 삭제)
  deletedAt?: string;
}

export interface AuditEntry {
  action: "상신" | "승인" | "반려" | "게시" | "수정";
  by: string;        // 수행자 이름
  at: string;        // ISO timestamp
  ip?: string;       // IP 주소
  note?: string;     // 비고 (반려 사유 등)
}

export interface ViewLogEntry {
  articleId: string;
  timestamp: string;
  path: string;
}

export interface DistributeLog {
  id: string;
  articleId: string;
  articleTitle: string;
  portal: string;
  status: "success" | "failed" | "pending";
  timestamp: string;
  message: string;
}

export interface AiSettings {
  provider: "openai" | "gemini";
  openaiApiKey: string;
  openaiModel: string;
  geminiApiKey: string;
  geminiModel: string;
  defaultPromptRewrite: string;
  defaultPromptSummarize: string;
  defaultPromptTitle: string;
  pexelsApiKey?: string;
}

export interface AiSkill {
  id: string;
  name: string;
  description: string;
  prompt: string;
  outputTarget: "body" | "summary" | "title" | "meta";
  maxOutputTokens: number;
  temperature: number;
  contentMaxChars: number;
  isBuiltin: boolean;
  styleContext?: string;
  styleContextSummary?: string;
  uploadedFiles: string[];
  learnedUrls: string[];
  lastLearnedAt?: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  articleId: string;
  articleTitle?: string;
  author: string;
  content: string;
  createdAt: string;
  status: "approved" | "pending" | "spam";
  ip?: string;
  parentId?: string; // 답글 지원 (루트 댓글은 undefined)
}

export interface AdminAccount {
  id: string;
  username: string;
  password?: string;
  passwordHash?: string;
  name: string;
  role: "superadmin" | "admin" | "reporter";
  email?: string;
  // 기자 정보 (기존 cp-reporters 통합)
  phone?: string;
  department?: string;
  title?: string;
  photo?: string;
  bio?: string;
  active?: boolean;
  joinDate?: string;
  createdAt?: string;
  lastLogin?: string;
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyHash: string;
  prefix: string;   // 키 앞 12자 (표시용)
  createdAt: string;
}

// ── 자동 뉴스 수집/발행 설정 ──────────────────────────────

export interface AutoNewsRssSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface AutoNewsSettings {
  enabled: boolean;
  sources: AutoNewsRssSource[];
  keywords: string[];          // 기사 필터 키워드 (빈 배열 = 전체)
  category: string;            // 발행 카테고리
  count: number;               // 회당 기사 수 (1-20)
  publishStatus: "게시" | "임시저장";
  aiProvider: "gemini" | "openai";
  aiModel: string;             // gemini-2.0-flash, gpt-4o-mini 등
  author: string;              // 기본 기자명
  cronEnabled: boolean;        // Vercel Cron 활성화 여부
  dedupeWindowHours: number;   // 중복 방지 시간 윈도우 (기본 48)
}

export interface AutoNewsArticleResult {
  title: string;
  sourceUrl: string;
  status: "ok" | "fail" | "dup" | "skip";
  articleId?: string;
  error?: string;
}

export interface AutoNewsRun {
  id: string;
  startedAt: string;
  completedAt: string;
  source: "cron" | "manual" | "cli";
  articlesPublished: number;
  articlesSkipped: number;
  articlesFailed: number;
  articles: AutoNewsArticleResult[];
}

// ── 보도자료 자동 등록 ──
export interface AutoPressSource {
  id: string;
  name: string;
  boTable: "rss" | "newswire";  // netpro board table
  sca: string;                   // 카테고리 필터 (빈 문자열 = 전체)
  enabled: boolean;
}

export interface AutoPressSettings {
  enabled: boolean;
  sources: AutoPressSource[];
  keywords: string[];
  category: string;
  count: number;
  publishStatus: "게시" | "임시저장";
  aiProvider: "gemini" | "openai";
  aiModel: string;
  author: string;
  cronEnabled: boolean;
  dedupeWindowHours: number;
  requireImage: boolean;         // 본문 이미지 없으면 스킵
}

export interface AutoPressArticleResult {
  title: string;
  sourceUrl: string;
  wrId: string;
  boTable: string;
  status: "ok" | "fail" | "dup" | "skip" | "no_image" | "old";
  articleId?: string;
  error?: string;
}

export interface AutoPressRun {
  id: string;
  startedAt: string;
  completedAt: string;
  source: "cron" | "manual" | "cli";
  articlesPublished: number;
  articlesSkipped: number;
  articlesFailed: number;
  articles: AutoPressArticleResult[];
}
