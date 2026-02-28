# 카페24 웹호스팅(뉴아우토반 · 절약형) 업로드/배포 스킬

> 목적: **GitHub에 있는 소스/빌드 산출물을 카페24 웹호스팅에 올려서 운영**한다.  
> 범위: SSH(가능 시) + SFTP/FTP + 웹FTP + CI/CD(자동배포)까지 **가능한 방법을 총망라**.

---

## 0. 서비스 사양(절약형) 빠른 요약

카페24 “뉴아우토반 호스팅”의 **절약형** 주요 스펙(결제 전 확인용):

- 트래픽: **1.6GB/일** (약 48GB/월)
- 웹용량: **700MB SSD**
- **무제한 데이터베이스**
- FullSSD 스토리지
- **최대 7일 자동 백업**
- 워드프레스 자동 설치
- 무료 기본 도메인
- 무료 기본 도메인용 SSL 인증서
- POP3 이메일 3개

참고(상품 페이지): https://hosting.cafe24.com/?controller=new_product_page&page=newautobahn

---

## 1) 배포 전 “필수 결정” 3가지

### 1-1. 서버환경/PHP 버전 확정 (가장 먼저)
- 서버환경/PHP 버전 변경은 **기존 데이터/DB 삭제 후 새 환경으로 초기화**되는 방식이다.
- **48시간 내 원복 기능**이 안내되어 있지만, 운영 데이터는 “변경 전 백업”이 안전하다.

참고(카페24 안내):  
https://help.cafe24.com/faq/web-hosting/introduce/new-renewal-change/change_server_environment_php_version/

> 운영 안정성 기준 추천: **PHP 8.2**  
> (8.4는 최신 지향일 때, 7.4는 레거시 호환성 목적의 임시 선택에 가까움)

---

### 1-2. 사이트 유형 결정 (업로드 폴더/방식이 달라짐)
아래 중 어디에 속하는지 먼저 확정:

1) **정적 사이트** (React/Vue/Next static export 등)  
- 로컬에서 `build/dist` 산출물 생성 → **산출물만** 업로드

2) **PHP 앱** (순수 PHP / 라라벨 등)  
- 웹루트(public) 구조 + `.env`/DB 연결 필요  
- 서버에서 composer 실행이 어렵다면, 로컬에서 vendor 포함해 배포 구성 고려

3) **워드프레스**  
- 카페24 **자동 설치 기능** 사용 가능(초기 세팅 빠름)  
- 기존 WP를 옮길 경우: 파일 + DB 마이그레이션(플러그인/덤프) 필요

---

### 1-3. “SSH 사용 가능 여부” 확인
카페24 리눅스 기반 호스팅은 **대부분 SSH 지원** 안내가 있다.  
- SSH 접속이 안 되면: **Shell(SSH) 접속 허용** 및 **국가/IP 접근 허용** 설정을 확인한다.

참고(카페24 SSH 가이드):  
https://help.cafe24.com/faq/web-hosting/introduce/setup-management/ssh_connect_putty_guide/

---

## 2) 업로드/배포 방법 전체 지도

| 방법 | 난이도 | 추천 상황 | 핵심 도구 |
|---|---:|---|---|
| A. **SFTP/FTP 업로드** | 낮음 | 가장 흔한 운영 방식, 대량 업로드/동기화 | FileZilla/WinSCP |
| B. **SSH 접속 + (SCP/RSYNC) 전송** | 중간 | 서버에서 로그/권한/디렉토리 관리까지 하고 싶을 때 | PuTTY + scp/rsync |
| C. **웹FTP(브라우저 파일업로더)** | 낮음 | 설치 없이 소규모 파일 수정/업로드 | 카페24 관리자 |
| D. **GitHub Actions 자동배포** | 중간 | push하면 자동으로 업로드되게 | GitHub Actions + FTP/SCP 액션 |

카페24는 “대부분 호스팅이 FTP/SFTP/SSH 지원”을 안내하면서, 일부 서비스는 **FTP만** 제공된다고 안내한다.  
참고: https://help.cafe24.com/faq/web-hosting/introduce/setup-management/ftp_sftp_connection_filezilla

---

## 3) 방법 A: SFTP/FTP로 업로드 (가장 무난한 표준)

### 3-1. 언제 이 방법이 최고인가?
- 폴더가 많고 파일이 많다
- 서버에서 빌드하지 않고 **로컬에서 완성본 만든 뒤** 올릴 계획이다
- SSH 설정이 번거롭거나, 일단 빠르게 배포하고 싶다

### 3-2. 연결 정보(호스트/ID/비밀번호/포트)
- 카페24 안내에 따라 **FTP/SFTP 접속 정보를 확인**하고 연결한다.  
- 일반적으로:
  - FTP: 21 포트
  - SFTP(가능한 서비스): 22 포트

참고(카페24 FTP/SFTP 가이드):  
https://help.cafe24.com/faq/web-hosting/introduce/setup-management/ftp_sftp_connection_filezilla

### 3-3. 업로드 체크리스트
1) 웹루트(예: `www`, `public_html` 등) 위치 확인  
2) 기존 파일이 있으면 백업/다운로드 후 교체  
3) 정적 사이트라면 `index.html`이 루트에 오도록  
4) PHP 앱이라면 `index.php`/public 구조 확인  
5) 업로드 후 브라우저로 접속 테스트(메인/서브페이지/리소스)

---

## 4) 방법 B: SSH로 접속해 배포/운영 (가능하면 강력)

### 4-1. SSH 접속(PuTTY) 기본
- Hostname: 도메인 또는 IP
- Port: 기본 22
- 로그인 비밀번호는 **FTP 비밀번호와 동일**(입력해도 화면에 표시되지 않음)

