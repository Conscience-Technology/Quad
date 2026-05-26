# Quad — Spec (v2)

> **Reporter의 영상·사진·음성·DOM·네트워크 컨텍스트가 한 timeline에 정렬되어, MCP/CLI를 통해 Claude Code에게 그대로 흘러간다.**
> 단순 버그 트래커가 아니라, **멀티모달 reporter 컨텍스트 → 코드 수정**까지 한 루프로 묶는 파이프.
> 핵심 차별점: 다른 도구가 텍스트/스택만 전달할 때, Quad는 reporter가 보고 들은 **모든 모달리티를 LLM-ready bundle로 packaging해서 직접 Claude Code에 흘림**.
>
> **MIT 라이선스 오픈소스 · 셀프호스트 우선 · 무료** — 누구나 Railway/EC2/Fly/자체 K8s에 띄워 운영. SaaS 운영 없음.

---

## 0. v1 → v2 변경 요지 (자기 비판)

v1의 빠진 곳을 박고 들어간 부분:

| v1의 문제 | v2의 대응 |
|---|---|
| 댓글 모델이 "bug에 한 줄" 수준으로 모호 — 영상에 타임라인 댓글, element pin에 스레드 같은 게 빠짐 | **3-레벨 댓글 모델**: bug-level / element-pin-level / **video-timestamp-level**. 영상 플레이어는 댓글 오버레이 1급 시민 |
| 대시보드가 "리스트 + 상세" 수준 → 실제로 정리되고 분류되는 흐름 부재 | **단일 Inbox + Triage 보드** 구조. Inbox(미분류) → Triage(확인 중) → Confirmed(태스크) → Resolved. 키보드 단축키로 빠르게 흘러감 |
| 영상이 "재생만" — 거기서 바로 코멘트/지목 못함 | 영상 플레이어가 **타임라인 댓글 + 프레임 스냅 + STT 트랜스크립트 동기화**를 한 뷰로 |
| "Confirm"의 의미가 없음 — 그냥 status 변경에 그침 | **Confirm = Task 생성 트리거**. Task는 풀 컨텍스트 번들(영상/스크린샷/transcript/메타/스레드 전체)을 굳혀서 들고 다님 |
| Claude Code 연결 없음 (현재 user의 핵심 요청) | **MCP 서버 `@quad/mcp` + CLI `npx quad`** 두 채널. Claude Code가 `quad_pick_task` 한 번으로 Task Brief(자기충족 컨텍스트) 받아 작업, 진행/완료 상태와 PR URL 다시 push back |
| Phase 1 범위가 "보고 받기"에서 멈춤 → 루프 절반이 다음 분기로 빠짐 | Phase 1을 **end-to-end 루프 한 줄**로 재정의. 멤버/권한/SaaS 청구는 뒤로 미룸 |

---

## 1. 한 줄 정의

Next.js 서비스에 SDK 한 줄을 심으면:
1. 최종 사용자(Reporter)가 **Figma처럼 element 레이어 위에 직접** 댓글을 달고, 말하고, 녹화해서 던지고
2. SDK는 그 element를 **CSS selector + bounding box + 컴포넌트 트리 + source map 기반 원본 파일/라인**까지 정확히 짚음
3. 팀(Maintainer)이 한 inbox에서 정리하다가 "이건 고치자" 누르면
4. 멀티모달 컨텍스트가 **Task Brief**(자기충족 raw bundle)로 굳어져 — 마크다운 + 키프레임 이미지 + 같은 timeline에 정렬된 event 시계열 + source 해석본
5. **Claude Code가 MCP/CLI로 끌어다 직접 추론 + 코드 수정 → PR** (필요한 컨텍스트는 MCP 도구로 lazy pull)

→ 보고와 수정 사이의 컨텍스트 손실을 0에 가깝게. **AI 추론은 전부 Builder(Claude Code) 측**. Quad 서버는 데이터 정렬/packaging만.

## 1.5 Why Quad — 차별화

기존 도구가 못하는 두 가지를 동시에:

| | 기존 도구 | Quad |
|---|---|---|
| **Element 짚기** | Sentry는 stack trace만, BugHerd 류는 스크린샷+selector만 | **Figma-style overlay + DOM selector + 컴포넌트 트리 + source map → "이 element는 `src/components/PayNow.tsx:42`의 `<Button>`"까지 정확히 짚음** |
| **컨텍스트 모달리티** | 텍스트/스택 + 첨부 URL 정도 | **영상 키프레임 + STT 트랜스크립트 + DOM event trail + console + network**가 **같은 ms timeline에 정렬**된 LLM-ready bundle |
| **AI 핸드오프** | 사람이 보고 → 사람이 정리 → 사람이 수정 | Quad는 raw 멀티모달을 **알고리즘만으로 정렬·packaging** (STT 빼고 LLM 안 씀). Claude Code가 MCP로 image content + frames + 정렬된 timeline 받아 **직접 추론·수정**. 필요한 추가 컨텍스트는 lazy pull (`quad_get_frames`, `quad_get_timeline` 등) |
| **출력 형태** | 티켓 | **MCP 도구로 즉시 actionable** — Claude Code가 `quad_pick_task` 한 번으로 fix 시작 |

핵심: "버그 리포트 도구 + AI 통합"이 아니라, **"Reporter의 모든 감각 데이터를 결정론적으로 정렬해서 AI(Claude Code)에게 그대로 던지는 파이프"**. Quad는 AI를 적게 쓰고(STT만), 판단은 Builder 쪽에서.

---

## 2. 사용자/역할

| 역할 | 누구 | 어디서 |
|---|---|---|
| **Reporter** | 최종 사용자 / 내부 QA / 클라이언트 검수자 | 호스트 서비스 안 (SDK 오버레이) |
| **Maintainer** | PM / QA 리드 / 디자이너 | Quad 대시보드 (triage, confirm) |
| **Builder** | 개발자 + **Claude Code** | 로컬 레포 (MCP/CLI로 task 수신) |
| **Super Admin** | 인스턴스를 띄운 사람 (.env로 부트스트랩) | Instance settings (사용자/프로젝트/정책 관리) |

세 역할이 **같은 bug_report 데이터 위에서 다른 표면을 만질 뿐**. Super Admin은 OSS 셀프호스트 환경에서 instance를 운영하는 역할.

**조직 구조 (단순화: workspace 없음, project 1급)**:
- 1 instance = 1 조직 (OSS 셀프호스트 가정)
- instance 안에 N개 project
- user는 instance 전역 단일 계정
- 각 user는 N개 project에 `owner / admin / member` 역할
- instance 단위 정책(API key 만료, 데이터 보관, BYO OpenAI key)은 Super Admin이 관리
- 더 큰 격리 필요 시 → instance를 여러 개 띄우면 됨 (OSS 무료)

### 2.1 Primary user journey (Phase 1 핵심)

가장 자주 일어날 시나리오 — QA가 웹 화면 검수 중 장애 발견 → 30초 안에 완전한 보고:

```
1. QA: 화면 보다가 장애 마주침
2. → Cmd+Shift+B : Bug Mode 토글 ON (오버레이는 안 열고)
3. → Alt+Click   : 문제 element 위에서 Option+Click (Mac) / Alt+Click (Win) → 지목 (Figma-style overlay, 옆에 floating 코멘트 박스)
4. → 한 줄 텍스트  : "결제 버튼 누르면 빈 화면"
5. → Cmd+Shift+R : Capture session 시작 → 권한 다이얼로그 1번 → 녹화+마이크+STT 동시 시작
6. → 실제로 재현하면서 말함 : "여기 누르면 이렇게 빈 화면이 떠요"
7. → ■ 정지       : 영상 + 음성 + transcript + DOM event trail이 한 묶음으로 자동 저장
8. → 제출         : bug_report 생성 → 자동 전처리 (STT, 키프레임, source-map 해석, timeline 정렬)
9. Maintainer: Inbox에서 본 후 한 줄 의도 적고 Enter → Confirm → Task 큐 적재
10. Builder + Claude Code: `quad_pick_task` 한 번 → frames(vision) + timeline + source 받아 fix → PR
```

→ 핵심: **단축키 → 캡처 → 자동 → Confirm 한 클릭 → AI 핸드오프**. 사람이 끼는 곳은 (a) 발견·짚기·재현 (Reporter) (b) 한 줄 의도·승인 (Maintainer). 나머지는 전부 자동.

### 2.2 단축키 큐레이션 (Phase 1, 탭 활성화 시)

| 단축키 (Mac / Win) | 동작 |
|---|---|
| `Cmd+Shift+B` / `Ctrl+Shift+B` | Bug Mode 토글 ON/OFF |
| **`Option+Click` / `Alt+Click`** (Bug Mode ON일 때만) | element pin (Cmd+C 충돌 회피, Figma 스타일 modifier+click) |
| `Cmd+Shift+R` / `Ctrl+Shift+R` | Capture session 시작/정지 (영상+STT) |
| `Cmd+Shift+V` / `Ctrl+Shift+V` | Voice-only 녹음 시작/정지 |
| `Cmd+Shift+Q` / `Ctrl+Shift+Q` | 오버레이 패널 열기/닫기 (자유 작성) |
| `Esc` | Bug Mode/Capture/Voice 중지 |

**Cmd+C는 안 씀** — 브라우저 복사 단축키와 충돌. 대신 Bug Mode ON 상태에서 `Option+Click`/`Alt+Click`으로 element pin. modifier가 있어 호스트 앱의 onClick과도 자연 격리. Figma/Notion 사용자에게 익숙한 패턴.

전부 호스트 앱 옵션으로 재할당 가능 (`shortcut: { bugMode: "mod+shift+b", pin: "alt+click", ... }`). 디폴트는 호스트 앱 자체 단축키와 충돌 적은 조합. Phase 2 Extension이 글로벌로 끌어올림.

---

## 3. 전체 구조

