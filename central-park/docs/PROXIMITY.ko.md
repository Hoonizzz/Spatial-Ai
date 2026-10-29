# Facility Proximity — 기존 시뮬레이션 통합 구조

## 1. 목적과 기존 문서와의 관계

첨부 [facility_proximity_simulation_spec.md](facility_proximity_simulation_spec.md)를 현행 [SIMULATION.ko.md](SIMULATION.ko.md)의 경로·정류장·데이터·출력 구조에 통합한다. React/별도 GIS 서버로 재작성하지 않고 현재 JavaScript/SVG/Web Worker 구조를 확장한다. 사람·말 공유 경로, 말 대사 및 $72/20분 마차 요금은 보존한다. 첨부 요금·연구 검증 주장은 외부 검증 완료 사실로 간주하지 않는다.

## 2. 모듈 경계 (구현 전 확정)

| 파일 | 책임 |
|---|---|
| `dist/data.js` | GBFS feed discovery, station_id 조인, 미확인/누락 상태 보존, vehicle_types 정의 기반 e-bike 판정 |
| `dist/engine.js` | 물리적 거리/경사 가중 거리 목적함수, 방향 있는 보행 그래프, 후보 상한과 별도 접근 제한 |
| `dist/proximity.js` (신규) | A→시설 및 시설→B 최단 도보시간, 공간/운영 상태 분리, 가장 가까운 유효 시설, 직접 도보 기준, 네트워크 도달 구간 |
| `dist/worker.js` | 그래프·경로 캐시, proximity와 기존 여정 계산 연결, 비용 변경 시 경로 재탐색 생략 |
| `dist/app.js`, `index.html`, `style.css` | 설정, 시설 상태 레이어·목록·규칙 설명·비교표, 시각화 전용 토글 |
| 내보내기 JSON/CSV/스냅샷 | proximity 결과·파라미터·데이터 모드·정류장 시각·비교 기준 포함 |

## 3. 파라미터

- `walkThresholdMin=5`: HIGH/LOW 분류 전용. 후보를 제거하지 않는다.
- `maxStationCandidates=10`: 각 끝 후보 상한. 25 또는 전체(정밀 모드) 선택. 잘린 후보 수와 전역 최적 누락 가능성을 명시한다.
- `routingObjective=distance`: 새 proximity 기본값은 실제 네트워크 거리 최소. `weighted`를 선택하면 기존 경사 가중 거리 목적함수 사용. 시간·칼로리에는 두 모드 모두 경사를 유지한다.
- `walkSpeed=4.8 km/h`: 네트워크 도보시간 가정. `walkMet=3.5`는 도보 에너지 가정이며 조절 가능하다.
- 기존 `walkLimit=800m`: 양 끝 각각의 명시적인 거리 제한. 5분 분류 임계값과 별개다.
- `maxWalkAccessMin=null`: 선택적인 별도 시간 제한. 빈칸이면 시간 제한 없음.
- `dataQuality`: LIVE_SNAPSHOT / REPLAY_SNAPSHOT / SYNTHETIC_EXAMPLE. 저장 스냅샷은 현재 이용 가능 상태로 주장하지 않는다.
- stations / routes / baseline / network reach 레이어 토글은 계산을 변경하지 않는다.

## 4. 계산 계약

`Spatial proximity`와 `Functional availability`를 독립적으로 저장한다. 도보시간은 직선거리나 원형 반경이 아니라 최단 도보 네트워크 시간이다. B 쪽은 역방향 보행 그래프를 사용해 시설→B 방향을 계산한다. 네트워크 투영은 기존 최대 50m 정책이며 투영 연결의 보행 가능성·거리는 검증/합산하지 않는다. 이 한계를 UI와 문서에 명시한다.

- 도달 가능·임계시간 이내: HIGH. 초과: LOW. 연결 불가: DISCONNECTED.
- 설치/대여/반납 플래그, 해당 수량, 유효 시각이 미확인·누락·오래되면 STATUS_UNKNOWN. 수량 0이나 운영 중단이 확인되면 UNAVAILABLE.
- HIGH + AVAILABLE → NEAR_AVAILABLE.
- HIGH + UNAVAILABLE → NEAR_UNAVAILABLE.
- LOW + AVAILABLE → FAR_AVAILABLE.
- 미확인 상태는 가까워도 UNKNOWN을 보존한다.
- 각 끝의 가장 가까운 유효 시설은 별도 출력이며 최적 전체 여정의 정류장과 같다고 가정하지 않는다.

목적함수 distance의 동률은 총 시간, 이후 station_id 사전순으로 결정한다. 후보 상한은 도보 접근시간 순으로 적용하므로 전체 모드 이외의 결과는 후보 집합 내 최적이다. 경사·요금·MET 기존 계산식을 바꾸지 않는다. 직접 도보 A→B 기준 경로는 다른 이동 방식임을 명시한다.

