# Linux Mint KakaoTalk Bottles 설치 기록

작성일: 2026-05-24

이 문서는 Linux Mint에서 Windows용 카카오톡 PC 버전을 Bottles/Wine으로 실행한 성공 기록이다. 이번 설치에서는 처음에 `Wrong DLL present` 에러가 났고, 이후 Windows 7로 잘못 인식되어 업데이트/설치가 막혔으며, 마지막으로 한글 폰트가 깨지는 문제가 있었다. 아래 설정으로 로그인 화면까지 정상 확인했다.

## 성공 환경

- OS: Linux Mint 22.3 Zena
- Ubuntu base: noble
- Architecture: x86_64
- Bottles: Flatpak `com.usebottles.bottles` 63.2
- Bottles runner: `sys-wine-11.0`
- Bottle name: `카카오톡`
- Bottle architecture: `win64`
- Bottle Windows setting: `win10`
- Final executable: `C:\Program Files\Kakao\KakaoTalk\KakaoTalk.exe`
- Final executable type: `PE32+ executable (GUI) x86-64`

현재 실행 스크립트:

```sh
#!/bin/sh
export LANG=ko_KR.UTF-8
export LANGUAGE=ko
exec flatpak run --command=bottles-cli com.usebottles.bottles run -b "카카오톡" -p "KakaoTalk" "$@"
```

저장 위치:

```text
/home/arbada/bin/kakaotalk
/home/arbada/.local/share/applications/kakaotalk-wine.desktop
/home/arbada/.var/app/com.usebottles.bottles/data/bottles/bottles/카카오톡
```

## 핵심 결론

`Wrong DLL present`는 임의 DLL을 받아서 해결할 문제가 아니다. 이번 환경에서는 시스템 Wine 9.0과 Bottles `soda-9.0-1`에서 실패했고, Bottles의 `sys-wine-11.0` runner로 바꾸면서 해결됐다.

`This version of Windows OS is out of support for KakaoTalk updates` 메시지는 DLL 에러가 아니라 Wine registry가 Windows 7로 남아 있어서 생긴 OS 판정 문제였다. `winecfg /v win10`만으로는 일부 registry 값이 계속 Windows 7로 남을 수 있으므로 64-bit view와 32-bit view를 모두 Windows 10 값으로 맞춰야 했다.

한글이 네모로 깨지는 문제는 같은 bottle에 `winetricks cjkfonts`를 설치해서 해결했다.

## 처음부터 설치하는 절차

### 1. Bottles 설치

Linux Mint에서 Flatpak/Flathub가 이미 잡혀 있다면 Bottles만 설치하면 된다.

```sh
flatpak install -y flathub com.usebottles.bottles
```

설치 확인:

```sh
flatpak info com.usebottles.bottles
flatpak run --command=bottles-cli com.usebottles.bottles list components
```

`sys-wine-11.0` runner가 있어야 한다. 없다면 Bottles GUI에서 runner를 설치하거나, 사용 가능한 최신 `sys-wine` 계열 runner를 사용한다.

### 2. 카카오톡 설치 파일 준비

공식 카카오톡 PC 설치 파일을 `~/Downloads/KakaoTalk_Setup.exe`에 둔다.

주의:

- 인터넷에 떠도는 DLL fix zip, cracked DLL, 임의 `Themida` 우회 파일을 받지 않는다.
- 설치 파일은 공식 카카오 페이지에서 새로 받는다.
- 이번 성공 시점의 파일은 NSIS 기반 `PE32` 설치 파일이었지만, `win64` bottle에 설치하면 최종 `KakaoTalk.exe`는 x86-64로 설치됐다.

확인 예:

```sh
file "$HOME/Downloads/KakaoTalk_Setup.exe"
sha256sum "$HOME/Downloads/KakaoTalk_Setup.exe"
```

이번 성공 기록의 설치 파일 SHA256:

```text
db75711185bbaf59e0bde6be3b02bcd34d943dfebd0ef06913352f541f32392c  KakaoTalk_Setup.exe
```

### 3. Bottle 생성

```sh
flatpak run --command=bottles-cli com.usebottles.bottles new \
  --bottle-name "카카오톡" \
  --environment application \
  --arch win64 \
  --runner sys-wine-11.0
```

기존 bottle이 있다면 runner와 Windows 버전을 맞춘다.

```sh
flatpak run --command=bottles-cli com.usebottles.bottles edit \
  -b "카카오톡" \
  --runner sys-wine-11.0 \
  --win win10
```

현재 설정 확인:

```sh
grep -E '^(Arch|Runner|Windows):' \
  "$HOME/.var/app/com.usebottles.bottles/data/bottles/bottles/카카오톡/bottle.yml"
```

정상값:

```text
Arch: win64
Runner: sys-wine-11.0
Windows: win10
```

### 4. Windows 10 registry 강제 보정

이번 설치에서 가장 중요했던 부분이다. Bottles 설정 파일이 `Windows: win10`이어도 Wine registry 내부에는 `Microsoft Windows 7`, `CurrentMajorVersionNumber=6`, `CurrentMinorVersionNumber=1`이 남을 수 있었다. 카카오톡 설치기는 이 값을 보고 지원 종료 OS로 판단했다.

