#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_BACKUP_ROOT = path.join(os.homedir(), "culturepeople-backups");
const DEFAULT_SQLITE_FILE = path.join("merged", "culturepeople.sqlite");

function parseArgs(argv) {
  const flags = new Set();
  const values = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

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

  return { flags, values, positionals };
}

function printHelp() {
  console.log(`Usage: node scripts/create-local-backup-sqlite.mjs [backup-dir] [options]

Creates a single SQLite snapshot from an existing CulturePeople local backup.
The script reads local JSON files only; it does not contact remote services.

Options:
  --root <dir>        Backup root. Default: ${DEFAULT_BACKUP_ROOT}
  --latest            Use the newest timestamped backup under --root.
  --out <file>        SQLite output. Default: <backup-dir>/${DEFAULT_SQLITE_FILE}
  --sqlite-bin <cmd>  sqlite3 command. Default: sqlite3
  --sql-out <file>    Also write the SQL import script to this file.
  --keep-sql          Keep a SQL import script beside the SQLite file.
`);
}

function expandHome(value) {
  const text = String(value || "");
  if (text === "~") return os.homedir();
  if (text.startsWith("~/")) return path.join(os.homedir(), text.slice(2));
  return text;
}

function latestBackupDir(root) {
  if (!fs.existsSync(root)) return "";
  return fs.readdirSync(root)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T/.test(name))
    .map((name) => path.join(root, name))
    .filter((item) => fs.existsSync(path.join(item, "backup-manifest.json")))
    .sort()
    .at(-1) || "";
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/\u0000/g, "").replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "NULL";
}

function sqlBool(value) {
  if (value === null || value === undefined) return "NULL";
  return value ? "1" : "0";
}

function jsonText(value) {
  return JSON.stringify(value ?? null);
}

function insert(table, values) {
  const columns = Object.keys(values);
  return `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((column) => values[column]).join(", ")});`;
}

function listTableFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      table: name.replace(/\.json$/, ""),
      file: path.join(dirPath, name),
    }));
}

function resolveBackupDir({ root, positionals, flags }) {
  const explicit = positionals[0];
  if (explicit) return path.resolve(expandHome(explicit));
  if (flags.has("latest") || root) return latestBackupDir(root);
  return latestBackupDir(root);
}

