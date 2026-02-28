export type ArticleStatus = "게시" | "임시저장" | "예약";

export interface Article {
  id: string;
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
  status: "approved" | "pending";
}

export interface AdminAccount {
  id: string;
  username: string;
  password?: string;
  passwordHash?: string;
  name: string;
  role: string;
  email?: string;
}
