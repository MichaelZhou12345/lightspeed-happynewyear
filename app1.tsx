
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// --- DATA & UTILS ---

// Helper to interpolate points along a line
const getPointsOnLine = (p1: {x:number, y:number}, p2: {x:number, y:number}, count: number) => {
  const points = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    points.push({
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
    });
  }
  return points;
};

// Bolt segments (SVG Coordinates 0-100 x 0-150)
// Increased counts for better particle definition since we removed the line
const segments = [
  { start: {x: 68, y: 2}, end: {x: 28, y: 72}, count: 18 },
  { start: {x: 28, y: 72}, end: {x: 52, y: 72}, count: 10 },
  { start: {x: 52, y: 72}, end: {x: 38, y: 140}, count: 18 },
  { start: {x: 38, y: 140}, end: {x: 82, y: 58}, count: 18 },
  { start: {x: 82, y: 58}, end: {x: 58, y: 58}, count: 10 },
  { start: {x: 58, y: 58}, end: {x: 68, y: 2}, count: 16 },
];

const generateBoltPoints = () => {
  let allPoints: {x: number, y: number}[] = [];
  segments.forEach(seg => {
    allPoints = [...allPoints, ...getPointsOnLine(seg.start, seg.end, seg.count)];
  });
  return allPoints;
};

// Generate random 3D positions for the "Polaroid" state - Starfield warp effect
const generateScatterState = (count: number) => {
  // Particle colors - varied palette
  const colors = [
    '#D6A85A', // Gold
    '#FFFFFF', // White
    '#A0C4FF', // Light blue
    '#FFD6E0', // Pink
    '#C9B1FF', // Purple
    '#BAFFC9', // Mint
    '#FFE5B4', // Peach
  ];
  
  return Array.from({ length: count }).map(() => {
    // Distribute particles across the entire screen, avoiding center
    const angle = Math.random() * Math.PI * 2;
    // Minimum distance from center to avoid clustering
    const minDistance = 200;
    const maxDistance = 600;
    const distance = minDistance + Math.random() * (maxDistance - minDistance);
    
    // Position spread across screen
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance * 0.7; // Slightly flattened for screen aspect
    
    // Only 0.5% of particles have glow effect (very rare)
    const hasGlow = Math.random() < 0.005;
    
    // Random color for each particle
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    // Random drift direction (small movement, not toward center)
    const driftAngle = Math.random() * Math.PI * 2;
    const driftDistance = 30 + Math.random() * 50;
    const driftX = Math.cos(driftAngle) * driftDistance;
    const driftY = Math.sin(driftAngle) * driftDistance;
    
    return {
      x,
      y,
      driftX,
      driftY,
      hasGlow,
      color,
      contentType: Math.floor(Math.random() * 4),
      // Slow drift animation
      duration: 8 + Math.random() * 12,
      delay: Math.random() * 5,
    };
  });
};

const generateStars = (count: number) => {
  return Array.from({ length: count }).map(() => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    scale: Math.random() * 0.5 + 0.5,
    opacity: Math.random() * 0.7 + 0.3,
    animationDuration: Math.random() * 3 + 2,
  }));
};

// --- SUB-COMPONENTS ---

