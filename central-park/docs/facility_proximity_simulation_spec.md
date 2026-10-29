# Facility Proximity Simulation — Implementation Specification

**Project:** Central Park Distance / Proximity Simulator  
**Version:** 1.0 · 2026-10-29  
**Implementation target:** Web-based interactive GIS simulation (suitable as a Codex build brief)  
**Language:** UI may use English; this technical brief is in Korean.

## 0. Objective and definition

**Research question:** *How do the location and operational availability of Citi Bike stations change practical accessibility between two points?*

- **Distance module (기존):** A에서 B까지 네트워크 기반 최단 경로의 거리와 이동 비용(USD, kcal)을 계산한다.
- **Facility Proximity module (신규):** A 주변의 대여 가능한 Citi Bike e-bike 시설과 B 주변의 반납 가능한 도크 시설에 대한 **도보 네트워크 접근성**을 계산한다. 이 제약을 추가하면 경로가 어떻게 변하는지 비교한다.
- **핵심 구분:** `Spatial proximity`(얼마나 가까운가)와 `Functional availability`(실제로 이용 가능한가)는 별도 차원이다. 가깝지만 비어 있는 대여소는 `NEAR_UNAVAILABLE`로 표시한다.
- **A/B:** 사용자가 지도에서 선택하는 임의의 두 좌표. 대여소에 자동 스냅하지 않는다.

> 분석 결과는 GBFS 조회 시점의 **스냅샷**이다. 미래 도착 시점의 도크/자전거 이용 가능성을 보장하지 않는다.

## 1. Study area and geodata

### 1.1 Study boundary

1. Central Park의 실제 공원 폴리곤을 취득한다.
2. 적절한 미터 단위 투영좌표계(예: EPSG:2263은 US survey foot 기반이므로 미터로 변환하거나 EPSG:32618 같은 미터 CRS 사용)로 재투영한다.
3. 공원 경계로부터 **바깥쪽 1,000m buffer**를 생성한다. 센트럴파크 중심점으로부터 반경 1km 원을 그리는 것이 아니다.
4. `study_area = buffer(central_park_polygon, 1000m)`; A와 B는 이 영역 내부에서 선택 가능하다.
5. 네트워크 경로의 정확한 계산을 위해 도로망은 분석 영역보다 추가 여유(buffer)를 두고 취득한다. 분석 경계에서 도로를 잘라 생기는 가짜 막다른 길을 피해야 한다.
6. 운영상 A/B가 범위를 벗어나면 명확한 경고를 표시한다.

### 1.2 Required datasets

| Dataset | Purpose | Suggested source |
|---|---|---|
| Central Park boundary polygon | 공원 및 1km buffer | NYC Open Data/NYC Parks 또는 검증된 OSM geometry |
| Walkable street/path graph | A→S1, S2→B | OpenStreetMap + OSMnx 등 |
| Bicycle-legal street/path graph | S1→S2 | OpenStreetMap(자전거 통행 규제, 일방통행, 공원 내 운행 제한 확인) |
| Citi Bike station metadata | `station_id`, `name`, 좌표 | GBFS station_information |
| Citi Bike station availability | e-bike 대수, 빈 도크, 대여/반납 가능 여부 | GBFS station_status |
| Citi Bike official pricing | USD 계산 | Citi Bike 공식 요금 안내 |
| Elevation (optional) | kcal의 경사 관련 보정 | 적절한 NYC DEM / 표고 데이터 |

**GBFS endpoints (runtime에서 동작 확인하고 실패시 오류 표시):**

- `https://gbfs.citibikenyc.com/gbfs/en/station_information.json`
- `https://gbfs.citibikenyc.com/gbfs/en/station_status.json`

GBFS 버전/필드 구성이 바뀔 수 있으므로 feed discovery와 schema validation 구현. **두 배열을 순서가 아닌 `station_id`로 조인**한다. 타입별 e-bike 잔량(`vehicle_types_available` 등)은 실제 현재 응답의 vehicle type 정의를 조회하여 판정하고, 미확인 타입을 e-bike로 오인하지 않는다.

