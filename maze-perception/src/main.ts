import { Simulation, defaults, type Config } from "./simulation";
import { Scene, type Layers } from "./scene";
import { materials, type Material } from "./world";
import "./style.css";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const config = defaults();
let sim = new Simulation({ ...config });
const layers: Layers = {
  rays: true,
  pulses: true,
  sound: true,
  range: false,
  maps: true,
  trails: true,
  landmarks: false,
  geometry: true,
};
const sliders: [keyof Config, string, number, number, number, string][] = [
  ["lidarRange", "LiDAR range", 3, 20, 1, "m"],
  ["echoRange", "Echo range", 3, 20, 1, "m"],
  ["soundRange", "Mouse sound radius", 1, 15, 1, "m"],
  ["lidarInterval", "LiDAR interval", 0.05, 1, 0.05, "s"],
  ["echoInterval", "Echo pulse interval", 0.1, 2, 0.1, "s"],
];
const advanced: [keyof Config, string, number, number, number][] = [
  ["lidarNoise", "LiDAR noise (m)", 0, 0.5, 0.005],
  ["echoNoise", "Echo noise (m)", 0, 1, 0.01],
  ["lidarFov", "LiDAR horizontal FOV", 30, 360, 5],
  ["lidarVertical", "LiDAR vertical FOV", 10, 180, 5],
  ["echoFov", "Echo horizontal FOV", 30, 360, 5],
  ["echoVertical", "Echo vertical FOV", 10, 180, 5],
  ["echoThreshold", "Echo threshold", 0.005, 0.5, 0.005],
  ["humanSpeed", "Human speed (m/s)", 0.2, 5, 0.1],
  ["batSpeed", "Bat speed (m/s)", 0.2, 8, 0.1],
  ["mouseSpeed", "Mouse speed (m/s)", 0.1, 5, 0.1],
  ["captureRadius", "Capture radius (m)", 0.3, 2, 0.1],
  ["timeLimit", "Time limit (s)", 10, 1800, 10],
];
document.querySelector("#app")!.innerHTML = `
 <header><a class="brand" href="#">SPATIAL <span>LAB / 02</span></a><div class="project-title">Perception in a Maze <span>Human × Bat</span></div><span class="live"><i></i> LOCAL SIMULATION</span></header>
 <main><aside class="controls"><div class="eyebrow">EXPERIMENT DESIGN</div><h1>Same world.<br>Different knowledge.</h1><p class="intro">Two sensing systems. One moving target. Watch space become memory.</p>
 <section><div class="section-title"><b>01</b> Environment</div><label for="environment">Material experiment</label><select id="environment"><option value="A">A · LiDAR advantage / foam</option><option value="B">B · Echo advantage / glass</option><option value="C" selected>C · Balanced / concrete</option></select><p class="hint">Switching resets both maps. Geometry, starts and random streams stay fixed.</p><div class="seed-row"><label>Seed<input id="seed" type="number" min="0" max="4294967295" value="2026"></label><button id="regenerate" title="Generate a fresh random seed">New maze ↗</button></div></section>
 <section><div class="section-title"><b>02</b> Sensing</div>${sliders.map(([k, label, min, max, step, unit]) => `<label class="range-label" for="${k}">${label}<output id="${k}-value">${config[k]} ${unit}</output></label><input id="${k}" type="range" min="${min}" max="${max}" step="${step}" value="${config[k]}">`).join("")}<details><summary>Advanced model parameters</summary>${advanced.map(([k, label, min, max, step]) => `<label class="advanced">${label}<input id="${k}" type="number" min="${min}" max="${max}" step="${step}" value="${config[k]}"></label>`).join("")}<p class="hint">Material coefficients are modeling assumptions, not measured properties. Changing these restarts the experiment.</p>${Object.entries(
   materials,
 )
   .map(
     ([k, m]) =>
       `<fieldset><legend>${k}</legend><label class="advanced">Optical reliability<input data-material="${k}" data-field="optical" type="number" min="0" max="1" step=".05" value="${m.optical}"></label><label class="advanced">Acoustic reflection<input data-material="${k}" data-field="reflection" type="number" min="0" max="1" step=".05" value="${m.reflection}"></label><label class="advanced">Absorption<input data-material="${k}" data-field="absorption" type="number" min="0" max="1" step=".05" value="${m.absorption}"></label></fieldset>`,
   )
   .join("")}</details></section>
 <section><div class="section-title"><b>03</b> Display layers</div><div class="toggles">${Object.entries(
   {
     geometry: "Full maze geometry",
     maps: "Accumulated + current maps",
     rays: "LiDAR scan rays",
     pulses: "Active echo pulses",
     sound: "Mouse sound events",
     range: "Sensor range envelopes",
     trails: "Movement trails",
     landmarks: "Memory landmarks",
   },
 )
   .map(
     ([k, label]) =>
       `<label><input type="checkbox" id="layer-${k}" ${layers[k as keyof Layers] ? "checked" : ""}>${label}</label>`,
   )
   .join("")}</div></section>
 <p class="method">Geometry-based sensing · Fixed 50 ms steps<br>30 × 30 × 12 m · 1 m occupancy voxels</p></aside>
 <article class="viewport"><div class="view-toolbar"><span><i class="dot"></i> LIVE SPATIAL VIEW</span><select id="camera" aria-label="Camera view"><option value="orbit">Orbit view</option><option value="top">Top view</option><option value="follow-human">Follow human</option><option value="follow-bat">Follow bat</option><option value="follow-mouse">Follow mouse</option></select></div><div id="scene" aria-label="Interactive 3D maze"></div><div id="render-error" hidden></div><div class="view-caption">DRAG TO ORBIT · SCROLL TO ZOOM · RIGHT DRAG TO PAN</div><div class="legend"><span class="human">● LiDAR knowledge</span><span class="bat">● Echo knowledge</span><span class="both">● Shared discovery</span><span>○ Unknown</span></div><div class="transport"><button id="start" class="primary">▶ Start experiment</button><button id="reset">↺ Reset</button><label>Speed<select id="speed"><option>1</option><option>2</option><option>4</option><option>6</option><option>10</option></select><span>×</span></label><div class="clock"><strong id="time">00:00.0</strong><span id="limit">/ 300 s</span></div></div></article>
 <aside class="analytics"><div class="eyebrow">LIVE OBSERVATIONS</div><div id="result" role="status">Ready to explore<span>Start both agents simultaneously.</span></div><div id="metrics"></div><section class="mouse-card"><div class="section-title"><b>●</b> Mouse / moving target</div><div id="mouse-status"></div><p class="hint">Passive hearing belongs to the bat only. Cues are uncertain and attenuated by intervening walls.</p></section><section><div class="section-title">Material key</div><div class="material-key"><span>▧ Foam / absorptive</span><span>▱ Glass / transparent</span><span>▦ Concrete / baseline</span><span>▰ Metal / reflective</span></div></section><button id="export">↓ Export experiment JSON</button><p class="method">Coverage measures observed free 3D volume. Accuracy measures correct classifications among known voxels; unknown cells are excluded. Different mobility means this compares complete agent systems.</p><a href="https://github.com/Hoonizzz/Spatial-Ai" target="_blank" rel="noreferrer">Source & methodology ↗</a></aside></main>`;
