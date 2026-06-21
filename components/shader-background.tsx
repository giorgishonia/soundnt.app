"use client";

import * as React from "react";

/**
 * ShaderBackground — a single-pass WebGL fragment shader that renders a flowing
 * teal "aurora" matching the soundn't glow. It fills its nearest positioned
 * parent (drop it into a `relative` section, e.g. the hero). GPU-cheap (one
 * fullscreen triangle, domain-warped value-noise) and perf-guarded:
 *
 *  - sizes to its container (ResizeObserver), internal scale clamped/reduced
 *  - animation pauses when the tab is hidden
 *  - honors prefers-reduced-motion (renders a single still frame)
 *  - gracefully no-ops if WebGL is unavailable (themed CSS gradient shows)
 *  - subtle eased pointer parallax for a sense of depth/motion
 */

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2  u_res;
uniform float u_time;
uniform vec2  u_mouse;   // -1..1, eased

// --- hash / value noise ---------------------------------------------------
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 M = mat2(1.62, 1.18, -1.18, 1.62);

float fbm(vec2 p) {
  float s = 0.0, a = 0.55;
  for (int i = 0; i < 6; i++) {
    s += a * vnoise(p);
    p = M * p;
    a *= 0.5;
  }
  return s;
}

// soft drifting glow core (echoes the logo bloom)
float bloom(vec2 uv, vec2 c, float r) {
  float d = length(uv - c);
  return exp(-d * d / (r * r));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y; // aspect-correct, centered

  float t = u_time * 0.045;
  vec2 par = u_mouse * 0.12; // parallax offset

  // --- domain warp for flowing depth -------------------------------------
  vec2 q = vec2(fbm(p * 1.3 + vec2(0.0, t) + par),
                fbm(p * 1.3 + vec2(5.2, -t * 0.8) - par));
  vec2 r = vec2(fbm(p * 1.8 + 1.5 * q + vec2(1.7 - t * 0.5, 9.2)),
                fbm(p * 1.8 + 1.5 * q + vec2(8.3, 2.8 + t * 0.6)));

  float n1 = fbm(p * 1.5 + 2.0 * r + vec2(t * 0.6, 0.0));        // near layer
  float n2 = fbm(p * 2.6 - 1.0 * r + vec2(-t * 0.4, t * 0.3));    // far layer

  // aurora ribbons
  float aurora = smoothstep(0.18, 0.95, n1);
  aurora *= 0.65 + 0.55 * n2;

  // --- palette (warm parchment base → coral bloom) ------------------------
  // Light theme: we MIX toward warm tones rather than add light, so the
  // aurora deepens into peach/coral instead of blowing out to white.
  vec3 base  = vec3(0.957, 0.933, 0.859); // #f4eedb cream (logo bg)
  vec3 sand  = vec3(0.945, 0.882, 0.776); // soft warm sand
  vec3 peach = vec3(0.925, 0.733, 0.639); // light peach
  vec3 coral = vec3(0.851, 0.467, 0.341); // #d97757 (logo accent)

  vec3 col = base;
  col = mix(col, sand,  smoothstep(0.0, 1.1, aurora));
  col = mix(col, peach, aurora * 0.5);
  col = mix(col, coral, pow(aurora, 3.0) * 0.32);   // gentle coral cores

  // drifting glow blobs — blend toward coral/peach
  vec2 b1 = vec2(sin(t * 1.1) * 0.55, cos(t * 0.8) * 0.32) + par * 1.6;
  vec2 b2 = vec2(cos(t * 0.7 + 1.3) * 0.6, sin(t * 0.9 + 0.5) * 0.36) - par;
  col = mix(col, coral, bloom(p, b1, 0.55) * (0.12 + 0.05 * n2));
  col = mix(col, peach, bloom(p, b2, 0.40) * 0.12);

  // --- finishing: soft warm vignette + dither -----------------------------
  float vig = smoothstep(1.35, 0.25, length(p * vec2(0.92, 1.05)));
  col *= mix(0.9, 1.02, vig);

  // keep the top edge airy for nav/hero text
  col = mix(col, base, (1.0 - smoothstep(0.0, 0.6, uv.y + uv.x * 0.15)) * 0.35);

  // dither to kill banding on dark gradients
  float dither = (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  col += dither;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export function ShaderBackground() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const gl =
      (canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" }) as
        | WebGLRenderingContext
        | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return; // graceful fallback — CSS background remains

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    // fullscreen triangle
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");

    // render scale: lighter on small / high-dpi screens
    function renderScale(): number {
      const small = window.innerWidth < 768;
      const cap = small ? 1.0 : 1.4;
      const dpr = Math.min(window.devicePixelRatio || 1, cap);
      return dpr * (small ? 0.6 : 0.82);
    }

    function resize() {
      if (!canvas) return;
      const cssW = canvas.clientWidth || canvas.parentElement?.clientWidth || 1;
      const cssH = canvas.clientHeight || canvas.parentElement?.clientHeight || 1;
      const s = renderScale();
      const w = Math.max(1, Math.floor(cssW * s));
      const h = Math.max(1, Math.floor(cssH * s));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl!.viewport(0, 0, w, h);
      gl!.uniform2f(uRes, w, h);
    }
    resize();

    // resize with the container, not the window
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => resize()) : null;
    ro?.observe(canvas);
    window.addEventListener("resize", resize);

    // eased pointer parallax, mapped to the canvas box
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const clamp = (v: number) => Math.max(-1.5, Math.min(1.5, v));
    function onPointer(e: PointerEvent) {
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      mouse.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1);
      mouse.ty = clamp(-(((e.clientY - r.top) / r.height) * 2 - 1));
    }
    window.addEventListener("pointermove", onPointer, { passive: true });

    let raf = 0;
    let running = true;
    const start = performance.now();

    function frame(now: number) {
      if (!running) return;
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      gl!.uniform1f(uTime, (now - start) / 1000);
      gl!.uniform2f(uMouse, mouse.x, mouse.y);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    }

    function renderStill() {
      gl!.uniform1f(uTime, 12.0);
      gl!.uniform2f(uMouse, 0, 0);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    function onVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduce) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    if (reduce) {
      renderStill();
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* themed fallback if WebGL is unavailable (canvas stays transparent) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% -10%, rgba(217,119,87,0.14), rgba(244,238,219,0) 55%), radial-gradient(90% 70% at 85% 110%, rgba(217,119,87,0.09), rgba(244,238,219,0) 55%), #f4eedb",
        }}
      />
      <canvas ref={canvasRef} className="relative block h-full w-full" />
      {/* readability veil for hero text */}
      <div className="absolute inset-0 bg-gradient-to-b from-bg/45 via-bg/15 to-bg/35" />
      {/* fade the bottom edge into the solid page background */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-bg" />
      {/* fine film grain — very subtle on the light parchment */}
      <div className="bg-noise absolute inset-0 opacity-[0.05] mix-blend-multiply" />
    </div>
  );
}