## 2. User interface / controls

### Mandatory inputs

- `A` : 지도 클릭 또는 검색으로 출발점 지정.
- `B` : 지도 클릭 또는 검색으로 도착점 지정.

### Configurable simulation controls

| Parameter | Default | Notes |
|---|---|---|
| `walk_threshold_min` | 5 min | 시설 proximity 분류용; 임의 연구 임계값이며 변경 가능 |
| `max_station_candidates` | 10 per end | 검색 속도 제한. 누락 가능성 표시; 정밀 모드에서 확대 |
| `station_status_mode` | live snapshot | 데이터 갱신 시간 표기 |
| `routing_objective` | shortest_total_distance | 기존 Distance 시뮬레이션과 정합 |
| `rider_plan` | non_member | member/reduced_fare 등 변경 가능 |
| `walking_speed_kmh` | 4.8 | 보행 속도 가정 |
| `ebike_speed_kmh` | 15 | 경로별 속도 추정치; 보장 아님 |
| `rider_weight_kg` | 70 | kcal 추정 시 사용하는 가정 |
| `calorie_model` | MET estimate | 전기자전거 보조 정도에 대한 불확실성 표시 |
| `show_layer` | all | routes/stations/proximity/heatmap 각각 토글 |

`walk_threshold_min`은 **분류 임계값**이며 경로 후보를 자동으로 제외하는 하드 제한으로 쓰지 않는다. 엄격한 최대 도보 접근시간을 원한다면 별도 `max_walk_access_min` 파라미터를 둔다.

## 3. IF–THEN–ELSE rules (normative)

### R01 — Study area

```text
IF A and B are both inside the study area
THEN enable facility analysis
ELSE show OUT_OF_STUDY_AREA, request valid A/B
```

### R02 — Station spatial proximity

```text
FOR EACH station S near origin A or destination B:
    compute shortest legal WALKING-network travel time T_walk
    IF no walkable connection exists:
        proximity = DISCONNECTED
    ELSE IF T_walk <= walk_threshold_min:
        proximity = HIGH
    ELSE:
        proximity = LOW
```

> 직선거리 원형 버퍼는 배경 참고용으로만 사용한다. HIGH/LOW 판단에는 네트워크 이동시간을 사용한다.

### R03 — Valid departure station

```text
IF S.is_renting == true AND S.is_installed == true
   AND S.e_bikes_available >= 1
THEN S.departure_eligible = true
ELSE S.departure_eligible = false
```

`is_installed` 등 필드는 실제 feed에 있는 경우 검증해 사용하고, 값이 누락되거나 최신 상태가 불명확하면 `UNKNOWN`으로 처리한다. 정비 불가 차량은 이용 가능 수에서 제외한다.

### R04 — Valid arrival station

```text
IF S.is_returning == true AND S.is_installed == true
   AND S.docks_available >= 1
THEN S.arrival_eligible = true
ELSE S.arrival_eligible = false
```

### R05 — Network access

```text
IF a legal pedestrian route exists from A to S1
   AND a legal bike route exists from S1 to S2
   AND a legal pedestrian route exists from S2 to B
THEN station pair (S1, S2) is route_eligible
ELSE exclude the pair from final route candidates
```

A/B와 시설 좌표는 접근 가능한 실제 네트워크에 연결한다. 장애물·공원 출입 제한·도로의 통행 모드·방향 규제를 반영한다. 단순 Euclidean 직선 연결은 금지한다.

### R06 — Pair selection

```text
IF >= 2 valid station pairs exist:
    select the pair minimizing
    D_walk(A,S1) + D_bike(S1,S2) + D_walk(S2,B)
ELSE IF exactly 1 valid pair exists:
    select that pair
ELSE:
    display NO_FEASIBLE_CITIBIKE_ROUTE
```