참고:  
https://help.cafe24.com/faq/web-hosting/introduce/setup-management/ssh_connect_putty_guide/

### 4-2. SSH에서 할 수 있는 대표 작업
- 서버 폴더/권한 확인 (`ls`, `pwd`, `chmod`)
- 로그 확인
- 압축 해제/이동 (`tar`, `unzip`, `mv`)
- (가능한 경우) git pull, composer install, 캐시 정리 등

> 실전 운영 팁: “로컬에서 압축(zip/tar.gz) → 업로드 → SSH로 압축 해제” 조합이 빠르다.

---

## 5) 방법 C: 카페24 웹FTP(파일업로더)로 업로드

### 5-1. 언제 쓰나?
- 프로그램 설치 없이 급하게 파일 1~2개 수정/업로드
- 간단한 이미지/리소스 업로드

### 5-2. 접속 경로(예시)
- (쇼핑몰 기준) 관리자에서 “디자인 > 웹 FTP > 파일 업로더” 경로가 안내되어 있다.

참고:  
https://support.cafe24.com/hc/ko/articles/8467004548249-%EC%9B%B9-FTP%EB%8A%94-%EC%96%B4%EB%96%BB%EA%B2%8C-%EC%82%AC%EC%9A%A9%ED%95%98%EB%82%98%EC%9A%94

---

## 6) 방법 D: GitHub Actions로 자동배포(푸시 → 자동 업로드)

> 목표: `main`에 push하면 **빌드 → 업로드**가 자동으로 실행

### 6-1. 비밀정보(FTP/SSH 비밀번호) 저장 방식
- GitHub Actions는 **Secrets**에 민감정보를 저장하고, 워크플로우에서 참조하는 방식을 공식 안내한다.

참고(공식 문서):  
https://docs.github.com/actions/security-guides/using-secrets-in-github-actions

### 6-2. 대표 구성 2가지

#### (1) FTP 기반 배포(정적 사이트에 특히 깔끔)
- 예: SamKirkland/FTP-Deploy-Action 같은 방식으로 산출물 폴더를 동기화 업로드
  - Repo: https://github.com/SamKirkland/FTP-Deploy-Action
  - Marketplace: https://github.com/marketplace/actions/ftp-deploy

#### (2) SSH(SCP) 기반 배포(SSH가 잘 열리는 환경일 때 강력)
- 예: appleboy/scp-action으로 특정 폴더를 SCP로 전송
  - Repo: https://github.com/appleboy/scp-action

### 6-3. 워크플로우 “뼈대” 예시(개념)
> 아래는 **개념 구조**이며, 실제로는 네 프로젝트 빌드 명령/산출물 폴더에 맞춰 조정한다.

```yaml
name: deploy
on:
  push:
    branches: [ "main" ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # 1) 빌드 (정적 사이트라면)
      - name: Build
        run: |
          npm ci
          npm run build

      # 2) 업로드 (FTP 또는 SCP 중 택1)
      # - FTP 업로드 액션 (예시)
      # - SCP 업로드 액션 (예시)
```

---

## 7) 도메인/SSL 연결(이미 카페24 도메인 보유 시 체크)

- 호스팅과 도메인을 연결하면, 무료 기본 도메인용 SSL 또는 SSL 설정으로 HTTPS 운영이 가능하다.
- “무료 기본 도메인”이 있는 경우, 서버환경/PHP 변경 시 무료 도메인 표기가 바뀔 수 있다는 안내도 있다.

참고(서버환경 변경 안내):  
https://help.cafe24.com/faq/web-hosting/introduce/new-renewal-change/change_server_environment_php_version/

---

## 8) 장애 대응: 로그 확인(운영 필수)

- 웹/FTP 접속 로그를 다운로드할 수 있고,
- 생성 위치가 `/홈디렉토리/cafe24_log/` 로 안내되어 있다.

참고(카페24 로그 안내):  
https://help.cafe24.com/faq/web-hosting/introduce/setup-management/web_ftp_log_download

> 500 에러가 나면: PHP 버전/권한/.htaccess(리라이트)/DB 접속 정보를 우선 점검한다.

---

## 9) “내가 지금 바로” 실행할 최소 플로우(추천)

1) 카페24에서 **서버환경 + PHP 8.2 확정**(변경하면 초기화될 수 있으니 먼저)  
2) SSH 허용 여부 확인(가능하면 SSH까지 켜두기)  
3) 로컬에서 배포용 산출물 생성(정적이면 build/dist, PHP면 배포 폴더 구성)  
4) **SFTP/FTP(FileZilla)** 로 1차 업로드(가장 실패 확률 낮음)  
5) 접속 테스트 후, 필요하면 **GitHub Actions 자동배포**로 고도화  
6) 운영 중 에러는 **로그 다운로드 + SSH로 확인**까지 루틴화

---

## 10) 확인해야 할 값 체크리스트(빈칸 채우기)

- [ ] 호스팅 상품명/서비스 유형: 뉴아우토반 웹호스팅(절약형)
- [ ] 서버환경/PHP 버전: (예: PHP 8.2)
- [ ] FTP 호스트:
- [ ] FTP/SFTP 포트:
- [ ] FTP 아이디:
- [ ] FTP 비밀번호:
- [ ] SSH Hostname:
- [ ] SSH 포트(기본 22):
- [ ] 웹루트 경로:
- [ ] DB 사용 여부: (예/아니오)
- [ ] DB Host/Name/User/Password:
- [ ] 배포 방식: (FTP/SFTP/SSH/웹FTP/Actions)

---

## 변경 이력
- v1.0: 절약형 기준 배포 방법 총망라(SSH/FTP/웹FTP/자동배포), 서버환경 변경 주의 포함
