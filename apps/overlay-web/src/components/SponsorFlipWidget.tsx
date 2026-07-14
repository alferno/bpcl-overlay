import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';

export interface SponsorFlipWidgetProps {
  sponsors?: string[];
  width?: string | number;
  height?: string | number;
  fontFamily?: string;
  fontSize?: string | number;
  fontWeight?: string | number;
  textColor?: string;
  backgroundColor?: string;
  borderRadius?: string | number;
  borderWidth?: string | number;
  borderColor?: string;
  perspective?: string | number;
  flipDuration?: number; // in seconds
  holdDuration?: number; // in seconds
  animationEasing?: number[]; // bezier curve
  motionBlurIntensity?: number; // max blur in px
  x?: string | number;
  y?: string | number;
  anchor?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
  opacity?: number;
  scale?: number;
  zIndex?: number;
  padding?: string | number;
  letterSpacing?: string | number;
}

export const SponsorFlipWidget: React.FC<SponsorFlipWidgetProps> = ({
  sponsors = ['SPONSOR 1', 'SPONSOR 2', 'SPONSOR 3'],
  width = 300,
  height = 80,
  fontFamily = 'Inter, sans-serif',
  fontSize = 24,
  fontWeight = 800,
  textColor = '#ffffff',
  backgroundColor = '#0f172a',
  borderWidth = 1,
  borderColor = 'rgba(255, 255, 255, 0.1)',
  flipDuration = 0.8,
  holdDuration = 4.0,
  animationEasing = [0.65, 0, 0.35, 1], // premium cubic ease-in-out
  x = '2rem',
  y = '2rem',
  anchor = 'bottom-right',
  opacity = 1,
  scale = 1,
  zIndex = 50,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  const numericWidth = typeof width === 'number' ? width : parseFloat(width as string) || 300;
  const numericHeight = typeof height === 'number' ? height : parseFloat(height as string) || 80;

  useEffect(() => {
    if (!mountRef.current || sponsors.length === 0) return;

    // 1. Setup Scene
    const scene = new THREE.Scene();
    
    const camera = new THREE.PerspectiveCamera(30, numericWidth / numericHeight, 0.1, 1000);
    const dist = (numericHeight / 2) / Math.tan((30 / 2) * (Math.PI / 180));
    camera.position.z = dist;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(numericWidth, numericHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    mountRef.current.appendChild(renderer.domElement);

    // 2. Texture Generator
    const createTexture = (text: string, flip: boolean) => {
      const canvas = document.createElement('canvas');
      const res = 4; 
      canvas.width = numericWidth * res;
      canvas.height = numericHeight * res;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.save();
        if (flip) {
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate(Math.PI);
          ctx.translate(-canvas.width / 2, -canvas.height / 2);
        }
        
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fs = typeof fontSize === 'number' ? fontSize : parseFloat(fontSize as string) || 24;
        ctx.font = `${fontWeight} ${fs * res}px ${fontFamily}`;
        
        // Slight letter spacing simulation with tracking (not natively supported in old canvas, but we'll just draw)
        // Canvas API has letterSpacing in newer browsers but we will just use standard fillText
        ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);
        ctx.restore();
        
        const bw = typeof borderWidth === 'number' ? borderWidth : parseFloat(borderWidth as string) || 0;
        if (bw > 0) {
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = bw * res;
          ctx.strokeRect(0, 0, canvas.width, canvas.height);
        }
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return texture;
    };

    // Pre-generate textures for all sponsors (both normal and flipped)
    const normalTextures = sponsors.map(sp => createTexture(sp, false));
    const flippedTextures = sponsors.map(sp => createTexture(sp, true));

    // 3. Create Cube
    const geometry = new THREE.BoxGeometry(numericWidth, numericHeight, numericHeight);
    
    const blankMat = new THREE.MeshBasicMaterial({ color: backgroundColor });
    
    // Order: +X, -X, +Y, -Y, +Z, -Z
    const materials = [
      blankMat, // Right
      blankMat, // Left
      new THREE.MeshBasicMaterial({ color: 0xffffff }), // Top (+Y)
      new THREE.MeshBasicMaterial({ color: 0xffffff }), // Bottom (-Y)
      new THREE.MeshBasicMaterial({ color: 0xffffff }), // Front (+Z)
      new THREE.MeshBasicMaterial({ color: 0xffffff }), // Back (-Z)
    ];
    
    const cube = new THREE.Mesh(geometry, materials);
    scene.add(cube);

    // Sequence of faces that face the camera on positive X rotation
    // 0: Front (+Z, index 4)
    // 1: Top (+Y, index 2)
    // 2: Back (-Z, index 5) -> NEEDS FLIPPED TEXTURE
    // 3: Bottom (-Y, index 3)
    const faceSeq = [4, 2, 5, 3];

    let flipCount = 0;
    
    // Set initial faces
    // We want the current face (Front) to have sponsor 0
    // And the next face (Top) to have sponsor 1
    const applyTextureToFace = (fcCount: number, sponsorIdx: number) => {
      const faceInSeq = fcCount % 4;
      const matIdx = faceSeq[faceInSeq];
      const isBackFace = matIdx === 5; // Back face needs flipped texture
      const tex = isBackFace ? flippedTextures[sponsorIdx] : normalTextures[sponsorIdx];
      (materials[matIdx] as THREE.MeshBasicMaterial).map = tex;
      (materials[matIdx] as THREE.MeshBasicMaterial).needsUpdate = true;
    };

    applyTextureToFace(0, 0 % sponsors.length);
    if (sponsors.length > 1) applyTextureToFace(1, 1 % sponsors.length);

    let animationId: number;
    const render = () => {
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(render);
    };
    render();

    // 4. GSAP Animation
    let timer: ReturnType<typeof setTimeout>;
    let activeTween: gsap.core.Tween | null = null;

    if (sponsors.length > 1) {
      const customEase = gsap.parseEase(`cubic-bezier(${animationEasing.join(',')})`);
      
      const doFlip = () => {
        flipCount++;
        const targetRotX = flipCount * (Math.PI / 2);
        
        // Prepare the face AFTER the one we're flipping to
        const nextSponsorIdx = (flipCount + 1) % sponsors.length;
        applyTextureToFace(flipCount + 1, nextSponsorIdx);

        activeTween = gsap.to(cube.rotation, {
          x: targetRotX,
          duration: flipDuration,
          ease: customEase,
          onComplete: () => {
            timer = setTimeout(doFlip, holdDuration * 1000);
          }
        });
      };

      timer = setTimeout(doFlip, holdDuration * 1000);
    }

    return () => {
      clearTimeout(timer);
      if (activeTween) activeTween.kill();
      cancelAnimationFrame(animationId);
      renderer.dispose();
      normalTextures.forEach(t => t.dispose());
      flippedTextures.forEach(t => t.dispose());
      geometry.dispose();
      materials.forEach(m => m.dispose());
      if (mountRef.current) {
        mountRef.current.innerHTML = '';
      }
    };
  }, [
    sponsors, numericWidth, numericHeight, backgroundColor, textColor, 
    fontFamily, fontSize, fontWeight, flipDuration, holdDuration, 
    animationEasing, borderWidth, borderColor
  ]);

  const anchorStyles: React.CSSProperties = {
    position: 'absolute',
    opacity,
    transform: `scale(${scale})`,
    zIndex,
  };
  if (anchor.includes('top')) anchorStyles.top = y;
  if (anchor.includes('bottom')) anchorStyles.bottom = y;
  if (anchor.includes('left')) anchorStyles.left = x;
  if (anchor.includes('right')) anchorStyles.right = x;
  if (anchor === 'center') {
    anchorStyles.top = '50%';
    anchorStyles.left = '50%';
    anchorStyles.transform = `scale(${scale}) translate(-50%, -50%)`;
  }

  return (
    <div style={anchorStyles}>
      <div ref={mountRef} style={{ width: numericWidth, height: numericHeight }} />
    </div>
  );
};
