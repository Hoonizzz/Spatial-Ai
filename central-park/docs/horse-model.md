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

Human/Horse result selection updates gross energy, component breakdown, travel distance/time, route elevation and cumulative chart. Horse USD/rental results are N/A. Map agents independently interpolate their own sequences under the shared elapsed clock and remain at their destination after arrival. The selected agent and complete human/horse results are included in exported result JSON, settings in snapshots, and the selected agent’s energy in CSV (horse monetary cells are empty).

Tests check dimensional arithmetic, mass/speed responses, slope/uphill/downhill behavior, exact walking/riding geometry, fractional edges, nonmutation of the human result, unavailable shared routes, independent time, and worker/UI behavior. Browser fixtures are synthetic and are not evidence of actual Central Park horse-network connectivity or calibrated metabolism.
