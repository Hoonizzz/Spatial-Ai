import { Simulation, defaults, type Config } from "./simulation";
import type { KnowledgeMode } from "./regions";
import { Scene, type Layers } from "./scene";
import { materials, type Material } from "./world";
import "./style.css";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const config = defaults();
let sim = new Simulation({ ...config });
const layers: Layers = {
  rays: false,
  pulses: false,
  sound: false,
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
  ["echoFov", "Echo horizontal FOV", 30, 360, 5],
  ["echoThreshold", "Echo threshold", 0.005, 0.5, 0.005],
  ["humanSpeed", "Human speed (m/s)", 0.2, 5, 0.1],
  ["batSpeed", "Bat speed (m/s)", 0.2, 8, 0.1],
  ["mouseSpeed", "Mouse speed (m/s)", 0.1, 5, 0.1],
  ["captureRadius", "Capture radius (m)", 0.3, 2, 0.1],
  ["timeLimit", "Time limit (s)", 10, 1800, 10],
];
document.querySelector("#app")!.innerHTML = `
 <header><a class="brand" href="#">SPATIAL <span>LAB / 02</span></a><div class="project-title">Perception in a Maze <span>Human × Bat</span></div><nav class="workspace-links"><a href="#controls-panel">Controls</a><a href="#analytics-panel">Agent maps</a></nav><label class="interface-size">UI size<select id="ui-size" aria-label="Interface size"><option value="1">100%</option><option value="1.5" selected>150%</option><option value="2">200%</option><option value="3">300%</option></select></label><span class="live"><i></i> LOCAL SIMULATION</span></header>
 <main><aside class="controls" id="controls-panel"><div class="eyebrow">EXPERIMENT DESIGN</div><h1>Same world.<br>Different knowledge.</h1><p class="intro">Two sensing systems. One moving target. Watch space become memory.</p>
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
     geometry: "Maze materials",
     maps: "Perceived regions",
     rays: "LiDAR scan rays",
     pulses: "Active echo pulses",
     sound: "Mouse sound events",
     range: "Sensor range sectors",
     trails: "Movement trails",
     landmarks: "Memory landmarks",
   },
 )
   .map(
     ([k, label]) =>
       `<label><input type="checkbox" id="layer-${k}" ${layers[k as keyof Layers] ? "checked" : ""}>${label}</label>`,
   )
   .join("")}</div></section>
 <p class="method">Geometry-based sensing · Fixed 50 ms steps<br>30 × 30 m · 1 m map cells</p></aside>
 <article class="viewport"><div class="view-toolbar"><span><i class="dot"></i> 2D MAZE PLAN</span><div class="view-options"><div id="knowledge-view" class="knowledge-switch" role="group" aria-label="Displayed knowledge"><button data-knowledge="world" aria-pressed="true">All</button><button data-knowledge="human" aria-pressed="false">Human</button><button data-knowledge="bat" aria-pressed="false">Bat</button><button data-knowledge="overlap" aria-pressed="false">Shared</button></div><label class="cutaway-label"><input id="map-memory" type="checkbox">Accumulated memory</label><select id="camera" aria-label="Camera view"><option value="fit">Fit whole maze</option><option value="follow-human">Follow human</option><option value="follow-bat">Follow bat</option><option value="follow-mouse">Follow mouse</option></select><button id="zoom-out" aria-label="Zoom out">−</button><button id="zoom-in" aria-label="Zoom in">+</button></div></div><div class="transport"><button id="start" class="primary">▶ Start experiment</button><button id="reset">↺ Reset</button><label>Speed<select id="speed"><option>1</option><option>2</option><option>4</option><option>6</option><option>10</option></select><span>×</span></label><div class="clock"><strong id="time">00:00.0</strong><span id="limit">/ 300 s</span></div></div><div id="scene" aria-label="Interactive 2D maze"></div><div id="render-error" hidden></div><div class="view-caption">CURRENT SCAN · DRAG TO PAN · SCROLL TO ZOOM · FIXED METRIC SCALE</div><div class="legend"><span class="human">● LiDAR knowledge</span><span class="bat">● Echo knowledge</span><span class="both">● Shared discovery</span><span>○ Unknown</span></div></article>
 <aside class="analytics" id="analytics-panel"><div class="eyebrow">LIVE OBSERVATIONS</div><div id="result" role="status">Ready to explore<span>Start both agents simultaneously.</span></div><div id="metrics"></div><section class="mouse-card"><div class="section-title"><b>●</b> Mouse / moving target</div><div id="mouse-status"></div><p class="hint">Passive hearing belongs to the bat only. Cues are uncertain and attenuated by intervening walls.</p></section><section><div class="section-title">Material key</div><div class="material-key"><span>▧ Foam / opaque, sound absorbing</span><span>▱ Glass / transparent, blue frame</span><span>▦ Concrete / opaque</span><span>▰ Metal / opaque, reflective</span></div></section><button id="export">↓ Export experiment JSON</button><p class="method">Coverage measures observed free floor area. Accuracy measures correct known cells. Both agents use the same plane and default speed; sensing and hearing differ.</p><a href="https://github.com/Hoonizzz/Spatial-Ai" target="_blank" rel="noreferrer">Source & methodology ↗</a></aside></main>`;
