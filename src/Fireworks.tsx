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

    // 配色：保留过年红金，增加光子青呼应闪电主题
    const colors = [
      '255, 50, 50',   // 新年红
      '255, 215, 0',   // 富贵金
      '255, 255, 255', // 纯净白
      '0, 240, 255',   // 光子青
      '255, 100, 255', // 霓虹紫
    ];

    const createFirework = () => {
      // 限制数量，保持画面高级感
      if (fireworks.length > 6) return;

      // 布局：只在两侧发射，中间留给闪电
      const isLeft = Math.random() > 0.5;
      const sideMargin = width * 0.05;
      const activeZone = width * 0.25;

      let xPos;
      if (isLeft) {
        xPos = sideMargin + Math.random() * activeZone;
      } else {
        xPos = width - sideMargin - (Math.random() * activeZone);
      }

      // 高度：整体降低
      const targetY = height * 0.30 + Math.random() * (height * 0.35);

      const color = colors[Math.floor(Math.random() * colors.length)];

      fireworks.push({
        x: xPos,
        y: height,
        targetY: targetY,
        color: color,
        speed: 25 + Math.random() * 10, // 升空速度 - 更快
        particles: [],
        state: 'rising'
      });
    };

    const explode = (fw: Firework) => {
      const particleCount = 80 + Math.random() * 50;

      for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;

        // 爆炸爆发力 - 缩小范围
        const rawSpeed = Math.random();
        const speed = (rawSpeed * rawSpeed * 4) + 1;

        fw.particles.push({
          x: fw.x,
          y: fw.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          alpha: 1,
          color: fw.color,
          decay: 0.02 + Math.random() * 0.03, // 消失速度 - 更快
          size: Math.random() * 2 + 0.5,
          flicker: Math.random() > 0.5
        });
      }
    };

    const update = () => {
      // 发射频率 - 加快
      if (visible && Math.random() < 0.08) {
        createFirework();
      }

      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)'; // 拖尾长度
      ctx.fillRect(0, 0, width, height);

      ctx.globalCompositeOperation = 'lighter';

      for (let i = fireworks.length - 1; i >= 0; i--) {
        const fw = fireworks[i];

        if (fw.state === 'rising') {
          fw.y -= fw.speed;
          fw.speed *= 0.96; // 升空阻力 - 减小，保持速度

          // 绘制升空轨迹
          ctx.beginPath();
          ctx.moveTo(fw.x, fw.y + 10);
          ctx.lineTo(fw.x, fw.y);
          ctx.strokeStyle = `rgb(${fw.color})`;
          ctx.lineWidth = 1.5;
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

            // 空气阻力 - 减小，让粒子飞得更快
            p.vx *= 0.95;
            p.vy *= 0.95;

            // 重力：很小，营造太空/失重感
            p.vy += 0.015;

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

  // 降低透明度，让烟花作为背景点缀
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
        opacity: visible ? 0.6 : 0,
        transition: 'opacity 0.5s ease',
        zIndex: 5
      }}
    />
  );
};

export default Fireworks;
