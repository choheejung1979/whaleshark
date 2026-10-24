# 고래상어 투어 예약 사이트

스노클링 · 다이빙 체험 예약을 받는 정적 웹사이트입니다.
프론트엔드는 순수 HTML/CSS/JS이며, 예약 데이터는 Firebase Firestore에 저장됩니다.

## 폴더 구조

```
index.html          홈페이지
reservation.html     예약 폼
admin.html            예약 목록 관리자 페이지 (기본 상태에서는 비활성 - 아래 참고)
css/style.css
js/firebase-config.js  Firebase 프로젝트 설정 (직접 값 채워 넣어야 함)
js/reservation.js      예약 폼 -> Firestore 저장 로직
js/admin.js             Firestore 실시간 목록 표시/상태변경/삭제 로직
firestore.rules         Firestore 보안 규칙
firebase.json            Firebase CLI 설정 (규칙 배포용)

--- 고래상어 티켓/QR 체크인 시스템 (A/B/C) — 5번 섹션 참고 ---
ticket-admin.html    A(보라카이션) 관리자 대시보드
ticket-seller.html   B(판매처) 대시보드
ticket-check.html    QR을 스캔하면 열리는 공개 체크 페이지 (C, 로그인 불필요)
ticket-counter.html  C(리버타드)의 일일 실물 카운트 대조 화면
js/ticket-access.js  ?t=접근링크 토큰 교환 + 로그인 공용 헬퍼
css/ticket-portal.css 위 4개 페이지 공용 스타일
functions/            Cloud Functions (티켓 발급/체크인/집계 로직 전체)
firestore.indexes.json Firestore 복합 색인 정의
.firebaserc            로컬 에뮬레이터용 데모 프로젝트 별칭 (demo-whale-shark)
```

## 1. Firebase 프로젝트 설정

1. https://console.firebase.google.com 에서 새 프로젝트를 생성합니다.
2. 왼쪽 메뉴 **Firestore Database** 에서 데이터베이스를 생성합니다 (프로덕션 모드 권장).
3. 프로젝트 설정 > 일반 > "내 앱" 에서 웹 앱(</>)을 추가하고, 발급되는 설정 값을
   `js/firebase-config.js` 의 `firebaseConfig` 객체에 붙여넣습니다.
4. Firebase CLI로 보안 규칙을 배포합니다 (최초 1회 로그인 필요):
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add        # 방금 만든 프로젝트 선택
   firebase deploy --only firestore:rules
   ```

`firestore.rules` 는 기본적으로 "예약 생성"만 허용하고, 읽기/수정/삭제는 차단되어 있습니다.
즉 **admin.html 은 기본 상태에서 데이터를 불러오지 못합니다.** 이는 의도된 보안 기본값입니다
(인증 없이 예약자 개인정보를 아무나 조회할 수 없도록). 관리자 페이지를 실제로 쓰려면:

1. Firebase Authentication(이메일/비밀번호)을 활성화하고 관리자 계정을 만듭니다.
2. `firestore.rules` 하단 안내에 따라 규칙을 수정하고, `admin.html`에 로그인 UI를 추가합니다.

이 부분은 현재 범위(예약 폼 + Firestore 저장)에 포함되어 있지 않으므로, 필요하시면 이어서 요청해주세요.

## 2. 로컬에서 확인하기

정적 파일이라 별도 빌드가 필요 없습니다. 아무 로컬 서버로 열면 됩니다:

```bash
npx serve .
# 또는
python3 -m http.server 8080
```

`file://` 로 직접 열면 브라우저에 따라 ES 모듈(import)이 막힐 수 있으니 로컬 서버 사용을 권장합니다.

## 3. GitHub 연결

```bash
gh repo create whale-shark-reservation --private --source=. --remote=origin
git push -u origin main
```

또는 GitHub 웹에서 저장소를 만든 뒤:

```bash
git remote add origin <저장소 URL>
git branch -M main
git push -u origin main
```

## 4. Cloudflare Pages 배포