```
[Reporter — 호스트 Next.js 서비스]
    │  SDK: Cmd/Ctrl+C pin / 우측 토글 / 영상 / 음성
    ▼  HTTPS (REST + presigned upload)
[Quad Backend — Next.js Route Handlers]
    │  Postgres + S3-호환 + STT provider
    ▲
    │
[Maintainer — Quad Dashboard (Next.js)]
    │  Inbox → Triage → Confirm(=Task 생성) → Resolved
    │  영상 player + 타임라인 댓글 + 트랜스크립트 동기화
    ▼  Confirm 시 Task 생성
[Task Queue (project별)]
    ▲▼  MCP server / CLI
[Builder — Claude Code in 로컬 레포]
    pick task → 컨텍스트 흡수 → 코드 수정 → PR → task 상태 갱신
```

핵심: **Dashboard = Backend = 한 Next.js 풀스택 앱**. SDK는 `@quad/sdk`, MCP는 `@quad/mcp`로 별도 npm.

---

## 4. Reporter 표면 (SDK)

### 4.1 진입점 3종

| 트리거 | 동작 | 산출물 |
|---|---|---|
| **Bug Mode ON + Option/Alt+Click** | 그 element를 지목 (Figma 스타일 modifier+click) | `bug_report` (kind=`pin`) + element 메타 |
| **우측 가장자리 토글** | full-height 오버레이 패널 슬라이드인 | `bug_report` (kind=`session`) — 자유 작성, 여러 항목 |
| **Capture 버튼 (메인 CTA)** | 화면 녹화 + 마이크 + STT를 한 번에 시작. 종료 시 한 묶음으로 저장 | `bug_report` (kind=`capture`) + video + audio + transcript + inline pins |

#### Bug Mode 토글이 왜 필요한가
- 기본 Cmd+C가 브라우저 "복사" 단축키와 충돌 → 토글 OFF일 땐 SDK가 단축키 안 가로챔
- 토글 ON일 땐 커서가 십자선으로 변하고 hover 시 element 하이라이트
- 옵션 `forceGlobal: true`로 호스트가 끌 수 있음 (검수 환경 등)

#### Pin Comment (element-level) — Figma-on-prod

핵심: **클릭한 그 element가 코드의 어느 줄인지까지 정확히 짚어서 저장**. 단순 스크린샷+selector 아님.

저장 필드:
- `target_selector` (CSS selector, data-testid 우선, semantic class > nth-child fallback)
- `target_dom_path` (selector 깨질 때를 위한 nth-child 절대 경로 백업)
- `target_bbox` (viewport 좌표) + `target_screenshot` (element + 주변 16px padding)
- `target_route` (Next.js pathname + dynamic param 분리, route pattern 추출)
- **`target_component_path`** (React fiber 추적 — `Layout > Dashboard > BillingTable > PayNowButton` 컴포넌트 트리 경로)
- **`target_source_location`** (source map 해석 결과 — `src/components/billing/PayNowButton.tsx:42:8`, 함수/컴포넌트명, 주변 코드 3줄)
- `target_react_props_shape` (직렬화 가능한 props key 목록 — 값은 제외, PII 방지)

→ Task Brief에는 selector뿐 아니라 **원본 파일:라인 + 컴포넌트 트리**가 들어감. Claude Code가 "어디를 고쳐야 하는지"를 fuzzy search 없이 즉시 알 수 있음.

피그마-스타일 댓글 UX:
- Bug Mode ON + hover → element가 violet outline + 라벨 (`PayNowButton · src/.../PayNowButton.tsx`)
- **Option/Alt+Click** → element 옆에 floating 코멘트 박스 (피그마처럼). modifier 없는 일반 클릭은 호스트 앱의 onClick 그대로 통과
- 제출하면 element 위에 작은 별 pin이 남음 (다른 Reporter도 hover로 볼 수 있는 옵션)

#### Bug List (session-level)
- 오버레이 안에서 N개 항목을 한 세션에 묶음
- 각 항목별로 영상/음성 첨부 가능
- 제출 시 "Bug Story 1개 = bug_report 1개" 또는 N개로 split (제출 시 선택)

#### Video Recording
- `MediaRecorder` + `getDisplayMedia` (탭 캡처 우선, 화면 전체 옵션)
- 30s / 2min / 5min preset + manual stop
- 녹화 중 빨간 dot indicator (오버레이가 닫혀도 노출)
- 정지 → presigned URL로 **S3 직업로드** (서버 경유 X)

#### Voice + STT
- 녹음 → 업로드 → 서버에서 Whisper API 호출
- (옵션) 브라우저 `SpeechRecognition`으로 실시간 미리보기 → 사용자 검수 후 저장
- transcript는 **segment 단위로 timestamp 포함** (영상 댓글 동기화의 기반)

#### Capture Session (메인 진입점)

**"버그를 말로 설명하면서 동시에 화면에서 보여주는" 가장 자연스러운 흐름.** 위젯의 1순위 CTA.

흐름:
1. Reporter가 큰 **Capture 버튼** 클릭 → 작은 confirm: `[화면 + 음성]` / `[음성만]` / 취소
2. 시작되면 화면 우상단에 작은 **floating control bar** 떠 있음:
   - 빨간 dot + 경과 시간
   - `■ 정지` / `‖ 일시정지` / `🎤 mute` (아이콘은 디자인 시스템 참조)
   - `+ 핀` 버튼: 누른 순간의 timestamp + 현재 마우스 위치/element가 inline pin으로 캡처됨 (입력창은 정지 후에 뜸)
3. Reporter는 자기 서비스 안에서 평소처럼 행동하며 말함 ("여기 누르면 이렇게 되는데...")
4. **정지** 누르면 → "Bug Story 정리" 화면:
   - 영상 + 트랜스크립트 동기화 프리뷰
   - 자동 생성된 핀 목록 (timestamp + element 스냅)
   - 각 핀에 짧은 코멘트 추가 가능
   - 제목 한 줄 작성 → 제출

음성만 (영상 없이) 모드:
- 화면 녹화 권한 안 받음. 마이크만 시작
- 그 동안에도 `+ 핀` 누르면 현재 화면 + element + 음성 timestamp가 함께 기록됨
- 결과: video 없는 bug_report (`kind=capture`), audio + transcript + inline pins

기술 디테일:
- 화면 녹화: `getDisplayMedia({ video: true, audio: true })` — 시스템 오디오와 마이크 동시 가능
- 마이크 분리 트랙: `getUserMedia({ audio: true })`로 별도 트랙 → 음질 더 좋음, STT 정확도 ↑
- 정지 후 클라이언트에서 webm으로 mux → presigned URL로 직업로드
- 호스트 앱이 백그라운드 탭으로 전환돼도 녹화는 유지 (control bar는 별도 popup window 옵션)
- 최대 길이 기본 5분, 옵션으로 늘림

**핵심: Capture 동안 element 단위 trail이 같이 기록됨.** 영상은 픽셀, trail은 의미. 두 개가 같은 timeline에 정렬되어 저장:

| 시각 (ms) | 종류 | 데이터 |
|---|---|---|
| 0 | session_start | url, route, viewport |
| 1240 | click | selector=`button.pay-now`, source=`PayNow.tsx:42`, component_path |
| 1241 | scroll | scrollY=320 |
| 2100 | input | selector=`input[name=card]`, length=16 (값은 마스킹) |
| 2380 | route_change | from `/billing` to `/billing/checkout` |
| 2890 | console_error | "TypeError: Cannot read..." + source 해석 |
| 2910 | network_error | POST /api/charge 500 |
| 3050 | voice_segment | "이렇게 빈 화면이 떠요" |
| 3120 | pin_added | 사용자가 `+ 핀` 누름 → selector + frame snapshot |

Reporter가 한 번도 명시적으로 짚지 않아도, **Capture 한 번에 element-level의 풀 trail이 영상과 정렬되어 잡힘**. Maintainer/AI는 영상의 어느 시점이 어느 코드 라인의 어느 이벤트인지 즉시 알 수 있음.

### 4.2 자동 수집 메타 (옵트인)

각 bug_report에 자동 첨부:
- `user_agent`, `viewport`, `device_pixel_ratio`
- `url`, `pathname`, `referrer`, `route_pattern` (Next.js route 패턴 추출)
- `console_logs` (최근 N개, ring buffer)
- `network_errors` (4xx/5xx 최근 N개)
- `client_timestamp`, `timezone`
- `sdk_version`, `git_commit_sha` (호스트 앱이 빌드시 주입)
- `user_id` / `email` (호스트가 `identify()` 호출 시)

### 4.3 SDK API (1차)

```tsx
// app/layout.tsx
import { QuadProvider } from "@quad/sdk/react";

<QuadProvider
  apiKey={process.env.NEXT_PUBLIC_QUAD_KEY!}
  user={{ id: "u_123", email: "user@acme.com" }}
  options={{
    shortcut: "mod+c",
    captureConsole: true,
    captureNetwork: true,
    video: { enabled: true, maxDurationMs: 120_000 },
    voice: { enabled: true, sttProvider: "auto" },
    position: "right",
    mask: ["input[type=password]", "[data-pii]"],
    commitSha: process.env.NEXT_PUBLIC_GIT_SHA,
  }}
>
  {children}
</QuadProvider>
```

```ts
import { quad } from "@quad/sdk";
quad.open();                  // 오버레이 열기
quad.startRecord({ kind: "screen" });
quad.stopRecord();
quad.identify({ id, email });
quad.setContext({ tenantId, plan, featureFlags }); // 호스트 앱의 custom context
quad.report({ title, body, target });
```

### 4.4 SDK 안전성 / 호환성 (호스트 앱을 절대 망가뜨리지 않는다)

비-협상 룰:

- **Fail silent**: 네트워크/스토리지/STT 어떤 실패도 호스트 앱에 throw하지 않음. 내부 에러는 자체 sentry로만
- **Lazy load**: Provider 마운트 시점엔 ~10KB 코어만 로드 (토글 버튼 + 단축키 리스너). Cmd+C 누르거나 토글 클릭 시점에 나머지(영상/음성/오버레이 UI)를 dynamic import
- **Shadow DOM**: 오버레이/토글은 shadow root 안에서 렌더 → 호스트 앱의 CSS와 격리. `:host` 변수로만 테마 노출
- **CSP 호환**: inline style/script 금지. 모든 스타일은 CSSOM API로 주입. nonce 미지원 환경에서도 동작
- **No global pollution**: `window.quad` 외 prototype 확장 금지
- **호환성 매트릭스 (Phase 1)**:
  | Next.js | App Router | Pages Router | RSC streaming | Edge runtime |
  |---|---|---|---|---|
  | 13 | (best effort) | (best effort) | OK | client-only |
  | 14 | ✓ 1차 타깃 | ✓ | OK | client-only |
  | 15 | ✓ 1차 타깃 | ✓ | OK | client-only |
