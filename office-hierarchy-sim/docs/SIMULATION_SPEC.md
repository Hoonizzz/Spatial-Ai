# Office Hierarchy: Spatial Agent Simulation

> **구현 명세서 v1.0** · 2026-11-04<br>
> 목적: 직급별 시야 거리와 위계에 의해 발생하는 **접근, 감시, 위장 업무, 도주**를 사무실 평면에서 시각화하는 브라우저 기반 공간 시뮬레이션.

## 1. 핵심 개념

이 시뮬레이션의 독립변수는 **직급에 따른 시야 거리**다. 모든 에이전트의 **시야각(FOV)은 동일**하지만, 낮은 직급일수록 더 먼 거리의 상급자를 인지한다. 상급자는 하급자를 발견하면 다가가고, 하급자는 상급자를 발견하면 업무 중인 척하거나 피한다. 따라서 단순 보행 시뮬레이션이 아니라 **권력관계가 공간 점유 및 이동 궤적에 미치는 영향**을 시험한다.

- 총원: **22명** (사장 1, 팀장 3, 대리 6, 신입 12). 사용자 표현의 '20명 정도'는 22명으로 확정한다.
- 모든 22명은 고정 자리 없이 실내를 계속 이동한다. 다만 업무 위장 시 임시로 책상에 머무를 수 있다.
- 사람의 위치는 2D 평면 `(x, y)`, 시선 방향은 `heading`으로 표현한다.
- **한 에이전트가 다른 에이전트를 감지했는지 여부는 감지하는 에이전트의 시야로 판단한다.** 상대가 나를 보고 있는지는 별도로 계산한다.
- 초기 구현은 현실 행동 예측이 아닌 **가상 행동 규칙에 따른 모델**이다. 설정된 반응은 사회학적 사실이나 실제 직장인의 보편 행동으로 해석하면 안 된다.

## 2. 구현 기술 및 프로젝트 구성

### 권장 스택

- **TypeScript + Vite + HTML Canvas 2D**: 경량 인터랙티브 시뮬레이션.
- `requestAnimationFrame`으로 렌더링, 0.05초 고정 타임스텝으로 논리 업데이트.
- 이동 경로는 **그리드 기반 A*** 또는 navmesh의 A*; 인원 간 근접 회피는 간단한 steering/repulsion.
- 외부 물리엔진 없이 시작한다. 인원이 22명에 불과해 거리 및 시야 판정은 O(N²)으로 충분하다.

### 제안 리포지토리 구조

```text
office-hierarchy-sim/
├─ README.md
├─ package.json
├─ index.html
├─ src/
│  ├─ main.ts
│  ├─ config.ts             # 공간, 속도, 시야, 반응 확률
│  ├─ types.ts              # Agent, Room, State, Event
│  ├─ simulation.ts         # 고정 timestep 및 update 순서
│  ├─ world/
│  │  ├─ floorplan.ts        # 영역, 문, 장애물, 목적지
│  │  ├─ navigation.ts       # A*, 통행 가능 영역
│  │  └─ occupancy.ts        # WC 4명 제한 + 예약
│  ├─ agents/
│  │  ├─ perception.ts       # 시야각, 시야거리, 벽 차폐
│  │  ├─ decision.ts         # 우선순위/상태 전환
│  │  ├─ movement.ts         # 이동속도 및 충돌 회피
│  │  └─ spawn.ts            # 인원별 초기 배치
│  ├─ render/
│  │  ├─ canvas.ts           # 평면도, 에이전트, trails
│  │  └─ overlays.ts         # FOV, 감지 관계, 통계
│  └─ ui/
│     └─ controls.ts         # 실행, 초기화, 매개변수
├─ tests/
│  ├─ perception.test.ts
│  ├─ behavior.test.ts
│  ├─ movement.test.ts
│  └─ occupancy.test.ts
└─ docs/
   └─ SIMULATION_SPEC.md    # 이 문서
```

## 3. 에이전트 설정

### 직급과 감지 거리

| 직급 | 계층 rank (클수록 높음) | 인원 | 시야각 (동일) | 시야 반경 | 기본 속도 | 하급자 접근 시 | 상급자 회피 시 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 사장 (CEO) | 4 | 1 | 110° | 3m | 1 | 2 | 해당 없음 |
| 팀장 (Lead) | 3 | 3 | 110° | 5m | 2 | 3 | 4 |
| 대리 (Associate) | 2 | 6 | 110° | 7m | 2 | 3 | 4 |
| 신입 (Junior) | 1 | 12 | 110° | 9m | **3** | 해당 없음 | **5** |

