
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Float } from '@react-three/drei';
import * as THREE from 'three';
import { PlanetConfig } from '../types.ts';
import PlanetaryRing from './PlanetaryRing.tsx';
import { AtmosphereShader } from './AtmosphereShader.ts';

// 纹理生成引擎 v4.2：增强稳定性和兼容性
const generateProceduralTexture = (type: string, baseColor: string): THREE.CanvasTexture => {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  if (type === 'volcanic') {
    ctx.fillStyle = '#110000';
    ctx.fillRect(0, 0, size, size);
    
    const lavaColors = ['#550000', '#aa2200', '#ff5500', '#ffcc00'];
    
    for (let layer = 0; layer < lavaColors.length; layer++) {
      const count = 150 - (layer * 30);
      for (let i = 0; i < count; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = Math.random() * (200 / (layer + 1)) + 40;
        
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, lavaColors[layer]);
        grad.addColorStop(1, 'transparent');
        
        ctx.globalAlpha = 0.4 + Math.random() * 0.4;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        
        // 接缝平滑处理
        if (x + r > size) { ctx.beginPath(); ctx.arc(x - size, y, r, 0, Math.PI * 2); ctx.fill(); }
        if (x - r < 0) { ctx.beginPath(); ctx.arc(x + size, y, r, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    
    ctx.globalAlpha = 0.3;
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 15000; i++) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;

  } else if (type === 'gas') {
    for (let i = 0; i < 60; i++) {
      const y = (i / 60) * size;
      const height = size / 60 + Math.random() * 25;
      const opacity = Math.random() * 0.4;
      ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
      ctx.fillRect(0, y, size, height);
    }
  } else {
    for (let i = 0; i < 180; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 100 + 20;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.1)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
};

interface PlanetProps {
  config: PlanetConfig;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const Planet: React.FC<PlanetProps> = ({ config, isSelected, onSelect }) => {
  const planetRef = useRef<THREE.Mesh>(null);
  
  const { diffuse, bump } = useMemo(() => {
    const tex = generateProceduralTexture(config.type, config.color);
    return { diffuse: tex, bump: tex };
  }, [config.type, config.color]);

  const atmosphereUniforms = useMemo(() => ({
    color: { value: new THREE.Color(config.color) },
    coefficient: { value: 0.1 }, 
    power: { value: 8.0 } // 修正：提高到 8.0，让大气层变细，消除弹珠感
  }), [config.color]);

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime();
    if (planetRef.current) {
      planetRef.current.rotation.y = time * config.rotationSpeed;
      planetRef.current.rotation.z = 0.3;
    }
  });

  return (
    <Float 
      speed={0.25} 
      rotationIntensity={0.03} 
      floatIntensity={0.03} 
      position={config.position as [number, number, number]}
    >
      <group>
        <mesh 
          ref={planetRef} 
          onClick={(e) => {
            e.stopPropagation();
            onSelect(config.id);
          }}
          onPointerOver={() => (document.body.style.cursor = 'pointer')}
          onPointerOut={() => (document.body.style.cursor = 'auto')}
        >
          <sphereGeometry args={[config.radius, 128, 128]} /> {/* 修正：增加段数让边缘更圆滑 */}
          <meshStandardMaterial 
            map={diffuse}
            bumpMap={bump}
            bumpScale={config.type === 'gas' ? 0.05 : 1.2} // 修正：增加凹凸感
            roughness={0.9} // 修正：增加粗糙度，避免油亮的反光
            metalness={0.0}
            emissive={new THREE.Color(config.color)}
            emissiveIntensity={isSelected ? 0.4 : (config.type === 'volcanic' ? 0.15 : 0.02)}
          />
        </mesh>

        {/* 边缘大气 */}
        <mesh scale={[1.015, 1.015, 1.015]}>
          <sphereGeometry args={[config.radius, 128, 128]} />
          <shaderMaterial
            key={`atmos-${config.id}`}
            transparent
            side={THREE.BackSide}
            blending={THREE.AdditiveBlending}
            uniforms={atmosphereUniforms}
            vertexShader={AtmosphereShader.vertexShader}
            fragmentShader={AtmosphereShader.fragmentShader}
            depthWrite={false}
          />
        </mesh>

        {isSelected && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[config.radius * 1.4, 0.2, 16, 100]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.3} />
          </mesh>
        )}

        {config.hasRings && (
          <PlanetaryRing radius={config.radius} color={config.ringColor || '#ffffff'} />
        )}

        <Html distanceFactor={250} position={[0, config.radius + 30, 0]}>
          <div className={`transition-all duration-700 flex flex-col items-center pointer-events-none ${
              isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
            }`}>
            <div className="px-6 py-2 text-[11px] font-bold tracking-[0.6em] uppercase border-b border-white/20 text-white whitespace-nowrap bg-black/40">
              {config.name}
            </div>
          </div>
        </Html>
      </group>
    </Float>
  );
};

export default Planet;