동률일 경우 `total_time_min`이 짧은 경로, 이후 `station_id` 사전순으로 결정하여 결과를 재현 가능하게 한다. `S1 == S2`이면서 의미 있는 자전거 주행이 없는 퇴행 경로는 기본 후보에서 제외한다.

### R07 — Proximity versus availability

```text
IF proximity == HIGH AND station is eligible for its required role:
    state = NEAR_AVAILABLE
ELSE IF proximity == HIGH AND station is not eligible:
    state = NEAR_UNAVAILABLE
ELSE IF proximity == LOW AND station is eligible:
    state = FAR_AVAILABLE
ELSE IF proximity == DISCONNECTED:
    state = DISCONNECTED
ELSE:
    state = FAR_UNAVAILABLE_OR_UNKNOWN
```

### R08 — Live data uncertainty

```text
IF status feed is stale, missing, or unavailable:
    show STATUS_UNKNOWN and data timestamp
    do not claim a currently available bike/dock
    optionally allow a clearly labeled hypothetical mode
ELSE:
    compute using snapshot and label "Available at last update"
```

### R09 — Existing distance/cost integration

```text
IF a valid A -> S1 -> S2 -> B route is selected:
    calculate walking and cycling distance/time separately
    USD = Citi Bike e-bike fee for bike rental segment only
    kcal = estimated human energy expenditure for walking + assisted cycling
    render results and compare against baseline route
ELSE:
    show unavailable route, no invented USD/kcal outcome
```

## 4. Pathfinding and model specification

Construct two distinct directed graphs:

- `G_walk`: walkable sidewalks, paths, legal crossings, entrances.
- `G_bike`: cycling-legal paths/roads respecting allowed directions and park restrictions.

For each valid `S1, S2`, calculate:

\[
D_{total}(S_1,S_2) = D_w(A,S_1)+D_b(S_1,S_2)+D_w(S_2,B)
\]

Pick the minimum over valid pairs. Distances are measured on actual graphs, **not straight lines**. Dijkstra/A* with `length_m` edge weight is appropriate. Treat one-way restrictions and temporal access restrictions where available.

**Baseline comparator:** For a like-for-like interpretation, show either (a) a clearly marked **direct walking route A→B** or (b) a hypothetical direct cycling route A→B; do not silently compare a walking route with a cycling route as though station effects alone explain the difference. Name all routing modes on the UI.

**Nearest versus optimal:** Also compute `nearest_valid_departure_station` and `nearest_valid_arrival_station` independently, as a separate proximity output. The pair of nearest facilities is not always the globally shortest full trip.

## 5. USD and kcal calculation

### 5.1 NYC e-bike fare configuration (official published 2026 prices)

- Non-member single ride: **$4.99 unlock fee + $0.41 per minute e-bike charge** for NYC (other restrictions/charges may apply).
- Annual member: **$0.27 per minute**, no unlock fee; certain NYC Manhattan-related trips of **45 min or less** may qualify for a **$5.40 e-bike fee cap**, subject to applicable official conditions.
- Reduced Fare Bike Share: **$0.14/minute** e-bike fee per official materials.
- **Round billed e-bike duration UP to the next full minute.**

For the basic non-member case:

```text
bike_minutes_billed = ceil(estimated_bike_time_seconds / 60)
USD = 4.99 + 0.41 * bike_minutes_billed
```

Include current fare source, price effective date and configuration version; pricing is changeable. If route is invalid or no e-bike trip occurs, do not charge a simulated unlock fee by default. Show potential taxes, holds, service fees, or overage caveats if relevant and not modeled. Never charge the e-bike rate for the walking legs.

### 5.2 Physical energy estimate

