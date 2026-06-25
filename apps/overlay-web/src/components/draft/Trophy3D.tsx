import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function Trophy3D() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const canvas = document.createElement('canvas');
    mountRef.current.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(320, 480);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 320 / 480, 0.1, 100);
    camera.position.set(0, 0.2, 9);
    camera.lookAt(0, 0.2, 0);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(3, 6, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xaaddff, 1.2);
    fillLight.position.set(-4, 2, 3);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffd700, 2.0);
    rimLight.position.set(0, -2, -4);
    scene.add(rimLight);
    const topLight = new THREE.PointLight(0xffffff, 2.8, 18);
    topLight.position.set(0, 6, 3);
    scene.add(topLight);
    const bottomGlow = new THREE.PointLight(0xffd700, 1.2, 8);
    bottomGlow.position.set(0, -4, 2);
    scene.add(bottomGlow);

    // Materials
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd0d8e0, metalness: 1.0, roughness: 0.08 });
    const goldMat   = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.12, emissive: 0x332200, emissiveIntensity: 0.2 });
    const baseMat   = new THREE.MeshStandardMaterial({ color: 0x909aaa, metalness: 0.98, roughness: 0.08 });

    const root = new THREE.Group();
    scene.add(root);

    // ── CIRCULAR PEDESTAL ──────────────────────────────────────────
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.14, 64), baseMat);
    disc.position.y = -3.3;
    root.add(disc);

    const discRim = new THREE.Mesh(new THREE.TorusGeometry(1.43, 0.04, 8, 64), goldMat);
    discRim.rotation.x = Math.PI / 2;
    discRim.position.y = -3.23;
    root.add(discRim);

    const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.35, 0.2, 64), baseMat);
    tier2.position.y = -3.06;
    root.add(tier2);

    const tier2Band = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.035, 8, 64), goldMat);
    tier2Band.rotation.x = Math.PI / 2;
    tier2Band.position.y = -2.96;
    root.add(tier2Band);

    const tier3 = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 0.28, 64), baseMat);
    tier3.position.y = -2.72;
    root.add(tier3);

    const tier3Band = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.035, 8, 64), goldMat);
    tier3Band.rotation.x = Math.PI / 2;
    tier3Band.position.y = -2.58;
    root.add(tier3Band);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.38, 0.42, 32), baseMat);
    neck.position.y = -2.28;
    root.add(neck);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 8, 32), goldMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = -2.06;
    root.add(collar);

    // ── DNA HELIX (two strands, no rungs) ─────────────────────────
    const HELIX_HEIGHT = 4.4;
    const HELIX_RADIUS = 0.68;
    const TURNS = 2.5;
    const SEGMENTS = 140;
    const strandR = 0.1;
    const helixBaseY = -2.06 + HELIX_HEIGHT / 2;

    function makeStrand(phaseOffset: number, mat: THREE.Material) {
      const group = new THREE.Group();
      for (let i = 0; i < SEGMENTS; i++) {
        const t0 = i / SEGMENTS;
        const t1 = (i + 1) / SEGMENTS;
        const a0 = t0 * TURNS * Math.PI * 2 + phaseOffset;
        const a1 = t1 * TURNS * Math.PI * 2 + phaseOffset;
        const y0 = t0 * HELIX_HEIGHT - HELIX_HEIGHT / 2;
        const y1 = t1 * HELIX_HEIGHT - HELIX_HEIGHT / 2;

        const start = new THREE.Vector3(Math.cos(a0) * HELIX_RADIUS, y0, Math.sin(a0) * HELIX_RADIUS);
        const end   = new THREE.Vector3(Math.cos(a1) * HELIX_RADIUS, y1, Math.sin(a1) * HELIX_RADIUS);
        const dir = new THREE.Vector3().subVectors(end, start);
        const len = dir.length();
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

        const seg = new THREE.Mesh(new THREE.CylinderGeometry(strandR, strandR, len, 8), mat);
        seg.position.copy(mid);
        seg.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
        group.add(seg);
      }
      // End spheres
      const capGeo = new THREE.SphereGeometry(strandR * 1.1, 10, 10);
      [-HELIX_HEIGHT/2, HELIX_HEIGHT/2].forEach(y => {
        const a = (y < 0 ? 0 : TURNS * Math.PI * 2) + phaseOffset;
        const cap = new THREE.Mesh(capGeo, mat);
        cap.position.set(Math.cos(a) * HELIX_RADIUS, y, Math.sin(a) * HELIX_RADIUS);
        group.add(cap);
      });
      return group;
    }

    const helixGroup = new THREE.Group();
    helixGroup.position.y = helixBaseY;
    helixGroup.add(makeStrand(0,          chromeMat));
    helixGroup.add(makeStrand(Math.PI,    goldMat));
    root.add(helixGroup);

    // Animate
    let t = 0;
    let animationId: number;

    function animate() {
      animationId = requestAnimationFrame(animate);
      t += 0.008;
      root.rotation.y = t * 0.55;
      goldMat.emissiveIntensity = 0.15 + 0.1 * Math.sin(t * 2.5);
      topLight.intensity = 2.6 + 0.5 * Math.sin(t * 1.8);
      rimLight.intensity = 1.8 + 0.6 * Math.sin(t * 2.1);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      if (mountRef.current && canvas) {
        mountRef.current.removeChild(canvas);
      }
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className="flex justify-center items-center h-[480px]" />;
}
