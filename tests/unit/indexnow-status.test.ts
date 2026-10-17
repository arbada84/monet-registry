import { execFileSync } from "node:child_process";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
// @ts-ignore - Node script module.
import { collectIndexNowStatus, INDEXNOW_STATUS_SQL, INDEXNOW_FAILURES_SQL } from "../../scripts/lib/indexnow-status.mjs";

describe("low-load IndexNow status aggregates", () => {
  it("counts active published coverage, deduplicates UUID/no and includes legacy logs", () => {
    const py = `import sqlite3,json,sys
c=sqlite3.connect(':memory:');c.row_factory=sqlite3.Row
c.executescript('CREATE TABLE articles(id TEXT,no INTEGER,status TEXT,deleted_at TEXT); CREATE TABLE distribute_logs(article_id TEXT,portal TEXT,status TEXT,timestamp TEXT,message TEXT); CREATE TABLE site_settings(key TEXT,value_json TEXT);')
c.executemany('INSERT INTO articles VALUES(?,?,?,?)',[('a',1,'게시',None),('b',2,'게시',None),('c',3,'게시',None),('gone',4,'게시','2026-01-01'),('draft',5,'임시저장',None)])
c.executemany('INSERT INTO distribute_logs VALUES(?,?,?,?,?)',[('a','IndexNow','success','2026-10-18',''),('1','IndexNow','success','2026-10-18',''),('c','Google','success','2026-10-18',''),('old','IndexNow','failed','2026-01-01','401'),('recent','IndexNow','failed','2026-10-18T00:00:00Z','HTTP 403')])
c.execute('INSERT INTO site_settings VALUES(?,?)',('cp-distribute-logs',json.dumps([{'articleId':'2','portal':'IndexNow','status':'success'}])))
print(json.dumps(dict(c.execute(sys.argv[1]).fetchone())))
print(json.dumps(dict(c.execute(sys.argv[2],['2026-10-17T00:00:00Z']).fetchone())))
c.execute('UPDATE site_settings SET value_json=?',('invalid-json',))
print(json.dumps(dict(c.execute(sys.argv[1]).fetchone())))`;
    const output = execFileSync(process.platform === "win32" ? "python" : "python3", ["-c", py, INDEXNOW_STATUS_SQL, INDEXNOW_FAILURES_SQL], { encoding: "utf8" });
    const [coverage, failures, malformed] = output.trim().split("\n").map((line) => JSON.parse(line));
    expect(coverage).toEqual({ publishedArticles: 3, successfulLogs: 2, candidates: 1, invalidLegacy: 0 });
    expect(failures).toEqual({ failed: 1, authFailed: 1 });
    expect(malformed.invalidLegacy).toBe(1);
    expect(INDEXNOW_STATUS_SQL).not.toContain("SELECT *");
  }, 30_000);

  it("does not scan all successful keys once for every article", () => {
    const py = `import sqlite3,sys,json
c=sqlite3.connect(':memory:')
c.executescript('CREATE TABLE articles(id TEXT,no INTEGER,status TEXT,deleted_at TEXT); CREATE TABLE distribute_logs(article_id TEXT,portal TEXT,status TEXT,timestamp TEXT,message TEXT); CREATE TABLE site_settings(key TEXT,value_json TEXT);')
print(json.dumps([r[3] for r in c.execute('EXPLAIN QUERY PLAN '+sys.argv[1])]))`;
    const plan = JSON.parse(execFileSync(process.platform === "win32" ? "python" : "python3", ["-c", py, INDEXNOW_STATUS_SQL], { encoding: "utf8" })) as string[];
    expect(plan.join("\n")).not.toContain("CORRELATED SCALAR SUBQUERY");
    expect(plan.filter((row) => row.includes("AUTOMATIC COVERING INDEX"))).toHaveLength(2);
  }, 30_000);

  it("returns numeric zero evidence only from successful explicit query results", async () => {
    const query = vi.fn().mockResolvedValueOnce([{ publishedArticles: 3, successfulLogs: 3, candidates: 0, invalidLegacy: 0 }])
      .mockResolvedValueOnce([{ failed: 0, authFailed: 0 }]);
    expect(await collectIndexNowStatus(query)).toMatchObject({ ok: true, candidates: 0, authFailed: 0, submittedUrls: 0 });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("fails closed for errors, missing aggregates, malformed legacy and unclassified failures", async () => {
    const bad = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ failed: 0, authFailed: 0 }]);
    await expect(collectIndexNowStatus(bad)).rejects.toThrow("Invalid IndexNow aggregate");
    const failing = vi.fn().mockResolvedValueOnce([{ publishedArticles: 1, successfulLogs: 1, candidates: 0, invalidLegacy: 1 }])
      .mockResolvedValueOnce([{ failed: 2, authFailed: 0 }]);
    expect(await collectIndexNowStatus(failing)).toMatchObject({ ok: false, invalidLegacy: 1, unclassifiedFailuresLast24h: 2 });
  });

  it.each(["unavailable", "missing-metrics", "over-budget"])("CLI records blocked evidence on %s without exposing credentials", (scenario) => {
    const root = mkdtempSync(path.join(tmpdir(), "indexnow-status-cli-"));
    try {
      mkdirSync(path.join(root, "scripts/lib"), { recursive: true });
      for (const file of ["scripts/backfill-portal-publication.mjs", "scripts/lib/indexnow-status.mjs"]) copyFileSync(file, path.join(root, file));
      const bootstrap = `globalThis.fetch=async()=>new Response(JSON.stringify(${JSON.stringify(scenario === "unavailable"
        ? { success: false }
        : { success: true, result: [{ success: true, results: [{ publishedArticles: 0, successfulLogs: 0, candidates: 0, invalidLegacy: 0 }], meta: scenario === "missing-metrics" ? {} : { rows_read: 50_001, rows_written: 0 } }] })}),{status:${scenario === "unavailable" ? 503 : 200},headers:{"content-type":"application/json"}});`;
      const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(bootstrap)}`, path.join(root, "scripts/backfill-portal-publication.mjs"), "--status-only", "--source", "d1"], {
        cwd: root, encoding: "utf8", env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: "test-account", CLOUDFLARE_D1_DATABASE_ID: "test-db", CLOUDFLARE_API_TOKEN: "test-only-do-not-print" },
      });
      expect(result.status).toBe(1);
      const reports = readdirSync(path.join(root, ".portal-backfill-runs"));
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatch(/^portal-backfill-blocked-/);
      const text = readFileSync(path.join(root, ".portal-backfill-runs", reports[0]), "utf8");
      expect(JSON.parse(text)).toMatchObject({ ok: false, submittedUrls: 0, blocked: { reason: "INDEXNOW_STATUS_UNAVAILABLE" } });
      expect(text + result.stdout + result.stderr).not.toContain("test-only-do-not-print");
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 30_000);
});
