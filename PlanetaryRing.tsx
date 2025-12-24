
import React, { useMemo } from 'react';
import * as THREE from 'three';

interface PlanetaryRingProps {
  radius: number;
  color: string;
}

const PlanetaryRing: React.FC<PlanetaryRingProps> = ({ radius, color }) => {
  const innerRadius = radius * 1.8;
  const outerRadius = radius * 3.4;

  const shaderData = useMemo(() => ({
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uInnerRadius;
      uniform float uOuterRadius;
      varying vec3 vPos;
      
      void main() {
        float dist = length(vPos.xy);
        
        // 使用更稳定的多层正弦波叠加模拟带状感
        float stripes = sin(dist * 10.0) * 0.1 + 0.9;
        stripes += sin(dist * 45.0) * 0.05;
        stripes += sin(dist * 90.0) * 0.02;
        
        // 模拟缝隙系统
        float gapPos = uInnerRadius + (uOuterRadius - uInnerRadius) * 0.6;
        float gap = smoothstep(0.0, 0.05, abs(dist - gapPos) - 0.1);
        
        float alpha = 0.25 * stripes * gap;
        
        // 边缘渐变
        float edgeFade = smoothstep(uInnerRadius, uInnerRadius + 0.5, dist) * 
                         (1.0 - smoothstep(uOuterRadius - 0.5, uOuterRadius, dist));
        
        gl_FragColor = vec4(uColor, alpha * edgeFade);
      }
    `
  }), []);

  const uniforms = useMemo(() => ({
    uColor: { value: new THREE.Color(color) },
    uInnerRadius: { value: innerRadius },
    uOuterRadius: { value: outerRadius }
  }), [color, innerRadius, outerRadius]);

  return (
    <mesh rotation={[Math.PI / 2.1, 0.05, 0]}>
      <ringGeometry args={[innerRadius, outerRadius, 128]} />
      <shaderMaterial 
        vertexShader={shaderData.vertexShader}
        fragmentShader={shaderData.fragmentShader}
        uniforms={uniforms}
        transparent={true} 
        side={THREE.DoubleSide} 
        depthWrite={false}
      />
    </mesh>
  );
};

export default PlanetaryRing;