**속도값은 1~5의 상대 단계**이며 초기 물리 단위는 아래와 같다. 신입 기본 3, 도주 5와 사장 기본 1, 접근 2는 고정 요구조건이다. 나머지는 조정 가능한 기본안이다.

| 속도 단계 | 실제 보행 속도 (시뮬레이션) |
|---|---:|
| 1 | 0.5 m/s |
| 2 | 1.0 m/s |
| 3 | 1.5 m/s |
| 4 | 2.0 m/s |
| 5 | 2.5 m/s |

> 속도 4~5는 일반 실내 보행보다 빠를 수 있다. 실제 보행 재현이 아니라 **위계에 따른 상대적 긴급성의 표현**으로 사용하며 UI에서 배율을 조절한다.

기본 에이전트 반경 `0.30m`; 신체 간 비침투 최소 중심 거리 `0.60m`, 추가 개인공간 반경 `0.15m` 권장.

### 에이전트 데이터 타입

```ts
type Role = 'CEO' | 'LEAD' | 'ASSOCIATE' | 'JUNIOR';
type State =
  | 'WANDER'          // 자율 이동
  | 'PHONE'           // 이동하거나 잠시 서서 핸드폰
  | 'APPROACH'        // 발견한 하급자에게 접근
  | 'PRETEND_WORK'    // 책상에 가거나 책상 부근에서 일하는 척
  | 'FLEE_TO_WC'     // 화장실로 회피
  | 'FLEE_IN_OFFICE' // 화장실이 만원일 때 사무실 내 회피
  | 'WC_HIDE'        // 화장실 은신
  | 'COOLDOWN';      // 이벤트 직후 재판단 대기

type Agent = {
  id: string;
  role: Role;
  rank: 1 | 2 | 3 | 4;
  x: number;
  y: number;
  heading: number;          // radians, 0 = +x
  radius: number;
  fovDeg: number;
  visionRangeM: number;
  speedLevel: 1 | 2 | 3 | 4 | 5;
  state: State;
  targetAgentId: string | null;
  targetPoint: { x: number; y: number } | null;
  path: Array<{ x: number; y: number }>;
  lastSeenSuperiorAt: number | null;
  stateStartedAt: number;
  wcReservation: boolean;
  homeDeskId?: string;
};
```

## 4. 22인 사무실 공간

### 전체 평면

- 외곽: **22m × 14m = 308m²** (초기 시뮬레이션용 가정, 실제 법규 적합성을 뜻하지 않음).
- 좌표계: 좌하단 `(0, 0)`, 우상단 `(22, 14)`, 단위 m.
- 모든 방은 벽과 문을 갖는 다각형이며, 문으로만 영역 간 이동 가능.
- 책상 22석, 회의실 10~12석, 라운지 좌석 6~8석, WC 최대 **동시 4명**.

| 구역 | 사각형 범위 `(xmin,ymin)-(xmax,ymax)` | 면적 | 주요 요소 |
|---|---|---:|---|
| 업무공간 `WORK` | `(0,0)-(14,11)` | 154m² | 22개 책상, 주 보행 동선 |
| 회의실 `MEETING` | `(14,7)-(22,14)` | 56m² | 회의 테이블, 의자, 출입문 |
| 라운지 `LOUNGE` | `(14,0)-(22,7)` | 56m² | 소파, 테이블, 순환 보행 |
| 화장실 `WC` | `(0,11)-(7,14)` | 21m² | 4개 수용 슬롯, 은신 목적지 |
| 연결 복도 `CORRIDOR` | `(7,11)-(14,14)` | 21m² | WC/회의실/업무공간 연결 |
| **합계** | | **308m²** | |

```text
          x=0              7              14                 22
 y=14  ┌──────────────────┬───────────────┬────────────────────┐
       │ WC               │ CORRIDOR      │ MEETING            │
 y=11  ├──────────────────┴─── DOOR ──────┤                    │
       │                                  │                    │
 y=7   │              WORK                ├──── DOOR ──────────┤
       │                                  │                    │
       │                                  │ LOUNGE             │
 y=0   └──────────────────────────────────┴────────────────────┘
```

