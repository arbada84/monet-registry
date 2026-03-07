#!/bin/sh
# ============================================================
# 컬처피플 Cron 호출 스크립트 (시놀로지 NAS용)
# Vercel Hobby plan cron 제한 대체 — cron-job.org 대신 NAS에서 실행
#
# DSM > 제어판 > 작업 스케줄러 등록:
#   1. 예약발행: 매 5분 실행 → sh /volume1/backup/scripts/nas-cron.sh publish
#   2. 자동뉴스: 매일 06:00 실행 → sh /volume1/backup/scripts/nas-cron.sh auto-news
#   3. 보도자료: 매일 07:00 실행 → sh /volume1/backup/scripts/nas-cron.sh auto-press
# ============================================================

# ── 설정 (반드시 수정) ──────────────────────────────────
SITE_URL="https://culturepeople.co.kr"
CRON_SECRET="여기에_CRON_SECRET_입력"
# ────────────────────────────────────────────────────────

ACTION="$1"

case "$ACTION" in
  publish)
    echo "[$(date)] 예약발행 실행..."
    curl -s -X POST "$SITE_URL/api/cron/publish" \
      -H "Authorization: Bearer $CRON_SECRET" \
      -H "Content-Type: application/json"
    echo ""
    ;;
  auto-news)
    echo "[$(date)] 자동뉴스 수집..."
    curl -s -X POST "$SITE_URL/api/cron/auto-news" \
      -H "Authorization: Bearer $CRON_SECRET" \
      -H "Content-Type: application/json"
    echo ""
    ;;
  auto-press)
    echo "[$(date)] 보도자료 자동등록..."
    curl -s -X POST "$SITE_URL/api/cron/auto-press" \
      -H "Authorization: Bearer $CRON_SECRET" \
      -H "Content-Type: application/json"
    echo ""
    ;;
  *)
    echo "사용법: $0 {publish|auto-news|auto-press}"
    exit 1
    ;;
esac
