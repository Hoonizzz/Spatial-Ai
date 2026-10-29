# Central Park Cost Distance

센트럴파크와 경계 바깥 1km를 대상으로 A/B 경로와 kcal·USD 비용을 비교하는 영어 UI 웹 시뮬레이션입니다.

## 실행

Node.js 22 이상에서 실행합니다. 외부 패키지 설치는 필요하지 않습니다.

```sh
npm run dev
```

브라우저에서 http://127.0.0.1:4173 에 접속하세요. Windows에서는 `실행.cmd`도 사용할 수 있습니다.

## 검증

```sh
npm test
npm run check
```

## 문서

- [현재 시뮬레이션 구현 문서](docs/SIMULATION.ko.md)
- [Facility Proximity 통합 구조·검증](docs/PROXIMITY.ko.md)
- [사용자 제공 proximity 원본 명세](docs/facility_proximity_simulation_spec.md) (외부 요금 검증 주장은 원문 내용이며 별도 검증을 뜻하지 않음)

- [실행·구현·제약 안내](README.ko.md)
- [원본 기술 명세](SPEC.ko.md)
- [다른 채팅에서 이어받기 / GitHub 업로드](HANDOFF.ko.md)

실제 데이터 연결에는 인터넷이 필요합니다. 연결 없이도 앱에서 ‘예제로 살펴보기’를 선택할 수 있습니다. 예제 도로와 정류장은 합성 데이터이며 실제 길안내가 아닙니다.

현재 센트럴파크 앱은 사람·말 공유 경로, DEM 경사, 대사·마차 비용 및 시설 proximity 분석을 지원합니다. 계산 테스트 35개와 Playwright 브라우저 검증이 통과했습니다. 실제 GBFS 접속은 이 환경에서 HTTP 403으로 차단되어 현재 잔량의 실연결 검증은 완료하지 못했습니다.

이 패키지는 GitHub 저장소 초기화를 위한 소스이며 Git 기록, 계정 토큰, Sites 프로젝트 식별자 및 배포 설정은 포함하지 않습니다. 코드 배포 라이선스는 아직 지정하지 않았습니다. 공개 저장소에 올릴 경우 사용자가 라이선스를 선택해야 합니다.

## Terrain-aware routing (v2)

The English UI samples Mapzen Terrarium DEM along OSM roads every 30 m (zoom 14, bilinear interpolation). Green-to-brown road colors indicate elevation. No terrain is invented when loading fails. Terrain resolution does not resolve every curb, bridge deck or short slope.

For grade `g = delta elevation / horizontal distance`, the model uses `w = max(1, 18 * abs(g))`. Both uphill and downhill above 1:18 receive a proportional cost. Route selection minimizes weighted distance across walking and riding; displayed distance remains physical horizontal meters. Moving time and thus MET energy and rental fares also reflect the factor. This is a user-defined planning cost, not a calibrated speed/physiology law. Results include ascent, maximum grade and weighted distance. Synthetic examples and legacy snapshots explicitly report missing elevation.

Internal cycleways and OSM bicycle=yes/designated/permissive park paths are eligible in addition to Drives. Foot-only paths remain walking routes; access, one-way and turn restrictions still apply. No artificial connection across the park is added.

Live browser destinations: data.cityofnewyork.us, overpass-api.de (or overpass.kumi.systems), gbfs.citibikenyc.com and its advertised feed hosts, s3.amazonaws.com/elevation-tiles-prod. Local automated tests use controlled terrain fixtures; production data access must be verified separately when the environment network blocks these services.

Validation: `npm test` now executes 35 tests. With the repository served at port 8000 and Python Playwright/Chromium installed, run `python3 central-park/tests/terrain_browser.py` from the repository root. The browser test uses controlled DEM fixtures, including snapshot routing and elevation profile, not live terrain data.

## Human and horse on a shared route

The blue circle/person labeled **HUMAN** and purple square/horse labeled **HORSE** share the exact selected human route geometry, with independent speeds, positions and energy estimates. Both depart at elapsed time zero; the playback ends at the later arrival. Pause/scrub/reset apply to both. An arrived agent remains at its own destination. Switching **Chart and results** selects each agent’s energy and elevation without resetting the shared time. Horse fares default to the user-supplied $72 per started 20 minutes per carriage; human Citi Bike calculations retain their original model.

