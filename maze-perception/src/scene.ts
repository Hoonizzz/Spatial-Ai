import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Simulation, type Agent } from "./simulation";
import { materials, center, type V } from "./world";
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
const vec = (p: V) => new T.Vector3(p.x, p.y, p.z);
export class Scene {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(43, 1, 0.1, 180);
  controls: OrbitControls;
  environment = new T.Group();
  dynamic = new T.Group();
  human = new T.Group();
  bat = new T.Group();
  mouse = new T.Group();
  map: T.InstancedMesh;
  cameraMode = "orbit";
  lastMap = "";
  sim: Simulation;
  constructor(
    public host: HTMLElement,
    sim: Simulation,
  ) {
    this.sim = sim;
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setClearColor(0x101a21);
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.camera.position.set(43, 43, 47);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(15, 1.5, 15);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.scene.add(new T.HemisphereLight(0xe1f6ff, 0x273427, 2));
    const light = new T.DirectionalLight(0xffffff, 2.5);
    light.position.set(12, 30, 14);
    this.scene.add(light);
    this.scene.add(
      this.environment,
      this.dynamic,
      this.human,
      this.bat,
      this.mouse,
    );
    this.map = new T.InstancedMesh(
      new T.BoxGeometry(0.7, 0.7, 0.7),
      new T.MeshBasicMaterial({
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
      }),
      10800,
    );
    this.map.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.scene.add(this.map);
    this.map.count = 0;
    this.makeActors();
    this.rebuild(sim);
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }
  mesh(
    group: T.Group,
    geometry: T.BufferGeometry,
    color: number,
    x: number,
    y: number,
    z: number,
  ) {
    const m = new T.Mesh(
      geometry,
      new T.MeshStandardMaterial({ color, roughness: 0.7 }),
    );
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }
  makeActors() {
    this.mesh(
      this.human,
      new T.CapsuleGeometry(0.19, 0.45, 4, 8),
      0x46aaff,
      0,
      0.1,
      0,
    );
    this.mesh(
      this.human,
      new T.SphereGeometry(0.18, 12, 8),
      0xd9c8b1,
      0,
      0.65,
      0,
    );
    for (const x of [-0.13, 0.13])
      this.mesh(
        this.human,
        new T.BoxGeometry(0.13, 0.45, 0.15),
        0x4585ad,
        x,
        -0.35,
        0,
      );
    this.mesh(
      this.human,
      new T.BoxGeometry(0.13, 0.12, 0.19),
      0x98ecff,
      0.18,
      0.5,
      0,
    );
    this.mesh(this.bat, new T.SphereGeometry(0.18, 12, 8), 0xf9a14b, 0, 0, 0);
    const shape = new T.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(0.8, -0.25);
    shape.lineTo(0.65, 0.12);
    shape.lineTo(0.43, 0.03);
    shape.lineTo(0.27, 0.19);
    shape.lineTo(0, 0.03);
    const wing = new T.ShapeGeometry(shape);
    for (const s of [-1, 1]) {
      const m = new T.Mesh(
        wing,
        new T.MeshStandardMaterial({ color: 0xec933e, side: T.DoubleSide }),
      );
      m.rotation.x = -Math.PI / 2;
      m.scale.x = s;
      this.bat.add(m);
    }
    for (const x of [-0.1, 0.1])
      this.mesh(
        this.bat,
        new T.ConeGeometry(0.08, 0.2, 4),
        0xffc17d,
        x,
        0.2,
        0,
      );
    const body = this.mesh(
      this.mouse,
      new T.SphereGeometry(0.2, 12, 8),
      0xa9d58e,
      0,
      0,
      0,
    );
    body.scale.set(1.4, 0.8, 0.8);
    for (const z of [-0.13, 0.13])
      this.mesh(
        this.mouse,
        new T.SphereGeometry(0.1, 10, 8),
        0xe1baa9,
        0.15,
        0.13,
        z,
      );
    this.mesh(
      this.mouse,
      new T.CylinderGeometry(0.02, 0.02, 0.45, 6),
      0xa5b698,
      -0.35,
      0,
      0,
    ).rotation.z = Math.PI / 2;
  }
  clear(group: T.Group) {
    for (const o of [...group.children]) {
      group.remove(o);
      o.traverse((v) => {
        if (
          v instanceof T.Mesh ||
          v instanceof T.Line ||
          v instanceof T.Points
        ) {
          v.geometry.dispose();
          const m = v.material;
          for (const material of Array.isArray(m) ? m : [m]) material.dispose();
        }
      });
    }
  }
  rebuild(sim: Simulation) {
    this.sim = sim;
    this.clear(this.environment);
    this.lastMap = "";
    const floor = this.mesh(
      this.environment,
      new T.BoxGeometry(30, 0.15, 30),
      0x26353b,
      15,
      -0.12,
      15,
    );
    floor.receiveShadow = true;
    const grid = new T.GridHelper(30, 30, 0x527078, 0x34474d);
    grid.position.set(15, 0.015, 15);
    this.environment.add(grid);
    for (const w of sim.world.walls) {
      const m = this.mesh(
        this.environment,
        new T.BoxGeometry(2, w.height, 2),
        materials[w.material].color,
        w.x + 1,
        w.height / 2,
        w.z + 1,
      );
      (m.material as T.MeshStandardMaterial).transparent = true;
      (m.material as T.MeshStandardMaterial).opacity =
        w.height === 12 ? 0.12 : w.material === "glass" ? 0.23 : 0.43;
      const edges = new T.LineSegments(
        new T.EdgesGeometry(m.geometry),
        new T.LineBasicMaterial({
          color: materials[w.material].color,
          transparent: true,
          opacity: 0.55,
        }),
      );
      edges.position.copy(m.position);
      this.environment.add(edges);
    }
    this.mesh(
      this.environment,
      new T.BoxGeometry(4, 0.3, 6),
      0x8a9b9f,
      11,
      3.85,
      6,
    );
    const ramp = new T.BufferGeometry();
    ramp.setAttribute(
      "position",
      new T.Float32BufferAttribute(
        [3, 0, 3, 9, 4, 3, 9, 4, 5, 3, 0, 3, 9, 4, 5, 3, 0, 5],
        3,
      ),
    );
    ramp.computeVertexNormals();
    const rm = new T.Mesh(
      ramp,
      new T.MeshStandardMaterial({ color: 0x97b0b5, side: T.DoubleSide }),
    );
    this.environment.add(rm);
  }
  resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
  line(points: V[], color: number, opacity = 1) {
    if (points.length < 2) return;
    const g = new T.BufferGeometry().setFromPoints(points.map(vec)),
      line = new T.Line(
        g,
        new T.LineBasicMaterial({ color, transparent: true, opacity }),
      );
    this.dynamic.add(line);
  }
  volume(a: Agent, range: number, hfov: number, vfov: number, color: number) {
    const points: V[] = [];
    for (const pitch of [-vfov / 2, vfov / 2])
      for (let i = 0; i <= 24; i++) {
        const yaw = a.heading + (i / 24 - 0.5) * hfov;
        points.push({
          x: a.p.x + Math.cos(yaw) * Math.cos(pitch) * range,
          y: a.p.y + Math.sin(pitch) * range,
          z: a.p.z + Math.sin(yaw) * Math.cos(pitch) * range,
        });
      }
    const corners = [0, 24, 49, 25],
      vertices: number[] = [];
    for (let i = 0; i < 4; i++) {
      const b = points[corners[i]],
        c = points[corners[(i + 1) % 4]];
      vertices.push(a.p.x, a.p.y, a.p.z, b.x, b.y, b.z, c.x, c.y, c.z);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute(
      "position",
      new T.Float32BufferAttribute(vertices, 3),
    );
    this.dynamic.add(
      new T.Mesh(
        geometry,
        new T.MeshBasicMaterial({
          color,
          side: T.DoubleSide,
          transparent: true,
          opacity: 0.035,
          depthWrite: false,
        }),
      ),
    );
    this.line(points.slice(0, 25), color, 0.28);
    this.line(points.slice(25), color, 0.28);
    for (const i of [0, 24, 25, 49]) this.line([a.p, points[i]], color, 0.22);
  }
  ring(p: V, radius: number, color: number, opacity: number) {
    const mesh = new T.Mesh(
      new T.RingGeometry(Math.max(0.01, radius - 0.035), radius, 40),
      new T.MeshBasicMaterial({
        color,
        side: T.DoubleSide,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, p.y, p.z);
    this.dynamic.add(mesh);
  }
  update(layers: Layers) {
    const s = this.sim;
    this.clear(this.dynamic);
    this.environment.visible = layers.geometry;
    this.map.visible = layers.maps;
    this.human.position.copy(vec(s.agents[0].p));
    this.bat.position.copy(vec(s.agents[1].p));
    this.mouse.position.copy(vec(s.mouse.p));
    this.human.rotation.y = -s.agents[0].heading + Math.PI / 2;
    this.bat.rotation.y = -s.agents[1].heading;
    this.mouse.rotation.y = -s.mouse.heading;
    for (const [i, a] of s.agents.entries()) {
      const color = i ? 0xffa252 : 0x54b3ff;
      const age = s.time - a.scanTime,
        interval = i ? s.config.echoInterval : s.config.lidarInterval;
      if (layers.range)
        this.volume(
          a,
          i ? s.config.echoRange : s.config.lidarRange,
          ((i ? s.config.echoFov : s.config.lidarFov) * Math.PI) / 180,
          ((i ? s.config.echoVertical : s.config.lidarVertical) * Math.PI) /
            180,
          color,
        );
      if (!i && layers.rays && age < 0.13) {
        const g = new T.BufferGeometry().setFromPoints(
          a.rays.flatMap((r) => [vec(r.a), vec(r.b)]),
        );
        this.dynamic.add(
          new T.LineSegments(
            g,
            new T.LineBasicMaterial({
              color,
              transparent: true,
              opacity: 0.24,
            }),
          ),
        );
      }
      if (i && layers.pulses && age < interval) {
        this.ring(
          a.p,
          Math.max(0.05, (s.config.echoRange * age) / interval),
          color,
          0.5 * (1 - age / interval),
        );
        const hits = a.rays.filter((r) => r.hit);
        const g = new T.BufferGeometry().setFromPoints(
          hits.map((r) => vec(r.b)),
        );
        this.dynamic.add(
          new T.Points(
            g,
            new T.PointsMaterial({
              color,
              size: 0.15,
              transparent: true,
              opacity: 1 - age / interval,
            }),
          ),
        );
      }
      if (layers.trails) this.line(a.trail, color, 0.7);
      if (layers.landmarks)
        for (const { p, kind } of a.memory.landmarks.values()) {
          if (kind === "intersection" && a.memory.landmarks.size > 100)
            continue;
          this.mesh(
            this.dynamic,
            new T.OctahedronGeometry(kind === "sound cue" ? 0.19 : 0.1),
            color,
            p.x,
            p.y + 0.3,
            p.z,
          );
        }
    }
    if (layers.sound)
      for (const sound of s.sounds)
        this.ring(
          sound.p,
          Math.min(s.config.soundRange, (s.time - sound.time) * 9) + 0.05,
          0xb5d8a2,
          Math.max(0, 0.5 - (s.time - sound.time) * 0.6),
        );
    const mapRevision = s.agents
      .map((a) => `${a.scanTime}:${a.memory.cells.size}:${a.collisions}`)
      .join("/");
    if (layers.maps && mapRevision !== this.lastMap) {
      this.lastMap = mapRevision;
      const union = new Set([
        ...s.agents[0].memory.cells.keys(),
        ...s.agents[1].memory.cells.keys(),
      ]);
      const matrix = new T.Matrix4();
      let n = 0;
      for (const k of union) {
        const h = s.agents[0].memory.cells.has(k),
          b = s.agents[1].memory.cells.has(k),
          p = center(k),
          occupied = s.agents.some((a) => a.memory.cells.get(k) === 1),
          current = s.agents.some((a) => a.memory.current.has(k));
        matrix.compose(
          vec(p),
          new T.Quaternion(),
          new T.Vector3(
            occupied ? 0.8 : 0.18,
            occupied ? 0.8 : 0.18,
            occupied ? 0.8 : 0.18,
          ),
        );
        this.map.setMatrixAt(n, matrix);
        const color = new T.Color(h && b ? 0xb48cff : h ? 0x4baeff : 0xffa05a);
        if (!current) color.multiplyScalar(0.48);
        this.map.setColorAt(n, color);
        n++;
      }
      this.map.count = n;
      this.map.instanceMatrix.needsUpdate = true;
      if (this.map.instanceColor) this.map.instanceColor.needsUpdate = true;
      this.map.computeBoundingSphere();
    }
    if (this.cameraMode.startsWith("follow")) {
      const p =
        this.cameraMode === "follow-human"
          ? s.agents[0].p
          : this.cameraMode === "follow-bat"
            ? s.agents[1].p
            : s.mouse.p;
      this.controls.target.lerp(vec(p), 0.12);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
  setCamera(mode: string) {
    this.cameraMode = mode;
    if (mode === "top") {
      this.controls.target.set(15, 0, 15);
      this.camera.position.set(15, 58, 15.01);
    } else if (mode === "orbit") {
      this.controls.target.set(15, 1.5, 15);
      this.camera.position.set(43, 43, 47);
    } else {
      this.camera.position.set(24, 22, 24);
    }
    this.controls.update();
  }
}
