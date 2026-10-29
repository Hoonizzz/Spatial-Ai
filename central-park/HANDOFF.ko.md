# 다른 채팅에서 이어받기

## 사용자의 목적

이 폴더의 Central Park Cost Distance 앱을 GitHub에 올리고 개발을 이어가는 것입니다. 사용자가 명시적으로 요청하기 전에는 저장소 공개 범위 변경, 사이트 공개 배포, 계정 권한 변경을 진행하지 않습니다.

## 전달물

이 ZIP에는 실제 소스가 들어 있습니다. 단순 설계 문서가 아닙니다.

- dist/index.html, style.css, app.js: 한국어 지도/설정/결과/재생 화면
- dist/engine.js: UTM 좌표, 방향 그래프, Dijkstra, 요금·MET 계산
- dist/data.js: NYC Parks / OSM / GBFS 취득과 캐시
- dist/worker.js: 별도 Worker에서 경로 계산
- dist/example.js: 명시적으로 선택하는 합성 예제
- dist/zip.js: 결과 ZIP 내보내기
- server.mjs: 로컬 정적 서버 및 선택적 JSON API
- tests/engine.test.mjs: 계산 검증 16개
- package.json: 실행·테스트 명령, 외부 패키지 의존성 없음
- README.ko.md: 상세 구현과 미완료/제약 항목
- SPEC.ko.md: 원본 한국어 기술 명세

`dist/`는 이 프로젝트에서 직접 작성하는 소스 디렉터리입니다. 빌드 산출물이라고 가정해 제외하거나 삭제하지 마세요. 앱은 외부 프레임워크 빌드 없이 실행됩니다.

## 바로 시작

```sh
npm run dev
npm test
npm run check
```

Node.js 22 이상. 서버 주소는 http://127.0.0.1:4173 입니다. npm install은 필요하지 않습니다. HTML을 파일로 직접 열면 Worker/모듈 제한 때문에 정상 실행되지 않습니다.

## GitHub 업로드

이 패키지에는 `.git`이 없으므로 새 저장소로 초기화할 수 있습니다. GitHub 원격 저장소 주소와 공개/비공개 범위는 사용자가 선택합니다. 기존 원격 저장소를 사용한다면 먼저 해당 내용을 확인하고 강제 푸시하지 마세요.

빈 원격 저장소를 이미 만들었다면 다음 순서로 올립니다.

```sh
git init
git add .
git commit -m "Add Central Park cost distance simulator"
git branch -M main
git remote add origin <사용자가 지정한 GitHub 저장소 주소>
git push -u origin main
```

위 꺾쇠 부분은 실제 주소로 바꿔야 하며 그대로 실행하지 않습니다. Git 사용자 이름/이메일 및 GitHub 로그인은 사용자의 실제 설정을 사용합니다. 토큰을 코드·README·원격 URL에 적지 마세요. 자동 GitHub Pages 배포는 포함하지 않았습니다. 필요하면 정적 dist/만 게시하되 Node API는 별도 서버가 필요합니다.

## 현재 상태와 다음 우선 작업

- 구현된 기능: A/B 선택·이동, 거리 기준 경로, 회원별 세전 USD, kcal gross/active 추정, 누적 그래프·재생, 요금 후보 비교, JSON/GeoJSON/CSV/스냅샷 ZIP.
- 16개 계산 테스트 통과. JS 구문 검사 통과.
- 작성 환경에서 DNS/소켓과 권한 제한으로 실제 외부 데이터 취득, 브라우저 UI, 실시간 API 통합, 원격 배포는 검증되지 않았습니다. 실행/배포 성공으로 표현하지 마세요.
- 공원 내부 승차는 East/West/Center Drive만 허용하는 보수적 모델입니다. 모든 현장 통행법규를 검증한 것은 아닙니다.
- A/B와 역은 50m 이내 도로로 투영합니다. 투영 전후 보행 연결을 보장하지 않습니다.
- ‘최저요금’ 비교는 거리 최단·시간 최단 후보 중 비교입니다. 요금 동률 전체 경로에 대한 전역 최단거리는 보장하지 않습니다.
- 실시간 반납 실패 자동 감지, 배터리, 차량별 도크 호환성, 시간별 폐쇄, 전문 GIS 위상 수정, 자유 주소 검색, 고도 보정은 미완료입니다.
- 요금 기준은 2026-10-28. 세금·개인 크레딧·장시간 요금 상세 규칙은 검증 필요합니다. 다음 작업 시 공식 요금을 재확인하세요.
- 먼저 README.ko.md의 ‘남은 명세 차이 / 운영 전 검증’을 읽고 인터넷 가능한 환경에서 실제 데이터 연결과 브라우저 UI를 확인하세요.

## 계정·배포 정보

이전 Sites 등록/배포 시도에 사용한 `.openai`, `.git`, 계정 자격증명은 의도적으로 제외했습니다. 이 ZIP에는 기존 Site의 제어권이 없습니다. GitHub 업로드에 기존 Sites 프로젝트는 필요하지 않습니다.

## 다른 채팅에 붙여 넣을 요청 예시

> 첨부한 central-park-github-source.zip을 풀고 HANDOFF.ko.md와 README.ko.md를 읽어줘. 소스를 검사하고 테스트한 뒤, 내가 지정하는 GitHub 저장소에 업로드할 수 있도록 진행해줘. 구현의 검증된 범위와 미완료 항목을 유지하고, 저장소 공개 범위나 외부 배포는 내 요청 없이 바꾸지 마.