> ASCII 그림은 관계도다. 정확한 충돌 및 문 배치는 아래의 좌표 목록을 사용한다.

### 문(벽을 통과할 수 있는 유일한 구간)

| 연결 | 출입문 중심 | 방향 | 폭 |
|---|---|---|---:|
| WORK ↔ CORRIDOR | `(11,11)` | 수평 벽(y=11) | 1.5m |
| CORRIDOR ↔ WC | `(7,12.5)` | 수직 벽(x=7) | 1.2m |
| CORRIDOR ↔ MEETING | `(14,12.5)` | 수직 벽(x=14) | 1.2m |
| WORK ↔ MEETING | `(14,9)` | 수직 벽(x=14) | 1.5m |
| WORK ↔ LOUNGE | `(14,3.5)` | 수직 벽(x=14) | 1.5m |
| LOUNGE ↔ MEETING | `(19,7)` | 수평 벽(y=7) | 1.5m |

### 장애물과 목적지

- `WORK`: 22개 책상은 2~3개 열로 배치한다. 각 책상은 `1.2m × 0.6m`의 직사각형 장애물이며, 의자 앞에 `workAnchor`를 둔다. **22개 책상이 모두 중앙 통로와 접근 가능하게** 자동 배치한다.
- `MEETING`: 테이블은 충돌 장애물, 주변 통로를 따라 회전 이동 가능.
- `LOUNGE`: 소파/테이블은 장애물, 앉을 수 있는 `loungeAnchor` 여러 개 배치.
- `WC`: 벽 내 4개 `hideSlot`; 실제 점유를 시뮬레이션하는 자리이며 문 앞 대기는 기본적으로 금지.
- 각 방마다 3개 이상 `patrolWaypoint`를 두고 에이전트가 목적지 선택 시 교차 동선을 만들도록 한다.
- 길 찾기 격자 크기 `0.25m`. 벽과 장애물을 에이전트 반경만큼 팽창시켜 충돌 없는 경로만 생성한다.

## 5. 시야 감지 모델

모든 에이전트의 **시야각은 110°로 동일**하다. 보이는 거리만 직급에 따라 달라진다.

### 조건

관찰자 A, 대상 B에 대해 다음 조건이 **모두 참**일 때 `canSee(A, B) = true`:

1. `distance(A,B) <= A.visionRangeM`.
2. A의 정면 단위벡터 `f=(cos heading, sin heading)`과 B 방향 단위벡터 `d`의 내적이 `dot(f,d) >= cos(55°)`.
3. A에서 B를 잇는 선분이 **불투명한 벽이나 장애물**과 교차하지 않는다(문 개구부 제외). 책상은 시선 차폐 여부를 별도 옵션으로 한다(기본: 낮은 책상은 시선 차폐하지 않음).
4. `A.id !== B.id`.

### 핵심 함수

```ts
function canSee(observer: Agent, target: Agent, world: World): boolean {
  if (observer.id === target.id) return false;
  const dx = target.x - observer.x;
  const dy = target.y - observer.y;
  const dist = Math.hypot(dx, dy);
  if (dist > observer.visionRangeM) return false;
  if (dist < 1e-6) return true;
  const forwardX = Math.cos(observer.heading);
  const forwardY = Math.sin(observer.heading);
  const dot = (forwardX * dx + forwardY * dy) / dist;
  if (dot < Math.cos((observer.fovDeg * Math.PI) / 360)) return false;
  return !world.isLineOfSightBlocked(observer.x, observer.y, target.x, target.y);
}
```

**중요:** 시야각 바깥에 있다고 무조건 보이지 않는 상태가 아니다. 해당 에이전트가 상급자를 **하나도 감지하지 못했을 때** 폰 행동을 한다. 상하급자가 서로 보는지는 반드시 별도로 계산한다.

## 6. 행동 모델

### 상태별 핵심 행동