- `kcal_total = kcal_walk_1 + kcal_e_bike + kcal_walk_2`.
- Baseline approximation using MET: `kcal = MET * body_weight_kg * duration_hours` (gross metabolic energy; label as estimate).
- Walking and e-bike-assist MET assumptions must be explicit and configurable. Pedal-assist level, grade, body weight, speed, stops, rider behavior vary significantly. Avoid presenting kcal as precise measurement.
- Elevation/slope adjustment is an optional later version, NOT required for MVP.

### 5.3 Results schema

```json
{
  "origin": {"lat": 0, "lon": 0},
  "destination": {"lat": 0, "lon": 0},
  "departure_station_id": "station-id-1",
  "arrival_station_id": "station-id-2",
  "status_timestamp": "ISO-8601",
  "walk_to_pickup_m": 0,
  "ride_m": 0,
  "walk_from_dropoff_m": 0,
  "total_distance_m": 0,
  "walk_access_time_min": 0,
  "ride_time_min": 0,
  "total_time_min": 0,
  "estimated_cost_usd": 0,
  "estimated_energy_kcal": 0,
  "origin_station_proximity": "HIGH",
  "destination_station_proximity": "LOW",
  "data_quality": "LIVE_SNAPSHOT",
  "route_status": "FEASIBLE"
}
```

## 6. Map visualization / layers

| Layer | Meaning | Visual encoding |
|---|---|---|
| Study extent | Central Park + outward 1km buffer | muted boundary and subdued park fill |
| Stations | all in/near operating zone | point symbols with role and current availability |
| Proximity | walking travel time to eligible stations | network isochrones: 0–3, 3–5, 5–10 min (configurable) |
| Selected route | A → S1 → S2 → B | dashed pedestrian legs; solid bicycle leg |
| Facility state | `NEAR_AVAILABLE`, `NEAR_UNAVAILABLE`, `FAR_AVAILABLE`, `UNKNOWN` | shapes/icons plus legend; never color alone |
| Comparator | baseline A→B | distinct thin neutral path, mode labeled |
| Summary | trip metrics | walking m/min; cycling km/min; USD; kcal; station access time |

**Do not display a Euclidean circle as a network reachability isochrone.** An illustrative circle may be shown only with `straight-line buffer` label. All cost or time boundaries must derive from legal network travel.

### Recommended screen composition

1. **Left:** full interactive map, A and B draggable pins, Central Park + buffer, station points, route segments and accessible network-isochrones.
2. **Right top:** two inputs A/B, `walk_threshold_min`, plan selector, toggle `live/snapshot`.
3. **Right middle:** `IF–THEN–ELSE rule inspector`: selected station's walking time, bike count, dock count, eligible state and explanation.
4. **Right bottom:** trip comparison table; warnings about outdated availability and estimated kcal.

### Interactive changes

- Move A/B → recompute proximity, candidate stations, valid pairs, routes and metrics.
- Change walking threshold → recompute HIGH/LOW classifications and contours; **do not silently alter feasible station pairs** unless hard access cap explicitly enabled.
- Availability feed update → recompute eligibility and, if necessary, selected pair.
- Change fare plan → update USD only, without recomputing shortest-distance route.
- Change weight/MET → update kcal only.
- Toggle layers → change visualization only; do not change model calculations.

## 7. Implementation architecture

**Suggested stack:** TypeScript + React, MapLibre GL JS (map), Turf.js/Proj4 for spatial operations, OSMnx/NetworkX or routing engine (backend), GBFS fetch/cache service.

```text
/map
  ├── StudyAreaLayer
  ├── FacilityStationLayer
  ├── WalkingIsochroneLayer
  ├── TripRouteLayer
  └── BaselineRouteLayer
/controls
  ├── OriginDestinationPicker
  ├── WalkingThresholdSlider
  ├── FarePlanSelector
  └── LayerToggles
/services
  ├── BoundaryAndNetworkLoader
  ├── GBFSClient + VersionAwareParser
  ├── StationEligibilityRules
  ├── WalkingNetworkProximity
  ├── MultimodalRouteOptimizer
  ├── FareCalculator
  └── CalorieEstimator
/results
  ├── RuleInspector
  ├── TripMetrics
  └── DataFreshnessWarning
```

