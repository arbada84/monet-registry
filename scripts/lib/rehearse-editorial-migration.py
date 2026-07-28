#!/usr/bin/env python3
import json
import sqlite3
import sys
import tempfile
from pathlib import Path

EXPECTED_TABLES = {
    "editorial_runtime_state",
    "editorial_sources",
    "editorial_source_snapshots",
    "editorial_candidates",
    "editorial_candidate_versions",
    "editorial_claims",
    "editorial_evidence_links",
    "editorial_origin_clusters",
    "editorial_origin_cluster_members",
    "editorial_reviews",
    "editorial_ai_runs",
    "editorial_audit_logs",
    "editorial_corrections",
}


def expect_integrity_error(connection, sql):
    try:
        connection.execute(sql)
    except sqlite3.IntegrityError:
        return True
    return False


def main():
    migration = Path(sys.argv[1]).resolve()
    sql = migration.read_text(encoding="utf-8")
    with tempfile.TemporaryDirectory(prefix="culturepeople-editorial-") as folder:
        database = Path(folder) / "rehearsal.sqlite"
        connection = sqlite3.connect(database)
        connection.executescript(sql)
        connection.executescript(sql)
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'editorial_%'"
            )
        }
        runtime = connection.execute(
            "SELECT feature_enabled, shadow_enabled, draft_enabled, auto_publish_enabled "
            "FROM editorial_runtime_state WHERE singleton = 1"
        ).fetchone()
        auto_publish_guard = expect_integrity_error(
            connection,
            "UPDATE editorial_runtime_state SET auto_publish_enabled = 1 WHERE singleton = 1",
        )
        fixture_guard = expect_integrity_error(
            connection,
            "INSERT INTO editorial_sources "
            "(id, source_type, fixture, evidence_eligible, training_eligible) "
            "VALUES ('fixture-test', 'fixture', 1, 1, 0)",
        )
        foreign_key_check = list(connection.execute("PRAGMA foreign_key_check"))
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        connection.close()

    missing = sorted(EXPECTED_TABLES - tables)
    report = {
        "ok": not missing
        and runtime == (0, 0, 0, 0)
        and auto_publish_guard
        and fixture_guard
        and not foreign_key_check
        and integrity == "ok",
        "migration": migration.name,
        "appliedTwice": True,
        "tableCount": len(tables),
        "missingTables": missing,
        "runtimeDefaults": runtime,
        "autoPublishGuard": auto_publish_guard,
        "fixtureEligibilityGuard": fixture_guard,
        "foreignKeyErrors": foreign_key_check,
        "integrity": integrity,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