| 상태 | 발생 조건 | 이동 / 연출 | 종료 조건 |
|---|---|---|---|
| `WANDER` | 순찰 목적지 선택 | 방 간 이동, 목적지 변경 | 상급자/하급자 감지 또는 도착 |
| `PHONE` | **사장 제외**, 감지 가능한 상급자 0명 | 이동하며 핸드폰을 보거나 1~3초 정지 | 상급자를 감지하면 즉시 중단 |
| `APPROACH` | 자신보다 직급 낮은 사람을 발견, 상급자 회피 상태가 아닐 때 | 하급자 위치를 추적, 거리 1.2m 이내에서 멈춤 | 타깃 상실, 회피 우선 또는 8초 경과 |
| `PRETEND_WORK` | 상급자 발견 시 선택된 대응 | 가까운 업무 책상/워크 앵커까지 이동하고 3~6초 업무 모션 | 상급자가 시야에서 사라지고 안정화 시간 종료 |
| `FLEE_TO_WC` | 상급자 발견 + 회피 선택 + WC 예약 성공 | 화장실로 최단 경로 이동 | 도착 시 `WC_HIDE` |
| `WC_HIDE` | 화장실 도착 | 4~8초 머물기; 점유 1명으로 계산 | 은신 종료 후 예약 해제 |
| `FLEE_IN_OFFICE` | WC 만실 또는 경로 불가 | 업무공간 내 상급자와 거리/차폐가 유리한 지점으로 도주 | 상급자 시야 상실 + 2초 유지 |
| `COOLDOWN` | 행동 종료 직후 | 1~2초 유지 후 재탐색 | 시간 종료 |

### 직급별 기본 행동

- **사장**: 이동속도 1로 순찰. 어떤 하급자를 발견하면 속도 2로 `APPROACH`. 핸드폰 동작 없음.
- **팀장**: 기본 2. 상급자인 사장을 감지하면 회피/위장 선택, 하급자인 대리·신입을 감지하면 속도 3으로 접근. 아무 상급자도 감지하지 못하면 `PHONE`과 보행을 번갈아 수행.
- **대리**: 기본 2. 사장·팀장을 감지하면 회피/위장 선택. 신입을 발견하면 속도 3으로 접근. 그 외 `PHONE`/순찰.
- **신입**: 기본 3. 사장·팀장·대리를 감지하면 회피/위장 선택. **도망갈 때 속도 5**. 하급자가 없으므로 `APPROACH`하지 않음.
- **동일 직급**의 상호 발견은 위계 이벤트를 생성하지 않으며, 서로 비켜 지나간다.

### 상급자를 발견했을 때: 두 가지 선택

초기 기본값으로 위장 업무 45%, 회피 55%를 제안하며 UI에서 비율을 수정할 수 있다. 이 비율은 **연출 파라미터**일 뿐 실제 조사 결과가 아니다.

```text
상급자 감지
   ├─ PRETEND_WORK (45%) → 가까운 접근 가능한 업무 앵커 → 업무 모션
   └─ ESCAPE (55%)
        ├─ 화장실에 수용 여유 + 예약 가능 → FLEE_TO_WC → WC_HIDE
        └─ 정원 4명 / 경로 불가 → FLEE_IN_OFFICE
```

- 도망의 방향은 단순히 상급자에게서 멀어지는 직선이 아니라 **A*가 도달 가능한 공간 중 상급자의 현재/예상 시야를 최소화하는 지점**을 선택한다.
- `PRETEND_WORK` 중 상급자가 1.5m 이내로 접근하면 **재평가**하여 70% 확률로 도주하도록 설정 가능(기본값 OFF; 추가 실험 옵션).
- 화장실에 도착하면 최대 4명만 안에 있을 수 있다. 대기열을 만들지 않으며, 만실이면 **사무실 내부에서 도주**한다.
- 사장의 방 입장은 금지할 필요는 없지만 기본 동선에서 WC는 제외한다. 다른 에이전트도 WC는 회피 목적일 때만 진입한다.

### 동시에 여러 사람을 볼 때: 충돌 없는 우선순위

1. **현재 시야 내 상급자 감지**: 다른 모든 사회적 행동보다 우선. 가장 위 직급의 상급자를 우선 목표로 선택하며 같은 직급이면 거리 가까운 사람 선택.
2. **이미 실행 중인 WC 회피/은신**: 예약을 유지하며 계속 실행. 단, 막힌 경로는 재탐색.
3. **현재 시야 내 하급자 감지**: `APPROACH` 실행. 하급자 중 가장 가까운 대상을 추적(또는 실험 설정에 따라 가장 낮은 직급 우선).
4. **그 외**: 사장은 `WANDER`, 나머지는 `PHONE`/`WANDER`.

