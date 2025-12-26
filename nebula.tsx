import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicBackgroundVertex, cosmicBackgroundFragment } from '../utils/shaders';

const CosmicBackground = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    }
  });

  const uniforms = React.useMemo(() => ({
    uTime: { value: 0 },
  }), []);

  return (
    <group>
      {/* Huge Background Sphere */}
      <mesh ref={meshRef} scale={[300, 300, 300]}>
        <sphereGeometry args={[1, 128, 128]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={cosmicBackgroundVertex}
          fragmentShader={cosmicBackgroundFragment}
          uniforms={uniforms}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

export default CosmicBackground;