const StarField = () => {
  const stars = useMemo(() => generateStars(200), []); // Increased star count
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      {stars.map((star, i) => (
        <div
          key={i}
          className="absolute bg-white rounded-full"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: '2px',
            height: '2px',
            opacity: star.opacity,
            transform: `scale(${star.scale})`,
            animation: `twinkle ${star.animationDuration}s infinite ease-in-out`
          }}
        />
      ))}
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.8; box-shadow: 0 0 3px white; }
        }
      `}</style>
    </div>
  );
};

// Mock Content inside Polaroids
const PolaroidContent = ({ type }: { type: number }) => {
  if (type === 0) {
    // Profile / ID Card look
    return (
      <div className="w-full h-full p-2 flex flex-col gap-1">
        <div className="flex gap-2">
          <div className="w-6 h-6 rounded-full bg-neutral-600" />
          <div className="flex-1 space-y-1">
             <div className="h-2 bg-neutral-700 rounded w-3/4" />
             <div className="h-1.5 bg-neutral-800 rounded w-1/2" />
          </div>
        </div>
        <div className="mt-2 h-8 bg-neutral-800 rounded" />
      </div>
    );
  } else if (type === 1) {
    // Code / Text lines
    return (
      <div className="w-full h-full p-2 space-y-1">
        <div className="h-1.5 bg-emerald-900/50 w-full rounded" />
        <div className="h-1.5 bg-neutral-800 w-5/6 rounded" />
        <div className="h-1.5 bg-neutral-800 w-4/6 rounded" />
        <div className="h-1.5 bg-pink-900/50 w-full rounded" />
        <div className="h-1.5 bg-neutral-800 w-3/4 rounded" />
      </div>
    );
  } else if (type === 2) {
    // Graph / Chart
    return (
      <div className="w-full h-full p-2 flex items-end gap-1">
        <div className="w-1/5 h-[40%] bg-indigo-900/60 rounded-t" />
        <div className="w-1/5 h-[70%] bg-indigo-800/60 rounded-t" />
        <div className="w-1/5 h-[50%] bg-indigo-900/60 rounded-t" />
        <div className="w-1/5 h-[90%] bg-[#D6A85A]/60 rounded-t" />
        <div className="w-1/5 h-[60%] bg-indigo-900/60 rounded-t" />
      </div>
    );
  } else {
    // Image placeholder
    return (
      <div className="w-full h-full bg-neutral-800 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-neutral-900 via-neutral-800 to-neutral-700" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-neutral-600 opacity-20" />
      </div>
    );
  }
};

// --- MAIN APP ---

const App: React.FC = () => {
  const [isDispersed, setIsDispersed] = useState(false);
  const boltPoints = useMemo(() => generateBoltPoints(), []);
  const scatterStates = useMemo(() => generateScatterState(boltPoints.length), [boltPoints]);

  return (
    <div className="min-h-screen w-full bg-black flex flex-col items-center justify-center relative perspective-container overflow-hidden">
      
      <StarField />
      
      {/* Main Container for 3D Elements */}
      <div className="fixed inset-0 z-10 flex items-center justify-center">
        
        {/* Reference point for bolt shape - centered */}
        <div className="relative w-[300px] h-[450px]">
        
        {/* The Particles */}
        {boltPoints.map((point, index) => {
          const scatter = scatterStates[index];
          
          return (
            <motion.div
              key={index}
              className="absolute will-change-transform"
              initial={false}
              animate={{
                // When gathered: bolt shape. When dispersed: scattered position
                x: isDispersed ? scatter.x : (point.x * 3),
                y: isDispersed ? scatter.y : (point.y * 3),
                width: isDispersed ? 60 : 8, 
                height: isDispersed ? 75 : 8,
              }}
              transition={{
                duration: 1.2,
                ease: "easeOut",
                delay: isDispersed ? index * 0.01 : index * 0.005
              }}
              style={{
                marginLeft: isDispersed ? -30 : -4,
                marginTop: isDispersed ? -37 : -4,
              }}
            >
              {/* Gentle drift animation - forward movement only */}
              <motion.div
                 className="w-full h-full"
                 animate={{
                    // Forward movement in one direction
                    x: isDispersed ? [0, scatter.driftX] : 0,
                    y: isDispersed ? [0, scatter.driftY] : 0,
                 }}
                 transition={{
                    duration: scatter.duration,
                    repeat: Infinity,
                    repeatType: "loop",
                    ease: "linear",
                    delay: scatter.delay,
                 }}
              >
                
                {/* STATE A: Colored Dot (Visible when gathered) */}
                <motion.div 
                  className="absolute inset-0 rounded-full"
                  animate={{ 
                    opacity: isDispersed ? 0 : 1,
                    scale: isDispersed ? 0.2 : 1
                  }}
                  transition={{ duration: 0.4 }}
                  style={{
                    backgroundColor: scatter.color,
                    boxShadow: scatter.hasGlow 
                      ? `0 0 8px ${scatter.color}aa, 0 0 4px ${scatter.color}66` 
                      : 'none'
                  }}
                />

                {/* STATE B: Polaroid (Visible when dispersed) */}
                <motion.div
                  className="absolute inset-0 bg-white p-2 flex flex-col"
                  initial={{ opacity: 0 }}
                  animate={{ 
                    opacity: isDispersed ? 1 : 0,
                  }}
                  transition={{ duration: 0.6, delay: isDispersed ? 0.3 : 0 }} // Fade in slightly later
                  style={{
                    backfaceVisibility: 'visible', 
                    borderRadius: '2px',
                    // Only 1% of polaroids have glow effect
                    boxShadow: scatter.hasGlow 
                      ? `0 0 20px rgba(214,168,90,0.6), 0 0 40px rgba(214,168,90,0.3)` 
                      : '0 4px 8px rgba(0,0,0,0.3)'
                  }}
                >
                  <div className="flex-1 bg-neutral-900 w-full overflow-hidden relative border border-neutral-200/10">
                    <PolaroidContent type={scatter.contentType} />
                  </div>
                  <div className="h-4 w-full mt-1.5 flex items-center px-1">
                     <div className="h-1 bg-neutral-200 w-1/2 rounded-full" />
                  </div>
                </motion.div>

              </motion.div>
            </motion.div>
          );
        })}

        </div>
      </div>

      {/* Interactive Title Overlay */}
      <div className={`
          absolute top-12 text-center transition-all duration-1000 z-0 pointer-events-none
          ${isDispersed ? 'opacity-100 translate-y-0 tracking-[1em]' : 'opacity-0 -translate-y-10 tracking-normal'}
      `}>
          <h1 className="text-[#D6A85A] text-xs font-mono">AI READY: SHOW HAND</h1>
      </div>

      {/* Controls */}
      <div className="fixed bottom-12 z-50">
        <button
          onClick={() => setIsDispersed(!isDispersed)}
          className={`
            px-8 py-3 rounded-full font-mono text-xs tracking-[0.2em] uppercase transition-all duration-500
            border backdrop-blur-md outline-none cursor-pointer
            ${isDispersed 
              ? 'border-white/20 bg-white/5 text-white shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:bg-white/10' 
              : 'border-[#D6A85A] bg-transparent text-[#D6A85A] hover:bg-[#D6A85A]/10 hover:shadow-[0_0_20px_rgba(214,168,90,0.3)]'}
          `}
        >
          {isDispersed ? 'Recall Assets' : 'Disperse'}
        </button>
      </div>

    </div>
  );
};

export default App;
