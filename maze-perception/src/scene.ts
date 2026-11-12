import { Simulation } from "./simulation";
import { materials, type V } from "./world";
import {
  mergePlanRegions,
  selectRegionCells,
  type KnowledgeMode,
} from "./regions";
export type Layers = {
  rays: boolean;
  pulses: boolean;
  sound: boolean;
  range: boolean;
  maps: boolean;
  trails: boolean;
  landmarks: boolean;
  geometry: boolean;
};
const ownerColor = { human: "#1769ce", bat: "#c86216", both: "#8547b9" };
const freeColor = { human: "#b6d7ff", bat: "#ffcfaa", both: "#d8beed" };
export class Scene {
  canvas = document.createElement("canvas");
  ctx: CanvasRenderingContext2D;
  knowledgeMode: KnowledgeMode = "world";
  showMemory = false;
  cameraMode = "fit";
  zoom = 1;
  pan = { x: 0, z: 0 };
  width = 1;
  height = 1;
  scale = 1;
  origin = { x: 0, z: 0 };
  drawnRegions = 0;
  lastRevision = "";
  regions: ReturnType<typeof mergePlanRegions> = [];
  constructor(
    public host: HTMLElement,
    public sim: Simulation,
  ) {
    this.canvas.setAttribute(
      "aria-label",
      "Interactive two-dimensional maze plan",
    );
    this.canvas.setAttribute("role", "img");
    host.append(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    let drag: { x: number; y: number; px: number; pz: number } | null = null;
    this.canvas.addEventListener("pointerdown", (e) => {
      drag = { x: e.clientX, y: e.clientY, px: this.pan.x, pz: this.pan.z };
      this.canvas.setPointerCapture(e.pointerId);
      this.cameraMode = "fit";
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      this.pan = {
        x: drag.px + (e.clientX - drag.x) / this.scale,
        z: drag.pz + (e.clientY - drag.y) / this.scale,
      };
    });
    const end = () => (drag = null);
    this.canvas.addEventListener("pointerup", end);
    this.canvas.addEventListener("pointercancel", end);
    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(
          1,
          Math.min(4, this.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)),
        );
      },
      { passive: false },
    );
  }
  rebuild(sim: Simulation) {
    this.sim = sim;
    this.lastRevision = "";
    this.frameScene();
  }
  resize() {
    const r = this.host.getBoundingClientRect();
    this.width = Math.max(1, r.width);
    this.height = Math.max(1, r.height);
    const dpr = Math.min(devicePixelRatio, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
  }
  frameScene() {
    this.zoom = 1;
    this.pan = { x: 0, z: 0 };
  }
  setKnowledgeMode(mode: KnowledgeMode) {
    this.knowledgeMode = mode;
    this.lastRevision = "";
  }
  setCamera(mode: string) {
    this.cameraMode = mode;
    this.frameScene();
    if (mode !== "fit") this.zoom = 1.6;
  }
  visibleAgent(index: number) {
    return (
      this.knowledgeMode === "world" ||
      this.knowledgeMode === (index ? "bat" : "human")
    );
  }
  path(points: V[], color: string, width: number, alpha = 1) {
    if (points.length < 2) return;
    const c = this.ctx;
    c.beginPath();
    c.moveTo(points[0].x, points[0].z);
    for (const p of points.slice(1)) c.lineTo(p.x, p.z);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.globalAlpha = alpha;
    c.stroke();
    c.globalAlpha = 1;
  }
  label(p: V, text: string, color: string, offset: number) {
    const c = this.ctx;
    c.font = `600 ${Math.max(0.52, 14 / this.scale)}px system-ui`;
    const w = c.measureText(text).width + 0.4,
      h = Math.max(0.75, 20 / this.scale),
      z = p.z + offset;
    c.fillStyle = "#fffdf5";
    c.strokeStyle = color;
    c.lineWidth = 1.3 / this.scale;
    c.beginPath();
    c.roundRect(p.x - w / 2, z - h / 2, w, h, 0.12);
    c.fill();
    c.stroke();
    c.fillStyle = color;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, p.x, z);
  }
  update(layers: Layers) {
    const s = this.sim,
      c = this.ctx,
      dpr = this.canvas.width / this.width;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = this.knowledgeMode === "world" ? "#eef4f2" : "#e7eaf0";
    c.fillRect(0, 0, this.width, this.height);
    this.scale =
      Math.max(1, (Math.min(this.width, this.height) - 48) / 30) * this.zoom;
    let focus = { x: 15, z: 15 };
    if (this.cameraMode.startsWith("follow")) {
      const p =
        this.cameraMode === "follow-human"
          ? s.agents[0].p
          : this.cameraMode === "follow-bat"
            ? s.agents[1].p
            : s.mouse.p;
      if (
        this.knowledgeMode === "world" ||
        this.cameraMode === `follow-${this.knowledgeMode}`
      )
        focus = p;
    }
    this.origin = {
      x: this.width / 2 - (focus.x - this.pan.x) * this.scale,
      z: this.height / 2 - (focus.z - this.pan.z) * this.scale,
    };
    c.translate(this.origin.x, this.origin.z);
    c.scale(this.scale, this.scale);
    c.save();
    c.beginPath();
    c.rect(0, 0, 30, 30);
    c.clip();
    c.fillStyle = this.knowledgeMode === "world" ? "#fffdf6" : "#e0e4ec";
    c.fillRect(0, 0, 30, 30);
    if (this.knowledgeMode === "world" && layers.geometry)
      for (const wall of s.world.walls) {
        const x = wall.x,
          z = wall.z;
        c.fillStyle =
          "#" + materials[wall.material].color.toString(16).padStart(6, "0");
        c.fillRect(x, z, 2, 2);
        c.strokeStyle = wall.material === "glass" ? "#397c9b" : "#9d8d9e";
        c.lineWidth = wall.material === "glass" ? 0.1 : 0.025;
        c.setLineDash(wall.material === "glass" ? [0.22, 0.12] : []);
        c.strokeRect(x + 0.05, z + 0.05, 1.9, 1.9);
        c.setLineDash([]);
        if (wall.material === "foam") {
          c.strokeStyle = "#ac606c";
          c.lineWidth = 0.035;
          for (let k = 0.4; k < 2; k += 0.5) {
            c.beginPath();
            c.moveTo(x + 0.1, z + k);
            c.lineTo(x + k, z + 0.1);
            c.stroke();
          }
        }
        if (wall.material === "metal") {
          c.fillStyle = "#617b99";
          for (const dx of [0.28, 1.72])
            for (const dz of [0.28, 1.72]) {
              c.beginPath();
              c.arc(x + dx, z + dz, 0.06, 0, Math.PI * 2);
              c.fill();
            }
        }
      }
    const revision =
      s.agents
        .map((a) => `${a.scanTime}:${a.collisions}:${a.memory.cells.size}`)
        .join("/") +
      this.knowledgeMode +
      this.showMemory;
    if (revision !== this.lastRevision) {
      this.regions = mergePlanRegions(
        selectRegionCells(
          s.agents.map((a) => a.memory),
          this.knowledgeMode,
          !this.showMemory,
        ),
      );
      this.lastRevision = revision;
    }
    this.drawnRegions = layers.maps ? this.regions.length : 0;
    if (layers.maps)
      for (const r of this.regions) {
        if (this.knowledgeMode === "world" && r.occupied) {
          c.strokeStyle = ownerColor[r.owner];
          c.lineWidth = 0.08;
          c.strokeRect(r.x + 0.06, r.z + 0.06, r.width - 0.12, r.depth - 0.12);
          continue;
        }
        c.globalAlpha = this.knowledgeMode === "world" ? 0.55 : 1;
        c.fillStyle = r.occupied ? ownerColor[r.owner] : freeColor[r.owner];
        c.fillRect(r.x, r.z, r.width, r.depth);
        c.globalAlpha = 1;
      }
    for (const [i, a] of s.agents.entries()) {
      if (!this.visibleAgent(i)) continue;
      const color = ownerColor[i ? "bat" : "human"],
        age = s.time - a.scanTime;
      if (layers.trails) this.path(a.trail, color, 0.06, 0.75);
      if (layers.range) {
        const range = i ? s.config.echoRange : s.config.lidarRange,
          fov = ((i ? s.config.echoFov : s.config.lidarFov) * Math.PI) / 180;
        c.beginPath();
        c.moveTo(a.p.x, a.p.z);
        c.arc(a.p.x, a.p.z, range, a.heading - fov / 2, a.heading + fov / 2);
        c.closePath();
        c.fillStyle = color;
        c.globalAlpha = 0.08;
        c.fill();
        c.globalAlpha = 1;
      }
      if (layers.rays && i === 0 && age < 0.15)
        for (const ray of a.rays) this.path([ray.a, ray.b], color, 0.025, 0.25);
      if (layers.pulses && i === 1 && age < s.config.echoInterval) {
        c.beginPath();
        c.arc(
          a.p.x,
          a.p.z,
          Math.max(0.1, (age / s.config.echoInterval) * s.config.echoRange),
          0,
          Math.PI * 2,
        );
        c.strokeStyle = color;
        c.lineWidth = 0.04;
        c.globalAlpha = 0.4;
        c.stroke();
        c.globalAlpha = 1;
      }
      if (layers.landmarks)
        for (const landmark of a.memory.landmarks.values()) {
          c.fillStyle = color;
          c.fillRect(landmark.p.x - 0.1, landmark.p.z - 0.1, 0.2, 0.2);
        }
    }
    if (layers.sound && this.knowledgeMode === "world")
      for (const sound of s.sounds) {
        c.beginPath();
        c.arc(
          sound.p.x,
          sound.p.z,
          0.2 + (s.time - sound.time),
          0,
          Math.PI * 2,
        );
        c.strokeStyle = "#69924a";
        c.lineWidth = 0.05;
        c.stroke();
      }
    for (const [i, a] of s.agents.entries())
      if (this.visibleAgent(i)) {
        const radius = Math.max(i ? 0.4 : 0.28, 8 / this.scale),
          color = ownerColor[i ? "bat" : "human"];
        c.beginPath();
        if (i) {
          c.moveTo(a.p.x, a.p.z - radius);
          c.lineTo(a.p.x + radius, a.p.z);
          c.lineTo(a.p.x, a.p.z + radius);
          c.lineTo(a.p.x - radius, a.p.z);
          c.closePath();
        } else c.arc(a.p.x, a.p.z, radius, 0, Math.PI * 2);
        c.fillStyle = color;
        c.fill();
        c.strokeStyle = "white";
        c.lineWidth = 2 / this.scale;
        c.stroke();
        this.label(a.p, i ? "BAT" : "HUMAN", color, i ? 1 : -1);
      }
    if (this.knowledgeMode === "world") {
      const p = s.mouse.p;
      c.beginPath();
      c.arc(p.x, p.z, Math.max(0.22, 7 / this.scale), 0, Math.PI * 2);
      c.fillStyle = "#507f39";
      c.fill();
      c.strokeStyle = "white";
      c.lineWidth = 2 / this.scale;
      c.stroke();
      this.label(p, "MOUSE", "#507f39", 0.8);
    }
    c.restore();
    c.strokeStyle = "#9ba9b7";
    c.lineWidth = 1 / this.scale;
    c.strokeRect(0, 0, 30, 30);
    // A fixed metric scale makes perceived area comparable between views.
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.strokeStyle = "#4e6072";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(18, this.height - 15);
    c.lineTo(18 + 2 * this.scale, this.height - 15);
    c.stroke();
    c.font = "13px system-ui";
    c.fillStyle = "#4e6072";
    c.textAlign = "left";
    c.fillText("2 m", 18, this.height - 22);
  }
}
