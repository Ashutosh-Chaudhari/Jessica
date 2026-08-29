import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The hero object, in real 3D.
 *
 * It is a wall of extruded blocks that breathes like a voice - a spectrum
 * analyser, which is exactly what a studio meter is. That comes from the
 * product's own world rather than being a generic floating shape, and it is
 * the one place the design spends any softness: everything else on the page is
 * a hard rule.
 *
 * The readable text stays in HTML on top of this, so the headline and the
 * countdown remain selectable, translatable and available to a screen reader.
 * Canvas text would look the same and be none of those things.
 */

const COLUMNS = 28;
const ROWS = 5;
const GAP = 1.18;

/** Pull the live theme colours out of CSS rather than duplicating hex here. */
function themeColors(): { bar: THREE.Color; hot: THREE.Color; bg: THREE.Color } {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    new THREE.Color((style.getPropertyValue(name) || fallback).trim());
  return {
    bar: read("--signal", "#5f74ff"),
    hot: read("--live", "#ff2d16"),
    bg: read("--bg", "#0b0b0c"),
  };
}

export default function HeroScene() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      return; // no WebGL: the CSS hero underneath is already doing the job
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    camera.position.set(0, 11, 30);
    camera.lookAt(0, 0.5, 0);

    // Cap DPR: this is ambient, and a 3x retina buffer is not worth the battery.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const colors = themeColors();

    // Instanced boxes: one draw call for the whole wall.
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({ color: colors.bar });
    const count = COLUMNS * ROWS;
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    scene.add(mesh);

    scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-8, 16, 12);
    scene.add(key);

    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();

    /** A speech-like envelope: several detuned waves, not a clean sine. */
    function heightAt(col: number, row: number, t: number): number {
      const x = col / COLUMNS;
      const envelope = Math.sin(Math.PI * x) ** 0.6; // quieter at the edges
      const wave =
        Math.sin(x * 9 + t * 1.7) * 0.5 +
        Math.sin(x * 17 - t * 2.3 + row) * 0.3 +
        Math.sin(x * 4 + t * 0.9) * 0.4;
      return Math.max(0.35, (wave + 1.2) * envelope * 2.6);
    }

    function layout(t: number) {
      let i = 0;
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLUMNS; col++) {
          const h = heightAt(col, row, t - row * 0.22);
          dummy.position.set(
            (col - (COLUMNS - 1) / 2) * GAP,
            h / 2,
            (row - (ROWS - 1) / 2) * GAP * 1.5,
          );
          dummy.scale.set(0.82, h, 0.82);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);

          // Only the tallest blocks go red, the way a meter peaks.
          tint.copy(h > 5.4 ? colors.hot : colors.bar).multiplyScalar(0.55 + (row / ROWS) * 0.55);
          mesh.setColorAt(i, tint);
          i++;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // A const arrow, not a hoisted declaration: TypeScript will not carry the
    // null-check above into a function that could have been called before it.
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    // Follow the theme toggle without rebuilding the scene.
    const themeWatcher = new MutationObserver(() => {
      const next = themeColors();
      colors.bar.copy(next.bar);
      colors.hot.copy(next.hot);
      layout(reduced ? 0 : clock.getElapsedTime());
      if (reduced) renderer.render(scene, camera);
    });
    themeWatcher.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const clock = new THREE.Clock();
    let frame = 0;

    if (reduced) {
      // A held pose: still a real 3D object, just not an animated one.
      layout(0);
      renderer.render(scene, camera);
    } else {
      const tick = () => {
        frame = requestAnimationFrame(tick);
        layout(clock.getElapsedTime());
        renderer.render(scene, camera);
      };
      tick();
    }

    // Stop rendering entirely when the hero is off screen.
    const io = new IntersectionObserver(([entry]) => {
      if (reduced) return;
      if (entry?.isIntersecting) {
        if (!frame) {
          const tick = () => {
            frame = requestAnimationFrame(tick);
            layout(clock.getElapsedTime());
            renderer.render(scene, camera);
          };
          tick();
        }
      } else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    io.observe(host);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      io.disconnect();
      themeWatcher.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />;
}
