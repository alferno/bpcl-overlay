import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function Trophy3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    
    const W = 340;
    const H = 540;
    
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
    camera.position.set(0, -0.3, 10.5);
    camera.lookAt(0, -0.3, 0);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
    keyLight.position.set(3, 6, 5);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xaaddff, 1.1);
    fillLight.position.set(-4, 2, 3);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffd700, 1.8);
    rimLight.position.set(0, -2, -4);
    scene.add(rimLight);
    const topLight = new THREE.PointLight(0xffffff, 2.6, 20);
    topLight.position.set(0, 6, 3);
    scene.add(topLight);
    const frontLight = new THREE.PointLight(0xffffff, 2.0, 14);
    frontLight.position.set(0, -1.5, 7);
    scene.add(frontLight);
    const bottomGlow = new THREE.PointLight(0xffd700, 1.2, 10);
    bottomGlow.position.set(0, -5, 2);
    scene.add(bottomGlow);

    // Materials
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xd0d8e0,
      metalness: 1.0,
      roughness: 0.08,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 1.0,
      roughness: 0.1,
      emissive: 0x332200,
      emissiveIntensity: 0.2,
    });
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xa8b2c4,
      metalness: 0.97,
      roughness: 0.1,
    });

    // ── STATIC PEDESTAL (reference-style: wide flat base + low cone neck) ──
    const pedestal = new THREE.Group();
    pedestal.scale.set(1.08, 0.88, 1.08);
    scene.add(pedestal);

    const outerBase = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.6, 0.14, 64),
      goldMat,
    );
    outerBase.position.y = -3.55;
    pedestal.add(outerBase);

    const innerDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.15, 0.22, 64),
      chromeMat,
    );
    innerDisc.position.y = -3.37;
    pedestal.add(innerDisc);
    
    const innerDiscRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.03, 8, 64),
      chromeMat,
    );
    innerDiscRim.rotation.x = Math.PI / 2;
    innerDiscRim.position.y = -3.26;
    pedestal.add(innerDiscRim);

    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.78, 0.62, 64),
      baseMat,
    );
    neck.position.y = -2.95;
    pedestal.add(neck);
    const neckCollar = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.035, 8, 32),
      chromeMat,
    );
    neckCollar.rotation.x = Math.PI / 2;
    neckCollar.position.y = -2.64;
    pedestal.add(neckCollar);

    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.28, 0.28, 24),
      baseMat,
    );
    stem.position.y = -2.46;
    pedestal.add(stem);
    const stemTop = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.035, 8, 24),
      goldMat,
    );
    stemTop.rotation.x = Math.PI / 2;
    stemTop.position.y = -2.32;
    pedestal.add(stemTop);

    // ── TEXT LABEL (flat plane, always faces camera) ───────────────
    const tCanvas = document.createElement('canvas');
    tCanvas.width = 1024;
    tCanvas.height = 220;
    const tCtx = tCanvas.getContext('2d');
    if (tCtx) {
      tCtx.clearRect(0, 0, 1024, 220);

      tCtx.font = 'bold 62px Georgia, serif';
      tCtx.textAlign = 'center';
      tCtx.textBaseline = 'middle';
      tCtx.shadowColor = '#ffcc00';
      tCtx.shadowBlur = 22;
      tCtx.lineWidth = 3;
      tCtx.strokeStyle = '#000000';
      tCtx.fillStyle = '#ffd700';
      tCtx.strokeText('BHARAT PRO CIRCUIT', 512, 80);
      tCtx.fillText('BHARAT PRO CIRCUIT', 512, 80);

      tCtx.font = 'bold 58px Georgia, serif';
      tCtx.strokeText('LEAGUE', 512, 158);
      tCtx.fillText('LEAGUE', 512, 158);
    }

    const tTex = new THREE.CanvasTexture(tCanvas);
    const textPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.34),
      new THREE.MeshBasicMaterial({
        map: tTex,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      }),
    );
    textPlane.position.set(0, -3.37 * 0.88, 1.0 * 1.08);
    textPlane.renderOrder = 999;
    scene.add(textPlane);

    // ── SPINNING HELIX ────────────────────────────────────────────
    const helixRoot = new THREE.Group();
    scene.add(helixRoot);

    const HELIX_HEIGHT = 4.2;
    const HELIX_RADIUS = 0.64;
    const TURNS = 2.5;
    const SEGMENTS = 140;
    const strandR = 0.1;
    helixRoot.position.y = -2.32 * 0.88 + HELIX_HEIGHT / 2;

    function makeStrand(phaseOffset: number, mat: THREE.Material) {
      const group = new THREE.Group();
      for (let i = 0; i < SEGMENTS; i++) {
        const t0 = i / SEGMENTS;
        const t1 = (i + 1) / SEGMENTS;
        const a0 = t0 * TURNS * Math.PI * 2 + phaseOffset;
        const a1 = t1 * TURNS * Math.PI * 2 + phaseOffset;
        const y0 = t0 * HELIX_HEIGHT - HELIX_HEIGHT / 2;
        const y1 = t1 * HELIX_HEIGHT - HELIX_HEIGHT / 2;
        const start = new THREE.Vector3(
          Math.cos(a0) * HELIX_RADIUS,
          y0,
          Math.sin(a0) * HELIX_RADIUS,
        );
        const end = new THREE.Vector3(
          Math.cos(a1) * HELIX_RADIUS,
          y1,
          Math.sin(a1) * HELIX_RADIUS,
        );
        const dir = new THREE.Vector3().subVectors(end, start);
        const len = dir.length();
        const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        const seg = new THREE.Mesh(
          new THREE.CylinderGeometry(strandR, strandR, len, 8),
          mat,
        );
        seg.position.copy(mid);
        seg.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize(),
        );
        group.add(seg);
      }
      [-HELIX_HEIGHT / 2, HELIX_HEIGHT / 2].forEach((y) => {
        const a = (y < 0 ? 0 : TURNS * Math.PI * 2) + phaseOffset;
        const cap = new THREE.Mesh(
          new THREE.SphereGeometry(strandR * 1.1, 10, 10),
          mat,
        );
        cap.position.set(
          Math.cos(a) * HELIX_RADIUS,
          y,
          Math.sin(a) * HELIX_RADIUS,
        );
        group.add(cap);
      });
      return group;
    }

    helixRoot.add(makeStrand(0, chromeMat));
    helixRoot.add(makeStrand(Math.PI, goldMat));

    // ── ANIMATE ───────────────────────────────────────────────────
    let frameId: number;
    let t = 0;
    function animate() {
      frameId = requestAnimationFrame(animate);
      t += 0.008;

      helixRoot.rotation.y = t * 0.55;

      goldMat.emissiveIntensity = 0.18 + 0.1 * Math.sin(t * 2.5);
      topLight.intensity = 2.5 + 0.5 * Math.sin(t * 1.8);
      rimLight.intensity = 1.7 + 0.55 * Math.sin(t * 2.1);

      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      tTex.dispose();
      chromeMat.dispose();
      goldMat.dispose();
      baseMat.dispose();
    };
  }, []);

  return (
    <div className="flex justify-center items-center h-[540px]">
      <canvas ref={canvasRef} width="340" height="540" />
    </div>
  );
}
