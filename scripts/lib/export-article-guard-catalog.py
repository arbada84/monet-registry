#!/usr/bin/env python3
import json
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse


def table_exists(connection, name):
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    ).fetchone()
    return row is not None


def count_rows(connection, table):
    if not table_exists(connection, table):
        return 0
    return connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: export-article-guard-catalog.py <sqlite>")
    database = Path(sys.argv[1]).resolve()
    connection = sqlite3.connect(f"file:{database}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row

    document_groups = []
    if table_exists(connection, "documents"):
        document_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(documents)").fetchall()
        }
        metadata_column = next(
            (name for name in ("metadata_json", "metadata", "extra_json") if name in document_columns),
            None,
        )
        metadata_select = f', "{metadata_column}" AS metadata_value' if metadata_column else ", NULL AS metadata_value"
        rows = connection.execute(
            """
            SELECT document_type, COALESCE(source_name, '') AS source_name,
                   COUNT(*) AS row_count,
                   SUM(CASE WHEN url IS NOT NULL AND TRIM(url) <> '' THEN 1 ELSE 0 END) AS with_url,
                   SUM(CASE WHEN author IS NOT NULL AND TRIM(author) <> '' THEN 1 ELSE 0 END) AS with_author,
                   SUM(CASE WHEN published_at IS NOT NULL AND TRIM(published_at) <> '' THEN 1 ELSE 0 END) AS with_date,
                   MIN(published_at) AS min_published_at,
                   MAX(published_at) AS max_published_at
            FROM documents
            GROUP BY document_type, COALESCE(source_name, '')
            ORDER BY document_type, source_name
            """
        ).fetchall()
        group_details = defaultdict(
            lambda: {"hosts": Counter(), "metadata_keys": Counter(), "fixture_signal_rows": 0}
        )
        detail_rows = connection.execute(
            """
            SELECT document_type, COALESCE(source_name, '') AS source_name, url
            """
            + metadata_select
            + " FROM documents"
        ).fetchall()
        for detail in detail_rows:
            key = (detail["document_type"], detail["source_name"])
            value = group_details[key]
            host = ""
            try:
                host = (urlparse(detail["url"] or "").hostname or "").lower()
            except ValueError:
                host = ""
            if host:
                value["hosts"][host] += 1
            metadata = {}
            raw_metadata = detail["metadata_value"]
            if raw_metadata:
                try:
                    metadata = json.loads(raw_metadata) if isinstance(raw_metadata, str) else {}
                except (TypeError, ValueError):
                    metadata = {}
            if isinstance(metadata, dict):
                value["metadata_keys"].update(str(item) for item in metadata.keys())
            fixture_text = f"{detail['source_name']} {detail['url'] or ''} {raw_metadata or ''}".lower()
            if "harness" in fixture_text or "fixture" in fixture_text or "example.com" in fixture_text:
                value["fixture_signal_rows"] += 1
        for row in rows:
            item = dict(row)
            details = group_details[(item["document_type"], item["source_name"])]
            item["url_hosts"] = [
                {"host": host, "row_count": count}
                for host, count in details["hosts"].most_common()
            ]
            item["metadata_keys"] = sorted(details["metadata_keys"].keys())
            item["fixture_signal_rows"] = details["fixture_signal_rows"]
            document_groups.append(item)

    reviewers = []
    if table_exists(connection, "review_cases"):
        reviewers = [
            dict(row)
            for row in connection.execute(
                """
                SELECT COALESCE(reviewer, '') AS reviewer, COUNT(*) AS row_count
                FROM review_cases GROUP BY COALESCE(reviewer, '') ORDER BY reviewer
                """
            ).fetchall()
        ]

    run_names = {}
    for table in ("risk_assessments", "review_queues", "review_cases"):
        if table_exists(connection, table):
            run_names[table] = [
                dict(row)
                for row in connection.execute(
                    f'SELECT COALESCE(run_name, "") AS run_name, COUNT(*) AS row_count FROM "{table}" GROUP BY run_name'
                ).fetchall()
            ]

    output = {
        "schemaVersion": 1,
        "databaseName": database.name,
        "tables": {
            table: count_rows(connection, table)
            for table in (
                "documents",
                "risk_assessments",
                "review_queues",
                "review_cases",
                "review_history",
                "similarity_matches",
                "similarity_candidate_links",
                "cached_news_articles",
            )
        },
        "documentGroups": document_groups,
        "reviewers": reviewers,
        "runNames": run_names,
    }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