이 모델에서 팀장은 신입을 추적하다가 사장을 발견하면 **추적을 중단하고 회피**한다. 동시에 신입은 팀장을 감지하면 도주한다. 이는 두 에이전트가 동일 사건을 서로 다른 시야에서 판단한 결과다.

#### 반응의 안정성

- 시야 변화가 프레임마다 요동치지 않도록 감지 시작에 `0.15초` 지속 조건, 감지 종료에 `0.7초` 유예를 둔다.
- 반응 선택(위장 vs 회피)은 **하나의 감지 에피소드당 한 번만 추첨**한다. 매 프레임 재추첨 금지.
- 목표 변경 최소 간격 `0.5초`. 목적지에 도착하기 전에 계속 새 목적지를 택하는 현상 방지.
- 은신/위장 종료 후 `1~2초 COOLDOWN`; 단, 새로운 상급자 발견은 냉각 시간을 중단할 수 있다.

## 7. 화장실 수용 인원 및 동시 진입

`WC_CAPACITY = 4`. **실제 입실 인원 + 입실 예약 인원**이 4를 넘지 않게 한다.

```ts
class WCManager {
  occupants = new Set<string>();
  reservations = new Set<string>();
  capacity = 4;

  tryReserve(id: string): boolean {
    if (this.occupants.has(id) || this.reservations.has(id)) return true;
    if (this.occupants.size + this.reservations.size >= this.capacity) return false;
    this.reservations.add(id);
    return true;
  }

  enter(id: string): boolean {
    if (!this.reservations.has(id)) return false;
    this.reservations.delete(id);
    this.occupants.add(id);
    return true;
  }

  exitOrCancel(id: string): void {
    this.occupants.delete(id);
    this.reservations.delete(id);
  }
}
```

- 22명이 동시에 도주하더라도 4명까지만 예약 성공.
- 5번째 이후는 즉시 `FLEE_IN_OFFICE`로 이동.
- 화장실 진입 직전에 예약 무효/초과가 감지되면 사무실 회피로 전환.
- 예약 후 일정 시간(예: 12초) 동안 화장실에 도달하지 못하면 예약 해제하고 사무실 회피로 전환.
- 화장실 밖으로 나올 때 점유를 먼저 해제하고 다음 waypoint를 정한다.
- WC occupancy 표기는 `occupied/4`, 별도로 `reserved/4`를 표시한다.

## 8. 이동과 충돌

### 경로 탐색

1. 목적지가 생기면 현재 위치와 목적지를 가장 가까운 **통과 가능한 nav cell**에 투영.
2. 벽, 책상, 회의 테이블, 화장실 칸 등을 장애물로 고려해 A* 경로 계산.
3. 문을 통하는 경로만 허용하고, 같은 방 내 직선이 벽을 통과하지 못하게 처리.
4. 매 순간 다음 waypoint를 향해 이동하되, 주변 사람과 가까워지면 분리(separation) steering 적용.
5. 여전히 충돌 가능하다면 다음 위치를 보정하고 이동을 줄여 비침투를 보장.
6. `heading`은 실제 이동 방향을 부드럽게 따라가며 회전. `PRETEND_WORK`/`WC_HIDE` 상태에서는 고정 시선 허용.

### 화장실 만실일 때 도망 후보지

업무공간 `WORK` 내부의 접근 가능 지점 20~40개에서 아래 점수를 계산해 최고점 선택:

```text
escapeScore(p) =
    2.0 * normalizedDistanceFromVisibleSuperior(p)
  + 2.5 * isOccludedFromSuperior(p)
  - 0.8 * normalizedTravelDistance(p)
  - 1.0 * crowdingPenalty(p)
```

- 동일 후보지로 여러 신입이 몰리면 군집 페널티를 높인다.
- 막다른 곳은 피하고 보행 가능한 통로를 확보한다.
- 대리/팀장도 상급자를 피해 도주할 때 같은 알고리즘 사용.
- 도주 대상이 더 이상 보이지 않아도 **최소 2초는 도주 상태 유지**하여 방향 떨림을 줄인다.

### 접근 상태의 종료

상급자는 하급자가 계속 달아나도 무한 추적하지 않는다. 하나의 추적 이벤트당 최대 8초, 목표를 2초 이상 보지 못하면 종료, 목표와 1.2m 이내로 접근하면 2초 정지 후 재순찰한다. 추적 상한은 UI에서 변경 가능.