아래 명령은 64-bit view와 32-bit view를 모두 Windows 10 22H2 계열 값으로 맞춘다.

```sh
PREFIX="$HOME/.var/app/com.usebottles.bottles/data/bottles/bottles/카카오톡"
KEY='HKLM\Software\Microsoft\Windows NT\CurrentVersion'

for VIEW in /reg:64 /reg:32; do
  flatpak run --env=WINEPREFIX="$PREFIX" --env=WINEDEBUG=-all \
    --command=wine com.usebottles.bottles \
    reg add "$KEY" /v ProductName /t REG_SZ /d "Microsoft Windows 10" /f "$VIEW"

  flatpak run --env=WINEPREFIX="$PREFIX" --env=WINEDEBUG=-all \
    --command=wine com.usebottles.bottles \
    reg add "$KEY" /v CurrentVersion /t REG_SZ /d "10.0" /f "$VIEW"

  flatpak run --env=WINEPREFIX="$PREFIX" --env=WINEDEBUG=-all \
    --command=wine com.usebottles.bottles \
    reg add "$KEY" /v CurrentBuild /t REG_SZ /d "19045" /f "$VIEW"

  flatpak run --env=WINEPREFIX="$PREFIX" --env=WINEDEBUG=-all \
    --command=wine com.usebottles.bottles \
    reg add "$KEY" /v CurrentBuildNumber /t REG_SZ /d "19045" /f "$VIEW"

  flatpak run --env=WINEPREFIX="$PREFIX" --env=WINEDEBUG=-all \
    --command=wine com.usebottles.bottles \
    reg add "$KEY" /v CurrentMajorVersionNumber /t REG_DWORD /d 10 /f "$VIEW"

  flatpak run --env=WINEPREFIX="$PREFIX" --env=WINEDEBUG=-all \
    --command=wine com.usebottles.bottles \
    reg add "$KEY" /v CurrentMinorVersionNumber /t REG_DWORD /d 0 /f "$VIEW"

  flatpak run --env=WINEPREFIX="$PREFIX" --env=WINEDEBUG=-all \
    --command=wine com.usebottles.bottles \
    reg add "$KEY" /v CSDVersion /t REG_SZ /d "" /f "$VIEW"
done
```

확인:

```sh
flatpak run --env=WINEPREFIX="$PREFIX" --env=WINEDEBUG=-all \
  --command=wine com.usebottles.bottles \
  reg query "$KEY" /v ProductName

flatpak run --env=WINEPREFIX="$PREFIX" --env=WINEDEBUG=-all \
  --command=wine com.usebottles.bottles \
  reg query "$KEY" /v CurrentMajorVersionNumber
```

### 5. 한글 폰트 설치

로그인 화면의 한글이 네모로 보이면 같은 bottle에 CJK 폰트를 설치한다.

```sh
PREFIX="$HOME/.var/app/com.usebottles.bottles/data/bottles/bottles/카카오톡"

flatpak run --env=WINEPREFIX="$PREFIX" --env=WINEDEBUG=-all \
  --command=winetricks com.usebottles.bottles -q cjkfonts
```

설치 확인:

```sh
flatpak run --env=WINEPREFIX="$PREFIX" --env=WINEDEBUG=-all \
  --command=winetricks com.usebottles.bottles list-installed
```

이번 성공 환경에서는 아래 항목이 들어갔다.

```text
sourcehansans
fakechinese
fakejapanese
fakekorean
unifont
cjkfonts
```

### 6. 카카오톡 설치

```sh
flatpak run --filesystem="$HOME/Downloads" \
  --command=bottles-cli com.usebottles.bottles \
  run -b "카카오톡" \
  -e "$HOME/Downloads/KakaoTalk_Setup.exe" \
  /S
```

`/S`는 NSIS silent install 옵션이다. 설치 UI를 보고 싶으면 `/S`를 빼고 실행한다.

설치 후 실행 파일 확인:

```sh
PREFIX="$HOME/.var/app/com.usebottles.bottles/data/bottles/bottles/카카오톡"
file "$PREFIX/drive_c/Program Files/Kakao/KakaoTalk/KakaoTalk.exe"
```

정상 예:

```text
PE32+ executable (GUI) x86-64, for MS Windows
```

### 7. Bottles 프로그램 등록

Bottles가 자동으로 `KakaoTalk` 프로그램을 잡지 못하면 수동 등록한다.

```sh
flatpak run --command=bottles-cli com.usebottles.bottles add \
  -b "카카오톡" \
  -n "KakaoTalk" \
  -p 'C:\Program Files\Kakao\KakaoTalk\KakaoTalk.exe'
```

확인:

```sh
flatpak run --command=bottles-cli com.usebottles.bottles programs -b "카카오톡"
```

### 8. 실행 스크립트 만들기

```sh
mkdir -p "$HOME/bin"
```

`$HOME/bin/kakaotalk`:

```sh
#!/bin/sh
export LANG=ko_KR.UTF-8
export LANGUAGE=ko
exec flatpak run --command=bottles-cli com.usebottles.bottles run -b "카카오톡" -p "KakaoTalk" "$@"
```

권한:

```sh
chmod +x "$HOME/bin/kakaotalk"
```

실행:

```sh
kakaotalk
```

### 9. Linux Mint 메뉴 등록

`$HOME/.local/share/applications/kakaotalk-wine.desktop`:

```ini
[Desktop Entry]
Type=Application
Name=카카오톡
Name[ko]=카카오톡
Comment=KakaoTalk for Windows via Wine
Exec=/home/arbada/bin/kakaotalk
Icon=/home/arbada/.var/app/com.usebottles.bottles/data/bottles/bottles/카카오톡/drive_c/Program Files/Kakao/KakaoTalk/resource/icon/icon_kakaotalk_logout.ico
Terminal=false
Categories=Network;InstantMessaging;
StartupNotify=true
```

검증:

```sh
desktop-file-validate "$HOME/.local/share/applications/kakaotalk-wine.desktop"
```

## 에러별 대응

### Themida: Wrong DLL present

증상:

```text
Themida
An error has occurred while loading imports. Wrong DLL present.
```

대응:

- DLL 파일을 인터넷에서 따로 받지 않는다.
- 시스템 Wine 9.0, Bottles `soda-9.0-1`에서 재현됐다.
- Bottles runner를 `sys-wine-11.0`으로 바꾼다.
- 같은 bottle에서 실행한다. 시스템 Wine prefix와 Bottles prefix를 섞지 않는다.

명령:

```sh
flatpak run --command=bottles-cli com.usebottles.bottles edit \
  -b "카카오톡" \
  --runner sys-wine-11.0 \
  --win win10
```

### This version of Windows OS is out of support

증상:

```text
This version of Windows OS is out of support for KakaoTalk updates.
Please reinstall with the newly downloaded installation file from ...
```

또는 설치기에서:

```text
Unable to install this version of KakaoTalk on your PC.
Please reinstall with the newly downloaded installation file from ...
```

대응:

- 이 메시지는 DLL 에러가 아니다.
- Wine registry가 Windows 7로 남아 있어서 생긴 OS 판정 문제다.
- `HKLM\Software\Microsoft\Windows NT\CurrentVersion` 값을 `/reg:64`, `/reg:32` 양쪽 모두 Windows 10으로 맞춘다.
- registry 보정 후 공식 설치 파일로 재설치한다.

### 한글이 네모로 깨짐

증상:

- 로그인 창의 `카카오계정`, `비밀번호`, `자동 로그인` 등이 네모로 보인다.

대응:

```sh
PREFIX="$HOME/.var/app/com.usebottles.bottles/data/bottles/bottles/카카오톡"

flatpak run --env=WINEPREFIX="$PREFIX" --env=WINEDEBUG=-all \
  --command=winetricks com.usebottles.bottles -q cjkfonts
```

### Bottles가 recovered running sessions를 표시함

증상:

```text
Recovered 1 running sessions -> forced at last_seen
```

대부분 이전 Wine 프로세스가 강제 종료되었거나 상태 파일이 남은 경우다. 실제로 실행이 꼬이면 카카오톡 관련 프로세스를 종료하고 다시 실행한다.

```sh
pgrep -af 'bottles-cli|KakaoTalk.exe|start.exe|wine'
```

프로세스를 확인한 뒤 카카오톡 관련 PID만 종료한다.

## 검증 체크리스트

실행 후 창 제목 확인:

```sh
wmctrl -l | grep -E '카카오톡|KakaoTalk|Themida'
```

정상:

```text
카카오톡
```

비정상:

```text
Themida
```

실행 파일 확인:

```sh
PREFIX="$HOME/.var/app/com.usebottles.bottles/data/bottles/bottles/카카오톡"
file "$PREFIX/drive_c/Program Files/Kakao/KakaoTalk/KakaoTalk.exe"
```

최종 성공 기준:

- `Wrong DLL present` 창이 뜨지 않는다.
- `Windows OS is out of support` 창이 뜨지 않는다.
- 카카오톡 노란 로그인 화면이 뜬다.
- 한글이 네모가 아니라 정상 문장으로 보인다.

## 주의사항

- 카카오톡은 Linux 네이티브 앱이 아니므로 업데이트 때마다 Wine/Bottles 호환성이 깨질 수 있다.
- 공식 설치 파일만 사용한다.
- 임의 DLL, 패치 파일, 우회 파일을 받지 않는다.
- 시스템 Wine prefix인 `~/.wine`, `~/.wine-kakaotalk`, `~/.wine-kakaotalk32`와 Bottles prefix를 섞지 않는다.
- 이번 최종 성공 경로는 Bottles prefix다.
- `winecfg /v win10`만 믿지 말고 registry 값을 직접 확인한다.
- 카카오톡 자동 업데이트가 다시 OS 지원 오류를 내면 공식 설치 파일을 다시 받고, registry 보정 후 재설치한다.
