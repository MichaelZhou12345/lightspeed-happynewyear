
import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, PerspectiveCamera, Sparkles, Html } from '@react-three/drei';
import * as THREE from 'three';
import Planet from './Planet.tsx';
import Nebula from './Nebula.tsx';
import { PLANETS } from '../constants.tsx';

interface UniverseProps {
  selectedPlanetId: string | null;
  onSelectPlanet: (id: string) => void;
}

const Universe: React.FC<UniverseProps> = ({ selectedPlanetId, onSelectPlanet }) => {
  return (
    <div className="w-full h-full bg-black">
      <Canvas 
        shadows 
        dpr={[1, 2]} 
        gl={{ 
          antialias: true, 
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0 
        }}
      >
        <Suspense fallback={<Html center><div className="text-white font-mono text-[9px] animate-pulse tracking-[1.5em] uppercase whitespace-nowrap">Initialising Stellar Grid...</div></Html>}>
          <PerspectiveCamera makeDefault position={[0, 400, 1000]} fov={45} />
          
          <OrbitControls 
            enablePan={false} 
            minDistance={100} 
            maxDistance={2000} 
            autoRotate={!selectedPlanetId}
            autoRotateSpeed={0.08}
            dampingFactor={0.05}
          />

          <color attach="background" args={['#000000']} />
          
          {/* 星云背景层 */}
          <Nebula />
          
          {/* 星空粒子增强 */}
          <Stars radius={1500} depth={100} count={12000} factor={6} saturation={1} fade speed={1} />
          <Sparkles count={800} scale={2000} size={2} speed={0.1} opacity={0.2} color="#ffffff" />

          {/* 灯光修正：深空感的核心在于低环境光和强点光源 */}
          <ambientLight intensity={0.05} /> {/* 修正：从 0.2 降到 0.05，让阴影深邃 */}
          <hemisphereLight intensity={0.1} color="#8080ff" groundColor="#000000" /> {/* 修正：从 0.4 降到 0.1 */}
          <pointLight position={[0, 0, 0]} intensity={10.0} color="#ffffff" distance={4000} decay={1.5} /> {/* 修正：增强恒星光 */}
          <directionalLight position={[1000, 500, 500]} intensity={1.5} color="#fff4e0" />

          {PLANETS.map((planet) => (
            <Planet 
              key={planet.id} 
              config={planet} 
              isSelected={selectedPlanetId === planet.id}
              onSelect={onSelectPlanet}
            />
          ))}
        </Suspense>
      </Canvas>
    </div>
  );
};

export default Universe;
