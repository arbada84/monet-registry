import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("D1 backup keyset pagination", () => {
  it("exports composite primary keys without OFFSET, skips or duplicates", async () => {
    const { exportD1Keyset } = await import("../../scripts/lib/d1-keyset-export.mjs");
    const root = mkdtempSync(join(tmpdir(), "d1-keyset-"));
    const db = join(root, "test.sqlite");
    const python = process.platform === "win32" ? "python" : "python3";
    const run = (sql: string, params: unknown[]) => JSON.parse(execFileSync(python, ["-c",
      "import sqlite3,json,sys; c=sqlite3.connect(sys.argv[1]); c.row_factory=sqlite3.Row; r=c.execute(sys.argv[2],json.loads(sys.argv[3])); print(json.dumps([dict(x) for x in r.fetchall()])); c.commit()",
      db, sql, JSON.stringify(params)], { encoding: "utf8" }));
    try {
      run("CREATE TABLE samples (source TEXT, id INTEGER, PRIMARY KEY(source,id))", []);
      for (const [source, id] of [["a", 1], ["a", 2], ["b", 1], ["b", 2], ["z", 1]]) run("INSERT INTO samples VALUES (?,?)", [source, id]);
      const queries: string[] = [];
      const query = async (sql: string, params: unknown[]) => { queries.push(sql); return run(sql, params); };
      const rows = await exportD1Keyset({ query, table: "samples", pageSize: 2 });
      expect(rows.map((row: { source: string; id: number }) => `${row.source}:${row.id}`)).toEqual(["a:1", "a:2", "b:1", "b:2", "z:1"]);
      expect(queries.join("\n")).not.toContain("OFFSET");
      expect(await exportD1Keyset({ query, table: "samples", pageSize: 2, maxRows: 3 })).toHaveLength(3);
      run("CREATE TABLE unstable (value TEXT)", []);
      await expect(exportD1Keyset({ query, table: "unstable", pageSize: 2 })).rejects.toThrow("stable primary key");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