## 9. 메인 시뮬레이션 루프

고정 시뮬레이션 타임스텝 `dt = 0.05 sec`. 화면 렌더는 60fps 목표.

```ts
function simulateStep(dt: number, now: number) {
  // 1. 기존 위치 스냅샷 확보 (업데이트 순서 편향 제거)
  const snapshot = agents.map(a => ({ ...a }));

  // 2. 각 에이전트의 상급자/하급자 인지 정보 동시 계산
  const perceptions = buildPerceptions(snapshot, world, now);

  // 3. 다음 행동을 각각 계산 (감지 이벤트 단위로 선택 유지)
  const intents = snapshot.map(a =>
    decideAction(a, perceptions.get(a.id)!, now, config)
  );

  // 4. 화장실 예약 경쟁을 결정적으로 처리 (timestamp, id 순)
  resolveWCReservations(intents, wcManager);

  // 5. 예약 결과를 반영해 각자 경로 + 원하는 속도를 결정
  const desired = buildDesiredMovements(intents, agents, world, dt);

  // 6. 모든 인원의 이동을 동시 계산하고 충돌 해결
  const resolved = resolveCollisions(desired, world);
  applyPositionsAndStates(agents, intents, resolved, now);

  // 7. 화장실 입실·퇴실 및 만료 처리
  updateOccupancy(wcManager, agents, now);

  // 8. 통계 및 궤적 저장
  metrics.record(agents, perceptions, now);
}
```

**주의:** 인덱스 순으로 각 에이전트를 하나씩 이동하면 앞사람이 항상 유리한 편향이 생긴다. 인지와 의도는 같은 시점의 위치 스냅샷으로 계산하고 이동은 일괄 적용한다.

## 10. 초기 배치 및 이동 목적지

- 사장 1명: 업무공간의 상부 또는 회의실 출입문 근처 시작.
- 팀장 3명: 업무공간 2명, 회의실 1명.
- 대리 6명: 업무공간 4명, 라운지 1명, 회의실 1명.
- 신입 12명: 업무공간 9명, 라운지 2명, 회의실 1명.
- 화장실 시작 점유 0명.
- 시작 배치는 위 방 분포 내 무작위이며 `minSeparation = 0.75m` 충족.
- 초기 `heading`은 임의 방향, 초기 시야가 모두 같은 방향으로 쏠리지 않도록 seed 사용.
- 순찰은 현재 구역에 편향을 두되 **모든 비-WC 구역을 방문할 가능성**을 유지한다. 예: WORK 60%, MEETING 20%, LOUNGE 20% (사장/직급별 수치 조절 가능).
- `PHONE` 상태에서도 일부는 느리게 걸어 다니고 일부는 잠깐 정지하도록 한다. 모든 에이전트가 언제나 움직일 필요는 없지만 **모두 순환 이동이 가능한 에이전트**여야 한다.

## 11. 시각화 요구사항

### 기본 화면

- 중앙: 22m × 14m 사무실 평면도, 벽/문/책상/화장실/회의실/라운지.
- 사람: 원형 마커 + 방향 화살표. 직급별 색상과 반경 동일(사람 크기로 직급을 암시하지 않음).
- 현재 상태는 아이콘/작은 라벨로 표현: `PHONE`, `APPROACH`, `WORK`, `ESCAPE`, `WC`.
- 선택한 에이전트 한 명의 **110° 시야 부채꼴과 직급별 반경**을 오버레이로 그림.
- `APPROACH`: 상급자 → 하급자 선, `FLEE`: 하급자 → 도주 지점의 점선.
- 최근 10~30초 이동 경로를 반투명 trail로 표현.
- 화장실 `occupied/4` 수치와 예약 인원.

### 조작 패널

| 컨트롤 | 기본값 |
|---|---|
| Run / Pause / Reset | Run |
| Simulation time scale | 1x, 2x, 4x |
| Random seed | 42 |
| Show FOV | 선택된 에이전트만 |
| Show all FOV | OFF |
| Show paths / trails | ON |
| Show line-of-sight blockers | OFF |
| Vision angle | 110°, **전체 직급 동시 변경** |
| Vision radii CEO / Lead / Associate / Junior | 3 / 5 / 7 / 9 m |
| Pretend-work probability | 45% |
| WC capacity | 4, **기본 실험에서는 잠금** |
| Avoidance / pursuit duration | 2초 / 8초 |
| Agent inspector | id, 직급, 감지 인원, 현재 타깃, 상태, 속도 |

