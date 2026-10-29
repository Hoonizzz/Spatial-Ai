# Horse route and metabolic scenario model

## Scope and evidence

This is an explicitly uncalibrated, editable mechanistic planning scenario. It is **not** a published equine regression, a measured physiological result, or a feed/digestible-energy prescription. Human MET equations are not used for the horse. The user selected defaults of 500 kg and 6 km/h. Other model coefficients below are scenario assumptions; they must not be presented as literature-validated equine values. Access to external research sources was blocked during implementation, so no research validation is claimed.

## Routes and time

The horse copies the exact selected human journey's walking and riding edges, including fractional endpoints, direction and elevation grades. No separate horse-permission graph or bridleway detour is selected. This is a shared-route simulation; the geometry does not establish real equestrian access. If there is no human journey, the horse reports `NO_SHARED_HUMAN_ROUTE` rather than inventing one.

The horse retains the same slope-weighted cost `sum(horizontal distance * max(1, 18 * abs(grade)))`. Each segment takes `seconds = distance / (base km/h / 3.6) * slopeWeight`. Segments split at fractional start/end positions retain proportional distance, grade, time and metabolic work. Unknown terrain stays explicitly labeled; uphill energy cannot be estimated for those segments. Terrain heights have DEM resolution limits, particularly at bridges and tunnels.

## Segment metabolism

Let M be horse mass in kg, D horizontal meters, T slope-adjusted minutes, H positive elevation gain in meters, R resting oxygen in ml O2/kg/min, C net oxygen transport in ml O2/kg/m, and eta uphill efficiency.

- Resting expenditure: `M * R * T * 5 / 1000` kcal.
- Level locomotion expenditure above rest: `M * C * D * 5 / 1000` kcal.
- Additional uphill expenditure: `M * 9.80665 * H / (eta * 4184)` kcal.
- Gross expenditure is the sum; active expenditure excludes resting.

Constants: approximate aerobic energy equivalent **5 kcal/L O2** (varies with fuel mixture), gravity 9.80665 m/s², 4184 J/kcal. Scenario defaults: **R=3 ml/kg/min**, **C=0.10 ml/kg/m**, **eta=0.25**. These defaults are adjustable assumptions, not verified equine measurements. The speed/grade factor affects resting time; distance affects net level locomotion; only ascent adds gravitational work. Downhill does not generate negative energy credit.

Example under these assumptions: 500 kg, 6 km/h, 1000 m level travel → 10 minutes, resting 75 kcal + locomotion 250 kcal = **325 kcal gross**, **250 kcal active**. This is a dimensional/formula example, not a validation against a horse experiment.

No rider/cargo mass, gait transitions, fatigue, thermoregulation, terrain-specific footing energy or feeding requirements are modeled. The linear oxygen transport coefficient does not establish a physiological speed response across gaits. This implementation can support later replacement with a sourced equine study or animal-specific measurements without changing path geometry or playback.

## Outputs and checks

Human/Horse result selection updates gross energy, component breakdown, travel distance/time, route elevation and cumulative chart. Horse USD results are N/A without a complete carriage quote; with one, the entered base and started extra-time units determine the total per carriage. Map agents independently interpolate their own sequences under the shared elapsed clock and remain at their destination after arrival. The selected agent and complete human/horse results are included in exported result JSON, settings in snapshots, and the selected agent’s energy in CSV (horse monetary cells are empty if no complete tariff is configured).

Tests check dimensional arithmetic, mass/speed responses, slope/uphill/downhill behavior, exact walking/riding geometry, fractional edges, nonmutation of the human result, unavailable shared routes, independent time, and worker/UI behavior. Browser fixtures are synthetic and are not evidence of actual Central Park horse-network connectivity or calibrated metabolism.

## Carriage pricing (separate from metabolism)

Inputs: base price/period, extra price/period, source. The user supplied **USD 72 per 20 minutes per carriage**. Default base price/period and additional price/period are both $72 / 20 minutes. The source records this user-provided tariff; independent current-market verification remains unclaimed because external NYC/operator pages returned HTTP 403. Prices/time units remain editable. For t > 0, charge base price plus `ceil(max(0, t - basePeriod) / extraPeriod)` additional charges; t = 0 costs zero. The cumulative cost buys the base period at departure and adds each started extra period, stopping at the horse’s arrival. The quote is per carriage, not per rider; taxes/tips are not added. Currency uses integer US cents. A missing required price yields no estimate, not zero.

Pricing is not horse metabolic or feed cost. The oxygen, uphill work and speed formulas above are unchanged. The model does not add carriage/rider load to the energy estimate. Input prices and provenance persist in snapshots/results with `market_verified: false`. Operator-specific fixed tours, minimums, holiday premiums and mandatory fees must be represented by an appropriate supplied quote; they are not guessed.
