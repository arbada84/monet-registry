#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULT_DATABASE = "culturepeople-prod";
const DEFAULT_REPORT = "cloudflare/d1/import/article-renumber-preview.json";
const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

function parseArgs(argv) {
  const flags = new Set();
  const values = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      values[key] = inlineValue;
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      values[key] = next;
      i += 1;
    } else {
      flags.add(key);
    }
  }

  return { flags, values };
}

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const values = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && value) values[key] = value;
  }
  return values;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function summarizeCloudflareErrors(json) {
  const errors = Array.isArray(json?.errors) ? json.errors : [];
  return errors.map((error) => error.message).filter(Boolean).join("; ") || "unknown error";
}

async function cloudflareRequest({ accountId, apiToken, endpoint, method = "GET", body }) {
  const response = await fetch(`${CLOUDFLARE_API_BASE}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { success: false, errors: [{ message: text || response.statusText }] };
  }
  return {
    ok: response.ok && json.success !== false,
    status: response.status,
    json,
  };
}

async function resolveD1DatabaseId({ accountId, apiToken, database }) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(database)) {
    return database;
  }

  const result = await cloudflareRequest({
    accountId,
    apiToken,
    endpoint: `/accounts/${accountId}/d1/database`,
  });

  if (!result.ok) {
    throw new Error(`D1 list failed (${result.status}): ${summarizeCloudflareErrors(result.json)}`);
  }

  const databases = Array.isArray(result.json.result) ? result.json.result : [];
  const found = databases.find((item) => item.name === database);
  if (!found?.uuid) throw new Error(`D1 database not found: ${database}`);
  return found.uuid;
}

async function d1Query({ accountId, apiToken, databaseId, sql, params = [] }) {
  const result = await cloudflareRequest({
    accountId,
    apiToken,
    endpoint: `/accounts/${accountId}/d1/database/${databaseId}/query`,
    method: "POST",
    body: { sql, params },
  });

  if (!result.ok) {
    throw new Error(`D1 query failed (${result.status}): ${summarizeCloudflareErrors(result.json)}`);
  }

  const first = Array.isArray(result.json.result) ? result.json.result[0] : null;
  return Array.isArray(first?.results) ? first.results : [];
}

function buildRankedSql({ scope }) {
  const where = scope === "active" ? "WHERE deleted_at IS NULL" : "";
  return `
    SELECT
      id,
      no AS old_no,
      ROW_NUMBER() OVER (
        ORDER BY
          COALESCE(NULLIF(date, ''), created_at, id) ASC,
          COALESCE(NULLIF(created_at, ''), date, id) ASC,
          id ASC
      ) AS new_no,
      title,
      status,
      date,
      created_at,
      deleted_at
    FROM articles
    ${where}
  `;
}

function toSampleRows(rows, limit = 12) {
  return rows.slice(0, limit).map((row) => ({
    id: row.id,
    oldNo: Number(row.old_no),
    newNo: Number(row.new_no),
    delta: Number(row.new_no) - Number(row.old_no),
    date: row.date,
    createdAt: row.created_at,
    status: row.status,
    deleted: Boolean(row.deleted_at),
    title: row.title,
  }));
}

async function inspectMapping(config) {
  const rankedSql = buildRankedSql({ scope: config.scope });
  const rows = await d1Query({
    ...config,
    sql: `
      WITH ranked AS (${rankedSql})
      SELECT * FROM ranked ORDER BY new_no ASC
    `,
  });
  const changed = rows.filter((row) => Number(row.old_no) !== Number(row.new_no));
  const oldNoSet = new Set(rows.map((row) => Number(row.old_no)));
  const newNoSet = new Set(rows.map((row) => Number(row.new_no)));
  const duplicateNewNoCount = rows.length - newNoSet.size;
  const missingOldNoCount = rows.filter((row) => row.old_no === null || row.old_no === undefined).length;
  const overlapCount = [...newNoSet].filter((newNo) => oldNoSet.has(newNo)).length;
  const maxNewNo = rows.reduce((max, row) => Math.max(max, Number(row.new_no) || 0), 0);

  const summary = await d1Query({
    ...config,
    sql: `
      SELECT
        COUNT(*) AS total_articles,
        SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) AS active_articles,
        SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) AS deleted_articles,
        MIN(no) AS min_no,
        MAX(no) AS max_no,
        COUNT(DISTINCT no) AS distinct_no,
        MIN(date) AS min_date,
        MAX(date) AS max_date,
        SUM(CASE WHEN no < 0 THEN 1 ELSE 0 END) AS negative_no_count
      FROM articles
    `,
  });

  const statusDistribution = await d1Query({
    ...config,
    sql: `
      SELECT
        COALESCE(status, '') AS status,
        CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'deleted' END AS state,
        COUNT(*) AS count,
        MIN(no) AS min_no,
        MAX(no) AS max_no,
        MIN(date) AS min_date,
        MAX(date) AS max_date
      FROM articles
      GROUP BY status, state
      ORDER BY state, status
    `,
  });

  const largestMoves = [...changed]
    .sort((a, b) => Math.abs(Number(b.new_no) - Number(b.old_no)) - Math.abs(Number(a.new_no) - Number(a.old_no)))
    .slice(0, 20);

  const newest = [...rows].slice(-10).reverse();
  const oldest = rows.slice(0, 10);

  return {
    summary: summary[0] || {},
    statusDistribution,
    mapping: {
      scope: config.scope,
      totalRows: rows.length,
      changedRows: changed.length,
      unchangedRows: rows.length - changed.length,
      duplicateNewNoCount,
      missingOldNoCount,
      maxNewNo,
      oldNewNamespaceOverlapCount: overlapCount,
      oldUrlCollisionRisk: overlapCount > 0,
    },
    samples: {
      oldestAfterRenumber: toSampleRows(oldest, 10),
      newestAfterRenumber: toSampleRows(newest, 10),
      largestMoves: toSampleRows(largestMoves, 20),
    },
  };
}

async function ensureOperationTables(config) {
  await d1Query({
    ...config,
    sql: `
      CREATE TABLE IF NOT EXISTS article_no_renumber_operations (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        applied INTEGER NOT NULL DEFAULT 0,
        rows_total INTEGER NOT NULL DEFAULT 0,
        rows_changed INTEGER NOT NULL DEFAULT 0,
        max_new_no INTEGER NOT NULL DEFAULT 0,
        report_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        applied_at TEXT,
        rolled_back_at TEXT
      )
    `,
  });
  await d1Query({
    ...config,
    sql: `
      CREATE TABLE IF NOT EXISTS article_no_renumber_map (
        operation_id TEXT NOT NULL,
        article_id TEXT NOT NULL,
        old_no INTEGER NOT NULL,
        new_no INTEGER NOT NULL,
        title TEXT,
        status TEXT,
        date TEXT,
        created_at TEXT,
        deleted_at TEXT,
        PRIMARY KEY (operation_id, article_id)
      )
    `,
  });
  await d1Query({
    ...config,
    sql: "CREATE INDEX IF NOT EXISTS idx_article_no_renumber_map_old_no ON article_no_renumber_map(operation_id, old_no)",
  });
  await d1Query({
    ...config,
    sql: "CREATE INDEX IF NOT EXISTS idx_article_no_renumber_map_new_no ON article_no_renumber_map(operation_id, new_no)",
  });
}

async function applyRenumber(config, inspection) {
  if (Number(inspection.summary.negative_no_count || 0) > 0) {
    throw new Error("Refusing to apply while negative article numbers exist. A previous renumber operation may be incomplete.");
  }
  if (inspection.mapping.duplicateNewNoCount > 0) {
    throw new Error(`Refusing to apply because generated numbers are duplicated: ${inspection.mapping.duplicateNewNoCount}`);
  }
  if (inspection.mapping.missingOldNoCount > 0) {
    throw new Error(`Refusing to apply because some rows have no current article number: ${inspection.mapping.missingOldNoCount}`);
  }
  if (config.scope !== "all") {
    throw new Error("Live renumbering must use --scope all to avoid UNIQUE conflicts with deleted rows.");
  }

  const operationId = `article-renumber-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}`;
  const rankedSql = buildRankedSql({ scope: config.scope });
  const now = new Date().toISOString();

  await ensureOperationTables(config);
  await d1Query({
    ...config,
    sql: `
      INSERT INTO article_no_renumber_operations
        (id, scope, reason, applied, rows_total, rows_changed, max_new_no, report_json, created_at)
      VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)
    `,
    params: [
      operationId,
      config.scope,
      config.reason,
      inspection.mapping.totalRows,
      inspection.mapping.changedRows,
      inspection.mapping.maxNewNo,
      JSON.stringify(inspection),
      now,
    ],
  });
  await d1Query({
    ...config,
    sql: `
      INSERT INTO article_no_renumber_map
        (operation_id, article_id, old_no, new_no, title, status, date, created_at, deleted_at)
      SELECT ?, id, old_no, new_no, title, status, date, created_at, deleted_at
      FROM (${rankedSql})
    `,
    params: [operationId],
  });

  const mapCheck = await d1Query({
    ...config,
    sql: `
      SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT new_no) AS distinct_new_no,
        COUNT(DISTINCT old_no) AS distinct_old_no
      FROM article_no_renumber_map
      WHERE operation_id = ?
    `,
    params: [operationId],
  });
  const checked = mapCheck[0] || {};
  if (
    Number(checked.total) !== inspection.mapping.totalRows ||
    Number(checked.distinct_new_no) !== inspection.mapping.totalRows ||
    Number(checked.distinct_old_no) !== inspection.mapping.totalRows
  ) {
    throw new Error(`Persisted renumber map failed integrity check: ${JSON.stringify(checked)}`);
  }

  // Two-phase update avoids UNIQUE(no) collisions while numbers are being permuted.
  await d1Query({
    ...config,
    sql: `
      UPDATE articles
      SET no = -(
        SELECT new_no FROM article_no_renumber_map
        WHERE operation_id = ? AND article_id = articles.id
      )
      WHERE id IN (
        SELECT article_id FROM article_no_renumber_map WHERE operation_id = ?
      )
    `,
    params: [operationId, operationId],
  });
  await d1Query({
    ...config,
    sql: `
      UPDATE articles
      SET no = -no
      WHERE no < 0
        AND id IN (
          SELECT article_id FROM article_no_renumber_map WHERE operation_id = ?
        )
    `,
    params: [operationId],
  });

  for (const table of ["auto_press_run_items", "auto_press_retry_queue"]) {
    await d1Query({
      ...config,
      sql: `
        UPDATE ${table}
        SET article_no = (
          SELECT new_no FROM article_no_renumber_map
          WHERE operation_id = ? AND article_id = ${table}.article_id
        )
        WHERE article_id IN (
          SELECT article_id FROM article_no_renumber_map WHERE operation_id = ?
        )
      `,
      params: [operationId, operationId],
    });
    await d1Query({
      ...config,
      sql: `
        UPDATE ${table}
        SET article_no = (
          SELECT new_no FROM article_no_renumber_map
          WHERE operation_id = ? AND old_no = ${table}.article_no
        )
        WHERE article_no IN (
          SELECT old_no FROM article_no_renumber_map WHERE operation_id = ?
        )
      `,
      params: [operationId, operationId],
    });
  }

  await d1Query({
    ...config,
    sql: `
      INSERT INTO site_settings (key, value_json, updated_at)
      VALUES ('cp-article-counter', ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `,
    params: [String(inspection.mapping.maxNewNo), now],
  });

  await d1Query({
    ...config,
    sql: `
      UPDATE article_no_renumber_operations
      SET applied = 1, applied_at = ?
      WHERE id = ?
    `,
    params: [now, operationId],
  });

  return operationId;
}

async function rollbackRenumber(config, operationId) {
  if (!operationId) throw new Error("--rollback requires an operation id.");

  await ensureOperationTables(config);
  const operation = await d1Query({
    ...config,
    sql: "SELECT id, applied, rolled_back_at FROM article_no_renumber_operations WHERE id = ? LIMIT 1",
    params: [operationId],
  });
  if (!operation[0]) throw new Error(`Renumber operation not found: ${operationId}`);
  if (Number(operation[0].applied || 0) !== 1) throw new Error(`Renumber operation was not applied: ${operationId}`);
  if (operation[0].rolled_back_at) throw new Error(`Renumber operation was already rolled back: ${operationId}`);

  const integrity = await d1Query({
    ...config,
    sql: `
      SELECT
        COUNT(*) AS total,
        COUNT(DISTINCT old_no) AS distinct_old_no,
        COUNT(DISTINCT new_no) AS distinct_new_no,
        MAX(old_no) AS max_old_no,
        SUM(CASE WHEN old_no < 0 OR new_no < 0 THEN 1 ELSE 0 END) AS negative_map_count
      FROM article_no_renumber_map
      WHERE operation_id = ?
    `,
    params: [operationId],
  });
  const checked = integrity[0] || {};
  if (!Number(checked.total)) throw new Error(`Renumber map is empty: ${operationId}`);
  if (
    Number(checked.total) !== Number(checked.distinct_old_no) ||
    Number(checked.total) !== Number(checked.distinct_new_no) ||
    Number(checked.negative_map_count || 0) > 0
  ) {
    throw new Error(`Renumber rollback map failed integrity check: ${JSON.stringify(checked)}`);
  }

  const current = await d1Query({
    ...config,
    sql: "SELECT SUM(CASE WHEN no < 0 THEN 1 ELSE 0 END) AS negative_no_count FROM articles",
  });
  if (Number(current[0]?.negative_no_count || 0) > 0) {
    throw new Error("Refusing to rollback while negative article numbers exist.");
  }

  await d1Query({
    ...config,
    sql: `
      UPDATE articles
      SET no = -(
        SELECT old_no FROM article_no_renumber_map
        WHERE operation_id = ? AND article_id = articles.id
      )
      WHERE id IN (
        SELECT article_id FROM article_no_renumber_map WHERE operation_id = ?
      )
    `,
    params: [operationId, operationId],
  });
  await d1Query({
    ...config,
    sql: `
      UPDATE articles
      SET no = -no
      WHERE no < 0
        AND id IN (
          SELECT article_id FROM article_no_renumber_map WHERE operation_id = ?
        )
    `,
    params: [operationId],
  });

  for (const table of ["auto_press_run_items", "auto_press_retry_queue"]) {
    await d1Query({
      ...config,
      sql: `
        UPDATE ${table}
        SET article_no = (
          SELECT old_no FROM article_no_renumber_map
          WHERE operation_id = ? AND article_id = ${table}.article_id
        )
        WHERE article_id IN (
          SELECT article_id FROM article_no_renumber_map WHERE operation_id = ?
        )
      `,
      params: [operationId, operationId],
    });
    await d1Query({
      ...config,
      sql: `
        UPDATE ${table}
        SET article_no = (
          SELECT old_no FROM article_no_renumber_map
          WHERE operation_id = ? AND new_no = ${table}.article_no
        )
        WHERE article_no IN (
          SELECT new_no FROM article_no_renumber_map WHERE operation_id = ?
        )
      `,
      params: [operationId, operationId],
    });
  }

  const now = new Date().toISOString();
  await d1Query({
    ...config,
    sql: `
      INSERT INTO site_settings (key, value_json, updated_at)
      VALUES ('cp-article-counter', ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `,
    params: [String(checked.max_old_no), now],
  });
  await d1Query({
    ...config,
    sql: "UPDATE article_no_renumber_operations SET rolled_back_at = ? WHERE id = ?",
    params: [now, operationId],
  });

  return { operationId, restoredMaxNo: Number(checked.max_old_no) };
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2));
  const env = {
    ...readDotEnv(path.resolve(".env.local")),
    ...readDotEnv(path.resolve(".env.production.local")),
    ...process.env,
  };
  const accountId = env.CLOUDFLARE_ACCOUNT_ID || "";
  const apiToken = env.CLOUDFLARE_API_TOKEN || "";
  const database = values.database || env.CLOUDFLARE_D1_PROD_DB || env.D1_DATABASE_NAME || DEFAULT_DATABASE;
  const reportPath = path.resolve(values.out || DEFAULT_REPORT);
  const scope = values.scope || "all";
  const apply = flags.has("apply");
  const rollbackOperationId = values.rollback || "";
  const confirmed = flags.has("confirm-url-renumbering");
  const reason = values.reason || "date_order_article_number_cleanup";

  const report = {
    ok: false,
    generatedAt: new Date().toISOString(),
    database,
    scope,
    apply,
    reportPath,
    warnings: [],
    errors: [],
  };

  try {
    if (!accountId || !apiToken) {
      throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
    }
    if (!["all", "active"].includes(scope)) {
      throw new Error("--scope must be all or active.");
    }
    if (apply && rollbackOperationId) {
      throw new Error("--apply and --rollback cannot be used together.");
    }
    if ((apply || rollbackOperationId) && !confirmed) {
      throw new Error("Live renumbering changes public /article/{no} URLs. Re-run with --confirm-url-renumbering to mutate live data.");
    }

    const databaseId = await resolveD1DatabaseId({ accountId, apiToken, database });
    const config = { accountId, apiToken, databaseId, scope, reason };
    report.databaseId = databaseId;

    if (rollbackOperationId) {
      report.rollback = await rollbackRenumber(config, rollbackOperationId);
      report.postRollback = await inspectMapping(config);
      report.ok = Number(report.postRollback.summary.negative_no_count || 0) === 0;
      if (!report.ok) report.errors.push("Post-rollback verification failed.");
      ensureDir(reportPath);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    const inspection = await inspectMapping(config);
    Object.assign(report, inspection);
    if (inspection.mapping.oldUrlCollisionRisk) {
      report.warnings.push(
        "Existing numeric article URLs overlap the new numeric namespace. Reused numbers can make old shared/search URLs open different articles after apply.",
      );
    }

    if (apply) {
      report.operationId = await applyRenumber(config, inspection);
      report.postApply = await inspectMapping(config);
      report.ok = report.postApply.mapping.changedRows === 0
        && report.postApply.mapping.duplicateNewNoCount === 0
        && Number(report.postApply.summary.negative_no_count || 0) === 0;
      if (!report.ok) report.errors.push("Post-apply verification failed.");
    } else {
      report.ok = inspection.mapping.duplicateNewNoCount === 0 && inspection.mapping.missingOldNoCount === 0;
      report.dryRunMessage = "Dry-run only. Pass --apply --confirm-url-renumbering to update the live D1 article numbers.";
    }
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }

  ensureDir(reportPath);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main();
