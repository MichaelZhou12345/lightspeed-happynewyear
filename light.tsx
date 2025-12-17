import React from 'react';

interface LightspeedBoltProps {
  className?: string;
  width?: number;
  height?: number;
}

export const LightspeedBolt: React.FC<LightspeedBoltProps> = ({ 
  className = "", 
  width = 200, 
  height = 300 
}) => {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox="0 0 100 150"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-2xl"
        style={{ filter: 'drop-shadow(0 0 15px rgba(214, 168, 90, 0.4))' }}
      >
        <defs>
          <linearGradient id="gold-outline-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F5E6CA" />   {/* Highlight / Pale Gold */}
            <stop offset="45%" stopColor="#D6A85A" />   {/* MAIN TARGET COLOR */}
            <stop offset="100%" stopColor="#9C7636" />  {/* Shadow / Bronze */}
          </linearGradient>
        </defs>
        
        {/* 
           Outline-Only Path (Hollow):
           Using stroke-width to define the thickness of the lightning bolt's wall.
           fill="none" ensures it is completely hollow.
        */}
        <path
          d="M 68 2 
             L 28 72 
             L 52 72 
             L 38 140 
             L 82 58 
             L 58 58 
             Z"
          fill="none"
          stroke="url(#gold-outline-gradient)"
          strokeWidth="6" 
          strokeLinejoin="miter"
          strokeMiterlimit="10"
        />
      </svg>
    </div>
  );
};