## 5. 화면과 출력

시설 분석 패널에 임계시간, 후보 모드, 목적함수, 선택적 시간 제한, 시설 역할(A 대여/B 반납), 지도 레이어, 독립적인 nearest 시설, 규칙 inspector, 시설 표, 직접 도보와 정류장 제약 여정 비교를 표시한다. 시설 클릭은 inspector를 선택하며 A/B를 자동 이동시키지 않는다.

선택적 3/5/10분 레이어는 실제 네트워크의 부분 간선 도달 구간을 표시한다. 직선 원이나 면형 heatmap으로 오인시키지 않는다. 전체 지도 노드의 접근성 surface 및 예측 가용성은 후속 범위다.

결과는 `proximity.origin`, `destination`, `nearest`, `baseline`, `reachability`, `settings`, `data_quality`와 여정 `candidateSelection`, `route_status`를 포함한다. 분석 실패가 시설 표/기준 도보까지 숨기지 않게 한다. 요금/MET/체중만 변경하면 캐시한 경로를 재평가하고 경로 탐색은 반복하지 않는다. 위치·네트워크·접근 한도·후보 수·속도·목적함수가 바뀌면 경로를 재탐색한다.

## 6. 경계 및 원본 명세와의 차이

A/B·시설은 기존 공원 외곽 1km 영역에서 선택한다. 도로망은 바깥 300m 여유까지 경로 탐색에 사용해 분석 경계의 가짜 막다른 길을 줄인다. UI는 이 추가 여유를 명시한다. DEM 해상도와 OSM 태그 한계는 유지된다.

원본의 간략 MET 식 대신 기존 `MET × 3.5 × kg / 200 × min`을 유지한다. Annual $5.40 상한은 조건을 외부에서 검증하지 못했으므로 자동 적용하지 않고 기존 미검증 경고를 유지한다. 현재 요금표를 새로 공식 검증했다고 주장하지 않는다.

## 7. 검증 계획

근접하나 e-bike 0, 4분 유효시설, 7분 유효시설, 도크0, 누락/오래된 상태, 단절, 역방향 보행, nearest와 전체 최적 차이, threshold만 변경 시 경로 불변, 목적함수 차이, 후보 절단 경고, plan/weight 변경 시 경로 캐시 사용, 네트워크 레이어의 실제 시간 한계, 요금 8분1초→$8.68, JSON/CSV/스냅샷 재현을 확인한다. 외부 GBFS 실연결은 네트워크 제한과 별도로 결과를 보고한다.

## 8. 구현 결과와 검증

- 상태 표·역할 선택·지도 심볼·IF–THEN–ELSE inspector·nearest 시설·직접 도보 비교표 구현.
- 실제 보행 네트워크의 3/5/10분 부분 간선 도달 레이어 및 지도 레이어 토글 구현. 면형 heatmap/전체 지점 접근성 surface/미래 가용성 예측은 구현하지 않았다.
- 거리 최소와 경사 가중 거리 모드, 각 끝 10/25/전체 후보, 명시적 후보 절단 경고 구현. 시간 하드캡은 선택된 접근 경로에 적용하며, 시간 제약 아래의 모든 경로를 탐색하는 Pareto 최적화는 아니다.
- GBFS v2 숫자 시각과 v3 RFC3339 시각, 상태 누락·갱신 실패, 타입 정의 기반 e-bike 수량을 처리한다. 갱신 실패는 기존 잔량을 현재 이용 가능으로 주장하지 않는다.
- JSON에 `proximity`, `trip`, `candidateSelection`, `diagnostics`; ZIP에 `proximity.csv`, `comparison.json` 추가. 새 스냅샷은 proximity 설정을 저장한다. 목적함수 필드가 없는 기존 설정 스냅샷은 과거의 weighted 모드로 읽는다.
- 계산 테스트 35개 통과. 기존 terrain_browser.py, recalculation_browser.py 및 신규 proximity_browser.py로 브라우저 회귀/통합 검증을 수행한다.
- 실제 GBFS feed discovery 접속은 현재 환경의 CONNECT HTTP 403으로 차단되었다. feed discovery/타입 판정/누락 상태는 제어된 응답으로 검증했으며, 실제 현재 Citi Bike 잔량을 확인한 것으로 보고하지 않는다.

검증 명령(저장소 루트에서 8000번 정적 서버 실행):

```sh
npm test --prefix central-park
python3 central-park/tests/proximity_browser.py
python3 central-park/tests/terrain_browser.py
python3 central-park/tests/recalculation_browser.py
```
