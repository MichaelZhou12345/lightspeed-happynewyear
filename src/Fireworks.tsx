import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  color: string;
  decay: number;
  size: number;
  flicker: boolean;
}

interface Firework {
  x: number;
  y: number;
  targetY: number;
  color: string;
  speed: number;
  particles: Particle[];
  state: 'rising' | 'exploding' | 'dead';
}

interface FireworksProps {
  visible: boolean;
}

const Fireworks: React.FC<FireworksProps> = ({ visible }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    let fireworks: Firework[] = [];
    let animationId: number;

    // 华丽配色：高饱和度，营造庆典感
    const colors = [
      '255, 60, 60',   // Vivid Red
      '255, 220, 50',  // Bright Gold
      '60, 255, 255',  // Cyan (Matches theme)
      '255, 100, 255', // Magenta
      '100, 100, 255', // Royal Blue
      '50, 255, 100'   // Neon Green
    ];

    const createFirework = () => {
      if (fireworks.length > 8) return;

      // Position: Keep to sides (avoiding center text/logo)
      const isLeft = Math.random() > 0.5;
      const sideWidth = width * 0.30;

      let xPos;
      if (isLeft) {
        xPos = Math.random() * sideWidth;
      } else {
        xPos = width - (Math.random() * sideWidth);
      }

      // Target height: 15% to 55% of screen (有高有低)
      const targetY = height * 0.15 + Math.random() * (height * 0.40);

      const color = colors[Math.floor(Math.random() * colors.length)];

      fireworks.push({
        x: xPos,
        y: height,
        targetY: targetY,
        color: color,
        speed: 12 + Math.random() * 6, // 加快上升速度
        particles: [],
        state: 'rising'
      });
    };

    const explode = (fw: Firework) => {
      const particleCount = 100 + Math.random() * 60;

      for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;

        // "Blossom" Physics
        const rawSpeed = Math.random();
        const speed = (rawSpeed * rawSpeed * 4) + 1;

        fw.particles.push({
          x: fw.x,
          y: fw.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          color: fw.color,
          decay: 0.005 + Math.random() * 0.015,
          size: Math.random() * 2 + 0.5,
          flicker: Math.random() > 0.5
        });
      }
    };

    const update = () => {
      // 只在 visible 为 true 时创建新烟花 - 提高生成频率
      if (visible && Math.random() < 0.08) {
        createFirework();
      }

      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'lighter';

      for (let i = fireworks.length - 1; i >= 0; i--) {
        const fw = fireworks[i];

        if (fw.state === 'rising') {
          fw.y -= fw.speed;
          fw.speed *= 0.98;

          // Draw rising tail
          ctx.beginPath();
          ctx.moveTo(fw.x, fw.y + 8);
          ctx.lineTo(fw.x, fw.y);
          ctx.strokeStyle = `rgb(${fw.color})`;
          ctx.lineWidth = 2;
          ctx.stroke();

          if (fw.y <= fw.targetY || fw.speed < 1) {
            fw.state = 'exploding';
            explode(fw);
          }
        } else if (fw.state === 'exploding') {
          for (let j = fw.particles.length - 1; j >= 0; j--) {
            const p = fw.particles[j];

            p.x += p.vx;
            p.y += p.vy;

            // High Drag: Freezes them in place horizontally
            p.vx *= 0.91;
            p.vy *= 0.91;

            // Almost NO Gravity
            p.vy += 0.01;

            p.alpha -= p.decay;

            let renderAlpha = p.alpha;
            if (p.flicker) {
              renderAlpha = p.alpha * (0.5 + Math.random() * 0.5);
            }

            if (p.alpha <= 0) {
              fw.particles.splice(j, 1);
            } else {
              ctx.beginPath();
              ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(${p.color}, ${renderAlpha})`;
              ctx.fill();
            }
          }

          if (fw.particles.length === 0) {
            fw.state = 'dead';
          }
        } else {
          fireworks.splice(i, 1);
        }
      }

      animationId = requestAnimationFrame(update);
    };

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    window.addEventListener('resize', handleResize);
    update();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, [visible]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: visible ? 0.7 : 0,
        transition: 'opacity 0.5s ease',
        zIndex: 5
      }}
    />
  );
};

export default Fireworks;