- **iframe 한계**: cross-origin iframe(Stripe Checkout 등) 내부는 캡처/지목 불가 → 한계 명시
- **번들 사이즈 예산**: 코어 < 15KB gzip, full < 80KB gzip (영상/음성 제외)
- **호스트 앱 SDK key 마스킹**: SDK 자체가 캡처하는 스크린샷/영상에서 `Authorization` 헤더와 cookie는 무조건 제거 (네트워크 로그 캡처할 때)

### 4.5 외부 영상/스크린샷 첨부 (OS 녹화 → 자동 첨부)

**핵심: 사용자가 이미 OS 도구(QuickTime / Cmd+Shift+5 / Win+G / Snipping Tool)로 찍은 영상을 첨부하는 마찰을 0에 가깝게.** Capture Session(섹션 4.1)이 안 맞는 케이스(이미 찍어둔 영상, 백그라운드 캡처, internal QA 워크플로우)를 위함.

Phase 1 (Web only) 채널:

1. **Drag & Drop** — Reporter 위젯 / Maintainer dashboard / Task 상세 어디든 mov/mp4/webm 파일 드롭 → 즉시 presigned multipart 업로드 시작 (대용량 chunk + 재시도)
2. **Clipboard Paste** — 위젯/대시보드에서 `Cmd/Ctrl+V` → 클립보드의 이미지(스크린샷)/영상 자동 첨부. Mac `Cmd+Shift+Ctrl+5`(클립보드 복사 옵션)와 자연스러운 페어
3. **File Picker** — 위젯 안의 "파일 선택" 버튼 (`<input type=file accept="video/*,image/*">`)
4. **CLI `npx quad attach <bug-or-task-id> <file>`** — Builder/Maintainer가 터미널에서 첨부. CI/스크립트 환경에서도 활용
5. **드롭 영역의 onboarding 카피** — 위젯 안 드롭존에 `Cmd+Shift+5로 녹화 후 여기에 드롭` (Mac) / `Win+G로 녹화 후 여기에 드롭` (Windows) 가이드 표시

업로드 동작:
- 드롭/페이스트 시점부터 백그라운드 업로드. 사용자는 영상 업로드 끝나기 전에 코멘트 작성 가능
- 큰 파일(>50MB)도 multipart로 stable
- 업로드 진행률 진행바 + 실패 시 재시도 버튼
- 같은 bug에 여러 영상 누적 첨부 가능

자동화의 한계 (Web 표준만으로):
- **"가장 최근 OS 녹화 파일 자동 감지"는 안 됨** (브라우저는 임의 경로 접근 불가)
- 글로벌 단축키 안 됨 (위젯이 떠 있는 탭이 활성화돼야 함)
- 백그라운드 탭에서 녹화 시작/정지 불가

→ 이 한계는 Phase 2의 Browser Extension이, 또는 Phase 3의 옵션 Capture Helper가 풀어줌 (섹션 4.6).

### 4.6 배포 표면 — Web only (Tauri 안 함)

**결정: SDK도 Dashboard도 전부 웹브라우저. native 데스크탑 앱은 만들지 않는다.**

| 표면 | 어디 사는가 | Phase | 권한 | 마찰 | 적합 페르소나 |
|---|---|---|---|---|---|
| **Web SDK** (`@quad/sdk`) | 호스트 Next.js 앱 안 | **1** | 탭 화면 캡처, 마이크, DOM, drag/drop/clipboard 업로드 | 0 (설치 없음) | end-user, internal QA, 클라이언트 검수 |
| **CLI** (`@quad/cli`) | 사용자 OS 터미널 | **1** | 파일 시스템 접근(영상 attach), MCP 도구 호출 | npx 1줄 | Builder, Maintainer (재현 영상 첨부) |
| **Browser Extension** (`@quad/extension`) | Chrome/Firefox 웹스토어 | **2** | 시스템 전체 화면 녹화, 글로벌 단축키, 모든 탭, cross-origin iframe | 1클릭 설치 | 파워 QA, 외부 ↔ 내부 사이트 옮겨다니며 테스트 |
| **Capture Helper** (옵션, native) | menubar/tray 작은 도구 | **3 (필요해지면)** | 글로벌 단축키 + OS 전체 화면 + 끝나면 자동 업로드 | 설치 1회 | OS 녹화를 매일 쓰는 사용자, 백그라운드 캡처가 필수인 경우 |
| **Dashboard** | claude.ai/code 톤의 웹 앱 | **1** | 브라우저 표준 + drag/drop 영상 첨부 | 0 | Maintainer |

**Tauri를 SDK로 안 가는 이유 (자기 비판):**
1. *Positioning 붕괴* — "Next.js에 한 줄 심으면 끝"의 핵심 가치가 사라짐. end-user는 버그 신고하려고 앱 설치 안 함 → Reporter 페르소나가 internal-only로 강제 축소
2. *호스트 앱과의 결합 손실* — 데스크탑 앱은 호스트 브라우저와 별개 프로세스. element pin (DOM selector), `identify()`, `setContext()` 모두 별도 브릿지 필요
3. *두 SDK 유지비용* — API 표면 분기, feature parity 압박, 테스트 매트릭스 2배
4. *보안 모델 의미 손실* — `allowed_origins`/Origin 검증 같은 도메인 단위 API key 방어가 무의미
5. *Code signing 지옥* — Mac notarization, Windows signing, Tauri updater 운영 부담
6. *연쇄 압력* — 데스크탑 가면 결국 모바일 native도 요구됨 (4-플랫폼)

**Tauri를 Maintainer Console로도 안 가는 이유:**
- 메뉴바 위젯/OS 알림의 가치는 실재하지만, 빌드/배포/사이닝/업데이트 운영 비용이 명백히 더 큼
- 같은 효과의 대부분은 **PWA + Web Push + 브라우저 알림 + 탭 핀**으로 얻을 수 있음 (대시보드를 `installable PWA`로)
- 진짜 native가 필요해질 시점이 오면 그때 다시 판단 — 지금은 yagni

**예외 — Capture Helper (Phase 3, 옵션)**: Maintainer console과는 다른 포지션. "녹화 단축키 → 자동 업로드"만 하는 가벼운 menubar 도구. dashboard 전체를 native로 가는 게 아님. OS 녹화가 일상 워크플로우인 사용자 케이스가 명확해질 때만. Phase 1/2는 Web + Extension으로 충분.

**권한 문제는 Browser Extension(Phase 2)이 90% 풀어준다:**
- 글로벌 단축키 (`Cmd+Shift+C` 어디서든)
- `chrome.tabCapture` + `desktopCapture`로 시스템 전체 화면
- 모든 탭에서 동일하게 동작 (호스트 앱 SDK 미설치 사이트에서도)
- cross-origin iframe 캡처 (확장 권한으로 우회)
- 설치 마찰은 웹스토어 1클릭

→ 모든 표면은 웹 (또는 웹 기반 확장). Tauri/Electron 안 함.

---

## 5. Maintainer 표면 (Dashboard)

### 5.1 IA (정보 구조)

```
/login, /signup
/onboarding                              ← Super Admin은 자동, 일반 user는 project 선택/신청
/                                        ← 내가 멤버인 project 목록
/[project]
  /inbox                                 ← 미분류 (Reporter가 막 던진 거)
  /triage                                ← 확인 중 (질문/추가정보 요청)
  /tasks                                 ← Confirmed (Claude Code가 가져갈 큐)
  /resolved                              ← PR merge / wont_do
  /bug/[id]                              ← 상세 (모든 상태 공통)
  /task/[id]                             ← Task Brief 뷰 (Confirmed 이후)
  /members                               ← project 멤버 + 승인 대기
  /settings
    /general                             ← 이름/도메인 화이트리스트
    /api-keys                            ← 발급/회수/rotate
    /privacy                             ← 마스킹/옵트인 룰
/admin                                   ← Super Admin only
  /users                                 ← instance 전역 user 목록 + 비활성화
  /projects                              ← 모든 project 목록 + 강제 권한
  /settings                              ← instance 정책 (BYO OpenAI key, 데이터 보관 디폴트, 회원가입 open/closed)
  /audit                                 ← audit log
```

### 5.2 Inbox → Triage → Confirm 흐름

대시보드 핵심 화면은 **Triage 보드 1개**. 칸반 4열:

```
┌──────────┬──────────┬───────────┬──────────┐
│  Inbox   │  Triage  │ Confirmed │ Resolved │
│  (new)   │ (asking) │  (task)   │ (done)   │
└──────────┴──────────┴───────────┴──────────┘
```

키보드 단축키 (Linear/Height 류):
- `j/k` 위아래 이동
- `1/2/3/4` 컬럼 이동
- `c` 코멘트 작성
- `a` Assignee 지정
- `Enter` Confirm → Task 생성
- `r` Resolve
- `w` Won't do

### 5.3 Bug 상세 뷰

레이아웃:

```
┌────────────────────────────────┬───────────────────────┐
│  영상 플레이어 (있으면)          │  메타 패널            │
│  - 타임라인 위에 댓글 핀         │  - URL / route        │
│  - STT 트랜스크립트 자막 동기화   │  - UA / viewport      │
│  - event trail 오버레이          │  - reporter user     │
│    (click/error/network 타임라인) │ - sdk_version/sha    │
├────────────────────────────────┤                       │
│  Element 스크린샷 + selector     │  Maintainer 메모     │
│  + 컴포넌트 경로 + source line   │  (선택, 한 줄)        │
├────────────────────────────────┤  "이렇게 고쳤으면" 같은 │
│  Body (Reporter 작성)           │  의도 한 줄. 비우면    │
├────────────────────────────────┤  Reporter 원문이 곧    │
│  Comment Thread (3-level)       │  instruction.         │
│  (Reporter ↔ Maintainer)        ├──────────────────────┤
│                                │  [Confirm → Task]    │
│                                │  [Need info]         │
│                                │  [Won't do]           │
└────────────────────────────────┴───────────────────────┘
```

