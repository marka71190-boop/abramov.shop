"use client";
import { useEffect, useRef, useState } from "react";
import { bbox, footprint, TABLE_KINDS, ZONE_KIND, type Placed, type Plan, type TableModel } from "@/lib/turnkey-geom";

/**
 * 3D-модель зала на three.js: пол по контуру, стены, колонны, зоны, столы со светильниками.
 * Модели столов рисуются из простых фигур — 3D-файлы не нужны. Мышью или пальцем — вращать и приближать.
 */
export function Scene3D({ plan, tables, models }: { plan: Plan; tables: Placed[]; models: TableModel[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (!alive || !box.current) return;
      const el = box.current;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      } catch {
        setError("Браузер не поддерживает 3D (WebGL). План сверху — во вкладке «План».");
        return;
      }
      const S = 0.001; // мм → м
      const b = bbox(plan.points);
      const cx = (b.x + b.w / 2) * S;
      const cz = (b.y + b.h / 2) * S;
      const H = plan.ceiling * S;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#0b0b0d");
      const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 500);
      const span = Math.max(b.w, b.h) * S;
      camera.position.set(cx + span * 0.35, span * 0.75 + 4, cz + span * 0.85);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(cx, 0.6, cz);
      controls.enableDamping = true;
      controls.maxPolarAngle = Math.PI / 2.05;
      controls.minDistance = 2;
      controls.maxDistance = span * 3 + 10;

      scene.add(new THREE.HemisphereLight("#fff6e8", "#202024", 0.55));
      const sun = new THREE.DirectionalLight("#ffffff", 0.6);
      sun.position.set(cx + span, span * 1.5, cz + span * 0.5);
      scene.add(sun);

      const mat = (color: string, extra: Record<string, unknown> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
      const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, m: InstanceType<typeof THREE.Material>, parent: InstanceType<typeof THREE.Object3D> = scene) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
      };

      // Пол по контуру зала
      const shape = new THREE.Shape(plan.points.map((p) => new THREE.Vector2(p.x * S, p.y * S)));
      const floor = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat("#3a2f28", { roughness: 0.9, side: THREE.DoubleSide }));
      floor.rotation.x = Math.PI / 2; // плоскость XY → XZ (y плана → z сцены)
      floor.receiveShadow = true;
      scene.add(floor);

      // Стены: полупрозрачные, чтобы видеть зал
      const wallMat = mat("#d8d2c8", { transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
      const edgeMat = new THREE.LineBasicMaterial({ color: "#dcbf83" });
      plan.points.forEach((a, i) => {
        const c = plan.points[(i + 1) % plan.points.length];
        const len = Math.hypot(c.x - a.x, c.y - a.y) * S;
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wallMat);
        wall.position.set(((a.x + c.x) / 2) * S, H / 2, ((a.y + c.y) / 2) * S);
        wall.rotation.y = -Math.atan2(c.y - a.y, c.x - a.x);
        scene.add(wall);
        const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x * S, 0.01, a.y * S), new THREE.Vector3(c.x * S, 0.01, c.y * S)]);
        scene.add(new THREE.Line(g, edgeMat));
      });

      for (const c of plan.columns) addBox(c.w * S, H, c.h * S, (c.x + c.w / 2) * S, H / 2, (c.y + c.h / 2) * S, mat("#9a958d"));

      for (const z of plan.zones) {
        const color = ZONE_KIND[z.kind].color;
        const patch = new THREE.Mesh(new THREE.PlaneGeometry(z.w * S, z.h * S), mat(color, { transparent: true, opacity: 0.35 }));
        patch.rotation.x = -Math.PI / 2;
        patch.position.set((z.x + z.w / 2) * S, 0.01, (z.y + z.h / 2) * S);
        scene.add(patch);
        if (z.kind === "BAR") {
          // Барная стойка вдоль длинной стороны зоны
          const along = z.w >= z.h;
          addBox(along ? z.w * S * 0.85 : 0.6, 1.1, along ? 0.6 : z.h * S * 0.85, (z.x + z.w / 2) * S, 0.55, (along ? z.y + z.h * 0.35 : z.y + z.h / 2) * S, mat("#5a3b22"));
        } else if (z.kind === "LOUNGE") {
          addBox(Math.min(2.4, z.w * S * 0.7), 0.45, 0.9, (z.x + z.w / 2) * S, 0.22, (z.y + z.h * 0.3) * S, mat("#4b3d33"));
          addBox(1.0, 0.45, 0.6, (z.x + z.w / 2) * S, 0.22, (z.y + z.h * 0.65) * S, mat("#2f2a26"));
        }
      }

      // Столы
      const black = mat("#0b0b0b");
      const lampMat = new THREE.MeshStandardMaterial({ color: "#1c1c1c", emissive: "#fff3d6", emissiveIntensity: 0.9 });
      const rodMat = mat("#222");
      let lights = 0;
      for (const t of tables) {
        const m = models.find((x) => x.id === t.modelId);
        if (!m) continue;
        const r = footprint(t, m);
        const L = (t.rot === 0 ? r.w : r.h) * S; // по длине стола
        const W = (t.rot === 0 ? r.h : r.w) * S;
        const g = new THREE.Group();
        g.position.set(t.x * S, 0, t.y * S);
        g.rotation.y = t.rot === 0 ? 0 : Math.PI / 2;
        scene.add(g);
        const frame = mat(m.frame, { roughness: 0.5 });
        const cloth = mat(m.cloth, { roughness: 0.95 });
        const top = 0.8;
        const rail = 0.14;
        // Ноги: у больших столов шесть
        const legs = L > 3.3 ? [-0.38, 0, 0.38] : [-0.36, 0.36];
        for (const fx of legs) for (const fz of [-0.33, 0.33]) addBox(0.14, top - 0.18, 0.14, fx * L, (top - 0.18) / 2, fz * W, frame, g);
        addBox(L * 0.94, 0.2, W * 0.9, 0, top - 0.12, 0, frame, g); // корпус (царга)
        addBox(L - rail * 2, 0.04, W - rail * 2, 0, top - 0.02, 0, cloth, g); // игровое поле
        // Борта
        addBox(L, 0.07, rail, 0, top + 0.02, -(W - rail) / 2, frame, g);
        addBox(L, 0.07, rail, 0, top + 0.02, (W - rail) / 2, frame, g);
        addBox(rail, 0.07, W - rail * 2, -(L - rail) / 2, top + 0.02, 0, frame, g);
        addBox(rail, 0.07, W - rail * 2, (L - rail) / 2, top + 0.02, 0, frame, g);
        // Лузы
        const pr = TABLE_KINDS[m.kind]?.pockets === "wide" ? 0.07 : 0.055;
        for (const [px, pz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
          [0, -1],
          [0, 1],
        ]) {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(pr, pr, 0.09, 20), black);
          p.position.set(px * (L / 2 - rail * 0.55), top + 0.02, pz * (W / 2 - rail * (px === 0 ? 0.4 : 0.55)));
          g.add(p);
        }
        // Светильник над столом
        const lampY = Math.min(H - 0.3, top + 1.0);
        addBox(L * 0.62, 0.08, 0.42, 0, lampY, 0, lampMat, g);
        for (const fx of [-0.25, 0.25]) addBox(0.015, H - lampY, 0.015, fx * L, lampY + (H - lampY) / 2, 0, rodMat, g);
        if (lights < 16) {
          const spot = new THREE.PointLight("#fff1d0", 1.6, 4, 2);
          spot.position.set(0, lampY - 0.1, 0);
          g.add(spot);
          lights++;
        }
      }

      const resize = () => {
        if (!el.clientWidth) return;
        renderer.setSize(el.clientWidth, el.clientHeight);
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      let raf = 0;
      const loop = () => {
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        scene.traverse((o) => {
          const mesh = o as InstanceType<typeof THREE.Mesh>;
          mesh.geometry?.dispose?.();
        });
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch((e) => {
      console.error("[3d]", e);
      setError("Не получилось показать 3D. План сверху — во вкладке «План».");
    });
    return () => {
      alive = false;
      cleanup();
    };
  }, [plan, tables, models]);

  return (
    <div className="scene3d" ref={box}>
      {error && <div className="scene3d__error">{error}</div>}
      <div className="scene3d__hint small">Крутите мышью или пальцем, колесо или щипок — приблизить</div>
    </div>
  );
}