The horse defaults to **500 kg, 6 km/h**. Horse settings expose mass, base speed, resting oxygen, oxygen transport cost and uphill efficiency. The horse reuses all walking/riding edges from the human journey instead of selecting an equestrian-only network. Its existing oxygen-cost, uphill-work, slope-weight and speed calculations remain unchanged. Horse access tags do not constrain this shared-route simulation; if the human route is missing, the horse route is unavailable too.

See [Horse model](docs/horse-model.md) for units, formulas, assumptions and validation limits. Current engine tests: **35**. Browser tests cover independent positions, distinct badge shapes/labels, speed changes, arrival, focus switching, exact shared geometry, unchanged horse energy calculations and unavailable shared routes, in addition to terrain/energy overlays.

Human / Horse chart selection uses a keyboard-accessible toggle switch. Both choices remain selectable when a route is unavailable: the selected agent shows an explicit missing-route explanation and no energy/elevation values, instead of reverting to the other agent. The shared clock and any available agent continue during selection changes.

Recalculation cancels any pending automatic calculation so a manual click cannot trigger a second reset shortly afterward. A journey that was playing restarts at the new route origin and resumes after the latest result arrives; paused or completed journeys remain paused and can be started with Play. Horse speed and metabolic defaults are unchanged. Regression check with the local server running: `python3 central-park/tests/recalculation_browser.py`.

## Carriage-tour cost

Horse model settings accept a per-carriage base price, base period, additional-time price, additional-time unit and quote source. For positive journey time, cost is `base + ceil(max(0, elapsed - basePeriod) / extraUnit) * extraPrice`. Exact boundaries stay in the preceding unit. Default pricing is **$72 per started 20 minutes, per carriage**, supplied by the user. Both the base and additional periods are 20 minutes at $72. A 20-minute journey costs $72; 20 minutes plus any fraction through 40 minutes costs $144. Independent market verification is not claimed; the source field records the user-provided tariff. Missing additional pricing produces N/A when a journey exceeds the base period.

Enter a before-tax/tip quote. Rates apply per carriage, not per passenger. Taxes and gratuities are not added. With a complete quote, Horse USD totals, the cumulative USD chart and CSV/JSON exports use the tariff; snapshots retain the price inputs/source. JSON explicitly records `market_verified: false`. This changes cost only: horse mass, speed, path, slope weight and metabolic calculations retain their existing behavior. Unit tests use invented, clearly marked test tariffs solely to validate arithmetic.

The tariff remains editable. Independent official/operator rate verification was blocked by HTTP 403; use the source field to preserve any later quote update.

## Facility proximity

The facility panel separates walking-network proximity (HIGH/LOW/DISCONNECTED) from pickup/drop-off availability (AVAILABLE/UNAVAILABLE/STATUS_UNKNOWN). A default 5-minute threshold classifies facilities and never removes route candidates. The existing 800 m hard walking distance and optional hard access-time cap are separate controls. Nearest valid pickup/return facilities are independent outputs, not assumed to form the optimal full trip.

The UI defaults to shortest physical network distance; slope-weighted distance remains selectable. Candidate limits are 10/25 per end or All; pruning warnings identify approximate results. Use All to search every eligible station candidate under the selected access-path policy. Walking speed and walking MET are adjustable without changing their 4.8 km/h and 3.5 defaults. Plan/weight/MET changes re-evaluate cached paths rather than searching the graph again.

Station symbols, role selection, a rule inspector, direct-walking comparison, and optional actual-network 3/5/10-minute reach layers are provided. Layer toggles are visualization-only. No Euclidean circle is presented as an isochrone, and the direct walking baseline is explicitly a different mode. `proximity.csv` and `comparison.json` join the existing export files. New snapshots retain analysis settings; older settings without an objective retain weighted routing when imported.

Run `python3 central-park/tests/proximity_browser.py` from the repository root with its 8000-port static server running. Tests use controlled station/terrain fixtures. Whole-map heatmaps, predictive availability, and a verified Annual fare cap remain outside this implementation; see the integration document for assumptions and limits.