1. Cloudflare 대시보드 > Workers & Pages > "Create application" > Pages > "Connect to Git"
2. 방금 만든 GitHub 저장소 선택
3. 빌드 설정:
   - Build command: (비워둠 — 정적 사이트라 빌드 불필요)
   - Build output directory: `/`
4. 배포 완료 후 발급되는 `*.pages.dev` 도메인으로 접속 확인

이후 GitHub `main` 브랜치에 push 할 때마다 Cloudflare Pages가 자동으로 재배포합니다.

## 5. 고래상어 티켓/QR 체크인 시스템 (A/B/C)

기존 예약 폼(위 1~4번)과 완전히 별개의 시스템으로, 같은 Firebase 프로젝트/Firestore/배포 파이프라인을
그대로 공유합니다. A(보라카이션, 전체 관리) / B(판매처, 자기 티켓만) / C(리버타드, 현장 QR 체크인 +
일일 실물 카운트 대조) 세 역할이 있으며, 이메일/비밀번호 계정 대신 **개인 접근 링크(URL)** 로 로그인합니다.

### 5-1. Cloud Functions 배포를 위한 사전 준비

Cloud Functions는 Firebase의 **Blaze(종량제) 요금제**가 활성화된 프로젝트에서만 배포/실행됩니다
(무료 Spark 플랜 불가). 아래 순서로 준비하세요:

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트를 열고 좌측 하단 "업그레이드"로
   **Blaze 요금제**를 활성화합니다 (결제 정보 등록 필요, 실제 사용량이 적으면 대부분 무료 한도 내입니다).
2. 로컬에 Node.js / Firebase CLI가 없다면 설치합니다 (Homebrew 예시):
   ```bash
   brew install node
   npm install -g firebase-tools
   ```
3. 로그인 및 프로젝트 연결:
   ```bash
   firebase login
   firebase use --add        # 위 1번에서 만든(또는 기존) 프로젝트 선택
   ```
4. `js/firebase-config.js`의 `firebaseConfig`(프로덕션용 값, `IS_LOCAL`이 아닐 때 쓰이는 쪽)을
   실제 프로젝트의 웹 앱 설정 값으로 교체합니다. (`db`/`auth`/`functions` 모두 이 설정을 공유합니다.)
5. Functions 의존성 설치:
   ```bash
   cd functions
   npm install
   cd ..
   ```
6. 배포:
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,functions
   ```

### 5-2. 최초 관리자(A) 링크 발급

시스템에 관리자가 아직 한 명도 없으므로, 최초 1회만 동작하는 부트스트랩 함수를 사용합니다
(이미 A 역할 링크가 하나라도 존재하면 이후 호출은 항상 실패합니다 — 안전장치):

```bash
firebase functions:shell
# 셸 안에서:
seedAdminLink()
```

출력된 `token` 값으로 `https://<배포도메인>/ticket-admin.html?t=<token>` 접속하면 A로 로그인됩니다.
이후 A는 `ticket-admin.html`의 "접근 링크 관리"에서 B(판매처)/C(리버타드)용 링크를 직접 생성해
각 담당자에게 전달하면 됩니다 (카카오톡/이메일 등으로 수동 전달 — 별도 발송 기능 없음).

접근 링크는 한 번 열면 브라우저에 로그인 세션이 유지되므로 매번 다시 열 필요는 없습니다.
A가 "해지" 버튼을 누르면 해당 링크와 로그인 세션이 모두 무효화됩니다.

### 5-3. QR = 개별 고객이 아니라 "판매처 + 날짜 + 총 인원" 그룹

**QR 1개는 고객 1명이 아니라, 특정 판매처가 특정 날짜에 등록한 그룹 전체 인원을 나타냅니다.**
예: 보자무싸가 100장을 보유하고 2026-08-10에 12명, 2026-08-11에 8명 규모로 투어를 예정했다면
`ticket-seller.html`에서 날짜별로 그룹을 2개 등록하고, 각각 QR을 하나씩 발급합니다.
고객 이름/연락처 같은 개인정보는 시스템 어디에도 저장하지 않습니다.

