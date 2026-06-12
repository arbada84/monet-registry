#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import tempfile
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


DEFAULT_BACKUP_ROOT = Path.home() / "culturepeople-backups"
DEFAULT_MAX_NEW_MEDIA = 50
DEFAULT_DELAY_MS = 2000
DEFAULT_TIMEOUT_MS = 30000
DEFAULT_MAX_MEDIA_BYTES = 50 * 1024 * 1024
DEFAULT_MIN_FREE_GB = 10
MEDIA_STORE_DIR = "_media-store"


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def timestamp_for_file():
    return utc_now().replace(":", "-").replace(".", "-").replace("Z", "")


def load_json(path, fallback=None):
    if not path.exists():
        return fallback
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json_atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    tmp.replace(path)


def latest_backup_dir(root):
    if not root.exists():
        return None
    candidates = [
        item for item in root.iterdir()
        if item.is_dir()
        and item.name.startswith("20")
        and (item / "backup-manifest.json").exists()
        and (item / "merged" / "media-candidates.json").exists()
    ]
    if not candidates:
        return None
    return sorted(candidates, key=lambda item: item.name)[-1]


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_text(text):
    return hashlib.sha256(str(text).encode("utf-8")).hexdigest()


def host_of(url):
    try:
        return urlparse(url).netloc.lower()
    except Exception:
        return ""


def resolve_host(host):
    hostname = host.split("@")[-1].split(":")[0]
    if not hostname:
        return False, "empty host"
    try:
        socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
        return True, ""
    except OSError as error:
        return False, str(error)


def cached_media_file(entry, root):
    if not isinstance(entry, dict):
        return None
    if entry.get("media_store_file"):
        return root / entry["media_store_file"]
    if entry.get("storage") == "media_store" and entry.get("file"):
        return root / entry["file"]
    if entry.get("backup_dir") and entry.get("file"):
        return Path(entry["backup_dir"]) / entry["file"]
    if entry.get("file"):
        return root / entry["file"]
    return None


def is_cached(url, index, root):
    entry = index.get("entries", {}).get(url)
    file_path = cached_media_file(entry, root)
    return bool(file_path and file_path.exists())


def extension_from_content_type(content_type):
    normalized = str(content_type or "").split(";")[0].strip().lower()
    return {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/avif": "avif",
        "image/svg+xml": "svg",
    }.get(normalized, "")


def extension_from_url(url):
    suffix = Path(urlparse(url).path).suffix.lower().lstrip(".")
    if suffix == "jpeg":
        suffix = "jpg"
    return suffix if suffix in {"jpg", "png", "gif", "webp", "avif", "svg"} else ""


def media_store_relative_path(content_hash, ext):
    return str(Path(MEDIA_STORE_DIR) / "files" / content_hash[:2] / f"{content_hash}.{ext}")


def record_failure(index, url, error, http_status=None, attempts=1):
    now = utc_now()
    host = host_of(url)
    failed_entries = index.setdefault("failed_entries", {})
    existing = failed_entries.get(url, {})
    failed_entries[url] = {
        "url": url,
        "url_hash": existing.get("url_hash") or sha256_text(url),
        "host": host,
        "status": "failed",
        "http_status": http_status,
        "error": error,
        "attempts": attempts,
        "first_failed_at": existing.get("first_failed_at") or now,
        "last_failed_at": now,
        "failure_count": int(existing.get("failure_count") or 0) + 1,
    }

    if host:
        failed_hosts = index.setdefault("failed_hosts", {})
        host_record = failed_hosts.get(host, {})
        failed_hosts[host] = {
            "host": host,
            "first_failed_at": host_record.get("first_failed_at") or now,
            "last_failed_at": now,
            "error": error,
            "http_status": http_status,
            "failure_count": int(host_record.get("failure_count") or 0) + 1,
        }


def record_host_failure(index, host, error):
    now = utc_now()
    failed_hosts = index.setdefault("failed_hosts", {})
    existing = failed_hosts.get(host, {})
    failed_hosts[host] = {
        "host": host,
        "first_failed_at": existing.get("first_failed_at") or now,
        "last_failed_at": now,
        "error": error,
        "http_status": None,
        "failure_count": int(existing.get("failure_count") or 0) + 1,
    }


