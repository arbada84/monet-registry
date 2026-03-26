/**
 * CockroachDB 공통 DB 레이어
 *
 * 싱글톤 Pool + press_feeds CRUD 함수
 * docs/cockroachdb-guide.md 패턴 기반
 */
import { Pool } from "pg";

// ── 싱글톤 Pool ──

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const url = process.env.COCKROACH_DATABASE_URL;
    if (!url) {
      throw new Error(
        "[cockroach-db] COCKROACH_DATABASE_URL 환경변수가 설정되지 않았습니다"
      );
    }
    pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on("error", () => {
      pool = null;
    });
  }
  return pool;
}

// ── PressFeed 인터페이스 ──

export interface PressFeed {
  id: string;
  source: string;
  source_no: number;
  title: string;
  url: string;
  date: string | null;
  category: string | null;
  company: string | null;
  summary: string | null;
  body_html: string | null;
  thumbnail: string | null;
  images: string[];
  tags: string[];
  crawled_at: string;
  registered: boolean;
  article_id: string | null;
}

// ── 내부: 행 파싱 ──

function parsePressFeedRow(row: Record<string, unknown>): PressFeed {
  return {
    ...(row as Omit<PressFeed, "images" | "tags">),
    images: safeJsonArray(row.images),
    tags: safeJsonArray(row.tags),
  } as PressFeed;
}

function safeJsonArray(val: unknown): string[] {
  if (Array.isArray(val)) return val as string[];
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

// ── CRUD 함수 ──

/**
 * 목록 조회 (press-import 뉴스와이어 탭용)
 */
export async function getPressFeeds(options: {
  source?: string;
  category?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: PressFeed[]; total: number }> {
  const { source, category, search, page = 1, pageSize = 20 } = options;
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let idx = 1;

  if (source) {
    conditions.push(`source = $${idx++}`);
    values.push(source);
  }
  if (category) {
    conditions.push(`category = $${idx++}`);
    values.push(category);
  }
  if (search) {
    conditions.push(`title ILIKE $${idx++}`);
    values.push(`%${search}%`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const offset = (page - 1) * pageSize;

  const countResult = await getPool().query(
    `SELECT COUNT(*) FROM press_feeds ${where}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // COUNT 쿼리에 사용한 values 복사 후 LIMIT/OFFSET 추가
  const dataValues = [...values, pageSize, offset];
  const dataResult = await getPool().query(
    `SELECT * FROM press_feeds ${where} ORDER BY crawled_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    dataValues
  );

  return { items: dataResult.rows.map(parsePressFeedRow), total };
}

/**
 * 단건 조회 (detail API용 — URL 기준)
 */
export async function getPressFeedByUrl(
  url: string
): Promise<PressFeed | null> {
  const result = await getPool().query(
    "SELECT * FROM press_feeds WHERE url = $1 LIMIT 1",
    [url]
  );
  return result.rows.length > 0 ? parsePressFeedRow(result.rows[0]) : null;
}

/**
 * 미등록 건 조회 (auto-press용)
 */
export async function getUnregisteredFeeds(options: {
  keywords?: string[];
  dateFrom?: string;
  limit?: number;
}): Promise<PressFeed[]> {
  const { keywords, dateFrom, limit = 20 } = options;
  const conditions: string[] = ["registered = false"];
  const values: (string | number)[] = [];
  let idx = 1;

  if (dateFrom) {
    conditions.push(`date >= $${idx++}`);
    values.push(dateFrom);
  }
  if (keywords && keywords.length > 0) {
    const kwConditions = keywords.map(() => `title ILIKE $${idx++}`);
    conditions.push(`(${kwConditions.join(" OR ")})`);
    values.push(...keywords.map((kw) => `%${kw}%`));
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  values.push(limit);

  const result = await getPool().query(
    `SELECT * FROM press_feeds ${where} ORDER BY crawled_at DESC LIMIT $${idx}`,
    values
  );
  return result.rows.map(parsePressFeedRow);
}

/**
 * 등록 완료 표시 (auto-press 기사 등록 후 호출)
 */
export async function markAsRegistered(
  feedId: string,
  articleId: string
): Promise<void> {
  await getPool().query(
    "UPDATE press_feeds SET registered = true, article_id = $1 WHERE id = $2",
    [articleId, feedId]
  );
}