**Processing pipeline:**

```text
A, B
  -> validate study boundary
  -> fetch station metadata + latest status, join on station_id
  -> snap A/B/station access points to appropriate graphs
  -> compute walking-network travel times to facilities
  -> classify proximity HIGH/LOW + availability status
  -> enumerate feasible pickup/drop-off pairs
  -> shortest-distance walk/bike/walk routing
  -> compute durations and USD/kcal estimate
  -> show layers, rule explanations and comparison results
```

**Caching/performance:** cache network graph, boundary and station metadata separately from rapidly changing station status; throttle drag recomputation; use candidate pruning but allow a rigorous mode or explicit approximation warning when pruning can exclude global best route.

## 8. Acceptance tests (must pass)

| Case | Input / condition | Expected result |
|---|---|---|
| T01 | A or B outside study area | `OUT_OF_STUDY_AREA` |
| T02 | Station 2 min walking, e-bike 0 | `HIGH` spatial; `NEAR_UNAVAILABLE` for pickup |
| T03 | Station 4 min walking, e-bike 2 | `HIGH` and valid pickup (if operating) |
| T04 | Station 7 min walking, e-bike 2 | `LOW` but valid pickup unless hard limit selected |
| T05 | Arrival station docks 0 | invalid as drop-off |
| T06 | Candidate path bicycle-prohibited | pair excluded |
| T07 | Nearest station pair vs globally shorter station pair | globally minimum total **network distance** selected |
| T08 | No feasible pair | `NO_FEASIBLE_CITIBIKE_ROUTE`; no fabricated fare |
| T09 | Station feed unavailable | `STATUS_UNKNOWN`; no live availability claim |
| T10 | Threshold changes 5→10 min | classification/isochrones update; distance algorithm unchanged |
| T11 | Rider plan changes | same geometry, recomputed USD |
| T12 | Rider weight changes | same geometry/USD, updated estimated kcal |
| T13 | Non-member 8m01s ride | 9 billed minutes; `$4.99 + 9×$0.41 = $8.68` before unmodeled adjustments |

## 9. MVP → further development

**MVP**

- Central Park + 1km polygon buffer and valid walking/cycling graphs.
- Two selectable inputs A/B; live station metadata/status with timestamps.
- Walking time to eligible pickup/drop-off stations and discrete IF–THEN–ELSE statuses.
- Station-constrained shortest-distance A→S1→S2→B route.
- Route layers and approximate USD/kcal metrics.

**V2**

- 3/5/10-minute **network** isochrones for station reachability.
- Proximity surface across all map nodes (not just A/B).
- Snapshot replay and sensitivity to station availability change.
- Multiple objective options: minimum total time, minimum cost, minimum walk time (clearly distinguished from shortest-distance route).
- Elevation-aware / assisted-cycling energy models, calibrated with empirical parameters.
- Probabilistic bike/dock availability at estimated pickup/drop-off times (requires a predictive model; live snapshot alone insufficient).

## 10. Core logic in one statement

> **IF** a station is close via the legal walking network **AND** has the required operational capacity for its role, **THEN** it contributes to actual trip accessibility; **ELSE** geographic closeness alone does not imply usable access.

### Official references checked 2026-10-29

- Citi Bike pricing: https://citibikenyc.com/plans-and-pricing
- Citi Bike 2026 price change: https://citibikenyc.com/pricechange2026
- Citi Bike e-bike help (round-up rule): https://help.citibikenyc.com/hc/en-us/articles/360039406631-Riding-with-an-ebike
- NYC Open Data Citi Bike system dataset: https://data.cityofnewyork.us/dataset/Citi-Bike-System-Data/vsnr-94wk
- Live GBFS: https://gbfs.citibikenyc.com/gbfs/en/station_information.json and https://gbfs.citibikenyc.com/gbfs/en/station_status.json