function buildSql({ backupDir, sqliteFile }) {
  const backupManifest = readJson(path.join(backupDir, "backup-manifest.json"), {});
  const d1Manifest = readJson(path.join(backupDir, "raw", "d1", "export-manifest.json"), {});
  const supabaseManifest = readJson(path.join(backupDir, "raw", "supabase", "export-manifest.json"), {});
  const articles = readJson(path.join(backupDir, "merged", "articles.json"), []);
  const mergeReport = readJson(path.join(backupDir, "merged", "merge-report.json"), {});
  const mediaCandidates = readJson(path.join(backupDir, "merged", "media-candidates.json"), []);
  const mediaManifest = readJson(path.join(backupDir, "media", "media-manifest.json"), {});
  const mediaFiles = Array.isArray(mediaManifest.files) ? mediaManifest.files : [];

  if (!Array.isArray(articles)) {
    throw new Error(`merged/articles.json must be an array under ${backupDir}`);
  }

  const lines = [
    "PRAGMA foreign_keys=OFF;",
    "PRAGMA journal_mode=OFF;",
    "PRAGMA synchronous=OFF;",
    "BEGIN IMMEDIATE;",
    "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    `CREATE TABLE articles (
      article_index INTEGER PRIMARY KEY,
      id TEXT,
      no INTEGER,
      title TEXT,
      category TEXT,
      status TEXT,
      date TEXT,
      created_at TEXT,
      updated_at TEXT,
      slug TEXT,
      source_url TEXT,
      thumbnail TEXT,
      og_image TEXT,
      author TEXT,
      views INTEGER,
      source_database TEXT,
      duplicate_source_count INTEGER NOT NULL DEFAULT 0,
      article_json TEXT NOT NULL
    );`,
    `CREATE TABLE article_duplicate_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kept_article_index INTEGER NOT NULL,
      source_database TEXT,
      source_id TEXT,
      no INTEGER,
      title TEXT,
      source_url TEXT,
      duplicate_key TEXT,
      duplicate_json TEXT NOT NULL,
      FOREIGN KEY (kept_article_index) REFERENCES articles(article_index)
    );`,
    `CREATE TABLE raw_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_database TEXT NOT NULL,
      table_name TEXT NOT NULL,
      source_id TEXT,
      row_json TEXT NOT NULL
    );`,
    `CREATE TABLE media_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      download_allowed INTEGER,
      skip_reason TEXT,
      references_json TEXT NOT NULL,
      candidate_json TEXT NOT NULL
    );`,
    `CREATE TABLE media_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      status TEXT,
      url TEXT,
      url_hash TEXT,
      content_hash TEXT,
      file TEXT,
      media_store_file TEXT,
      bytes INTEGER,
      http_status INTEGER,
      error TEXT,
      attempts INTEGER,
      file_json TEXT NOT NULL
    );`,
  ];

  const metadata = {
    sqlite_file: sqliteFile,
    sqlite_generated_at: new Date().toISOString(),
    backup_dir: backupDir,
    backup_generated_at: backupManifest.generated_at || "",
    backup_completed_at: backupManifest.completed_at || "",
    backup_manifest_json: jsonText(backupManifest),
    d1_manifest_json: jsonText(d1Manifest),
    supabase_manifest_json: jsonText(supabaseManifest),
    merge_report_json: jsonText(mergeReport),
  };
  for (const [key, value] of Object.entries(metadata)) {
    lines.push(insert("metadata", {
      key: sqlString(key),
      value: sqlString(value),
    }));
  }

  articles.forEach((article, index) => {
    const duplicateSources = Array.isArray(article?.backup_meta?.duplicate_sources)
      ? article.backup_meta.duplicate_sources
      : [];
    const articleIndex = index + 1;
    lines.push(insert("articles", {
      article_index: sqlNumber(articleIndex),
      id: sqlString(article?.id),
      no: sqlNumber(article?.no),
      title: sqlString(article?.title),
      category: sqlString(article?.category),
      status: sqlString(article?.status),
      date: sqlString(article?.date),
      created_at: sqlString(article?.created_at),
      updated_at: sqlString(article?.updated_at),
      slug: sqlString(article?.slug),
      source_url: sqlString(article?.source_url),
      thumbnail: sqlString(article?.thumbnail),
      og_image: sqlString(article?.og_image),
      author: sqlString(article?.author),
      views: sqlNumber(article?.views),
      source_database: sqlString(article?.backup_meta?.source_database),
      duplicate_source_count: sqlNumber(duplicateSources.length),
      article_json: sqlString(jsonText(article)),
    }));

    for (const duplicate of duplicateSources) {
      lines.push(insert("article_duplicate_sources", {
        kept_article_index: sqlNumber(articleIndex),
        source_database: sqlString(duplicate?.source_database),
        source_id: sqlString(duplicate?.id),
        no: sqlNumber(duplicate?.no),
        title: sqlString(duplicate?.title),
        source_url: sqlString(duplicate?.source_url),
        duplicate_key: sqlString(duplicate?.duplicate_key),
        duplicate_json: sqlString(jsonText(duplicate)),
      }));
    }
  });

  for (const source of ["d1", "supabase"]) {
    const tablesDir = path.join(backupDir, "raw", source, "tables");
    for (const tableFile of listTableFiles(tablesDir)) {
      const rows = readJson(tableFile.file, []);
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        lines.push(insert("raw_rows", {
          source_database: sqlString(source),
          table_name: sqlString(tableFile.table),
          source_id: sqlString(row?.id ?? row?.no ?? row?.key),
          row_json: sqlString(jsonText(row)),
        }));
      }
    }
  }

  if (Array.isArray(mediaCandidates)) {
    for (const candidate of mediaCandidates) {
      lines.push(insert("media_candidates", {
        url: sqlString(candidate?.url),
        download_allowed: sqlBool(candidate?.download_allowed),
        skip_reason: sqlString(candidate?.skip_reason),
        references_json: sqlString(jsonText(candidate?.references || [])),
        candidate_json: sqlString(jsonText(candidate)),
      }));
    }
  }

  for (const file of mediaFiles) {
    lines.push(insert("media_files", {
      status: sqlString(file?.status),
      url: sqlString(file?.url),
      url_hash: sqlString(file?.url_hash),
      content_hash: sqlString(file?.content_hash),
      file: sqlString(file?.file),
      media_store_file: sqlString(file?.media_store_file),
      bytes: sqlNumber(file?.bytes),
      http_status: sqlNumber(file?.http_status),
      error: sqlString(file?.error),
      attempts: sqlNumber(file?.attempts),
      file_json: sqlString(jsonText(file)),
    }));
  }

  lines.push(
    "CREATE INDEX idx_articles_no ON articles(no);",
    "CREATE INDEX idx_articles_slug ON articles(slug);",
    "CREATE INDEX idx_articles_date ON articles(date);",
    "CREATE INDEX idx_articles_source_database ON articles(source_database);",
    "CREATE INDEX idx_raw_rows_source_table ON raw_rows(source_database, table_name);",
    "CREATE INDEX idx_media_files_status ON media_files(status);",
    "COMMIT;",
    "PRAGMA integrity_check;",
  );

  return {
    sql: lines.join("\n") + "\n",
    counts: {
      articles: articles.length,
      articleDuplicateSources: articles.reduce((sum, article) => (
        sum + (Array.isArray(article?.backup_meta?.duplicate_sources) ? article.backup_meta.duplicate_sources.length : 0)
      ), 0),
      rawRows: listTableFiles(path.join(backupDir, "raw", "d1", "tables")).reduce((sum, file) => {
        const rows = readJson(file.file, []);
        return sum + (Array.isArray(rows) ? rows.length : 0);
      }, 0) + listTableFiles(path.join(backupDir, "raw", "supabase", "tables")).reduce((sum, file) => {
        const rows = readJson(file.file, []);
        return sum + (Array.isArray(rows) ? rows.length : 0);
      }, 0),
      mediaCandidates: Array.isArray(mediaCandidates) ? mediaCandidates.length : 0,
      mediaFiles: mediaFiles.length,
    },
  };
}

function runSqlite({ sqliteBin, sqliteFile, sql }) {
  if (fs.existsSync(sqliteFile)) fs.rmSync(sqliteFile, { force: true });
  const output = execFileSync(sqliteBin, [sqliteFile], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  }).trim();
  if (!output.split(/\r?\n/).includes("ok")) {
    throw new Error(`SQLite integrity_check did not report ok. Output: ${output || "(empty)"}`);
  }
}

function readSqliteCount({ sqliteBin, sqliteFile, table }) {
  const output = execFileSync(sqliteBin, [sqliteFile, `SELECT COUNT(*) FROM ${table};`], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  }).trim();
  return Number(output);
}

function main() {
  const { flags, values, positionals } = parseArgs(process.argv.slice(2));
  if (flags.has("help") || flags.has("h")) {
    printHelp();
    return;
  }

  const root = path.resolve(expandHome(values.root || DEFAULT_BACKUP_ROOT));
  const backupDir = resolveBackupDir({ root, positionals, flags });
  if (!backupDir || !fs.existsSync(path.join(backupDir, "backup-manifest.json"))) {
    throw new Error(`No local backup found. Checked: ${backupDir || root}`);
  }

  const sqliteFile = path.resolve(
    expandHome(values.out || path.join(backupDir, DEFAULT_SQLITE_FILE)),
  );
  const sqlOut = values["sql-out"]
    ? path.resolve(expandHome(values["sql-out"]))
    : (flags.has("keep-sql") ? `${sqliteFile}.sql` : "");
  const sqliteBin = values["sqlite-bin"] || "sqlite3";
  ensureDir(path.dirname(sqliteFile));

  const built = buildSql({ backupDir, sqliteFile });
  if (sqlOut) {
    ensureDir(path.dirname(sqlOut));
    fs.writeFileSync(sqlOut, built.sql, "utf8");
  }
  runSqlite({ sqliteBin, sqliteFile, sql: built.sql });

  const verified = {
    articles: readSqliteCount({ sqliteBin, sqliteFile, table: "articles" }),
    rawRows: readSqliteCount({ sqliteBin, sqliteFile, table: "raw_rows" }),
    mediaFiles: readSqliteCount({ sqliteBin, sqliteFile, table: "media_files" }),
  };

  console.log(JSON.stringify({
    ok: true,
    backupDir,
    sqliteFile,
    sqlFile: sqlOut || null,
    counts: built.counts,
    verified,
  }, null, 2));
}

main();
