# Central Park Cost Distance

센트럴파크와 경계 바깥 1km를 대상으로 A/B 경로와 kcal·USD 비용을 비교하는 한국어 웹 시뮬레이션입니다.

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

- [실행·구현·제약 안내](README.ko.md)
- [원본 기술 명세](SPEC.ko.md)
- [다른 채팅에서 이어받기 / GitHub 업로드](HANDOFF.ko.md)

실제 데이터 연결에는 인터넷이 필요합니다. 연결 없이도 앱에서 ‘예제로 살펴보기’를 선택할 수 있습니다. 예제 도로와 정류장은 합성 데이터이며 실제 길안내가 아닙니다.

현재 결과는 실행 가능한 MVP입니다. 계산 테스트 16개는 통과했지만, 작성 환경의 네트워크 제한으로 실제 데이터 연동·브라우저 화면 검증·원격 배포는 완료하지 못했습니다. 상세 제약은 README.ko.md에 있습니다.

이 패키지는 GitHub 저장소 초기화를 위한 소스이며 Git 기록, 계정 토큰, Sites 프로젝트 식별자 및 배포 설정은 포함하지 않습니다. 코드 배포 라이선스는 아직 지정하지 않았습니다. 공개 저장소에 올릴 경우 사용자가 라이선스를 선택해야 합니다.

## Terrain-aware routing (v2)

The English UI samples Mapzen Terrarium DEM along OSM roads every 30 m (zoom 14, bilinear interpolation). Green-to-brown road colors indicate elevation. No terrain is invented when loading fails. Terrain resolution does not resolve every curb, bridge deck or short slope.

For grade `g = delta elevation / horizontal distance`, the model uses `w = max(1, 18 * abs(g))`. Both uphill and downhill above 1:18 receive a proportional cost. Route selection minimizes weighted distance across walking and riding; displayed distance remains physical horizontal meters. Moving time and thus MET energy and rental fares also reflect the factor. This is a user-defined planning cost, not a calibrated speed/physiology law. Results include ascent, maximum grade and weighted distance. Synthetic examples and legacy snapshots explicitly report missing elevation.

Internal cycleways and OSM bicycle=yes/designated/permissive park paths are eligible in addition to Drives. Foot-only paths remain walking routes; access, one-way and turn restrictions still apply. No artificial connection across the park is added.

Live browser destinations: data.cityofnewyork.us, overpass-api.de (or overpass.kumi.systems), gbfs.citibikenyc.com and its advertised feed hosts, s3.amazonaws.com/elevation-tiles-prod. Local automated tests use controlled terrain fixtures; production data access must be verified separately when the environment network blocks these services.

Validation: `npm test` now executes 19 tests. With the repository served at port 8000 and Python Playwright/Chromium installed, run `python3 central-park/tests/terrain_browser.py` from the repository root. The browser test uses controlled DEM fixtures, including snapshot routing and elevation profile, not live terrain data.

## Human and horse on a shared route

The blue circle/person labeled **HUMAN** and purple square/horse labeled **HORSE** share the exact selected human route geometry, with independent speeds, positions and energy estimates. Both depart at elapsed time zero; the playback ends at the later arrival. Pause/scrub/reset apply to both. An arrived agent remains at its own destination. Switching **Chart and results** selects each agent’s energy and elevation without resetting the shared time. Horse fares are N/A, and human Citi Bike calculations retain their original model.

The horse defaults to **500 kg, 6 km/h**. Horse settings expose mass, base speed, resting oxygen, oxygen transport cost and uphill efficiency. The horse reuses all walking/riding edges from the human journey instead of selecting an equestrian-only network. Its existing oxygen-cost, uphill-work, slope-weight and speed calculations remain unchanged. Horse access tags do not constrain this shared-route simulation; if the human route is missing, the horse route is unavailable too.

See [Horse model](docs/horse-model.md) for units, formulas, assumptions and validation limits. Current engine tests: **22**. Browser tests cover independent positions, distinct badge shapes/labels, speed changes, arrival, focus switching, exact shared geometry, unchanged horse energy calculations and unavailable shared routes, in addition to terrain/energy overlays.

Human / Horse chart selection uses a keyboard-accessible toggle switch. Both choices remain selectable when a route is unavailable: the selected agent shows an explicit missing-route explanation and no energy/elevation values, instead of reverting to the other agent. The shared clock and any available agent continue during selection changes.
