import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { starVertexShader, starFragmentShader } from '../utils/shaders';

const StarField = ({ count = 10000 }) => {
  const meshRef = useRef<THREE.Points>(null);

  const [positions, brightness, sizes] = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const brightness = new Float32Array(count);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // UNIFORM SPHERICAL DISTRIBUTION
      // No galaxy squashing, just pure deep space
      
      const r = 100 + Math.random() * 400; // Wide depth range
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1); // Standard sphere distribution

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Brightness
      brightness[i] = Math.random() * 0.8 + 0.2;

      // Sizes: Mostly small stars, a few bright ones
      const sizeRoll = Math.random();
      if (sizeRoll > 0.99) sizes[i] = 3.0 + Math.random() * 2.0;
      else sizes[i] = 0.5 + Math.random() * 1.5;
    }

    return [positions, brightness, sizes];
  }, [count]);

  useFrame((state) => {
    // Very slow rotation of the entire universe
    if (meshRef.current) {
        meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.005;
    }
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
        <bufferAttribute attach="attributes-brightness" count={count} array={brightness} itemSize={1} />
        <bufferAttribute attach="attributes-size" count={count} array={sizes} itemSize={1} />
      </bufferGeometry>
      <shaderMaterial
        vertexShader={starVertexShader}
        fragmentShader={starFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

export default StarField;