let scene: Scene | undefined;
try {
  scene = new Scene($("scene"), sim);
} catch (e) {
  $("render-error").hidden = false;
  $("render-error").textContent =
    `WebGL could not initialize: ${String(e)}. Simulation controls and metrics remain available.`;
}
function readConfig() {
  for (const [k] of [...sliders, ...advanced]) {
    const input = $<HTMLInputElement>(String(k));
    if (input.checkValidity() && Number.isFinite(input.valueAsNumber))
      (config as unknown as Record<string, unknown>)[k] = input.valueAsNumber;
  }
  const seed = $<HTMLInputElement>("seed");
  if (seed.checkValidity() && Number.isFinite(seed.valueAsNumber))
    config.seed = seed.valueAsNumber >>> 0;
  config.environment = $<HTMLSelectElement>("environment")
    .value as Config["environment"];
}
function reset() {
  readConfig();
  sim = new Simulation({ ...config });
  scene?.rebuild(sim);
  accumulator = 0;
  $("start").textContent = "▶ Start experiment";
  refresh();
}
for (const [k, , , , , unit] of sliders) {
  $<HTMLInputElement>(String(k)).addEventListener("input", () => {
    $(`${k}-value`).textContent =
      `${$<HTMLInputElement>(String(k)).value} ${unit}`;
  });
  $(String(k)).addEventListener("change", reset);
}
for (const [k] of advanced) $(String(k)).addEventListener("change", reset);
document
  .querySelectorAll<HTMLInputElement>("[data-material]")
  .forEach((input) =>
    input.addEventListener("change", () => {
      if (!input.checkValidity()) return;
      const m = materials[input.dataset.material as Material];
      m[input.dataset.field as "optical" | "reflection" | "absorption"] =
        input.valueAsNumber;
      reset();
    }),
  );
