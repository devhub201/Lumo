import { useEffect, useRef } from "react";

export type LumoOrbState = "listening" | "thinking" | "speaking" | "muted";

/**
 * The real LUMO orb: a hand-rolled 3D wireframe mesh rendered on canvas,
 * rim-lit from two directions with a soft ambient fill so it never goes
 * dark as it rotates. Ported from the approved design mockup.
 */
export function LumoOrb({
  state,
  size = 220,
}: {
  state: LumoOrbState;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const RES = 440;
    canvas.width = RES;
    canvas.height = RES;
    const off = document.createElement("canvas");
    off.width = RES;
    off.height = RES;
    const octx = off.getContext("2d");
    if (!octx) return;

    const W = RES,
      H = RES,
      CX = W / 2,
      CY = H / 2;
    const R = 148;
    const PD = R * 2.77;

    const hash = (n: number) => {
      const s = Math.sin(n * 12.9898) * 43758.5453;
      return s - Math.floor(s);
    };
    const bump = (theta: number, phi: number, t: number) =>
      Math.sin(theta * 2.1 + phi * 1.3 + t * 0.5) * 0.55 +
      Math.sin(theta * 3.7 - phi * 2.6 + t * 0.8 + 1.7) * 0.3 +
      Math.sin(theta * 1.3 + phi * 4.1 - t * 0.4 + 3.1) * 0.22 +
      Math.sin(phi * 5.3 + t * 0.9) * 0.15;

    const LAT = 20,
      LON = 34;
    const verts: Array<
      Array<{ theta: number; phi: number; jx: number; jy: number; ea: number }>
    > = [];
    for (let i = 0; i <= LAT; i += 1) {
      const theta = (Math.PI * i) / LAT;
      const row = [];
      for (let j = 0; j < LON; j += 1) {
        const phi = (2 * Math.PI * j) / LON;
        const jx = (hash(i * 97.3 + j * 13.7) - 0.5) * 0.028;
        const jy = (hash(i * 51.1 + j * 71.9 + 5) - 0.5) * 0.028;
        const ea = 0.55 + hash(i * 33.3 + j * 19.1 + 9) * 0.8;
        row.push({ theta, phi, jx, jy, ea });
      }
      verts.push(row);
    }

    const norm3 = (x: number, y: number, z: number) => {
      const l = Math.sqrt(x * x + y * y + z * z) || 1;
      return [x / l, y / l, z / l] as const;
    };
    const L1 = norm3(-0.75, -0.55, 0.55);
    const L2 = norm3(0.8, 0.6, -0.35);

    const t0 = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const t = (now - t0) / 1000;
      const s = stateRef.current;
      const speed = s === "muted" ? 0.04 : s === "thinking" ? 0.32 : 0.15;
      const energy = s === "muted" ? 0.45 : s === "speaking" ? 1.15 : 1;

      octx.clearRect(0, 0, W, H);
      octx.globalCompositeOperation = "lighter";

      const breathe = 1 + Math.sin(t * 0.9) * 0.04;
      const haze = octx.createRadialGradient(
        CX,
        CY,
        R * 0.15,
        CX,
        CY,
        R * 1.05 * breathe
      );
      haze.addColorStop(0, `rgba(80,110,220,${0.16 * energy})`);
      haze.addColorStop(0.6, `rgba(120,70,220,${0.08 * energy})`);
      haze.addColorStop(1, "rgba(0,0,0,0)");
      octx.fillStyle = haze;
      octx.beginPath();
      octx.arc(CX, CY, R * 1.05 * breathe, 0, Math.PI * 2);
      octx.fill();

      const rotY = t * speed;
      const rotX = 0.4 + Math.sin(t * 0.1) * 0.04;
      const cy = Math.cos(rotX),
        sy = Math.sin(rotX);

      const proj: Array<
        Array<{
          x: number;
          y: number;
          z: number;
          lit1: number;
          lit2: number;
          fill: number;
          ea: number;
        }>
      > = [];
      for (let i = 0; i <= LAT; i += 1) {
        const prow = [];
        for (let j = 0; j < LON; j += 1) {
          const v = verts[i][j];
          const { theta, phi } = v;
          const b = bump(theta, phi, t) * Math.sin(theta);
          const rad = R * (1 + b * 0.12);
          let nx = Math.sin(theta) * Math.cos(phi + rotY) + v.jx;
          let ny = Math.cos(theta) + v.jy;
          let nz = Math.sin(theta) * Math.sin(phi + rotY);
          const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
          nx /= nl;
          ny /= nl;
          nz /= nl;
          const x = nx * rad,
            y = ny * rad,
            z = nz * rad;
          const y2 = y * cy - z * sy;
          const z2 = y * sy + z * cy;
          const ny2 = ny * cy - nz * sy;
          const nz2 = ny * sy + nz * cy;
          const persp = PD / (PD - z2);
          const d1 = Math.max(0, nx * L1[0] + ny2 * L1[1] + nz2 * L1[2]);
          const d2 = Math.max(0, nx * L2[0] + ny2 * L2[1] + nz2 * L2[2]);
          const lit1 = Math.pow(d1, 1.6) * energy;
          const lit2 = Math.pow(d2, 1.6) * energy;
          const fill = Math.max(0, nz2) * 0.4;
          prow.push({
            x: CX + x * persp,
            y: CY + y2 * persp,
            z: z2,
            lit1,
            lit2,
            fill,
            ea: v.ea,
          });
        }
        proj.push(prow);
      }

      const styleFor = (p: { fill: number; lit1: number; lit2: number }) => {
        const r = 30 + p.fill * 35 + p.lit1 * 70 + p.lit2 * 210;
        const g = 35 + p.fill * 55 + p.lit1 * 150 + p.lit2 * 50;
        const bl = 60 + p.fill * 95 + p.lit1 * 255 + p.lit2 * 255;
        return [
          Math.min(255, r | 0),
          Math.min(255, g | 0),
          Math.min(255, bl | 0),
        ];
      };

      octx.lineWidth = 1;
      for (let i = 0; i <= LAT; i += 1) {
        for (let j = 0; j < LON; j += 1) {
          const p = proj[i][j];
          const depth = (p.z + R * 1.25) / (R * 2.5);
          if (depth < 0.22) continue;
          const base = 0.08 + p.fill * 0.5 + Math.max(p.lit1, p.lit2) * 0.8;
          const a = Math.min(0.92, base * depth * p.ea);
          if (a < 0.02) continue;
          const [r, g, bl] = styleFor(p);
          octx.strokeStyle = `rgba(${r},${g},${bl},${a})`;
          const pj = proj[i][(j + 1) % LON];
          octx.beginPath();
          octx.moveTo(p.x, p.y);
          octx.lineTo(pj.x, pj.y);
          octx.stroke();
          if (i < LAT) {
            const pd = proj[i + 1][j];
            const depth2 = (pd.z + R * 1.25) / (R * 2.5);
            if (depth2 >= 0.22) {
              octx.beginPath();
              octx.moveTo(p.x, p.y);
              octx.lineTo(pd.x, pd.y);
              octx.stroke();
            }
          }
        }
      }

      for (let i = 0; i <= LAT; i += 1) {
        for (let j = 0; j < LON; j += 1) {
          const p = proj[i][j];
          const depth = (p.z + R * 1.25) / (R * 2.5);
          if (depth < 0.24) continue;
          const lit = Math.max(p.lit1, p.lit2);
          const a = Math.min(1, (0.06 + p.fill * 0.45 + lit * 1.1) * depth);
          if (a < 0.03) continue;
          const [r, g, bl] = styleFor(p);
          const size2 = 0.55 + lit * 1.1;
          octx.beginPath();
          octx.arc(p.x, p.y, size2, 0, Math.PI * 2);
          octx.fillStyle = `rgba(${r},${g},${bl},${a})`;
          octx.fill();
        }
      }

      for (let k = 0; k < 30; k += 1) {
        const a0 = (k / 30) * Math.PI * 2 + t * 0.04;
        const rr = R * 1.1 + hash(k * 7.77) * R * 0.45;
        const x = CX + Math.cos(a0) * rr;
        const y = CY + Math.sin(a0 * 1.4 + k) * rr * 0.72;
        const flick = 0.25 + 0.4 * (Math.sin(t * 1.6 + k * 2) * 0.5 + 0.5);
        const warm = hash(k * 3.1) > 0.5;
        const col = warm ? [210, 110, 255] : [120, 160, 255];
        octx.beginPath();
        octx.arc(x, y, 0.4 + hash(k * 9.1) * 0.4, 0, Math.PI * 2);
        octx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${flick * 0.4})`;
        octx.fill();
      }

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.filter = "none";
      ctx.drawImage(off, 0, 0);
      ctx.globalCompositeOperation = "lighter";
      ctx.filter = "blur(2.2px)";
      ctx.globalAlpha = 0.55;
      ctx.drawImage(off, 0, 0);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="lv-orb-wrap" style={{ width: size, height: size }}>
      <div className="lv-orb-glow" />
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          position: "absolute",
          inset: 0,
        }}
      />
    </div>
  );
}
