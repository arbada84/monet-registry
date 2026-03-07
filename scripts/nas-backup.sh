#!/bin/sh
# ============================================================
# 컬처피플 Supabase 전체 백업 스크립트 (시놀로지 NAS용)
# Node.js 불필요 — curl + sh만 사용
#
# 사용법:
#   1. 이 파일을 NAS에 업로드 (예: /volume1/backup/scripts/nas-backup.sh)
#   2. 아래 변수 3개 설정
#   3. DSM > 제어판 > 작업 스케줄러에서 매일 실행 등록
#      - 작업: 사용자 정의 스크립트
#      - 사용자: root
#      - 명령: sh /volume1/backup/scripts/nas-backup.sh
# ============================================================

# ── 설정 (반드시 수정) ──────────────────────────────────
SUPABASE_URL="https://ifducnfrjarmlpktrjkj.supabase.co"
SUPABASE_ANON_KEY="여기에_ANON_KEY_입력"
BACKUP_DIR="/volume1/backup/culturepeople"
# ────────────────────────────────────────────────────────

# 날짜 폴더 생성
TODAY=$(date +%Y-%m-%d)
DIR="$BACKUP_DIR/$TODAY"
mkdir -p "$DIR"

HEADERS="-H \"apikey: $SUPABASE_ANON_KEY\" -H \"Authorization: Bearer $SUPABASE_ANON_KEY\""

echo "[$TODAY] 컬처피플 백업 시작..."

# ── 1. 기사 전체 백업 (페이지네이션) ─────────────────────
echo "  기사 백업 중..."
OFFSET=0
LIMIT=500
PAGE=1
> "$DIR/articles.json.tmp"
echo "[" > "$DIR/articles.json"

while true; do
  RESULT=$(eval curl -s "$HEADERS" \
    "\"$SUPABASE_URL/rest/v1/articles?select=*&order=created_at.desc&offset=$OFFSET&limit=$LIMIT\"")

  # 빈 배열이면 종료
  if [ "$RESULT" = "[]" ] || [ -z "$RESULT" ]; then
    break
  fi

  # 첫 페이지가 아니면 쉼표 추가
  if [ $PAGE -gt 1 ]; then
    echo "," >> "$DIR/articles.json"
  fi

  # JSON 배열의 대괄호 제거하고 추가
  echo "$RESULT" | sed 's/^\[//;s/\]$//' >> "$DIR/articles.json"

  COUNT=$(echo "$RESULT" | grep -o '"id"' | wc -l)
  echo "    페이지 $PAGE: ${COUNT}건"

  if [ "$COUNT" -lt "$LIMIT" ]; then
    break
  fi

  OFFSET=$((OFFSET + LIMIT))
  PAGE=$((PAGE + 1))
done

echo "]" >> "$DIR/articles.json"
rm -f "$DIR/articles.json.tmp"

TOTAL=$(grep -o '"id"' "$DIR/articles.json" | wc -l)
echo "  기사 백업 완료: ${TOTAL}건"

# ── 2. 설정값 백업 ──────────────────────────────────────
echo "  설정 백업 중..."
eval curl -s $HEADERS \
  "\"$SUPABASE_URL/rest/v1/site_settings?select=*\"" \
  -o "$DIR/settings.json"

SETTINGS_COUNT=$(grep -o '"key"' "$DIR/settings.json" | wc -l)
echo "  설정 백업 완료: ${SETTINGS_COUNT}건"

# ── 3. 이미지 URL 추출 및 백업 ──────────────────────────
echo "  이미지 백업 중..."
IMG_DIR="$DIR/images"
mkdir -p "$IMG_DIR"

# 썸네일 URL 추출
grep -o '"thumbnail":"[^"]*"' "$DIR/articles.json" | \
  sed 's/"thumbnail":"//;s/"$//' | \
  grep -i "supabase" | sort -u > "$DIR/image-urls.txt"

# 본문 이미지 URL 추출
grep -o 'src="https://[^"]*supabase[^"]*"' "$DIR/articles.json" | \
  sed 's/src="//;s/"$//' | sort -u >> "$DIR/image-urls.txt"

# OG 이미지 URL 추출
grep -o '"og_image":"[^"]*"' "$DIR/articles.json" | \
  sed 's/"og_image":"//;s/"$//' | \
  grep -i "supabase" | sort -u >> "$DIR/image-urls.txt"

# 중복 제거
sort -u "$DIR/image-urls.txt" -o "$DIR/image-urls.txt"

IMG_COUNT=0
IMG_TOTAL=$(wc -l < "$DIR/image-urls.txt")

while IFS= read -r URL; do
  if [ -z "$URL" ]; then continue; fi

  # URL에서 파일명 추출 (경로 유지)
  FILENAME=$(echo "$URL" | sed 's|.*/storage/v1/object/public/images/||')
  if [ -z "$FILENAME" ] || [ "$FILENAME" = "$URL" ]; then
    FILENAME=$(echo "$URL" | sed 's|.*/||')
  fi

  # 디렉토리 생성
  FILE_DIR=$(dirname "$IMG_DIR/$FILENAME")
  mkdir -p "$FILE_DIR"

  # 이미 다운로드된 파일 스킵
  if [ -f "$IMG_DIR/$FILENAME" ]; then
    IMG_COUNT=$((IMG_COUNT + 1))
    continue
  fi

  curl -s -o "$IMG_DIR/$FILENAME" "$URL" 2>/dev/null
  IMG_COUNT=$((IMG_COUNT + 1))

  # 진행 상황 (50개마다)
  if [ $((IMG_COUNT % 50)) -eq 0 ]; then
    echo "    이미지 $IMG_COUNT / $IMG_TOTAL"
  fi
done < "$DIR/image-urls.txt"

echo "  이미지 백업 완료: ${IMG_COUNT}건"

# ── 4. 오래된 백업 정리 (30일 이상) ─────────────────────
echo "  오래된 백업 정리 중..."
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null
echo "  30일 이상 오래된 백업 삭제 완료"

# ── 5. 백업 크기 확인 ───────────────────────────────────
SIZE=$(du -sh "$DIR" | cut -f1)
echo ""
echo "[$TODAY] 백업 완료!"
echo "  위치: $DIR"
echo "  크기: $SIZE"
echo "  기사: ${TOTAL}건 | 설정: ${SETTINGS_COUNT}건 | 이미지: ${IMG_COUNT}건"