$("environment").addEventListener("change", reset);
$("seed").addEventListener("change", reset);
$("reset").addEventListener("click", reset);
$("regenerate").addEventListener("click", () => {
  $<HTMLInputElement>("seed").value = String(
    crypto.getRandomValues(new Uint32Array(1))[0],
  );
  reset();
});
$("start").addEventListener("click", () => {
  if (sim.winner) reset();
  sim.running = !sim.running;
  $("start").textContent = sim.running ? "Ⅱ Pause" : "▶ Resume";
  refresh();
});
for (const k of Object.keys(layers) as (keyof Layers)[])
  $(`layer-${k}`).addEventListener(
    "change",
    () => (layers[k] = $<HTMLInputElement>(`layer-${k}`).checked),
  );
$("camera").addEventListener("change", () =>
  scene?.setCamera($<HTMLSelectElement>("camera").value),
);
$("export").addEventListener("click", () => {
  const blob = new Blob(
    [
      JSON.stringify(
        { ...sim.export(), materialCoefficients: materials },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `perception-${config.seed}-${config.environment}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
function refresh() {
  const t = sim.time;
  $("time").textContent =
    `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(1).padStart(4, "0")}`;
  $("limit").textContent = `/ ${config.timeLimit} s`;
  $("result").innerHTML = sim.winner
    ? sim.winner === "Incomplete"
      ? `Time limit reached<span>Incomplete · neither agent captured the mouse.</span>`
      : `${sim.winner === "Tie" ? "Simultaneous capture" : sim.winner + " captures the mouse"}<span>Capture at ${t.toFixed(2)} s · experiment paused</span>`
    : `${sim.running ? "Exploration in progress" : "Experiment paused"}<span>Environment ${config.environment} · seed ${config.seed}</span>`;
  $("metrics").innerHTML = sim.agents
    .map((a) => {
      const m = sim.metrics(a);
      return `<section class="agent-card ${a.kind.toLowerCase()}"><div class="agent-head"><h2>${a.kind}</h2><span>${a.kind === "Human" ? "LiDAR / ground" : "Echo / flight"}</span></div><div class="agent-state">${a.state}<span>${a.p.y.toFixed(1)} m altitude</span></div><div class="metric-primary"><strong>${m.coverage.toFixed(1)}<small>%</small></strong><span>SPACE EXPLORED</span></div><div class="progress"><i style="width:${Math.min(100, m.coverage)}%"></i></div><dl><dt>Mapping accuracy</dt><dd>${m.accuracy.toFixed(1)}%</dd><dt>Distance traveled</dt><dd>${m.distance.toFixed(1)} m</dd><dt>Collision attempts</dt><dd>${m.collisions}</dd><dt>Failed detections</dt><dd>${m.failed}</dd><dt>Mouse detections</dt><dd>${m.detections}</dd><dt>Landmarks</dt><dd>${m.landmarks}</dd><dt>False occupied / free</dt><dd>${m.falseOccupied} / ${m.falseFree}</dd><dt>Unknown voxels</dt><dd>${m.unknown}</dd><dt>Capture time</dt><dd>${m.captureTime === null ? "—" : m.captureTime.toFixed(2) + " s"}</dd></dl></section>`;
    })
    .join("");
  $("mouse-status").textContent =
    `${sim.mouse.moving ? "Moving · emitting intermittent sound" : "Stationary · no new sound"} / ${sim.mouse.p.y.toFixed(1)} m altitude`;
  if (sim.winner) $("start").textContent = "↻ New experiment";
}
let last = performance.now(),
  accumulator = 0,
  lastUI = 0;
function frame(now: number) {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (sim.running) {
    accumulator += elapsed * Number($<HTMLSelectElement>("speed").value);
    let steps = 0;
    while (accumulator >= 0.05 && steps++ < 25 && sim.running) {
      sim.step();
      accumulator -= 0.05;
    }
  } else accumulator = 0;
  if (now - lastUI > 180) {
    refresh();
    lastUI = now;
  }
  scene?.update(layers);
  requestAnimationFrame(frame);
}
refresh();
requestAnimationFrame(frame);
if (new URLSearchParams(location.search).has("test"))
  Object.assign(window, {
    mazeTest: {
      get sim() {
        return sim;
      },
      get scene() {
        return scene;
      },
      reset,
      step(n: number) {
        for (let i = 0; i < n && !sim.winner; i++) sim.step();
        refresh();
      },
    },
  });