### 검증 가능한 수치 지표

- 직급별 `PHONE` 상태 비율 (% time).
- 직급별 `PRETEND_WORK` / `FLEE_TO_WC` / `FLEE_IN_OFFICE` 발생 횟수.
- 직급별 평균 실제 이동 속도, 이동 거리.
- 각 구역의 체류시간/인원수 히트맵.
- WC 점유율, 예약 성공률, 만실로 인한 사무실 도주 횟수.
- 사장과 각 직급 간 평균 거리 및 직급별 상급자 감지 시간 비율.
- **재현성:** 같은 seed / 동일 설정이면 같은 결과를 생성(비결정적 랜덤 호출 및 실행 순서 주의).

## 12. 실험 시나리오

단순 애니메이션에서 그치지 않도록 변수를 바꾸어 공간 변화와 행동을 비교한다.

| 시나리오 | 변경 | 관찰 질문 |
|---|---|---|
| A. Baseline | 기본 설정 3/5/7/9m | 기본 위계 구조에서 누가 어디에 모이고 회피하는가? |
| B. Equal vision | 모든 직급 6m | 위계별 시야 차이를 없애면 도주 빈도/공간 이용이 어떻게 달라지는가? |
| C. Strong hierarchy | 2/4/7/11m | 신입의 감시 범위 확대가 업무공간 점유 및 경로에 어떤 영향을 주는가? |
| D. No WC escape | WC capacity 0 (실험 모드) | 폐쇄된 대피처가 없을 때 동선은 어떻게 달라지는가? |
| E. High visibility | 벽 차폐를 줄인 개방형 평면 | 시각적 개방성이 감시/회피를 얼마나 증폭시키는가? |

**비교 전제:** 시나리오 간 random seed, 인원수, 초기 좌표, 속도, 행동 확률은 유지하고 **선택한 변수만 변경**한다. 최소 20개의 서로 다른 seed로 반복 실행하여 평균과 분산을 함께 확인한다.

## 13. 정확성 검증과 테스트

### 필수 단위 테스트

1. 모든 에이전트의 시야각 `110°` 동일.
2. 시야 거리: `CEO=3`, `LEAD=5`, `ASSOCIATE=7`, `JUNIOR=9`.
3. 대상이 감지 거리 안이지만 시야각 밖이면 감지되지 않음.
4. 거리가 충분해도 벽으로 차폐되면 감지되지 않음. 열린 문 구간은 통과 가능.
5. 사장은 `PHONE` 상태에 진입하지 않음.
6. 신입 기본 속도 `3`, 도주 속도 `5`.
7. 사장 기본 속도 `1`, 하급자 접근 속도 `2`.
8. 상급자와 하급자가 서로 감지할 때 상급자는 `APPROACH`, 하급자는 `PRETEND_WORK` 또는 도주.
9. 팀장이 신입 추적 중 사장을 발견하면 상급자 회피가 우선.
10. 동시에 10명이 WC 진입을 시도해도 `occupants + reservations <= 4`.
11. WC 정원 마감이면 `FLEE_IN_OFFICE`, WC 문 앞 대기 상태 없음.
12. 모든 이동에서 벽·가구 관통 없음, 에이전트 간 최소 거리 준수(좁은 문에서 허용 오차 설정).
13. 동일 seed + 설정 + 1,000 step 결과가 동일함.
14. 시뮬레이션을 30분 가상 시간 실행해도 에이전트가 장애물에 영구 고착되지 않음(고착 감지/경로 재계산).
15. WC 예약 중 경로 실패·에이전트 상태 변경 시 예약이 누수 없이 해제됨.

### 수용 기준 (MVP)

- 22명 모두 출현하고, 업무공간/회의실/라운지 사이에서 이동한다.
- FOV 부채꼴이 시선 방향으로 회전하고 직급별 반경이 구별된다.
- 상급자 접근, 하급자 업무 위장/도주, 핸드폰 동작이 즉시 확인된다.
- 화장실 4명 제한과 만실 시 사무실 회피가 정상 작동한다.
- 경로가 문을 통과하고 벽/장애물을 관통하지 않는다.
- Pause/Reset/Seed/속도/시야범위 조작이 동작한다.
- 상태별 로그와 통계가 출력된다.