**Maintainer 메모**: AI 가설 자동 생성은 안 함 (토큰 낭비 + Claude Code 앵커링 위험). Maintainer가 원하면 한 줄 의도만 적고 Confirm. 그게 그대로 Task Brief의 `Maintainer instruction` 필드에 들어감. 비우면 Reporter 원문이 곧 instruction. 가설/repro/fix proposal 같은 추론은 전부 Claude Code 쪽에서.

### 5.4 영상 플레이어 — 1급 표면

요구사항을 만족시키는 핵심 부품:

- **타임라인 댓글 핀**: 재생 중 `C` 누르면 현재 timestamp에 핀 + 코멘트 입력. 핀 hover 시 미리보기.
- **트랜스크립트 동기화**: 옆 패널에 STT segment 리스트, 현재 재생 위치 하이라이트, segment 클릭 시 그 시각으로 점프.
- **프레임 스냅**: 특정 timestamp의 프레임을 캡처해서 코멘트에 inline 첨부.
- **속도/구간 반복**: 0.5x~2x, 구간 루프 (재현 확인용).
- **Maintainer ↔ Reporter 양방향 댓글**: Reporter도 본인이 보낸 영상의 timestamp 댓글에 답할 수 있음 (이메일 매직 링크로 게스트 접근).

### 5.5 중복 처리 / Fingerprinting (Inbox 스팸 방지)

같은 버그가 100명한테 발생하면 inbox 폭발. 자동 묶음 필수.

Fingerprint 산출:
- `route_pattern` (예: `/dashboard/[org]/billing`)
- `target_selector` (있을 때) 또는 `target_dom_path` 정규화
- `console_errors`의 stack signature (top frame 2개)
- `network_errors`의 method + path pattern + status

→ 해시해서 `bug_reports.fingerprint` 저장. 동일 fingerprint가 있으면:
- 신규 bug_report 만들지 않고 기존 것에 **occurrence** 추가 (`bug_occurrences` 테이블: bug_report_id, reporter, attachments[], created_at)
- Inbox에서는 "x 12 reports" 뱃지로 표시
- 영상/음성/스크린샷은 각 occurrence별로 보존 (최신 N개만 hot, 나머지 archive)
- Maintainer가 "분리" 버튼으로 별도 bug로 split 가능

→ Confirm은 묶음 단위(bug_report 단위)로. Task Brief에 "총 12건 발생, 대표 사례 3건의 영상 첨부" 식으로 정리.

### 5.6 Comment Model (3-레벨)

| Level | 어디에 달림 | 누가 보냄 |
|---|---|---|
| **bug-level** | bug_report 전체 | Reporter / Maintainer 둘 다 |
| **pin-level** | target element pin | Reporter / Maintainer 둘 다 |
| **video-timestamp-level** | attachment(video) + ms offset | Reporter / Maintainer 둘 다 |

스레드는 평면 (reply 깊이 1). `@user` 멘션은 멤버 단위 (Phase 2).

---

## 6. Confirm → Task → Claude Code 루프 (핵심)

### 6.1 Confirm의 의미

Maintainer가 bug 상세에서 **[Confirm → Task]** 누르면:

1. `bug_report.status = "confirmed"`
2. 그 시점의 **모든 컨텍스트가 freeze**되어 `tasks` 레코드 생성
3. Task에는 **Task Brief**라는 자기충족 마크다운 번들이 생성됨 (DB + 오브젝트 스토리지 둘 다 저장)
4. Task는 `tasks/queued` 큐로 들어감 → Claude Code가 가져갈 수 있는 상태

Confirm은 **단순 상태 변경이 아니라 컨텍스트 stamping 이벤트**. 이후 원본 bug에 댓글이 더 달려도 Task Brief는 안 바뀜 (필요 시 "Refresh Brief" 버튼으로 재생성).

### 6.2 Task Brief 구조 (자기충족 raw 멀티모달 번들)

Claude Code가 받는 **유일한 입력**. 도구 호출 N번 없이 이거 하나로 작업 시작 가능해야 함. **AI가 사전에 해석한 결과는 없음** — 정렬된 raw 데이터를 그대로 묶음.

구성요소:
1. **Markdown brief** (아래 템플릿) — 사람도 LLM도 읽음. Reporter 원문 + Maintainer 한 줄 의도 + source pointer + 메타
2. **Multimodal bundle** — 키프레임 이미지 N장 (vision input), 정렬된 timeline JSON, 트랜스크립트 (timestamp 포함)
3. **Source pointer 풀세트** — selector + component path + source file:line + 주변 코드 (source-map 결정론적 해석)

→ suspect cause / repro / fix proposal **같은 추론은 brief에 없음**. Claude Code가 1차로 brief를 보고, 필요하면 `quad_get_frames(range)` / `quad_get_timeline(kinds)` / `quad_get_source` 같은 MCP 도구로 lazy하게 추가 컨텍스트 끌어와 자기 추론으로 가설/수정.

MCP로 전달될 때는 markdown(text) + 이미지(image content type) + json(text)이 묶음으로 옴 (섹션 6.4 참조).

**크기 한도 (default; instance settings에서 override 가능)**:

| 부분 | 한도 |
|---|---|
| Markdown brief 본문 | 8KB (~2000 토큰) |
| Console log 줄 수 | 최근 50줄 (incident 시점 ±25줄 우선) |
| Network error 항목 | 최근 20개 |
| Frames 장수 | 4~6장 (장면변화 + 핀시점 + 시작/종료 중 자동 선별) |
| Frame 사이즈 | 1280px wide, JPEG quality 80, 장당 ~150KB |
| Timeline JSON event 수 | 최대 200개 (kind별 비례 샘플링) |
| Transcript | 영상 길이만큼 그대로 (실제론 1~5분이라 작음) |
| **Total inline bundle** | **< 2MB** (영상/음성 원본 제외) |
| 영상/음성 원본 | **항상 signed URL만** (inline 금지). MCP 응답에 URL만 포함, Claude Code 필요 시 `quad_get_frames`로 추가 프레임 pull |
| 핀 주변 trimmed clip (±5초) | Phase 2 옵션 (`quad_get_clip(task_id, ms, radius)`로 lazy 생성) |

원칙: **1회 호출(`quad_get_task`)로 받는 bundle은 작게, 더 깊이 들어가야 하면 도구 추가 호출**. lazy pull이 토큰/대역폭 모두 절약.

```markdown
# Task: [bug title]

## Summary
[Maintainer가 Confirm 시 작성한 "무엇을 고쳐야 하는가" — optional]

## Origin
- Reporter: [user_id or email or anon]
- Reported at: 2026-05-25T12:34:56+09:00
- Project: acme-web
- Route: /dashboard/[org]/billing
- URL: https://app.acme.com/dashboard/acme-corp/billing
- Commit at report time: a1b2c3d

## Reporter's words
> [bug_report.body 원문]

## Target element (source-mapped)
- Selector: `[data-testid="invoice-row-3"] > button.pay-now`
- DOM path fallback: `body > div:nth-child(2) > ...`
- Component path: `RootLayout > DashboardShell > BillingTable > InvoiceRow[3] > PayNowButton`
- **Source location: `apps/web/src/components/billing/PayNowButton.tsx:42:8`**
- Source excerpt (±3 lines):
  ```tsx
  // 39: export function PayNowButton({ invoice, onPay }: Props) {
  // 40:   const [loading, setLoading] = useState(false);
  // 41:   const handleClick = async () => {
  // 42:     await onPay(invoice.id);  // <-- here
  // 43:     setLoading(true);          // bug: setLoading after await
  // 44:   };
  // 45:   return <button onClick={handleClick}>Pay</button>;
  ```
- Props shape (keys only): `invoice`, `onPay`
- Screenshot: ./assets/pin-screenshot.png
- Bounding box: { x, y, w, h }

## Maintainer instruction (optional)
[Confirm 시 Maintainer가 한 줄 의도를 적었으면 여기. 비어 있으면 Reporter 원문이 곧 instruction.]

(가설/repro/fix 같은 추론은 Quad가 만들지 않음 — Builder가 위 raw 컨텍스트 보고 직접 판단)

## Video
- File: ./assets/recording.webm  (signed URL: https://...)
- Duration: 0:47

## Transcript (with timestamps)
- [0:02] "여기 결제 버튼을 누르면"
- [0:05] "이렇게 빈 화면이 떠요"
- [0:12] "그리고 콘솔에 보면..."
...

## Timestamped comments on video
- [0:05] Maintainer (PM): "이거 stripe webhook race condition 같은데"
- [0:12] Reporter: "네 어제도 같은 게..."

## Pin comments
- Reporter: "여기 클릭하면 안 됨"
- Maintainer: "재현됨. invoice id 3번에서만"

## Environment
- User agent: Mozilla/5.0 (...)
- Viewport: 1440x900
- Device pixel ratio: 2
- Timezone: Asia/Seoul

## Console (last 50, around incident)
[2026-05-25T12:34:50Z] error: Uncaught TypeError: Cannot read 'id' of undefined at PayNow.tsx:42
...

## Network errors (last 20)
POST /api/checkout 500  (resp: {"error":"webhook_timeout"})
...

## Aligned timeline (ms 기준)
| t (ms) | kind | summary |
|---|---|---|
| 0 | session_start | route `/dashboard/[org]/billing` |
| 1240 | click | PayNowButton (`PayNowButton.tsx:42`) |
| 1245 | network_request | POST /api/charge |
| 1248 | voice | "결제 버튼을 누르면" |
| 2890 | network_response | POST /api/charge → 500 (webhook_timeout) |
| 2895 | console_error | TypeError at `PayNow.tsx:42` |
| 3050 | voice | "이렇게 빈 화면이 떠요" |
| 3120 | pin_added | by reporter — selector `button.pay-now` |

(full JSON: ./assets/timeline.json)

## Key frames (vision input)
- `./assets/frame-1240.jpg` — click 시점 직전
- `./assets/frame-2890.jpg` — error 발생 직후 (빈 화면)
- `./assets/frame-3050.jpg` — reporter가 "빈 화면" 언급한 시점
- `./assets/frame-pin.jpg` — reporter가 핀 추가한 시점

## Attachments
- recording.webm (1.2MB)
- pin-screenshot.png (84KB)
- voice-1.mp3 (240KB)
- timeline.json (12KB)
- frames/ (4 jpg, total 320KB)

## Maintainer instruction (optional override)
[Confirm 시 "이렇게 고쳐달라" 메모를 적었으면 여기에]

---

(Auto-generated by Quad. Update task status via MCP: quad_update_task.)
```