def record_success(index, root, url, content_hash, content_type, bytes_count, store_relative_path):
    now = utc_now()
    host = host_of(url)
    index.setdefault("entries", {})[url] = {
        "url": url,
        "url_hash": sha256_text(url),
        "content_hash": content_hash,
        "content_type": content_type or "",
        "bytes": bytes_count,
        "backup_dir": str(root),
        "file": store_relative_path,
        "media_store_file": store_relative_path,
        "storage": "media_store",
        "updated_at": now,
    }
    index.setdefault("failed_entries", {}).pop(url, None)
    if host:
        index.setdefault("failed_hosts", {}).pop(host, None)


def download_one(url, root, timeout_ms, max_media_bytes):
    request = Request(
        url,
        headers={
            "User-Agent": "culturepeople-local-image-backfill/1.0 (+read-only; low-rate)",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
    )
    timeout_seconds = max(1, timeout_ms / 1000)
    tmp_dir = root / MEDIA_STORE_DIR / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp_name = None
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            content_type = response.headers.get("content-type", "")
            content_length = int(response.headers.get("content-length") or "0")
            if content_length > max_media_bytes:
                return {
                    "status": "skipped",
                    "url": url,
                    "error": f"content-length exceeds max-media-bytes ({max_media_bytes})",
                    "bytes": content_length,
                }

            digest = hashlib.sha256()
            bytes_count = 0
            with tempfile.NamedTemporaryFile(delete=False, dir=tmp_dir) as tmp:
                tmp_name = tmp.name
                while True:
                    chunk = response.read(1024 * 1024)
                    if not chunk:
                        break
                    bytes_count += len(chunk)
                    if bytes_count > max_media_bytes:
                        return {
                            "status": "skipped",
                            "url": url,
                            "error": f"downloaded body exceeds max-media-bytes ({max_media_bytes})",
                            "bytes": bytes_count,
                        }
                    digest.update(chunk)
                    tmp.write(chunk)

            content_hash = digest.hexdigest()
            ext = extension_from_content_type(content_type) or extension_from_url(url) or "bin"
            store_relative = media_store_relative_path(content_hash, ext)
            final_path = root / store_relative
            final_path.parent.mkdir(parents=True, exist_ok=True)
            if not final_path.exists() or final_path.stat().st_size != bytes_count:
                shutil.move(tmp_name, final_path)
                tmp_name = None
            return {
                "status": "downloaded",
                "url": url,
                "content_hash": content_hash,
                "content_type": content_type,
                "bytes": bytes_count,
                "media_store_file": store_relative,
            }
    except HTTPError as error:
        return {
            "status": "failed",
            "url": url,
            "http_status": error.code,
            "error": f"HTTP {error.code}",
        }
    except (URLError, TimeoutError, OSError) as error:
        return {
            "status": "failed",
            "url": url,
            "error": str(error.reason if isinstance(error, URLError) else error),
        }
    finally:
        if tmp_name:
            try:
                Path(tmp_name).unlink(missing_ok=True)
            except OSError:
                pass


def disk_available_bytes(path):
    usage = shutil.disk_usage(path)
    return usage.free


def build_parser():
    parser = argparse.ArgumentParser(description="Backfill CulturePeople media from local backup manifests.")
    parser.add_argument("--root", default=str(DEFAULT_BACKUP_ROOT))
    parser.add_argument("--max-new-media", type=int, default=DEFAULT_MAX_NEW_MEDIA)
    parser.add_argument("--delay-ms", type=int, default=DEFAULT_DELAY_MS)
    parser.add_argument("--timeout-ms", type=int, default=DEFAULT_TIMEOUT_MS)
    parser.add_argument("--max-media-bytes", type=int, default=DEFAULT_MAX_MEDIA_BYTES)
    parser.add_argument("--min-free-gb", type=int, default=DEFAULT_MIN_FREE_GB)
    parser.add_argument("--json", action="store_true")
    return parser


def main():
    args = build_parser().parse_args()
    root = Path(args.root).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)

    min_free_bytes = max(0, args.min_free_gb) * 1024 * 1024 * 1024
    if disk_available_bytes(root) < min_free_bytes:
        raise SystemExit(f"backup disk has less than {args.min_free_gb} GB available")

    backup_dir = latest_backup_dir(root)
    if not backup_dir:
        raise SystemExit(f"no backup with media candidates found under {root}")

    candidates = load_json(backup_dir / "merged" / "media-candidates.json", [])
    index_path = root / "media-url-index.json"
    index = load_json(index_path, {"version": 1, "updated_at": None, "entries": {}})
    index.setdefault("entries", {})
    index.setdefault("failed_entries", {})
    index.setdefault("failed_hosts", {})

    allowed = [item for item in candidates if item.get("download_allowed") and item.get("url")]
    before_materialized = sum(1 for item in allowed if is_cached(item["url"], index, root))
    remaining = [item for item in allowed if not is_cached(item["url"], index, root)]

    host_status = {}
    selected = []
    deferred_dns = 0
    for item in remaining:
        url = item["url"]
        host = host_of(url)
        if host not in host_status:
            ok, error = resolve_host(host)
            host_status[host] = {"ok": ok, "error": error, "deferred": 0}
            if not ok:
                record_host_failure(index, host, f"dns_lookup_failed: {error}")
        if not host_status[host]["ok"]:
            host_status[host]["deferred"] += 1
            deferred_dns += 1
            continue
        if len(selected) >= max(0, args.max_new_media):
            continue
        selected.append(item)

    downloaded = 0
    failed = 0
    skipped = 0
    bytes_downloaded = 0
    files = []
    for item in selected:
        result = download_one(item["url"], root, args.timeout_ms, args.max_media_bytes)
        files.append(result)
        if result["status"] == "downloaded":
            downloaded += 1
            bytes_downloaded += int(result.get("bytes") or 0)
            record_success(
                index,
                root,
                item["url"],
                result["content_hash"],
                result.get("content_type", ""),
                int(result.get("bytes") or 0),
                result["media_store_file"],
            )
        elif result["status"] == "failed":
            failed += 1
            record_failure(index, item["url"], result.get("error", "unknown error"), result.get("http_status"))
        else:
            skipped += 1
        time.sleep(max(0, args.delay_ms) / 1000)

    index["updated_at"] = utc_now()
    write_json_atomic(index_path, index)

    after_materialized = sum(1 for item in allowed if is_cached(item["url"], index, root))
    run = {
        "ok": failed == 0,
        "generated_at": utc_now(),
        "backup_dir": str(backup_dir),
        "root": str(root),
        "media": {
            "downloadable": len(allowed),
            "materialized_before": before_materialized,
            "materialized_after": after_materialized,
            "remaining_after": max(0, len(allowed) - after_materialized),
            "downloaded": downloaded,
            "failed": failed,
            "skipped": skipped,
            "deferred_dns": deferred_dns,
            "selected": len(selected),
            "max_new_media": args.max_new_media,
            "bytes_downloaded": bytes_downloaded,
        },
        "host_status": host_status,
        "files": files,
    }

    run_dir = root / "_image-backfill-runs"
    run_file = run_dir / f"image-backfill-{timestamp_for_file()}.json"
    write_json_atomic(run_file, run)
    write_json_atomic(run_dir / "latest.json", {**run, "run_file": str(run_file)})

    if args.json:
        print(json.dumps({**run, "run_file": str(run_file)}, ensure_ascii=False, indent=2))
    else:
        print("CulturePeople image backfill")
        print(f"- ok: {run['ok']}")
        print(f"- backup: {backup_dir}")
        print(f"- media: {before_materialized} -> {after_materialized}/{len(allowed)}, +{after_materialized - before_materialized}, remaining {run['media']['remaining_after']}")
        print(f"- downloaded/failed/skipped: {downloaded}/{failed}/{skipped}")
        print(f"- deferred by DNS: {deferred_dns}")
        print(f"- run file: {run_file}")

    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