## 14. 단계별 구현 순서

1. **M1 — 공간 및 22명:** 평면도, 책상, 문, 각 직급별 이동 마커, 기본 자율 보행.
2. **M2 — 시각 인식:** 동일 FOV(110°), 직급별 가시 거리, 벽 차폐, 선택 에이전트 감지선.
3. **M3 — 위계 FSM:** 사장/팀장/대리의 하급자 접근, 전 직급 하급자의 위장·도주, 핸드폰 행동.
4. **M4 — 화장실/경로:** WC 동시 4명 예약, 만실 처리, A* 및 충돌 회피.
5. **M5 — 인터페이스:** 인터랙티브 슬라이더, 에이전트 인스펙터, 그래프/히트맵.
6. **M6 — 실험/배포:** 시나리오 비교, CSV 결과 export, 자동 테스트, GitHub Pages 배포.

## 15. 구현 시 주의점

- **지위 ≠ 물리적으로 더 멀리 보는 능력:** 시야거리 차이는 사회적 경계심을 시각화하기 위한 모델링 가정이다. 따라서 `visionRange`는 실제 생리적 시력보다 **주변 감시/주의 반경**으로 라벨링하는 편이 정확하다.
- **시야가 큰 신입은 더 많이 감지하지만, 반드시 더 많이 도주하는 것은 아니다.** 벽, 방향, 군집, 우선순위, 화장실 혼잡이 실제 행동을 결정한다. 결과는 실측해야 한다.
- 기본 규칙에서 모든 하급자가 같은 반응을 보이지 않도록 위장/도주 확률과 휴지시간을 사용한다. 이는 관찰된 사회적 분포가 아니라 설정값이다.
- FOV만으로 `PHONE`을 정의하면 일부 상급자가 같은 방 뒤쪽에 있어도 핸드폰 사용이 가능하다. 이는 **의도된 규칙**이다. 별도의 청각 인지/주변주의 모델은 v2 확장으로 남긴다.
- 장기간 회피를 반복하면 무의미한 진동이나 문 앞 병목이 생길 수 있다. 상태 고정시간, 선행 예약, 목표 변화 지연 및 경로 재계산 필수.
- 사장·팀장·대리·신입 관계를 **단순한 계급 위계의 추상화**로 제시해야 하며 실제 조직 구성원 전체의 일반 행동이라고 주장하지 않는다.

## 16. 개발 에이전트에게 전달할 프롬프트

```text
Build a complete browser-based 2D office hierarchy agent simulation using
TypeScript, Vite, and HTML Canvas 2D, following docs/SIMULATION_SPEC.md.

Non-negotiable requirements:
- 22 agents: 1 CEO, 3 Leads, 6 Associates, 12 Juniors.
- Same 110-degree FOV, differing vision ranges: 3, 5, 7, 9 meters.
- CEO speed level 1 when wandering, 2 when approaching lower ranks.
- Junior speed level 3 by default, 5 when fleeing.
- Higher ranks pursue seen lower ranks; lower ranks react to seen higher
  ranks by pretending to work or fleeing. Avoidance overrides pursuit.
- All except CEO use phones when no superior is visible.
- Office includes work area, meeting room, lounge, and bathroom.
- Bathroom holds max 4 agents INCLUDING reserved entries; if full,
  fleeing agents escape within the office rather than queue.
- Walkable rooms, doors, obstacles, A* paths, line-of-sight occlusion,
  and collision avoidance must function.
- Each agent patrols across accessible non-bathroom spaces.
- Provide FOV overlay, speed/vision controls, agent state inspector,
  trail visualization, occupancy and metrics.
- Use seeded randomness and fixed timestep. Write automated tests for
  perception, priorities, bathroom capacity, and wall collisions.
- Deployable via GitHub Pages. Include README setup instructions.

Implement in milestones M1-M6; no fake UI controls or placeholder behavior.
```

---

**초기 실행 가정:** 시야각 110°, 시야 반경 3/5/7/9m, 위장 확률 45%, 화장실 회피 확률 55%, WC 4명, 접근 최대 8초, 은신 4~8초, seed 42. 이 값들은 사용자가 제공한 고정 조건을 제외하면 **검증용 초기 매개변수**이며 모두 수정 가능하도록 구현한다.
