import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, it } from "vitest";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

it("bounds recent lookups by date and historical queue replay checks by source even without statistics", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const name of ["0001_initial_schema", "0002_auto_press_observability", "0003_auto_press_queue_controls", "0004_auto_press_duplicate_guards", "0008_public_read_indexes", "0009_auto_press_recent_lookup"]) {
      db.exec(readFileSync(`cloudflare/d1/migrations/${name}.sql`, "utf8"));
    }
    for (const [query, predicate] of [
      ["SELECT title FROM articles WHERE status=? AND deleted_at IS NULL AND created_at>=? ORDER BY created_at DESC", "created_at>?"],
      ["SELECT title FROM articles WHERE deleted_at IS NULL AND created_at>=? ORDER BY created_at DESC", "created_at>?"],
      ["SELECT id FROM auto_press_items WHERE status IN ('ok','queued','running') AND created_at>=? ORDER BY created_at", "created_at>?"],
      ["SELECT id FROM auto_press_items WHERE status='ok' AND source_url=?", "source_url=?"],
    ]) {
      const args = Array.from(query.matchAll(/\?/g), () => "fixture");
      const rows = db.prepare("EXPLAIN QUERY PLAN " + query).all(...args);
      expect(rows.some((r: { detail: string }) => r.detail.startsWith("SEARCH ") && r.detail.includes(predicate))).toBe(true);
    }
  } finally {
    db.close();
  }
});
