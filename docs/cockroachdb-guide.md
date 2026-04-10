# CockroachDB 사용 가이드

> CockroachDB Cloud + Node.js(pg) 기반. 돈줍 프로젝트 운영 경험에서 검증된 내용.

---

## 1. 연결 설정

```bash
# .env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:26257/DATABASE?sslmode=verify-full
```

```ts
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },  // CockroachDB Cloud 필수
  max: 10,                             // 서버리스는 5~10 권장
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
});

// 연결 끊김 시 자동 복구
pool.on("error", () => { pool = null; });
```

**주의:** `ssl: true`로 하면 인증서 검증 실패로 연결 끊김. 반드시 `{ rejectUnauthorized: false }`.

---

## 2. 기본 CRUD

```ts
// SELECT
const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [userId]);

// INSERT
await pool.query("INSERT INTO users (name, email) VALUES ($1, $2)", [name, email]);

// UPDATE
await pool.query("UPDATE users SET name = $1 WHERE id = $2", [name, id]);

// DELETE
await pool.query("DELETE FROM users WHERE id = $1", [id]);

// UPSERT (있으면 업데이트, 없으면 삽입)
await pool.query(`
  INSERT INTO page_views (page_path, view_date, view_count)
  VALUES ($1, $2, 1)
  ON CONFLICT (page_path, view_date)
  DO UPDATE SET view_count = page_views.view_count + 1
`, [path, today]);
```

---

## 3. 검색 (ILIKE + pg_trgm)

```sql
-- pg_trgm 확장 활성화 (한 번만)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN 인덱스 생성 (ILIKE '%keyword%' 가속)
CREATE INDEX idx_name_trgm ON table_name USING GIN (column_name gin_trgm_ops);
```

```ts
// 한글 검색
const { rows } = await pool.query(
  "SELECT * FROM apt_complexes WHERE apt_name ILIKE $1 LIMIT 50",
  [`%${keyword}%`]
);
```

**팁:** pg_trgm 없이 ILIKE는 순차 스캔(느림). 인덱스 생성 후 `EXPLAIN`으로 확인.

---

## 4. 파라미터화 쿼리 (SQL Injection 방지)

```ts
// 올바름 — 파라미터 바인딩
await pool.query("SELECT * FROM users WHERE email = $1", [email]);

// 위험 — 절대 하지 말 것
await pool.query(`SELECT * FROM users WHERE email = '${email}'`);
```

동적 조건:
```ts
const conditions: string[] = [];
const values: (string | number)[] = [];
let idx = 1;

if (name) { conditions.push(`name ILIKE $${idx++}`); values.push(`%${name}%`); }
if (minYear) { conditions.push(`built_year >= $${idx++}`); values.push(minYear); }

const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
const { rows } = await pool.query(`SELECT * FROM items ${where} LIMIT 50`, values);
```

---

## 5. 서버리스 환경 주의사항 (Vercel/AWS Lambda)

| 항목 | 설정 | 이유 |
|------|------|------|
| 커넥션 풀 max | 5~10 | 서버리스 인스턴스마다 별도 풀 생성 |
| idleTimeout | 20초 | cold start 대비 빠른 해제 |
| 싱글톤 패턴 | 필수 | 함수 호출마다 new Pool() 하면 커넥션 폭발 |
| SSL | `{ rejectUnauthorized: false }` | CockroachDB Cloud 자체서명 인증서 |

```ts
// 싱글톤 패턴
let pool: Pool | null = null;
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 10 });
    pool.on("error", () => { pool = null; });
  }
  return pool;
}
```

---

## 6. Next.js 서버 컴포넌트에서 사용

```ts
// 서버 컴포넌트에서 직접 DB 쿼리 (권장)
export default async function Page() {
  const { rows } = await getPool().query("SELECT * FROM items LIMIT 10");
  return <div>{rows.map(r => <p key={r.id}>{r.name}</p>)}</div>;
}

// 서버 컴포넌트에서 자기 API fetch (비권장 — VERCEL_URL 문제)
// const res = await fetch(`${origin}/api/items`);  ← 하지 말 것
```

---

## 7. CockroachDB와 PostgreSQL 차이점

| 항목 | PostgreSQL | CockroachDB |
|------|-----------|-------------|
| 포트 | 5432 | 26257 |
| SERIAL | 순차 증가 | UUID 기반 (순서 보장 안 됨) |
| pg_trgm | `CREATE EXTENSION` 필요 | 내장 (바로 사용) |
| ENUM | 지원 | 지원하지만 ALTER 제한 |
| 트랜잭션 | ACID | 분산 ACID (더 느릴 수 있음) |
| JSON | jsonb 완전 지원 | jsonb 지원 (일부 함수 제한) |

**ID 생성 권장:** `gen_random_uuid()` 사용 (SERIAL 대신)

```sql
CREATE TABLE items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name STRING NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 8. 마이그레이션 실행

```bash
# 로컬에서 실행 (psql 설치 필요)
psql $DATABASE_URL -f scripts/migrate.sql

# Node.js로 실행 (psql 없을 때)
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query(fs.readFileSync('scripts/migrate.sql', 'utf8')).then(() => { console.log('Done'); pool.end(); });
"
```

---

## 9. 인덱스 전략

```sql
-- 기본 B-tree (정확한 조건, 범위 검색)
CREATE INDEX idx_trade_date ON apt_transactions (trade_date DESC);

-- 복합 인덱스 (자주 함께 사용하는 컬럼)
CREATE INDEX idx_region_date ON apt_transactions (region_code, trade_date DESC);

-- 부분 인덱스 (조건부 — NULL 아닌 것만)
CREATE INDEX idx_change_rate ON apt_transactions (change_rate ASC)
  WHERE change_rate IS NOT NULL;

-- GIN 인덱스 (ILIKE 검색용)
CREATE INDEX idx_name_trgm ON apt_complexes USING GIN (apt_name gin_trgm_ops);

-- 유니크 (중복 방지)
CREATE UNIQUE INDEX idx_unique_tx ON apt_transactions (apt_name, size_sqm, floor, trade_date, trade_price);
```

---

## 10. 환경변수 (Vercel 설정)

Vercel → Settings → Environment Variables:

| 변수명 | 값 | 환경 |
|--------|-----|------|
| `DATABASE_URL` | `postgresql://user:pass@host:26257/db?sslmode=verify-full` | All |

**`NEXT_PUBLIC_` 접두사 절대 붙이지 말 것** — 클라이언트에 DB URL 노출됨.

---

*돈줍 프로젝트 운영 경험 기반 — 2026-03-26*