원칙: **에이전트가 추가 도구 호출 없이 작업 가능한 최소 단위**.

### 6.3 Task 상태 머신

```
queued ──pick──▶ picked ──work──▶ in_progress ──pr──▶ pr_open ──merge──▶ done
   │                                                                       
   └──drop──▶ queued (다른 사람/세션이 가져갈 수 있게)
   
어디서든 ──skip──▶ wont_do
```

상태 변경 권한:
- `queued → picked`: Builder (Claude Code 또는 사람)
- `picked → in_progress`: Builder
- `in_progress → pr_open`: Builder (PR URL 동봉)
- `pr_open → done`: Maintainer 확인 (또는 PR merge webhook 자동)
- `* → wont_do`: Maintainer

### 6.4 Claude Code 연결 — MCP + CLI

**MCP 서버 (`@quad/mcp`)** — 대화형, 추천 경로. **응답이 멀티모달**: text + image content + json 묶음.

도구 목록:
| Tool | 역할 | 응답 |
|---|---|---|
| `quad_list_tasks(project, status?)` | 큐 조회 | text (lean list) |
| `quad_pick_task(project, task_id?)` | 다음 또는 지정 task claim → `picked` + Task Brief 반환 | text + image (key frames) + json (timeline) |
| `quad_get_task(task_id, depth?)` | Task Brief 전체 | text + image + json. `depth=lean` 시 frame 수 축소 |
| `quad_get_frames(task_id, range_ms?)` | 영상 키프레임만 (특정 구간 옵션) | image[] |
| `quad_get_transcript(task_id)` | 트랜스크립트만 (segment timestamps) | text |
| `quad_get_timeline(task_id, kinds?)` | 정렬된 timeline JSON (click/console/network/voice 등 필터) | json |
| `quad_get_source(task_id)` | source map 해석 결과 — 관련 파일들의 file:line + 주변 코드 | text |
| `quad_update_task(task_id, status, note?, pr_url?)` | 상태 + 진행 메모 | text |
| `quad_post_comment(task_id, body, level, video_ms?)` | bug 스레드에 답 (Reporter가 보게 됨) | text |
| `quad_search_tasks(project, query)` | 텍스트 검색 | text |

핵심: `quad_pick_task`/`quad_get_task`는 **MCP image content type을 활용해 키프레임을 직접 LLM 입력으로 전달**. Claude Code(또는 vision-capable LLM)는 영상 파일을 다운로드/디코드하지 않고도 결정적인 시점의 화면을 직접 봄. `quad_get_frames`로는 필요한 구간만 추가로 끌어올 수 있음.

응답 packaging 예시 (MCP `CallToolResult`):
```jsonc
{
  "content": [
    { "type": "text", "text": "<Task Brief 마크다운 본문>" },
    { "type": "image", "data": "<base64 frame-1240.jpg>", "mimeType": "image/jpeg" },
    { "type": "image", "data": "<base64 frame-2890.jpg>", "mimeType": "image/jpeg" },
    { "type": "text", "text": "<timeline.json 본문>" }
  ]
}
```

연결:
```json
// ~/.config/claude-code/mcp.json
{
  "mcpServers": {
    "quad": {
      "command": "npx",
      "args": ["-y", "@quad/mcp"],
      "env": { "QUAD_API_KEY": "qd_xxx", "QUAD_PROJECT": "acme-web" }
    }
  }
}
```

전형적 사용:
```
사용자: "다음 quad 태스크 가져와서 고쳐줘"
Claude Code: quad_pick_task → Task Brief 받음 → 코드 수정 → git commit/push 
           → gh pr create → quad_update_task(status=pr_open, pr_url=...)
           → quad_post_comment("수정 PR 올라갔습니다: <URL>")
```

**CLI (`npx quad`)** — 비-MCP 환경 / 스크립트용 / **OS 영상 파일 첨부용**

```bash
npx quad login                           # API key 저장
npx quad pull --next                     # 다음 task → ./.quad/tasks/<id>/
npx quad pull <task-id>
npx quad status <task-id> --set in_progress
npx quad status <task-id> --set pr_open --pr https://github.com/...
npx quad comment <task-id> "message"

# 영상/스크린샷 첨부 (Mac/Windows OS 녹화 결과물)
npx quad attach <bug-or-task-id> ./recording.mov
npx quad attach <bug-or-task-id> ~/Desktop/Screen\ Recording*.mov  # 글롭 OK
npx quad attach <bug-or-task-id> --latest ~/Movies                  # 가장 최근 영상 자동 선택
```

`quad attach`는 multipart presigned 업로드 + 자동 STT 트리거. CI/스크립트나 터미널 좋아하는 사용자가 GUI 없이 영상 첨부 가능.

`./.quad/tasks/<id>/` 구조:
```
TASK_BRIEF.md          ← Task Brief 마크다운 본문
assets/
  recording.webm
  pin-screenshot.png
  voice-1.mp3
manifest.json          ← task_id, status, hashes
```

Builder가 IDE에서 그냥 폴더 열고 Claude Code에게 "이거 고쳐줘" 해도 동작.

### 6.5 양방향 신호

- Builder가 `quad_post_comment` 호출 → Reporter에게 매직 링크 메일 알림 (옵션)
- PR이 merge되면 GitHub webhook → 자동 `done` + Reporter에게 알림
- Reporter가 "수정 확인됨" 이면 `verified` 메타 (Phase 2)

### 6.6 멀티모달 전처리 파이프라인 (결정론, AI 안 씀)

bug_report가 도착하면 백엔드가 비동기 job으로 첨부물을 **결정론적 알고리즘으로만** 가공. **STT 외에는 LLM 호출 없음** (토큰 비용/지연/앵커링 회피).

| 입력 | 처리 | 출력 | AI? |
|---|---|---|---|
| **영상 (webm)** | (1) **OpenAI Whisper API (audio만)** segment+timestamp (2) FFmpeg 키프레임 추출 — 장면변화 감지(PSNR/SSIM) + 핀 시점 + 매 N초 (3) 프레임 간 image diff | `transcript.json`, `frames/*.jpg`, `frames.json`, `scene_changes.json` | Whisper만 |
| **음성 (mp3)** | **OpenAI Whisper API** + segment timestamp | `transcript.json` | Whisper만 |
| **스크린샷 (png)** | element bbox 정렬 (target_bbox와 매칭). OCR은 안 함 — Claude Code가 vision으로 직접 봄 | `screenshot.json` | ❌ |
| **DOM event trail** (Capture 시) | route_change / click / input / scroll / focus 정규화 | `events.json` | ❌ |
| **Console logs** | source-map 라이브러리로 원본 파일:라인 해석 | `console.json` (resolved) | ❌ |
| **Network errors** | URL pattern + status + body preview | `network.json` | ❌ |

**모든 출력은 같은 `t_ms` 기준 timeline에 정렬됨** → `timeline.json` 한 파일에 머지 (단순 sort+merge).

```json
{
  "duration_ms": 4200,
  "events": [
    {"t_ms": 1240, "kind": "click", "selector": "...", "source": {"file": "...", "line": 42}},
    {"t_ms": 1240, "kind": "frame", "url": "./frames/frame-1240.jpg"},
    {"t_ms": 1248, "kind": "voice", "text": "결제 버튼을 누르면", "segment_id": "s1"},
    {"t_ms": 2890, "kind": "network", "method": "POST", "path": "/api/charge", "status": 500},
    {"t_ms": 2895, "kind": "console", "level": "error", "message": "...", "source": {"file": "PayNow.tsx", "line": 42}}
  ]
}
```

→ Claude Code는 텍스트 brief뿐 아니라 `frames/`(vision) + `timeline.json`(정렬된 사실) + 해석된 source location까지 한 번에 받음. **여기서 가설/repro/fix는 Claude Code의 몫**. Quad는 데이터 정렬까지만.

OCR은 Phase 2에 옵션으로만 추가 검토 (그때도 Tesseract 같은 결정론). 1차에선 vision-capable LLM이 키프레임 직접 보면 충분.

### 6.7 Repo 매핑 + Source Map (Task Brief 정확도의 결정타)

Task Brief에 `PayNow.tsx:42` 같은 minified 스택만 들어가면 Claude Code가 못 고침. 두 가지가 필요:

**Repo 매핑 (project ↔ repo)**

`projects.repo` 필드:
- `provider`: `github` / `gitlab` / `local`
- `owner`, `name`, `default_branch`
- `path_prefix` (모노레포일 때 `apps/web/` 등)

용도:
- Claude Code가 `quad_pick_task` 했을 때 응답에 `working_dir_hint` 포함 → "이 task는 이 레포의 이 폴더에서 작업하세요"
- PR URL 자동 검증 (해당 repo에서 온 PR인지)
- (먼 미래) GitHub App 설치 시 PR 상태 webhook 자동 연결 — 우선순위 낮음. Builder가 `quad_update_task`로 직접 상태/PR URL 보내는 방식으로 시작

**Source map upload**

빌드 타임에 호스트 앱이 source map을 Quad에 업로드 → release 단위로 보관.

```bash
npx quad sourcemap upload \
  --release $GIT_COMMIT_SHA \
  --project acme-web \
  ./.next/static
```

런타임:
- SDK가 stack trace 잡을 때 `git_commit_sha`를 함께 전송
- 서버에서 해당 release의 source map으로 stack 해석 → 원본 파일:라인 + 함수명 + 주변 코드 3줄을 `bug_reports.meta.resolved_stack`에 저장
- Task Brief에는 **해석된 스택**이 들어감 (원본 minified는 별도 섹션에 백업)

**PR merge closure (수동 기본)**

- 기본: Builder가 `quad_update_task(status=done)` 또는 Maintainer가 dashboard에서 수동으로 `done`
- (먼 미래) GitHub webhook으로 자동 closure — 우선순위 낮음

