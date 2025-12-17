
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

// Generate random 3D positions for the "Polaroid" state
const generateScatterState = (count: number) => {
  return Array.from({ length: count }).map(() => ({
    // Wide spread to fill the sky
    x: (Math.random() - 0.5) * 2400, 
    y: (Math.random() - 0.5) * 1400, 
    z: (Math.random() - 0.5) * 2000 - 400, // Depth
    // Initial random rotation for the dispersed state
    rotateX: (Math.random() - 0.5) * 60,
    rotateY: (Math.random() - 0.5) * 60,
    rotateZ: (Math.random() - 0.5) * 30,
    scale: 0.6 + Math.random() * 0.8,
    // Content type
    contentType: Math.floor(Math.random() * 4),
    // Speed for the slow auto-rotation
    rotationDuration: 15 + Math.random() * 20,
    rotationDir: Math.random() > 0.5 ? 1 : -1
  }));
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
      <div className="relative w-[300px] h-[450px] transform-style-3d z-10">
        
        {/* We removed the SVG Line. Now the shape is defined purely by the particles below. */}

        {/* The Particles */}
        {boltPoints.map((point, index) => {
          const scatter = scatterStates[index];
          
          return (
            <motion.div
              key={index}
              className="absolute top-0 left-0 will-change-transform"
              initial={false}
              // OUTER MOTION: Handles the big transition from Bolt Position to Sky Position
              animate={{
                // Converged: Use scaled SVG points. Dispersed: Use random scatter points.
                x: isDispersed ? scatter.x : (point.x * 3), 
                y: isDispersed ? scatter.y : (point.y * 3),
                z: isDispersed ? scatter.z : 0,
                // Rotation here sets the "initial" angle of the polaroid in the sky
                rotateX: isDispersed ? scatter.rotateX : 0,
                rotateY: isDispersed ? scatter.rotateY : 0,
                rotateZ: isDispersed ? scatter.rotateZ : 0,
                scale: isDispersed ? scatter.scale : 1,
                // Size transition: Small dot -> Big card
                width: isDispersed ? 80 : 8, 
                height: isDispersed ? 100 : 8,
              }}
              transition={{
                duration: 1.5,
                type: "spring",
                stiffness: 40,
                damping: 15,
                delay: isDispersed ? Math.random() * 0.2 : Math.random() * 0.1
              }}
              style={{
                // Center the pivot
                marginLeft: isDispersed ? -40 : -4,
                marginTop: isDispersed ? -50 : -4,
                transformStyle: 'preserve-3d',
              }}
            >
              {/* INNER MOTION: Handles the continuous slow rotation when suspended */}
              <motion.div
                 className="w-full h-full relative"
                 animate={{
                    // Infinite slow spin when dispersed. Static when gathered.
                    rotateY: isDispersed ? [0, 360 * scatter.rotationDir] : 0,
                    rotateX: isDispersed ? [0, 5, 0, -5, 0] : 0, 
                 }}
                 transition={{
                    duration: scatter.rotationDuration,
                    repeat: Infinity,
                    ease: "linear",
                    // Use a delay so they don't all start spinning exactly at the same millisecond of the animation curve
                    delay: Math.random() * 5 
                 }}
                 style={{ transformStyle: 'preserve-3d' }}
              >
                
                {/* STATE A: Gold Dot (Visible when gathered) */}
                <motion.div 
                  className="absolute inset-0 rounded-full bg-[#D6A85A]"
                  animate={{ 
                    opacity: isDispersed ? 0 : 1,
                    scale: isDispersed ? 0.2 : 1 // Shrink slightly as it fades
                  }}
                  transition={{ duration: 0.4 }}
                  style={{
                    boxShadow: '0 0 8px rgba(214, 168, 90, 0.8), 0 0 4px rgba(214, 168, 90, 0.4)'
                  }}
                />

                {/* STATE B: Polaroid (Visible when dispersed) */}
                <motion.div
                  className="absolute inset-0 bg-white p-2 shadow-2xl flex flex-col"
                  initial={{ opacity: 0 }}
                  animate={{ 
                    opacity: isDispersed ? 1 : 0,
                  }}
                  transition={{ duration: 0.6, delay: isDispersed ? 0.3 : 0 }} // Fade in slightly later
                  style={{
                    backfaceVisibility: 'visible', 
                    borderRadius: '2px',
                    boxShadow: '0 20px 40px -5px rgba(0,0,0,0.8)'
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