이 QR은 `https://<배포도메인>/ticket-check.html?t=<QR토큰>` 을 가리킵니다. 현장 직원은 휴대폰 기본
카메라로 이 QR을 스캔해 링크를 열기만 하면 되고, 별도 앱 설치나 로그인이 필요 없습니다. C가 OK를
누르면 그 순간 해당 그룹의 인원 전체가 한 번에 입장 처리되고 판매처의 사용량/일일 합계에 반영됩니다
(고객 1명씩 스캔하는 것이 아닙니다).

### 5-4. 로컬에서 에뮬레이터로 테스트하기

실제 Firebase 프로젝트/Blaze 없이도 전체 흐름을 로컬에서 테스트할 수 있습니다
(`.firebaserc`에 이미 에뮬레이터 전용 데모 프로젝트 `demo-whale-shark`가 설정되어 있습니다):

```bash
firebase emulators:start --only functions,firestore,auth --project demo-whale-shark
# 별도 터미널에서 정적 파일 서빙 (주의: `npx serve`는 .html 확장자와 쿼리스트링을
# 함께 지워버리는 301 리다이렉트를 하므로 접근 링크(?t=)가 깨집니다. 반드시 아래처럼
# 확장자를 그대로 서빙하는 서버를 사용하세요):
python3 -m http.server 8081
```

`js/firebase-config.js`는 `location.hostname`이 `localhost`/`127.0.0.1`일 때 자동으로
에뮬레이터(Firestore :8080, Auth :9099, Functions :5001)에 연결되므로 별도 설정이 필요 없습니다.

### 5-5. 알아두면 좋은 설계 결정

- **접근 링크 해지의 반영 시간**: A가 링크를 해지하면 서버는 즉시 세션을 무효화 시도하지만,
  이미 발급된 ID 토큰은 만료 전(최대 약 1시간)까지는 여전히 유효할 수 있습니다(Firebase Auth의
  일반적인 동작). 즉시 완전 차단이 필요한 고위험 상황이라면 이 점을 감안하세요.
- **C의 CANCEL 버튼**: 현장에서 문제를 발견해 CANCEL을 누르면 로그만 남고 그룹 자체는
  취소되지 않습니다(잔여 티켓도 복구되지 않음). 그룹의 실제 취소는 B(판매처)만 할 수 있습니다.
  현장에서 발견한 문제를 실제로 취소 처리하려면 B에게 알려 `ticket-seller.html`에서 취소해야 합니다.
- **그룹 수정은 QR을 바꾸지 않습니다**: B가 인원(예: 12명 → 10명)이나 날짜를 수정해도 같은 QR
  토큰이 유지되며, 스캔 시 최신 값이 그대로 조회됩니다. QR 자체를 새 값으로 교체하고 싶을 때만
  "QR 재발급"을 별도로 누르면 됩니다.
- **같은 날짜에 그룹 여러 개 등록 가능**: 판매처가 같은 날짜에 오전/오후 등 별도 그룹을 등록하고
  싶다면 그룹을 여러 개 만들면 됩니다(날짜당 1개로 강제하지 않음). QR도 그룹마다 하나씩 생깁니다.
- **QR 코드 라이브러리**: `ticket-seller.html`은 CDN의 `qrcode@1.5.1`(UMD 빌드)을 사용합니다.
  1.5.2 이상 버전은 jsDelivr 상에서 CommonJS 번들만 제공되어 `<script>` 태그로는 동작하지 않으니
  버전을 올릴 경우 브라우저에서 직접 동작하는지 반드시 확인하세요.

## 참고: Firebase Web API Key

`firebase-config.js`에 들어가는 `apiKey`는 비밀 키가 아니라 프로젝트 식별용 공개 값입니다
(공식 문서 기준). 실제 데이터 보호는 Firestore 보안 규칙(`firestore.rules`)이 담당하므로,
그대로 GitHub에 커밋해도 괜찮습니다.