---

## 7. 데이터 모델 (개념적 ERD)

```
Instance (single row, super admin bootstrap)
 └─ User
     └─ ProjectMember ─┬─ Project ─┬─ ApiKey
                       │           ├─ BugReport ─┬─ Comment (3-level)
                       │           │             ├─ Attachment ─┬─ VideoComment
                       │           │             │              └─ Transcript
                       │           │             ├─ Occurrence (fingerprint 그룹)
                       │           │             └─ Metadata
                       │           ├─ Task ──────── TaskBrief (frozen snapshot)
                       │           └─ Settings
                       └─ Invitation / JoinRequest
```

핵심 테이블 (요약):

| Table | 핵심 필드 |
|---|---|
| `instance` | id (singleton), name, created_at, openai_api_key_encrypted (BYO), signup_open boolean, retention_overrides JSONB |
| `users` | id, email, password_hash, name, is_super_admin (bootstrap), is_active |
| `projects` | id, name, slug, allowed_origins[], repo JSONB (`{provider, owner, name, default_branch, path_prefix}`), created_at |
| `project_members` | project_id, user_id, role (`owner`/`admin`/`member`), status (`active`/`pending`), invited_by, joined_at |
| `api_keys` | id, project_id?, user_id?, scope (`sdk` / `mcp`), key_hash, prefix, env, expires_at, last_used_at, revoked_at |
| `bug_reports` | id, project_id, fingerprint, kind (`pin`/`session`/`capture`), status (`new`/`triaging`/`confirmed`/`resolved`/`wont_do`), title, body, target_selector, target_component_path, target_source_location, target_bbox, target_route, page_url, meta JSONB, reporter_user_id?, reporter_anon_key |
| `bug_occurrences` | id, bug_report_id, reporter_anon_key/user_id, meta JSONB, created_at |
| `comments` | id, bug_report_id, level (`bug`/`pin`/`video`), video_attachment_id?, video_ms?, author_kind (`reporter`/`member`/`builder`), author_id, body |
| `attachments` | id, bug_report_id, kind (`video`/`audio`/`screenshot`), storage_key, mime, duration_ms, size_bytes |
| `transcripts` | id, attachment_id, text, language, provider, segments JSONB (`[{start_ms, end_ms, text}]`) |
| `tasks` | id, project_id, bug_report_id, status (`queued`/`picked`/`in_progress`/`pr_open`/`done`/`wont_do`), claimed_by_user_id, pr_url, brief_storage_key, created_at |
| `task_events` | id, task_id, kind, actor, payload JSONB, created_at (audit log) |
| `audit_log` | id, who_kind, who_id, ip, user_agent, action, target, meta JSONB, created_at |

`tasks.brief_storage_key`는 Confirm 시점에 굳어진 Task Brief의 오브젝트 스토리지 키. DB에는 짧은 indexed 필드만, 본문은 bucket.

상세 ERD/인덱스/제약은 다음 산출물 `erd.md`로 분리.

---

## 8. Auth & Onboarding

**원칙: email + password 로그인. 매직 링크도 소셜도 안 함.** Project 접근은 **Owner/Admin 승인** 게이트.

### 8.1 Instance 부트스트랩 (셀프호스트)

처음 instance를 띄울 때:
- `.env`에 `SUPER_ADMIN_EMAIL=you@example.com` 설정
- 첫 부팅 시 `instance` 싱글톤 row 생성 + 해당 email 계정이 자동 super admin (가입 후 약속된 email로 로그인하면 super admin 권한 활성)
- `INSTANCE_SIGNUP_OPEN=true|false`로 일반 회원가입 허용 여부 결정 (default `false` — 셀프호스트 환경에서 안전)
- super admin이 dashboard `/admin`에서 user invite하거나 signup open 토글

### 8.2 가입 / 로그인

```
Signup: email + password (argon2id, 12자+)
   ▼ (signup_open=true일 때만, 또는 invite 토큰으로)
Login: email + password → HTTP-only cookie 세션 (30일 슬라이딩, HMAC-signed)
   ▼
첫 로그인:
  - super admin이면 → /admin
  - 일반 user면 → 본인이 멤버인 project 목록 (없으면 "project 참여 신청" 화면)
```

reset은 본인 이메일로 만료형 토큰 메일.

### 8.3 Project 접근 모델 (승인 기반)

세 경로로 project 멤버가 됨:
1. **Invite** — Project Owner/Admin이 dashboard에서 이메일로 초대 (instance 안에 가입 안 됐으면 자동 초대 + 가입 토큰)
2. **Join Request** — user가 instance 안에서 project slug로 신청 → pending → Owner/Admin이 Approve/Reject
3. **자기 자신** — project 만든 사람이 자동 Owner. (project 생성 권한: super admin이 instance settings에서 "누구나 생성" / "admin 이상만" 토글)

역할 (project 단위):
- **Owner** — project 생성자. 멤버 관리 + 삭제. 1명 이상
- **Admin** — 멤버 승인/초대, 세팅 관리
- **Member** — bug triage / confirm / task 처리

별도 **Super Admin**(instance 단위): 모든 project 진입, instance 정책 관리, user 비활성화.

### 8.4 Onboarding

**Super Admin 첫 부팅**: 자동 instance 생성 → `/admin/projects/new` → 첫 project 만들기 → SDK key 발급 → snippet 복사 → "테스트 버그 보내기" → MCP key 발급 + Claude Code 설치 가이드.

**일반 user 가입 후**: 멤버인 project 목록 (또는 빈 화면 → "project 참여 신청" 안내).

### 8.5 Reporter 인증 (호스트 앱 측)

Reporter는 Quad 계정이 **없음**. 두 트랙:
- **익명 reporter**: `reporter_anon_key` cookie 1개로만 식별. 회신 채널 없음(단방향)
- **식별된 reporter**: 호스트 앱이 `quad.identify({ id, email })` 호출 → bug_report에 `reporter.user_id`/`reporter.email` 기록. 호스트 앱 안의 SDK 위젯에서 본인이 보낸 bug 스레드 다시 열고 **답글 가능**

→ Maintainer가 dashboard에서 댓글 달면:
- 식별된 reporter: 호스트 앱 SDK 위젯의 "내 보고" 탭에 알림 + 답글 가능
- 익명 reporter: 답 못함 (Phase 2에 이메일 reply-to)

### 8.6 API Key 종류

- `sdk` key: 브라우저 노출 OK, origin 검증 + rate limit. **프로젝트 단위**
- `mcp` key: Claude Code/CLI용. 노출 금지. scope=`task:read,task:write,comment:write`. **user 단위 + 접근 가능한 project ID 명시** (한 개발자가 여러 project 다룰 수 있게)

### 8.7 Phase 2 이후 (지금 안 함)

매직 링크, 소셜 OAuth(GitHub/Google), SAML SSO, 이메일 reply-to로 reporter 회신, SCIM.

---

## 9. 기술 스택

**원칙: 셀프호스트 우선의 OSS. Railway 1순위 추천 path, 그러나 Docker로 어디든 portable (EC2 / Fly / Render / 자체 K8s).** SaaS 운영은 안 함.