let scene: Scene | undefined;
try {
  scene = new Scene($("scene"), sim);
} catch (e) {
  $("render-error").hidden = false;
  $("render-error").textContent = `Canvas could not initialize: ${String(e)}.`;
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

function drawMemoryPlans() {
  for (const a of sim.agents) {
    const canvas = $<HTMLCanvasElement>(`memory-${a.kind}`);
    if (!canvas) continue;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#e7e9ef";
    ctx.fillRect(0, 0, 360, 360);
    const cells = new Map<string, number>();
    for (const [k, value] of a.memory.cells) {
      const [x, y, z] = k.split(",").map(Number);
      if (y > 1) continue;
      const id = `${x},${z}`;
      cells.set(id, Math.max(cells.get(id) ?? 0, value));
    }
    for (const [k, value] of cells) {
      const [x, z] = k.split(",").map(Number);
      ctx.fillStyle =
        a.kind === "Human"
          ? value
            ? "#1160d0"
            : "#bedbff"
          : value
            ? "#b94c08"
            : "#ffdab6";
      ctx.fillRect(x * 12, z * 12, 12, 12);
    }
    ctx.beginPath();
    ctx.arc(a.p.x * 12, a.p.z * 12, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#25334c";
    ctx.stroke();
  }
}
$("knowledge-view").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "button[data-knowledge]",
  );
  if (!button || !scene) return;
  scene.setKnowledgeMode(button.dataset.knowledge as KnowledgeMode);
  document
    .querySelectorAll<HTMLButtonElement>("[data-knowledge]")
    .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
});
$("map-memory").addEventListener("change", () => {
  if (scene) {
    scene.showMemory = $<HTMLInputElement>("map-memory").checked;
    scene.frameScene();
    document.querySelector(".view-caption")!.textContent =
      `${scene.showMemory ? "ACCUMULATED MEMORY" : "CURRENT SCAN REGIONS"} · DRAG TO PAN · SCROLL TO ZOOM · FIXED METRIC SCALE`;
  }
});
$("zoom-in").addEventListener("click", () => {
  if (scene) scene.zoom = Math.min(4, scene.zoom * 1.2);
});
$("zoom-out").addEventListener("click", () => {
  if (scene) scene.zoom = Math.max(1, scene.zoom / 1.2);
});
$("ui-size").addEventListener("change", () => {
  document.documentElement.style.setProperty(
    "--ui-scale",
    $<HTMLSelectElement>("ui-size").value,
  );
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
      return `<section class="agent-card ${a.kind.toLowerCase()}"><div class="agent-head"><h2>${a.kind}</h2><span>${a.kind === "Human" ? "LiDAR / planar" : "Echo / planar"}</span></div><div class="agent-state">${a.state}<span>x ${a.p.x.toFixed(1)} · y ${a.p.z.toFixed(1)} m</span></div><figure class="memory-plan"><canvas id="memory-${a.kind}" width="360" height="360" aria-label="${a.kind} independent planar memory"></canvas><figcaption>Own memory · 30 × 30 m<br>Filled regions = occupied · pale = free · gray = unknown</figcaption></figure><div class="metric-primary"><strong>${m.coverage.toFixed(1)}<small>%</small></strong><span>FLOOR OBSERVED</span></div><div class="progress"><i style="width:${Math.min(100, m.coverage)}%"></i></div><dl><dt>Mapping accuracy</dt><dd>${m.accuracy.toFixed(1)}%</dd><dt>Distance traveled</dt><dd>${m.distance.toFixed(1)} m</dd><dt>Collision attempts</dt><dd>${m.collisions}</dd><dt>Failed detections</dt><dd>${m.failed}</dd><dt>Mouse detections</dt><dd>${m.detections}</dd><dt>Landmarks</dt><dd>${m.landmarks}</dd><dt>False occupied / free</dt><dd>${m.falseOccupied} / ${m.falseFree}</dd><dt>Unknown cells</dt><dd>${m.unknown}</dd><dt>Capture time</dt><dd>${m.captureTime === null ? "—" : m.captureTime.toFixed(2) + " s"}</dd></dl></section>`;
    })
    .join("");
  drawMemoryPlans();
  $("mouse-status").textContent =
    `${sim.mouse.moving ? "Moving · emitting intermittent sound" : "Stationary · no new sound"} / planar target`;
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
