import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { ParticleCanvas } from '../components/ParticleCanvas.js';

function isWebGlAvailable(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

interface SceneProps {
  pointer: React.MutableRefObject<{ x: number; y: number }>;
}

const KamandValleyMesh: React.FC<SceneProps> = ({ pointer }) => {
  const groupRef = useRef<THREE.Group>(null);
  const bubble1Ref = useRef<THREE.Mesh>(null);
  const bubble2Ref = useRef<THREE.Mesh>(null);
  const bubble3Ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      // Smoothly interpolate toward mouse / gyroscope tilt
      groupRef.current.rotation.y += (pointer.current.x * 0.35 - groupRef.current.rotation.y) * 0.06;
      groupRef.current.rotation.x += (-pointer.current.y * 0.22 - groupRef.current.rotation.x) * 0.06;
    }
    if (bubble1Ref.current) {
      bubble1Ref.current.position.y = Math.sin(t * 1.4) * 0.35 + 0.6;
      bubble1Ref.current.rotation.z = t * 0.3;
    }
    if (bubble2Ref.current) {
      bubble2Ref.current.position.y = Math.cos(t * 1.1 + 1) * 0.4 - 0.2;
      bubble2Ref.current.rotation.x = t * 0.25;
    }
    if (bubble3Ref.current) {
      bubble3Ref.current.position.y = Math.sin(t * 1.7 + 2) * 0.3 + 0.2;
    }
  });

  return (
    <group ref={groupRef}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 4]} intensity={1.2} color="#38bdf8" />
      <pointLight position={[-4, -2, 3]} intensity={0.9} color="#818cf8" />

      {/* Wireframe Himalayan Valley Ridge */}
      <mesh position={[0, -1.35, -1.5]} rotation={[-Math.PI / 2.4, 0, 0]}>
        <coneGeometry args={[3.2, 2.2, 6]} />
        <meshStandardMaterial color="#0284c7" wireframe transparent opacity={0.22} />
      </mesh>

      {/* Orbiting Translucent Chat Bubbles */}
      <mesh ref={bubble1Ref} position={[-2.2, 0.6, -0.5]}>
        <icosahedronGeometry args={[0.42, 1]} />
        <meshStandardMaterial color="#38bdf8" wireframe transparent opacity={0.45} />
      </mesh>

      <mesh ref={bubble2Ref} position={[2.3, -0.2, -0.4]}>
        <octahedronGeometry args={[0.38, 1]} />
        <meshStandardMaterial color="#818cf8" wireframe transparent opacity={0.45} />
      </mesh>

      <mesh ref={bubble3Ref} position={[0, 1.5, -1.2]}>
        <dodecahedronGeometry args={[0.3, 0]} />
        <meshStandardMaterial color="#34d399" wireframe transparent opacity={0.35} />
      </mesh>
    </group>
  );
};

/**
 * Lazy-loaded 3D Mountain Valley & Orbiting Bubbles Hero (Deliverable 2).
 * Automatically falls back to a static gradient + 2D constellation if WebGL is unavailable or reduced-motion is set.
 */
export const ValleyHero3D: React.FC = () => {
  const [webGlSupported, setWebGlSupported] = useState(false);
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setWebGlSupported(isWebGlAvailable());

    const handleMove = (e: PointerEvent) => {
      pointerRef.current = {
        x: (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1,
        y: (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1,
      };
    };

    const handleOrientation = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0;
      const beta = e.beta ?? 45;
      pointerRef.current = {
        x: Math.max(-1, Math.min(1, gamma / 45)),
        y: Math.max(-1, Math.min(1, (beta - 45) / 45)),
      };
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-950/40 via-slate-950 to-slate-950"
      aria-hidden="true"
    >
      <ParticleCanvas />
      {webGlSupported && (
        <div className="absolute inset-0 opacity-75">
          <Canvas camera={{ position: [0, 0, 4.5], fov: 50 }} dpr={[1, 1.5]}>
            <KamandValleyMesh pointer={pointerRef} />
          </Canvas>
        </div>
      )}
    </div>
  );
};

export default ValleyHero3D;