| 영역 | 선택 | 이유 |
|---|---|---|
| Frontend + Backend | Next.js 15 (App Router) + **tRPC v11** | 풀스택 1앱, end-to-end 타입 안전 |
| Auth | 직접 구현 (email + password + bcrypt/argon2, HMAC-signed cookie 세션) | NextAuth 의존성 제거, internal과 같은 패턴 |
| DB | Postgres (Railway 자동 주입 `DATABASE_URL`) + **Drizzle ORM + drizzle-kit** | Prisma의 query engine binary 제거 → 노디펜던시 원칙. pure TS, SQL에 가까움, 마이그레이션 도구 자체 보유 |
| Object Storage | **Railway Storage Buckets** (S3 호환, BUCKET_NAME/ENDPOINT/ACCESS_KEY_ID/SECRET_KEY/REGION 자동 주입) | internal 프로젝트와 동일 패턴 |
| Presigned URL | `@aws-sdk/s3-presigned-post` + `@aws-sdk/s3-request-presigner` | internal과 동일. private only, 짧은 만료 |
| STT | **OpenAI Whisper API (audio transcription only)**. 사용자 BYO 키 | segment timestamp 제공. **Whisper 외 OpenAI API 호출 금지** (vision/chat/embed 비용 회피) |
| Video player | 자체 (HTML5 video + 타임라인 캔버스 오버레이) | 댓글 핀 커스텀 필요 |
| **Web SDK 빌드** | tsup (ESM/CJS + React entry 분리). **zero runtime dependency 목표** | 호스트 앱에 심으므로 dep 표면 최소 |
| MCP 서버 | `@modelcontextprotocol/sdk` | 표준 |
| CLI | `commander` (가벼움). chalk 안 씀 — `process.stdout.write` + ANSI 직접 | 노디펜던시 원칙 |
| **호스팅 (1순위 path)** | **Railway one-click deploy** (앱 + Postgres + Storage Bucket 한 프로젝트, 자동 env 주입) | 사용자 본인 dogfood + 가장 빠른 시작 |
| **호스팅 (portable)** | Docker image + `docker-compose.yml` 제공 → EC2 / Fly.io / Render / Hetzner / 자체 K8s 어디든 | OSS 사용자 전반 |
| 환경 변수 (S3 호환 일반화) | `DATABASE_URL`, `BUCKET_NAME`, `BUCKET_ENDPOINT`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_KEY`, `BUCKET_REGION` | Railway는 자동 주입, 다른 호스트는 수동. AWS S3 / Cloudflare R2 / MinIO / Backblaze B2 호환 |
| 직접 설정해야 할 env | `SESSION_SECRET`, `OPENAI_API_KEY` (Whisper 전용, optional — 없으면 STT 비활성화), `EMAIL_PROVIDER_KEY` (Resend 등), `SUPER_ADMIN_EMAIL`, `INSTANCE_SIGNUP_OPEN` | boot 시점에 SESSION_SECRET/SUPER_ADMIN_EMAIL 없으면 fail-fast. OpenAI 키 없으면 STT만 비활성화하고 나머지 기능은 동작 |

### 9.1 노디펜던시 원칙

Quad **자신**의 의존성을 최소화. 특히 SDK는 고객사에 심어지는 코드이므로:

- **Web SDK (`@quad/sdk`)**: runtime dependency **0개** 목표. React adapter는 React만 peer dep. fetch/FormData/MediaRecorder/Web Crypto/Shadow DOM 등 **Web 표준만** 사용
- **MCP server (`@quad/mcp`)**: `@modelcontextprotocol/sdk` + Node 내장만
- **CLI (`@quad/cli`)**: `commander` 1개. chalk/inquirer 같은 화려한 거 안 씀
- **앱 (`apps/web`)**: Prisma + AWS SDK presign 모듈 + Next.js 외에는 까다롭게 골라서만 추가. 새 의존성 추가 시 정당화 필요

이유: (1) 보안 표면 줄이기 (특히 SDK는 고객사 환경에서 실행됨) (2) 번들 사이즈 (3) 공급망 공격 대응 (4) 유지비용

### 9.2 LLM 사용 정책 (비용 통제)

**Quad 서버는 AI를 거의 안 쓴다. STT 한 곳만.**

| 호출 | 허용? | 이유 |
|---|---|---|
| OpenAI Whisper (audio transcription) | ✅ 유일 허용 | STT는 알고리즘으로 대체 불가 |
| OpenAI Vision (gpt-4o, image input) | ❌ 금지 | 비용 큼 + Claude Code 측에서 어차피 처리 |
| OpenAI Chat Completion (text) | ❌ 금지 | 가설/요약 추론은 Builder 측 책임 |
| OpenAI Embeddings | ❌ 금지 (Phase 1) | 검색은 Postgres FTS로 |
| Anthropic / 기타 LLM 호출 (서버 측) | ❌ 금지 | 같은 이유 |

운영:
- `OPENAI_API_KEY`는 **Whisper 엔드포인트(`/audio/transcriptions`)에만** 사용. 다른 endpoint 호출 시도가 코드에 들어가면 lint/CI에서 차단
- 키는 사용자 본인이 BYO (Phase 1: 글로벌 1개 key, dogfood용). 이후 워크스페이스별 BYO key 옵션 (Phase 2)
- Whisper 비용 모니터링: 일/주 사용량 dashboard 표시 (영상/음성 시간 합산)
- 비용 한도 환경변수 (`WHISPER_MONTHLY_MINUTES_CAP`) — 초과 시 STT 자동 중단 + 알림

→ 사용자가 우려한 비용 폭주를 코드 레벨에서 막음. AI 호출은 STT 한 곳뿐. **OpenAI 키 미설정 시 STT는 비활성화되고 나머지 기능은 정상 동작** (영상은 transcript 없이 저장됨).

### 9.3 오픈소스 전략 (라이선스 / 설치 / GitHub star)

**라이선스: MIT.** fork 자유, 자체 SaaS화도 자유, 어디든 사용 가능. SaaS 운영을 안 할 거라 AGPL 보호 불필요.

리포지토리 구조:
```
quad/
├─ apps/web              Next.js 15 + tRPC v11 + Drizzle (대시보드 + API)
├─ packages/sdk          Web SDK (@quad/sdk), zero runtime dep
├─ packages/mcp          MCP server (@quad/mcp)
├─ packages/cli          CLI (@quad/cli)
├─ docker/
│  ├─ Dockerfile         앱 단일 이미지
│  └─ docker-compose.yml Postgres + MinIO + 앱 (셀프호스트 1줄 시작)
├─ railway.json          Railway one-click deploy 설정
├─ deploy/
│  ├─ railway.md         Railway 가이드 (1순위 path)
│  ├─ ec2.md             EC2 + RDS + S3 가이드
│  ├─ fly.md             Fly.io 가이드
│  └─ k8s/               Helm chart (커뮤니티 기여 환영)
├─ .env.example          모든 env 설명
└─ README.md             별 갯수 끌 메인 문서
```

GitHub star 끌 핵심 자산:
- README 상단에 **30초 데모 GIF**: Reporter Alt+Click → Capture → Maintainer Confirm → Claude Code가 MCP로 받아 PR 올리는 한 줄
- "**Deploy to Railway**" 원클릭 버튼
- "**Run locally in 60 seconds**": `git clone && docker compose up`
- 차별화 한 줄: *"The bug reporter that ships its context straight to your AI coding agent."*
- MCP/Claude Code 통합 = USP. Anthropic 생태계 별 받기 좋은 영역
- 짧은 비교표: vs Sentry / LogRocket / BugHerd / Userback

설치 경로:
1. **로컬 시도 (60초)**: `docker compose up` → `localhost:3010` → super admin email 입력 → 첫 project 생성
2. **Railway (5분)**: One-click 버튼 → Postgres/Bucket 자동 추가 → env 3개 입력
3. **자체 인프라**: Dockerfile + `.env.example` + 가이드. 가이드는 deploy/*.md 폴더에 OS별로

운영 정책:
- 모든 코드 / 마이그레이션 / Dockerfile / Helm chart는 같은 repo
- 이슈/PR welcome, RFC 라벨로 큰 변경 토론
- 정기 release tag + changelog

---

## 10. 보안 / 프라이버시

**전제: Quad는 고객사 코드에 SDK가 심어지고, 고객사 개발 환경에서 CLI/MCP로 fetch한다. 보안은 1급 시민.**

### 10.1 API Key 모델

| Key | 노출 가능? | 저장 | 검증 |
|---|---|---|---|
| `sdk` key (브라우저용) | ✅ 노출 전제 | DB에 prefix + bcrypt hash | Origin/Referer 매칭 + per-key/per-IP rate limit |
| `mcp` key (Claude Code/CLI용) | ❌ 노출 금지 | DB에 prefix + bcrypt hash. **클라이언트는 OS keychain 권장** (macOS Keychain / Windows Credential Manager / Linux libsecret) | scope 검증 (`task:read,task:write,comment:write`), revoke + rotate, 만료(기본 90일) |

- 모든 key는 발급 시 1회만 평문 노출 후 사라짐 (DB엔 hash만)
- 회수 시 즉시 무효화 + audit log
- `mcp` key는 워크스페이스 단위 단일 활성 (rotate 시 직전 1개는 grace 24h)

### 10.2 통신

- **HTTPS only**, HSTS (`max-age=63072000; includeSubDomains; preload`)
- API 응답은 `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin`
- CSP: dashboard와 SDK 위젯 모두 strict CSP (`default-src 'self'`)
- SDK는 자체 도메인의 endpoint만 호출 (호스트 앱의 fetch와 격리)

### 10.3 데이터 보호

- 마스킹: SDK 옵션 `mask: [selector...]` → 스크린샷/녹화/녹음 시 해당 영역 블러. `<input type=password>`는 자동
- 영상/음성/스크린샷은 **Railway Storage Bucket에 private only, presigned PUT/GET URL로 업로드/다운로드** (internal 패턴 그대로). 만료 짧게(업로드 15분, 다운로드 5분)
- presigned URL 발급 endpoint는 **cookie-protected** (internal `api/storage/presign-upload` 패턴)
- Reporter의 호스트 cookie/localStorage 수집 금지
- 네트워크 로그 캡처 시 `Authorization`, `Cookie`, `Set-Cookie` 헤더 자동 제거
- Reporter 데이터 삭제 요청 엔드포인트 (GDPR)
- Task Brief 안에 PII 가능성 → "Task Brief 생성 시 마스킹 룰 재적용" 옵션

### 10.4 인증/세션

- 비밀번호: argon2id, 12자 이상, 흔한 패턴 차단
- 세션: HMAC-signed cookie (internal과 동일), `Secure`, `HttpOnly`, `SameSite=Lax`
- 30일 슬라이딩 만료, 비밀번호 변경 시 모든 세션 무효화
- 로그인 실패 rate limit (per email + per IP)

### 10.5 Audit Log

`task_events` 외에 별도 `audit_log` 테이블:
- API key 발급/회수/회전
- 멤버 invite/approve/role 변경/제거
- project 생성/삭제
- instance settings 변경 (super admin)
- 데이터 export/삭제 요청
- `who_kind`, `who_id`, `ip`, `user_agent`, `action`, `target`, `meta JSONB`

### 10.6 데이터 보관 정책 (default, 프로젝트별 override 가능)

| 데이터 | Hot 보관 | Archive 후 처리 |
|---|---|---|
| `bug_reports` 메타 + 코멘트 | 영구 | — |
| 영상 (`video/*`) | 30일 | 1년 cold storage 후 삭제 |
| 음성 (`audio/*`) | 30일 | 1년 cold storage 후 삭제 |
| Transcript 텍스트 | 영구 | — (텍스트는 가벼움) |
| 스크린샷 | 90일 | 삭제 |
| Task Brief (frozen) | 영구 (프로젝트 살아있는 동안) | — |
| `resolved` / `wont_do` bug의 첨부물 | 90일 | 삭제 |

Resolved된 bug의 영상은 빠르게 archive (목적 달성).

---

## 11. Phase 계획

### Phase 0 (스캐폴딩)
- Monorepo: `apps/web` (Next.js 풀스택 + tRPC) + `packages/{sdk,mcp,cli}` + `docker/` + `deploy/`
- Drizzle schema 초안 + drizzle-kit 마이그레이션 (위 ERD 기준, instance/project/project_members 포함)
- Railway 1순위 path (railway.json) + Docker compose (docker/) — 둘 다 Phase 0에 동작
- README 초안 + MIT LICENSE + .env.example
- Auth (email+password, super admin 부트스트랩) + project + API key 발급까지

### Phase 1 (end-to-end 한 줄)
**목표: Reporter가 영상 + 음성 + 코멘트로 버그 던지면 → 결정론적 전처리로 정렬된 raw bundle 생성 → Maintainer가 한 줄 의도 적고 Confirm → Claude Code가 MCP로 image+timeline+source 풀세트 받아 직접 추론·수정·PR까지 올리는 한 줄.**

들어갈 것:
- SDK: Provider + 우측 토글 + 오버레이 + Bug Mode pin (Figma-style overlay, source-mapped) + Capture session (영상+STT+event trail) + 자동 메타 + **외부 영상 첨부 (drag/drop, clipboard paste, file picker, OS 녹화 onboarding 카피)**
- 호스트 앱 build-time: source map upload CLI
- Backend: bug_report / comment / attachment / transcript / task / task_events + **occurrence (fingerprint 그룹핑)**
- **결정론적 전처리 파이프라인 (섹션 6.6)**: Whisper STT + FFmpeg 키프레임 추출 + source-map 해석 + timeline 정렬. **STT 외에는 LLM 안 씀**
- Dashboard: Inbox/Triage/Confirmed/Resolved 4-컬럼 보드 + 상세 + 영상 플레이어(타임라인 댓글 + 트랜스크립트 동기화 + event trail 오버레이) + Maintainer 메모 한 줄
- Task Brief 자동 생성기 (raw bundle: markdown + frames + timeline.json + source excerpt — AI 가설 없음)
- MCP 서버: `quad_pick_task` / `quad_get_task` (image content type 포함) / `quad_get_frames` / `quad_get_timeline` / `quad_get_source` / `quad_get_transcript` / `quad_update_task` / `quad_post_comment` / `quad_list_tasks` / `quad_search_tasks`
- CLI: `login` / `pull` (`.quad/tasks/<id>/`에 frames+timeline+brief 다 떨궘) / `status` / `comment` / **`attach <bug-or-task> <file>`** (OS 녹화 영상 자동 첨부 + STT 트리거, `--latest` 옵션으로 가장 최근 영상 자동 선택)

### Phase 2
- **Browser Extension** (`@quad/extension`) — 글로벌 단축키 + 시스템 전체 화면 + cross-origin iframe + 모든 탭
- Slack/Linear 양방향 동기 (GitHub은 제외)
- 세션 리플레이 (rrweb 기반 DOM diff)
- AI 자동 분류 + 중복 클러스터링 ("이 버그 같은 게 7건 더 있어요")
- Reporter 회신 채널 확장 (이메일 reply-to)
- Light 테마

### Phase 3+
- 모바일 SDK (React Native)
- **Capture Helper** (옵션, native menubar 작은 도구) — 글로벌 단축키 → OS 전체 화면 녹화 → 정지 시 자동 업로드. 필요 명확해질 때만
- GitHub App / PR merge webhook 자동 closure (필요해지면)
- Helm chart 공식화 (커뮤니티 기여 흡수)
- (만약 유료 SaaS를 띄운다면) hosted instance — 코어는 그대로 MIT, 호스팅만 부가. **현재 계획엔 없음**

**전부 무료, MIT OSS, 셀프호스트.** 청구 모델 없음.

---

## 12. 디자인 시스템 — Minimal Cosmos

**원칙**: 미니멀 · 모던 · 우주(deep space) 톤. 정보의 위계를 spacing과 톤으로만 만들고, 테두리/장식은 거의 안 씀. Dashboard, SDK 위젯, MCP 도구 메시지까지 한 결.

### 12.1 톤
- **Deep space dark 우선** (Phase 1은 dark only. light 모드는 Phase 2)
- 색은 정보가 아니라 분위기. 컨텐츠는 거의 무채색, 액션 1개만 차가운 별빛 accent
- 한 화면에 강조 1개. 나머지는 톤 다운(투명도/대비로만 위계)
- 우주 = "검은 화면에 작은 점 하나가 강하게 보이는" 미감. 가득 채우지 않는 여백이 핵심

### 12.2 컬러 토큰 (초안)

```
--space-void        #06070c   /* 가장 깊은 배경 */
--space-bg          #0a0c14   /* 패널 배경 */
--space-surface     #11141d   /* 카드 */
--space-elevated    #181c27   /* 모달/오버레이 */
--space-border      #1f2433   /* 테두리 (거의 안 보이게) */

--star-100          #f5f7ff   /* primary text */
--star-300          #c8cde0   /* secondary text */
--star-500          #8a90a8   /* tertiary text */
--star-700          #4a4f63   /* disabled */

--nebula-violet     #8b7cf6   /* 1차 accent (별빛 보라) */
--nebula-cyan       #67e8f9   /* 2차 accent (블루 시프트) */
--nebula-rose       #fb7185   /* 경고/에러 (적색 편이) */
--nebula-amber      #fbbf24   /* attention */

--glow-violet       0 0 24px rgba(139,124,246,0.35)
--noise             url("data:image/svg+xml;...")  /* 2% opacity grain */
```

배경엔 매우 미묘한 grain noise + 큰 반경의 nebula gradient (한쪽 모서리에서 은은하게).

### 12.3 타이포

- Sans: **Geist Sans** (또는 Inter) — UI 본문
- Mono: **Geist Mono** (또는 JetBrains Mono) — code, selector, transcript, MCP 출력
- 본문 14/15px, 라인높이 1.55, letter-spacing 약간 음수 (-0.005em) — 매트한 화면 느낌

### 12.4 모션

- 기본은 정적. 모션은 "별이 흐르는 듯" ambient에만 사용 (오버레이 진입, 로딩)
- 듀레이션 짧게: 120-200ms, easing은 cubic `[0.2, 0.8, 0.2, 1]`
- 로딩 indicator는 spinner 대신 **별이 떠오르는 듯한 dot pulse**
- `prefers-reduced-motion` 존중 — 모션 전부 step

### 12.5 아이콘 / 일러스트

- **Lucide** (선 굵기 1.5, round) — UI 전반
- 브랜드 마크는 점 4개로 `quad` 표현 (네 개의 별)
- 일러스트는 거의 안 씀. 빈 상태(empty state)는 단일 별 + 한 줄 카피

### 12.6 컴포넌트 톤

- 버튼: 기본은 ghost(투명+텍스트), primary만 차분한 violet glow
- 입력: 테두리 없음, 바닥선 hairline + focus 시 violet underline
- 모달/오버레이: `--space-elevated` + 8% violet glow 외곽
- 영상 플레이어: 컨트롤바는 호버 시에만 페이드인. 타임라인은 얇은 hairline, 댓글 핀은 작은 별 모양

### 12.7 SDK 위젯도 같은 톤

호스트 앱이 light든 dark든 SDK 위젯은 **자체 shadow DOM 안에서 항상 dark cosmos**. 호스트 위에 작은 검은 우주 한 조각이 떠 있는 느낌.

- 우측 토글: 작은 별 4개 dot 클러스터, 호버 시 violet glow
- 오버레이 패널: 우측 슬라이드인, 폭 380px, `--space-elevated` 배경
- Capture 시 floating bar: 화면 우상단, 매우 작게, 빨간 dot만 살아있음

### 12.8 디자인 산출물

- Figma 라이브러리: tokens + 컴포넌트 (Phase 0 산출물)
- Tailwind config: 위 토큰 매핑 (`tailwind.config.ts`)
- Storybook 또는 simple `/design` 페이지: 컴포넌트 카탈로그

---

## 13. 열린 결정

답한 것:
- ~~Reporter 신원~~ → 익명 키 + `identify()` 둘 다 지원. 회신은 식별된 reporter만, 호스트 앱 SDK 위젯 안에서
- ~~인증 방식~~ → email + password (매직 링크/소셜 안 함). Project 접근은 Owner/Admin 승인 게이트 + instance 단위 super admin
- ~~디자인 방향~~ → Minimal Cosmos (섹션 12)
- ~~Capture 단일 진입점~~ → 영상+STT / STT-only 두 모드
- ~~배포 표면~~ → 전부 웹 (SDK + Dashboard). Tauri/Electron 안 함. Extension은 Phase 2
- ~~이름 "Quad"~~ → 브랜드명, 큰 의미 없음. 그대로 유지
- ~~GitHub 연동~~ → 우선순위 낮음. 먼 미래. 그때까지 Builder가 `quad_update_task`로 직접 상태/PR URL 보냄
- ~~AI 자동 정리/가설~~ → 안 함. Quad 서버는 결정론, AI 추론은 전부 Claude Code 측
- ~~호스팅/셀프호스트~~ → **Railway SaaS only** (internal 프로젝트와 동일 스택). 셀프호스트 안 함
- ~~스택~~ → Next.js 15 + tRPC v11 + Drizzle + Railway Postgres + Railway Storage Buckets + AWS SDK presign
- ~~노디펜던시 원칙~~ → SDK는 zero runtime dep 목표, 앱 전반 새 의존성 추가는 정당화 필요
- ~~LLM 정책~~ → OpenAI Whisper(audio) only, 사용자 BYO 키, 다른 endpoint 호출 금지

추가로 답한 것:
- ~~Cmd+C 충돌 정책~~ → Cmd+C 폐기. Bug Mode ON 상태에서 **Option/Alt+Click**으로 element pin (Figma 스타일 modifier+click)
- ~~Task Brief 크기~~ → markdown 8KB / console 50줄 / network 20개 / frames 4~6장 / total inline bundle < 2MB / 영상 원본은 항상 signed URL (섹션 6.2)
- ~~무료/유료~~ → **전부 무료. MIT OSS. 청구 모델 없음**
- ~~호스팅 방향 전환~~ → SaaS only → **셀프호스트 우선 OSS**. Railway 1순위 path + Docker portable (EC2/Fly/K8s)
- ~~조직 구조~~ → workspace 제거. project 1급 단위 + instance 단위 super admin

남은 결정: **없음.** 다음 산출물로 진행 가능.

---

## 14. 다음 산출물 순서

이 spec OK면:
1. `erd.md` — 테이블 풀 정의 + 인덱스/제약 + 상태 머신 다이어그램 (capture/occurrence 포함)
2. `data-dictionary.md` — enum 값, 상태 전이 규칙
3. `task-brief-schema.md` — Task Brief 마크다운 템플릿 + JSON manifest 스키마
4. `sdk-api.md` — Provider props/methods 풀 시그니처 + 이벤트 + Capture 모드
5. `mcp-tools.md` — MCP tool 시그니처 + 에러 코드
6. `design-tokens.md` + Tailwind config — 컬러/타이포/모션 토큰
7. `dashboard-wireframe.md` — Inbox/Triage/상세/영상플레이어 와이어 (Minimal Cosmos 톤)
8. 코드 스캐폴딩: `apps/web` + `packages/{sdk,mcp,cli}`
