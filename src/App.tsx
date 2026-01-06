import { useState, useMemo, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, extend, useThree, useLoader } from '@react-three/fiber';
import {
  OrbitControls,
  Environment,
  PerspectiveCamera,
  shaderMaterial,
  Float,
  Stars,
  Sparkles,
  Html,
  useTexture
} from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { MathUtils } from 'three';
import * as random from 'maath/random';
import { GestureRecognizer, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

// --- 动态生成照片列表 (top.JPG + 1.JPG 到 31.JPG) ---
const TOTAL_NUMBERED_PHOTOS = 9;
// 修改：将 top.JPG 加入到数组开头
const bodyPhotoPaths = [
  '/photos/top.JPG',
  ...Array.from({ length: TOTAL_NUMBERED_PHOTOS }, (_, i) => `/photos/${i + 1}.JPG`)
];


const NEW_YEAR_GREETINGS = [
  '小量子祝你新年快乐',
  '小量子祝你万事如意',
  '小量子祝你前程似锦',
  '小量子祝你心想事成',
  '小量子祝你鸿运当头',
  '小量子祝你阖家安康',
  '小量子祝你大展宏图',
  '小量子祝你财源广进'
];

// --- 视觉配置 (次元撕裂 + 宇宙风格) ---
const CONFIG = {
  colors: {
    // 次元撕裂核心色系
    riftCore: '#FFFFFF',      // 核心极亮白
    riftInner: '#00FFFF',     // 青色能量
    riftMid: '#FF00FF',       // 霓虹粉/紫
    riftOuter: '#8A2BE2',     // 蓝紫外层
    riftEdge: '#4B0082',      // 靛蓝边缘
    // 宇宙背景
    universe: '#050510',      // 深邃宇宙黑
    nebula: '#1a0a2e',        // 星云紫
    // 星球色系
    planetColors: [
      '#4169E1', // 皇家蓝
      '#9370DB', // 中紫
      '#20B2AA', // 浅海绿
      '#FF6B6B', // 珊瑚红
      '#4ECDC4', // 青绿
      '#F7DC6F', // 淡金
      '#BB8FCE', // 淡紫
      '#85C1E9', // 天蓝
    ],
    // 保留部分原有配置
    emerald: '#004225',
    gold: '#FFD700',
    silver: '#ECEFF1',
    red: '#D32F2F',
    green: '#2E7D32',
    white: '#FFFFFF',
    warmLight: '#FFD700',
    lights: ['#00FFFF', '#FF00FF', '#8A2BE2', '#FFFFFF'], // 次元能量色
    borders: ['#FFFAF0', '#F0E68C', '#E6E6FA', '#FFB6C1', '#98FB98', '#87CEFA', '#FFDAB9'],
    giftColors: ['#B0C4DE', '#C0C0C0', '#D9D9D9', '#ECEFF1', '#FFD700'],
    candyColors: ['#ECEFF1', '#D9D9D9']
  },
  counts: {
    foliage: 18000,           // 增加粒子密度
    ornamentsChaos: 200,       // 散开态星球数量 - 增加到200
    ornamentsFormed: 12,      // 聚合态星球数量（闪电肚子里的精致宇宙）
    elementsChaos: 0,         // 散开态装饰 - 关闭避免漂浮方块
    elementsFormed: 0,
    lightsChaos: 0,           // 关闭散开态彩灯避免粉色闪烁
    lightsFormed: 0,
    glowDots: 400,            // 减少发光点
    fillDots: 4000,           // 减少星尘填充
    innerPlanets: 50,         // 闪电内部精致星球 - 增加到50
    nebulaParticles: 1500,    // 减少星云粒子
    disperseParticles: 8000,  // 散开时的宇宙粒子数量
  },
  tree: { height: 200, radius: 75 }, // 超大闪电尺寸
  photos: {
    body: bodyPhotoPaths
  }
};

// --- Shader Material (Foliage - 次元能量粒子) ---
const FoliageMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color('#8A2BE2'), uProgress: 0 },
  `uniform float uTime; uniform float uProgress; attribute vec3 aTargetPos; attribute float aRandom;
  varying vec2 vUv; varying float vMix;
  float cubicInOut(float t) { return t < 0.5 ? 4.0 * t * t * t : 0.5 * pow(2.0 * t - 2.0, 3.0) + 1.0; }
  void main() {
    vUv = uv;
    vec3 noise = vec3(
      sin(uTime * 1.5 + position.x) * 0.08,
      cos(uTime + position.y) * 0.08,
      sin(uTime * 1.2 + position.z) * 0.08
    );
    float t = cubicInOut(uProgress);
    vec3 finalPos = mix(position, aTargetPos + noise, t);
    vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
    gl_PointSize = (70.0 * (1.0 + aRandom)) / -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
    vMix = t;
  }`,
  `uniform vec3 uColor; varying float vMix;
  void main() {
    float r = distance(gl_PointCoord, vec2(0.5)); if (r > 0.5) discard;
    vec3 coreColor = vec3(1.0, 0.0, 1.0); // 霓虹粉
    vec3 outerColor = vec3(0.0, 1.0, 1.0); // 青色
    vec3 finalColor = mix(outerColor * 0.5, coreColor * 1.5, vMix);
    float glow = 1.0 - r * 2.0;
    gl_FragColor = vec4(finalColor * (1.0 + glow * 0.5), 1.0);
  }`
);
extend({ FoliageMaterial });

// --- Shader Material (Fresnel Atmosphere - 边缘大气效果，消除弹珠感) ---
const AtmosphereMaterial = shaderMaterial(
  { 
    uColor: new THREE.Color('#ffffff'),
    uCoefficient: 0.1,
    uPower: 8.0
  },
  // Vertex Shader
  `varying vec3 vNormal;
  varying vec3 vViewPosition;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }`,
  // Fragment Shader
  `uniform vec3 uColor;
  uniform float uCoefficient;
  uniform float uPower;
  
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  
  void main() {
    vec3 viewDir = normalize(vViewPosition);
    float intensity = pow(uCoefficient + 1.0 - max(dot(vNormal, viewDir), 0.0), uPower);
    gl_FragColor = vec4(uColor, intensity * 0.6);
  }`
);
extend({ AtmosphereMaterial });

// --- Helper: Lightning Shape (Lightspeed logo outline mapped into 3D space) ---
// SVG points from lightspeed-logo -> recentered and scaled to tree height
const lightningPath = (() => {
  const svgCenter = { x: 55, y: 71 }; // approximate centroid of the logo path
  const svgHeight = 138;              // max span after centering (from 69 to -69)
  const scale = CONFIG.tree.height / svgHeight;

  const svgPoints = [
    { x: 68, y: 2 },
    { x: 28, y: 72 },
    { x: 52, y: 72 },
    { x: 38, y: 140 },
    { x: 82, y: 58 },
    { x: 58, y: 58 },
  ];

  return svgPoints.map((p) => {
    const x = (p.x - svgCenter.x) * scale;
    const y = (svgCenter.y - p.y) * scale; // invert so higher y is up in 3D space
    return new THREE.Vector3(x, y, 0);
  });
})();

const getLightningPosition = (thickness = 2.2) => { // thickness 默认控制整体闪电粗细
  const seg = Math.floor(Math.random() * (lightningPath.length - 1));
  const t = Math.random();
  const from = lightningPath[seg];
  const to = lightningPath[seg + 1];
  const base = new THREE.Vector3().lerpVectors(from, to, t);
  base.z = 0; // keep the bolt on a thin plane
  const jitter = new THREE.Vector3(
    (Math.random() - 0.5) * thickness,
    (Math.random() - 0.5) * (thickness * 0.08), // 减少 Y 抖动，保持段平行
    (Math.random() - 0.5) * (thickness * 0.25) // add depth for thickness
  );
  base.add(jitter);
  return [base.x, base.y, base.z] as [number, number, number];
};

// Side fill offset to beef up right flank，靠近顶部/底部减弱以共用头尾
const addSideFill = (v: THREE.Vector3) => {
  const topY = CONFIG.tree.height / 2 + 0.4;
  const bottomY = -CONFIG.tree.height / 2 - 0.25 * CONFIG.tree.height;
  const t = (v.y - bottomY) / (topY - bottomY);
  const falloff = Math.max(0, Math.min(1, t * (1 - t) * 4)); // 中段最强，头尾为0
  const gapFactor = 1 - Math.max(0, 1 - Math.abs(v.y) / (CONFIG.tree.height * 0.05)); // 稍弱中段，保留连接
  const effective = falloff * gapFactor;
  const xOffset = (3.2 + (Math.random() - 0.5) * 0.8) * effective; // 略加宽，让轮廓更明显
  const zOffset = ((Math.random() - 0.5) * 0.35) * effective;
  const yOffset = ((Math.random() - 0.5) * 0.16) * effective;
  return new THREE.Vector3(v.x + xOffset, v.y + yOffset, v.z + zOffset);
};

// Mid-gap to separate the center connection into two parallel lanes
const applyMidGap = (v: THREE.Vector3) => {
  const midY = CONFIG.tree.height * (0.5 - 0.6);
  const split = 1.0; // 适度保留中缝，但更贴合细长造型
  const band = CONFIG.tree.height * 0.015;
  if (Math.abs(v.y - midY) < band) {
    const dir = v.y >= midY ? 1 : -1;
    return new THREE.Vector3(v.x, midY + dir * split, v.z);
  }
  return v;
};

// Merge dual lines on the right into a single lane in mid section
const mergeRightLane = (v: THREE.Vector3) => {
  const top = CONFIG.tree.height * 0.05;
  const bottom = -CONFIG.tree.height * 0.4;
  if (v.y < top && v.y > bottom && v.x > 0.2) {
    v.x = 0.05 + (Math.random() - 0.5) * 0.08; // tighter clamp for single line
    v.z += (Math.random() - 0.5) * 0.08;
  }
  return v;
};

// --- Static outline points (like app1/light.tsx dots) ---
const boltOutlinePoints = (() => {
  // SVG coords 0-100 x 0-150
  const segments = [
    { start: { x: 68, y: 2 }, end: { x: 28, y: 72 }, count: 18 },
    { start: { x: 28, y: 72 }, end: { x: 52, y: 72 }, count: 10 },
    { start: { x: 52, y: 72 }, end: { x: 38, y: 140 }, count: 18 },
    { start: { x: 38, y: 140 }, end: { x: 82, y: 58 }, count: 18 },
    { start: { x: 82, y: 58 }, end: { x: 58, y: 58 }, count: 10 },
    { start: { x: 58, y: 58 }, end: { x: 68, y: 2 }, count: 16 },
  ];
  const svgCenter = { x: 55, y: 71 };
  const svgHeight = 138;
  const scale = CONFIG.tree.height / svgHeight;

  const pts: THREE.Vector3[] = [];
  segments.forEach((seg) => {
    for (let i = 0; i < seg.count; i++) {
      const t = i / seg.count;
      const x = seg.start.x + (seg.end.x - seg.start.x) * t;
      const y = seg.start.y + (seg.end.y - seg.start.y) * t;
      pts.push(new THREE.Vector3((x - svgCenter.x) * scale, (svgCenter.y - y) * scale, 0));
    }
  });
  return pts;
})();

// --- Component: Foliage ---
const Foliage = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const materialRef = useRef<any>(null);
  const { positions, targetPositions, randoms } = useMemo(() => {
    const count = CONFIG.counts.foliage;
    const positions = new Float32Array(count * 3); const targetPositions = new Float32Array(count * 3); const randoms = new Float32Array(count);
    const spherePoints = random.inSphere(new Float32Array(count * 3), { radius: 25 }) as Float32Array;
    for (let i = 0; i < count; i++) {
      positions[i*3] = spherePoints[i*3]; positions[i*3+1] = spherePoints[i*3+1]; positions[i*3+2] = spherePoints[i*3+2];
      let [tx, ty, tz] = getLightningPosition();
      // 中部开缝 + 部分点向右侧填充，增厚右侧
      let targetVec = applyMidGap(new THREE.Vector3(tx, ty, tz));
      if (Math.random() < 0.35) targetVec = addSideFill(targetVec);
      tx = targetVec.x; ty = targetVec.y; tz = targetVec.z;
      targetPositions[i*3] = tx; targetPositions[i*3+1] = ty; targetPositions[i*3+2] = tz;
      randoms[i] = Math.random();
    }
    return { positions, targetPositions, randoms };
  }, []);
  
  useFrame((rootState, delta) => {
    if (materialRef.current) {
      materialRef.current.uTime = rootState.clock.elapsedTime;
      const targetProgress = state === 'FORMED' ? 1 : 0;
      materialRef.current.uProgress = MathUtils.damp(materialRef.current.uProgress, targetProgress, 4, delta);
    }
  });
  
  // 在散开态(CHAOS)隐藏粒子云
  if (state === 'CHAOS') return null;
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aTargetPos" args={[targetPositions, 3]} />
        <bufferAttribute attach="attributes-aRandom" args={[randoms, 1]} />
      </bufferGeometry>
      {/* @ts-ignore */}
      <foliageMaterial ref={materialRef} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
};

// --- Component: Planet Ornaments (真实天文行星系统) ---

// 纹理生成引擎 v4.2 (来自 planet.tsx)：增强稳定性和兼容性
const generateProceduralTexture = (type: string, baseColor: string): THREE.CanvasTexture => {
  const size = 1024; // 提高分辨率，更精细
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, size, size);

  if (type === 'volcanic') {
    // 深色基底，不要纯黑
    ctx.fillStyle = '#1a0808';
    ctx.fillRect(0, 0, size, size);
    
    // 更深沉的暗红色调，融入紫色宇宙氛围
    const lavaColors = ['#2a0a0a', '#3d1515', '#502020', '#5a2525'];
    
    // 添加大面积的暗区域
    for (let i = 0; i < 50; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 150 + 80;
      
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(20, 10, 10, 0.6)');
      grad.addColorStop(1, 'transparent');
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // 细小的暗红熔岩纹理
    for (let layer = 0; layer < lavaColors.length; layer++) {
      const count = 60 - (layer * 10);
      for (let i = 0; i < count; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = Math.random() * (60 / (layer + 1)) + 15;
        
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, lavaColors[layer]);
        grad.addColorStop(1, 'transparent');
        
        ctx.globalAlpha = 0.3 + Math.random() * 0.3;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        
        // 接缝平滑处理
        if (x + r > size) { ctx.beginPath(); ctx.arc(x - size, y, r, 0, Math.PI * 2); ctx.fill(); }
        if (x - r < 0) { ctx.beginPath(); ctx.arc(x + size, y, r, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    
    // 添加细腻的纹理噪点
    ctx.globalAlpha = 0.25;
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 8000; i++) {
      const brightness = Math.random();
      ctx.fillStyle = `rgba(0, 0, 0, ${brightness * 0.5})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
    
    // 添加微弱的紫色调，融入环境
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#3a2050';
    ctx.fillRect(0, 0, size, size);
    
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;

  } else if (type === 'gas') {
    // 气态巨行星 - 柔和的带状纹理
    const bandCount = 15 + Math.floor(Math.random() * 10);
    for (let i = 0; i < bandCount; i++) {
      const y = (i / bandCount) * size;
      const height = size / bandCount;
      const darkness = Math.sin((i / bandCount) * Math.PI * 4) * 0.15;
      
      ctx.globalAlpha = 0.3 + Math.random() * 0.2;
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.abs(darkness)})`;
      ctx.fillRect(0, y, size, height);
    }
    
    // 添加涡旋和斑点
    ctx.globalAlpha = 1.0;
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 40 + 10;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      
      const brightness = Math.random() * 0.2;
      grad.addColorStop(0, `rgba(255,255,255,${brightness})`);
      grad.addColorStop(0.5, `rgba(200,200,200,${brightness * 0.5})`);
      grad.addColorStop(1, 'transparent');
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      
      // 接缝平滑处理
      if (x + r > size) { ctx.beginPath(); ctx.arc(x - size, y, r, 0, Math.PI * 2); ctx.fill(); }
      if (x - r < 0) { ctx.beginPath(); ctx.arc(x + size, y, r, 0, Math.PI * 2); ctx.fill(); }
    }
    
    // 细腻纹理
    for (let i = 0; i < 5000; i++) {
      const brightness = Math.random() * 0.3;
      ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
    
  } else {
    // 岩石/冰/海洋行星 - 更细腻的表面
    // 大陆块
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 100 + 40;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      
      const darkness = 0.1 + Math.random() * 0.2;
      grad.addColorStop(0, `rgba(0, 0, 0, ${darkness})`);
      grad.addColorStop(0.7, `rgba(0, 0, 0, ${darkness * 0.5})`);
      grad.addColorStop(1, 'transparent');
      
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      
      // 接缝平滑处理
      if (x + r > size) { ctx.beginPath(); ctx.arc(x - size, y, r, 0, Math.PI * 2); ctx.fill(); }
      if (x - r < 0) { ctx.beginPath(); ctx.arc(x + size, y, r, 0, Math.PI * 2); ctx.fill(); }
    }
    
    // 细节纹理
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * 30 + 5;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.12)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // 表面噪点
    for (let i = 0; i < 6000; i++) {
      const brightness = Math.random() * 0.2;
      ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1, 1);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8; // 提高各向异性过滤
  return tex;
};

// 将行星类型映射到纹理类型
const mapPlanetTypeToTextureType = (type: 'gas_giant' | 'ice_giant' | 'rocky' | 'lava' | 'ocean' | 'desert'): string => {
  switch (type) {
    case 'gas_giant':
    case 'ice_giant':
      return 'gas';
    case 'lava':
      return 'volcanic';
    default:
      return 'rocky';
  }
};

// 根据行星类型获取基础颜色
const getPlanetBaseColor = (type: 'gas_giant' | 'ice_giant' | 'rocky' | 'lava' | 'ocean' | 'desert', hue: number): string => {
  switch (type) {
    case 'gas_giant':
      return `hsl(${hue}, 55%, 50%)`;
    case 'ice_giant':
      return `hsl(${hue}, 45%, 55%)`;
    case 'rocky':
      return `hsl(${hue}, 20%, 40%)`;
    case 'lava':
      return '#331100';
    case 'ocean':
      return `hsl(${hue}, 60%, 40%)`;
    case 'desert':
      return `hsl(${hue}, 50%, 50%)`;
    default:
      return `hsl(${hue}, 35%, 45%)`;
  }
};

// NASA天文摄影风格行星纹理生成器 - 真实昼夜分界、大面积柔和光照、暗部保留纹理
const createCinematicPlanetTexture = (
  baseHue: number, 
  type: 'gas_giant' | 'ice_giant' | 'rocky' | 'lava' | 'ocean' | 'desert',
  size: number,
  seed: number = Math.random() * 10000
) => {
  const resolution = Math.min(1024, Math.max(512, Math.floor(size * 120)));
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d')!;
  
  // 伪随机数生成器（确保同一seed生成相同纹理）
  const seededRandom = (s: number) => {
    const x = Math.sin(s * 12.9898 + seed) * 43758.5453;
    return x - Math.floor(x);
  };
  
  // 多层噪声函数 - 增强细节
  const noise2D = (x: number, y: number, freq: number, noiseSeed: number = 0) => {
    const nx = x * freq + noiseSeed + seed * 0.1;
    const ny = y * freq + noiseSeed * 1.3;
    return (Math.sin(nx * 1.2) * Math.cos(ny * 0.9) + 
            Math.sin(nx * 2.4 + ny * 1.1) * 0.5 +
            Math.cos(nx * 0.7 - ny * 1.8) * 0.3 +
            Math.sin(nx * 3.1 + ny * 2.7) * 0.2) / 2.0;
  };
  
  // FBM 分形噪声（更自然的纹理）
  const fbm = (x: number, y: number, octaves: number = 5, persistence: number = 0.5) => {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      value += noise2D(x, y, frequency * 0.006, i * 127 + seed) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2.1;
    }
    return value / maxValue;
  };
  
  // 湍流噪声（用于云层和气体条纹）- 柔和版本
  const turbulence = (x: number, y: number, octaves: number = 4) => {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      value += Math.abs(noise2D(x, y, frequency * 0.008, i * 89)) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    // 柔化输出，减少极端值
    const raw = value / maxValue;
    return 0.3 + raw * 0.4; // 压缩到0.3-0.7范围，避免深色斑纹
  };
  
  const imageData = ctx.getImageData(0, 0, resolution, resolution);
  const data = imageData.data;
  
  // 根据行星类型定义颜色调色板 - 提升基础亮度40%
  const getColorPalette = (planetType: typeof type, _hue: number) => {
    // 亮度提升系数
    const brightnessBoost = 1.4;
    const clampColor = (v: number) => Math.min(255, v * brightnessBoost);
    
    switch (planetType) {
      case 'gas_giant':
        // 类土星 - 丰富的棕橙黄色层次，真实土星风格
        return {
          primary: { r: clampColor(195 + seededRandom(1) * 25), g: clampColor(155 + seededRandom(2) * 20), b: clampColor(95 + seededRandom(3) * 15) },
          secondary: { r: clampColor(215 + seededRandom(4) * 20), g: clampColor(175 + seededRandom(5) * 18), b: clampColor(115 + seededRandom(6) * 12) },
          tertiary: { r: clampColor(170 + seededRandom(7) * 20), g: clampColor(125 + seededRandom(8) * 15), b: clampColor(75 + seededRandom(9) * 12) },
          highlight: { r: 245, g: 225, b: 180 },
          shadow: { r: 120, g: 85, b: 50 }
        };
      case 'ice_giant':
        // 类海王星/天王星 - 高对比度蓝青色，明显的条纹
        return {
          primary: { r: clampColor(60 + seededRandom(1) * 30), g: clampColor(140 + seededRandom(2) * 40), b: clampColor(210 + seededRandom(3) * 35) },
          secondary: { r: clampColor(100 + seededRandom(4) * 35), g: clampColor(180 + seededRandom(5) * 40), b: clampColor(240 + seededRandom(6) * 15) },
          tertiary: { r: clampColor(40 + seededRandom(7) * 25), g: clampColor(100 + seededRandom(8) * 35), b: clampColor(160 + seededRandom(9) * 40) },
          highlight: { r: 200, g: 235, b: 255 },
          shadow: { r: 30, g: 70, b: 120 }
        };
      case 'rocky':
        // 岩石行星 - 灰棕色，大幅提亮，增加对比度
        return {
          primary: { r: clampColor(175 + seededRandom(1) * 45), g: clampColor(165 + seededRandom(2) * 40), b: clampColor(155 + seededRandom(3) * 35) },
          secondary: { r: clampColor(200 + seededRandom(4) * 35), g: clampColor(190 + seededRandom(5) * 30), b: clampColor(180 + seededRandom(6) * 25) },
          tertiary: { r: clampColor(145 + seededRandom(7) * 35), g: clampColor(135 + seededRandom(8) * 30), b: clampColor(125 + seededRandom(9) * 25) },
          highlight: { r: 255, g: 250, b: 245 },
          shadow: { r: 110, g: 105, b: 100 } // 暗部保留岩石纹理
        };
      case 'lava':
        // 熔岩行星 - 深红棕色调，带发光裂缝
        return {
          primary: { r: clampColor(100 + seededRandom(1) * 30), g: clampColor(70 + seededRandom(2) * 20), b: clampColor(60 + seededRandom(3) * 18) },
          secondary: { r: clampColor(130 + seededRandom(4) * 30), g: clampColor(85 + seededRandom(5) * 20), b: clampColor(70 + seededRandom(6) * 18) },
          tertiary: { r: clampColor(80 + seededRandom(7) * 25), g: clampColor(55 + seededRandom(8) * 18), b: clampColor(50 + seededRandom(9) * 15) },
          highlight: { r: 255, g: 180, b: 100 }, // 明亮的熔岩发光
          shadow: { r: 50, g: 35, b: 30 }
        };
      case 'ocean':
        // 海洋行星 - 高对比度深蓝色，明显的海陆差异
        return {
          primary: { r: clampColor(30 + seededRandom(1) * 25), g: clampColor(80 + seededRandom(2) * 40), b: clampColor(160 + seededRandom(3) * 50) },
          secondary: { r: clampColor(50 + seededRandom(4) * 30), g: clampColor(120 + seededRandom(5) * 45), b: clampColor(200 + seededRandom(6) * 45) },
          tertiary: { r: clampColor(20 + seededRandom(7) * 20), g: clampColor(60 + seededRandom(8) * 30), b: clampColor(120 + seededRandom(9) * 40) },
          highlight: { r: 180, g: 230, b: 255 },
          shadow: { r: 15, g: 45, b: 90 }
        };
      case 'desert':
        // 沙漠行星 - 黄棕色，更明亮
        return {
          primary: { r: clampColor(200 + seededRandom(1) * 40), g: clampColor(165 + seededRandom(2) * 40), b: clampColor(115 + seededRandom(3) * 35) },
          secondary: { r: clampColor(220 + seededRandom(4) * 30), g: clampColor(185 + seededRandom(5) * 35), b: clampColor(135 + seededRandom(6) * 30) },
          tertiary: { r: clampColor(175 + seededRandom(7) * 40), g: clampColor(135 + seededRandom(8) * 35), b: clampColor(95 + seededRandom(9) * 30) },
          highlight: { r: 255, g: 250, b: 230 },
          shadow: { r: 140, g: 105, b: 70 }
        };
      default:
        return {
          primary: { r: 180, g: 180, b: 180 },
          secondary: { r: 200, g: 200, b: 200 },
          tertiary: { r: 150, g: 150, b: 150 },
          highlight: { r: 245, g: 245, b: 245 },
          shadow: { r: 100, g: 100, b: 100 }
        };
    }
  };
  
  const palette = getColorPalette(type, baseHue);
  
  // 简单的伪随机噪声函数（用于增加质感）
  const simpleNoise = (x: number, y: number, noiseSeed: number) => {
    const n = Math.sin(x * 12.9898 + y * 78.233 + noiseSeed) * 43758.5453;
    return n - Math.floor(n);
  };
  
  // 使用等距柱状投影 - 整个矩形纹理，无圆形裁剪
  for (let py = 0; py < resolution; py++) {
    for (let px = 0; px < resolution; px++) {
      const i = (py * resolution + px) * 4;
      
      // UV坐标：u = 经度 (0-1), v = 纬度 (0-1)
      const u = px / resolution;
      const v = py / resolution;
      
      // ========== 行星表面纹理 ==========
      let r: number, g: number, b: number;
      
      if (type === 'gas_giant') {
        // 气态巨行星 - 真实土星/木星风格，丰富的条纹和大气细节
        const bandFreq = 0.025 + seededRandom(10) * 0.01;
        
        // 多层大气条纹 - 不同频率叠加产生复杂结构
        const band1 = Math.sin(v * resolution * bandFreq) * 0.5;
        const band2 = Math.sin(v * resolution * bandFreq * 2.1 + seededRandom(11) * 2) * 0.35;
        const band3 = Math.sin(v * resolution * bandFreq * 4.3 + seededRandom(12) * 3) * 0.2;
        const band4 = Math.sin(v * resolution * bandFreq * 8.7) * 0.12;
        const band5 = Math.sin(v * resolution * bandFreq * 0.5) * 0.25; // 大尺度渐变
        const band6 = Math.sin(v * resolution * bandFreq * 16 + seededRandom(14) * 4) * 0.06; // 细条纹
        
        // 经度方向的大气流动扰动 - 增强
        const flowDistort1 = Math.sin(u * Math.PI * 6 + v * 15 + seededRandom(13) * 5) * 0.06;
        const flowDistort2 = Math.sin(u * Math.PI * 12 - v * 8) * 0.04;
        const flowDistort3 = Math.cos(u * Math.PI * 3 + v * 25) * 0.025;
        const flowDistort4 = Math.sin(u * Math.PI * 18 + v * 40) * 0.015;
        
        // 湍流效果 - 模拟大气涡旋
        const turbulence1 = Math.sin(u * Math.PI * 20 + v * 30) * Math.cos(v * Math.PI * 15) * 0.04;
        const turbulence2 = Math.sin(u * Math.PI * 35 - v * 20) * Math.sin(v * Math.PI * 25 + u * 10) * 0.03;
        const turbulence3 = Math.cos(u * Math.PI * 50 + v * 45) * Math.sin(v * Math.PI * 35) * 0.02;
        
        const bandNoise = band1 + band2 + band3 + band4 + band5 + band6 + flowDistort1 + flowDistort2 + flowDistort3 + flowDistort4 + turbulence1 + turbulence2 + turbulence3;
        
        const bandMix = (bandNoise + 0.9) / 1.8;
        const clampedMix = Math.max(0.05, Math.min(0.95, bandMix));
        
        // 五色混合：更丰富的色彩过渡
        const t = clampedMix;
        if (t < 0.25) {
          const localT = t * 4;
          r = palette.shadow.r * (1 - localT) + palette.primary.r * localT;
          g = palette.shadow.g * (1 - localT) + palette.primary.g * localT;
          b = palette.shadow.b * (1 - localT) + palette.primary.b * localT;
        } else if (t < 0.5) {
          const localT = (t - 0.25) * 4;
          r = palette.primary.r * (1 - localT) + palette.secondary.r * localT;
          g = palette.primary.g * (1 - localT) + palette.secondary.g * localT;
          b = palette.primary.b * (1 - localT) + palette.secondary.b * localT;
        } else if (t < 0.75) {
          const localT = (t - 0.5) * 4;
          r = palette.secondary.r * (1 - localT) + palette.tertiary.r * localT;
          g = palette.secondary.g * (1 - localT) + palette.tertiary.g * localT;
          b = palette.secondary.b * (1 - localT) + palette.tertiary.b * localT;
        } else {
          const localT = (t - 0.75) * 4;
          r = palette.tertiary.r * (1 - localT) + palette.highlight.r * localT * 0.8;
          g = palette.tertiary.g * (1 - localT) + palette.highlight.g * localT * 0.8;
          b = palette.tertiary.b * (1 - localT) + palette.highlight.b * localT * 0.8;
        }
        
        // 风暴系统 - 类似木星大红斑，更大更明显
        const stormX = 0.25 + seededRandom(20) * 0.5;
        const stormY = 0.35 + seededRandom(21) * 0.3;
        const stormDist = Math.sqrt(Math.pow((u - stormX) * 2.2, 2) + Math.pow((v - stormY) * 3.5, 2));
        if (stormDist < 0.18) {
          const stormIntensity = 1 - stormDist / 0.18;
          const stormSwirl = Math.sin(stormDist * 50 + Math.atan2(v - stormY, u - stormX) * 4) * stormIntensity;
          // 风暴核心更亮
          r += stormSwirl * 35 + stormIntensity * 20;
          g += stormSwirl * 20 + stormIntensity * 10;
          b -= stormSwirl * 8;
        }
        
        // 小型涡旋点缀 - 更多
        for (let si = 0; si < 8; si++) {
          const sx = seededRandom(30 + si) * 0.9 + 0.05;
          const sy = seededRandom(35 + si) * 0.6 + 0.2;
          const sd = Math.sqrt(Math.pow((u - sx) * 3, 2) + Math.pow((v - sy) * 5, 2));
          if (sd < 0.07) {
            const vortexIntensity = (1 - sd / 0.07) * 0.6;
            r += vortexIntensity * 18;
            g += vortexIntensity * 12;
            b += vortexIntensity * 4;
          }
        }
        
        // 细微噪点增加质感 - 多层
        const detailNoise = simpleNoise(u * 60, v * 60, baseHue) * 8;
        const fineNoise = simpleNoise(u * 120, v * 120, baseHue + 50) * 4;
        const microNoise = simpleNoise(u * 200, v * 200, baseHue + 100) * 2;
        r += detailNoise + fineNoise + microNoise;
        g += (detailNoise + fineNoise + microNoise) * 0.85;
        b += (detailNoise + fineNoise + microNoise) * 0.6;
        
        // 极地区域 - 更明显的六边形风暴
        const polarDist = Math.abs(v - 0.5) * 2;
        if (polarDist > 0.75) {
          const polarIntensity = (polarDist - 0.75) / 0.25;
          // 极地变暗变蓝
          r = r * (1 - polarIntensity * 0.4);
          g = g * (1 - polarIntensity * 0.3);
          b = b * (1 - polarIntensity * 0.15) + polarIntensity * 15;
        }
        
      } else if (type === 'ice_giant') {
        // 冰巨星 - 高对比度海王星/天王星风格，更丰富的细节
        const bandFreq = 0.022 + seededRandom(10) * 0.008;
        
        // 强烈的大气条纹 - 高对比度，更多层次
        const band1 = Math.sin(v * resolution * bandFreq) * 0.55;
        const band2 = Math.sin(v * resolution * bandFreq * 2.2 + seededRandom(11) * 2) * 0.38;
        const band3 = Math.sin(v * resolution * bandFreq * 4.5) * 0.22;
        const band4 = Math.sin(v * resolution * bandFreq * 0.5) * 0.3;
        const band5 = Math.sin(v * resolution * bandFreq * 7) * 0.14;
        const band6 = Math.sin(v * resolution * bandFreq * 12 + seededRandom(15) * 3) * 0.08;
        
        // 大气湍流 - 增强
        const flow1 = Math.sin(u * Math.PI * 6 + v * 15) * 0.08;
        const flow2 = Math.cos(u * Math.PI * 10 - v * 8) * 0.05;
        const flow3 = Math.sin(u * Math.PI * 15 + v * 20) * 0.03;
        const turbulence = Math.sin(u * Math.PI * 20 + v * 25) * Math.cos(v * Math.PI * 18) * 0.06;
        const turbulence2 = Math.cos(u * Math.PI * 30 - v * 35) * Math.sin(v * Math.PI * 22) * 0.04;
        
        // 甲烷云层 - 更明显，多层
        const methaneCloud1 = Math.sin(u * Math.PI * 12 + v * 18) * Math.cos(v * Math.PI * 10) * 0.1;
        const methaneCloud2 = Math.cos(u * Math.PI * 8 - v * 12) * Math.sin(v * Math.PI * 15) * 0.06;
        
        const atmosphereBand = band1 + band2 + band3 + band4 + band5 + band6 + flow1 + flow2 + flow3 + turbulence + turbulence2 + methaneCloud1 + methaneCloud2;
        
        const gradientMix = v * 0.18 + 0.4 + atmosphereBand;
        const clampedGradient = Math.max(0.03, Math.min(0.97, gradientMix));
        
        // 五色混合 - 更丰富的层次
        if (clampedGradient < 0.2) {
          const t = clampedGradient * 5;
          r = palette.shadow.r * (1 - t) + palette.tertiary.r * t;
          g = palette.shadow.g * (1 - t) + palette.tertiary.g * t;
          b = palette.shadow.b * (1 - t) + palette.tertiary.b * t;
        } else if (clampedGradient < 0.4) {
          const t = (clampedGradient - 0.2) * 5;
          r = palette.tertiary.r * (1 - t) + palette.primary.r * t;
          g = palette.tertiary.g * (1 - t) + palette.primary.g * t;
          b = palette.tertiary.b * (1 - t) + palette.primary.b * t;
        } else if (clampedGradient < 0.6) {
          const t = (clampedGradient - 0.4) * 5;
          r = palette.primary.r * (1 - t) + palette.secondary.r * t;
          g = palette.primary.g * (1 - t) + palette.secondary.g * t;
          b = palette.primary.b * (1 - t) + palette.secondary.b * t;
        } else if (clampedGradient < 0.8) {
          const t = (clampedGradient - 0.6) * 5;
          r = palette.secondary.r * (1 - t) + palette.highlight.r * t * 0.7;
          g = palette.secondary.g * (1 - t) + palette.highlight.g * t * 0.7;
          b = palette.secondary.b * (1 - t) + palette.highlight.b * t * 0.7;
        } else {
          const t = (clampedGradient - 0.8) * 5;
          r = palette.highlight.r * 0.7 * (1 - t) + palette.secondary.r * t;
          g = palette.highlight.g * 0.7 * (1 - t) + palette.secondary.g * t;
          b = palette.highlight.b * 0.7 * (1 - t) + palette.secondary.b * t;
        }
        
        // 亮带 - 高层甲烷冰晶云，非常明显
        const brightBand1 = Math.sin(v * resolution * bandFreq * 1.5 + 0.5);
        const brightBand2 = Math.sin(v * resolution * bandFreq * 3.3 - 0.8);
        const brightBand3 = Math.sin(v * resolution * bandFreq * 5.5 + 1.2);
        if (brightBand1 > 0.65) {
          const intensity = (brightBand1 - 0.65) / 0.35;
          r += intensity * 55;
          g += intensity * 70;
          b += intensity * 85;
        }
        if (brightBand2 > 0.7) {
          const intensity = (brightBand2 - 0.7) / 0.3;
          r += intensity * 40;
          g += intensity * 55;
          b += intensity * 70;
        }
        if (brightBand3 > 0.75) {
          const intensity = (brightBand3 - 0.75) / 0.25;
          r += intensity * 30;
          g += intensity * 40;
          b += intensity * 50;
        }
        
        // 暗带 - 深层大气，更明显
        const darkBand = Math.sin(v * resolution * bandFreq * 2.8 + 1.2);
        const darkBand2 = Math.sin(v * resolution * bandFreq * 6 - 0.5);
        if (darkBand < -0.55) {
          const intensity = (-darkBand - 0.55) / 0.45;
          r -= intensity * 40;
          g -= intensity * 35;
          b -= intensity * 20;
        }
        if (darkBand2 < -0.65) {
          const intensity = (-darkBand2 - 0.65) / 0.35;
          r -= intensity * 25;
          g -= intensity * 20;
          b -= intensity * 10;
        }
        
        // 大暗斑风暴 - 更明显，更大
        const stormX = 0.25 + seededRandom(20) * 0.5;
        const stormY = 0.35 + seededRandom(21) * 0.3;
        const stormDist = Math.sqrt(Math.pow((u - stormX) * 2.2, 2) + Math.pow((v - stormY) * 3.5, 2));
        if (stormDist < 0.18) {
          const stormIntensity = 1 - stormDist / 0.18;
          const stormSwirl = Math.sin(stormDist * 35 + Math.atan2(v - stormY, u - stormX) * 5);
          // 暗斑核心更暗
          r -= stormIntensity * 50 + stormSwirl * 15;
          g -= stormIntensity * 40 + stormSwirl * 12;
          b -= stormIntensity * 20 + stormSwirl * 8;
          // 风暴边缘亮环
          if (stormDist > 0.12) {
            const edgeBright = (stormDist - 0.12) / 0.06 * stormIntensity;
            r += edgeBright * 30;
            g += edgeBright * 40;
            b += edgeBright * 50;
          }
        }
        
        // 小型涡旋 - 更多
        for (let vi = 0; vi < 6; vi++) {
          const vx = seededRandom(30 + vi) * 0.8 + 0.1;
          const vy = seededRandom(40 + vi) * 0.6 + 0.2;
          const vd = Math.sqrt(Math.pow((u - vx) * 3, 2) + Math.pow((v - vy) * 5, 2));
          if (vd < 0.06) {
            const vortexIntensity = (1 - vd / 0.06) * 0.7;
            r += vortexIntensity * 35;
            g += vortexIntensity * 45;
            b += vortexIntensity * 55;
          }
        }
        
        // 极地 - 冰巨星极地明显更亮，更蓝
        const polarDist = Math.abs(v - 0.5) * 2;
        if (polarDist > 0.65) {
          const polarIntensity = (polarDist - 0.65) / 0.35;
          r += polarIntensity * 50;
          g += polarIntensity * 65;
          b += polarIntensity * 80;
        }
        
        // 细节噪点 - 多层
        const detailNoise = simpleNoise(u * 60, v * 60, baseHue) * 10;
        const fineNoise = simpleNoise(u * 120, v * 120, baseHue + 40) * 5;
        r += detailNoise * 0.4 + fineNoise * 0.3;
        g += detailNoise * 0.6 + fineNoise * 0.5;
        b += detailNoise + fineNoise;
        
      } else if (type === 'rocky') {
        // 岩石行星 - 真实月球/水星风格，更丰富的陨石坑和地形
        const latitudeMix = Math.sin(v * Math.PI) * 0.18 + 0.4;
        
        // 多层地形起伏 - 增强
        const terrain1 = Math.sin(u * Math.PI * 8 + v * 5) * 0.15;
        const terrain2 = Math.sin(u * Math.PI * 16 + v * 12) * 0.08;
        const terrain3 = Math.cos(u * Math.PI * 4 - v * 3) * 0.1;
        const terrain4 = Math.sin(u * Math.PI * 25 + v * 18) * 0.04;
        const terrain5 = Math.cos(u * Math.PI * 32 - v * 25) * 0.025; // 微细地形
        
        // 高地和低地区域 - 更明显
        const highland1 = Math.sin(u * Math.PI * 2 + v * 1.5) * Math.cos(v * Math.PI * 2.5);
        const highland2 = Math.cos(u * Math.PI * 1.5 - v * 2) * Math.sin(v * Math.PI * 1.8);
        const highland = Math.max(highland1, highland2 * 0.8);
        const highlandMix = highland > 0.25 ? (highland - 0.25) * 0.4 : 0;
        
        // 低地盆地
        const lowland = Math.sin(u * Math.PI * 1.8 + 0.5) * Math.cos(v * Math.PI * 2.2 - 0.3);
        const lowlandMix = lowland < -0.4 ? (-lowland - 0.4) * 0.25 : 0;
        
        const terrainMix = latitudeMix + terrain1 + terrain2 + terrain3 + terrain4 + terrain5 + highlandMix - lowlandMix;
        const clampedMix = Math.max(0.1, Math.min(0.9, terrainMix));
        
        // 四色混合 - 更丰富的层次
        if (clampedMix < 0.33) {
          const t = clampedMix * 3;
          r = palette.shadow.r * (1 - t) + palette.primary.r * t;
          g = palette.shadow.g * (1 - t) + palette.primary.g * t;
          b = palette.shadow.b * (1 - t) + palette.primary.b * t;
        } else if (clampedMix < 0.66) {
          const t = (clampedMix - 0.33) * 3;
          r = palette.primary.r * (1 - t) + palette.secondary.r * t;
          g = palette.primary.g * (1 - t) + palette.secondary.g * t;
          b = palette.primary.b * (1 - t) + palette.secondary.b * t;
        } else {
          const t = (clampedMix - 0.66) * 3;
          r = palette.secondary.r * (1 - t) + palette.tertiary.r * t;
          g = palette.secondary.g * (1 - t) + palette.tertiary.g * t;
          b = palette.secondary.b * (1 - t) + palette.tertiary.b * t;
        }
        
        // 多尺度陨石坑 - 更多更真实
        // 超大型撞击盆地
        for (let bi = 0; bi < 3; bi++) {
          const bx = seededRandom(20 + bi) * 0.7 + 0.15;
          const by = seededRandom(25 + bi) * 0.6 + 0.2;
          const br = 0.1 + seededRandom(30 + bi) * 0.08;
          const dist = Math.sqrt(Math.pow(u - bx, 2) + Math.pow(v - by, 2));
          if (dist < br) {
            // 盆地内部更暗
            const basinDepth = (1 - dist / br) * 20;
            r -= basinDepth * 0.6;
            g -= basinDepth * 0.6;
            b -= basinDepth * 0.5;
            // 边缘山脉
            if (dist > br * 0.7 && dist < br) {
              const rimHeight = Math.sin((dist - br * 0.7) / (br * 0.3) * Math.PI) * 15;
              r += rimHeight;
              g += rimHeight;
              b += rimHeight * 0.9;
            }
          }
        }
        
        // 大型陨石坑
        for (let ci = 0; ci < 12; ci++) {
          const cx = seededRandom(40 + ci) * 0.9 + 0.05;
          const cy = seededRandom(50 + ci) * 0.8 + 0.1;
          const cr = 0.03 + seededRandom(60 + ci) * 0.05;
          const dist = Math.sqrt(Math.pow(u - cx, 2) + Math.pow(v - cy, 2));
          if (dist < cr) {
            const rimDist = Math.abs(dist - cr * 0.85) / (cr * 0.15);
            if (rimDist < 1) {
              const rimBright = (1 - rimDist) * 30;
              r += rimBright;
              g += rimBright;
              b += rimBright * 0.95;
            }
            if (dist < cr * 0.7) {
              const depth = (1 - dist / (cr * 0.7)) * 22;
              r -= depth;
              g -= depth;
              b -= depth * 0.9;
            }
            // 中央峰
            if (dist < cr * 0.2) {
              const peakHeight = (1 - dist / (cr * 0.2)) * 12;
              r += peakHeight;
              g += peakHeight;
              b += peakHeight * 0.9;
            }
          }
        }
        
        // 中型陨石坑
        const craterNoise1 = simpleNoise(u * 25, v * 25, baseHue);
        if (craterNoise1 > 0.78) {
          const craterRim = (craterNoise1 - 0.78) / 0.22 * 28;
          r += craterRim;
          g += craterRim;
          b += craterRim * 0.9;
        }
        
        // 小型陨石坑密集区
        const craterNoise2 = simpleNoise(u * 60, v * 60, baseHue + 30);
        if (craterNoise2 > 0.85) {
          const microCrater = (craterNoise2 - 0.85) / 0.15 * 15;
          r -= microCrater * 0.6;
          g -= microCrater * 0.6;
          b -= microCrater * 0.5;
        }
        
        // 射纹 (撞击辐射纹理)
        for (let ri = 0; ri < 4; ri++) {
          const rx = seededRandom(70 + ri) * 0.8 + 0.1;
          const ry = seededRandom(75 + ri) * 0.7 + 0.15;
          const angle = Math.atan2(v - ry, u - rx);
          const dist = Math.sqrt(Math.pow(u - rx, 2) + Math.pow(v - ry, 2));
          if (dist > 0.05 && dist < 0.2) {
            const rayPattern = Math.sin(angle * 12) * 0.5 + 0.5;
            const rayIntensity = rayPattern * (1 - (dist - 0.05) / 0.15) * 8;
            r += rayIntensity;
            g += rayIntensity;
            b += rayIntensity * 0.9;
          }
        }
        
        // 表面尘埃纹理 - 多层
        const dustNoise1 = simpleNoise(u * 80, v * 80, baseHue + 60) * 8;
        const dustNoise2 = simpleNoise(u * 150, v * 150, baseHue + 90) * 4;
        r += dustNoise1 + dustNoise2;
        g += (dustNoise1 + dustNoise2) * 0.95;
        b += (dustNoise1 + dustNoise2) * 0.88;
        
      } else if (type === 'lava') {
        // 熔岩行星 - 更丰富的岩浆纹理，深棕暗紫色调
        r = palette.primary.r + 30;
        g = palette.primary.g + 20;
        b = palette.primary.b + 22;
        
        // 多层岩石纹理 - 增强
        const rock1 = Math.sin(u * Math.PI * 15 + v * 8) * Math.cos(v * Math.PI * 12 + u * 5);
        const rock2 = Math.sin(u * Math.PI * 8 - v * 6) * Math.cos(v * Math.PI * 10 - u * 4);
        const rock3 = Math.sin(u * Math.PI * 20 + v * 15) * 0.4;
        const rock4 = Math.cos(u * Math.PI * 25 - v * 20) * 0.25;
        const rock5 = Math.sin(u * Math.PI * 35 + v * 28) * 0.15; // 细节纹理
        const rockTexture = (rock1 + rock2 * 0.7 + rock3 + rock4 + rock5) * 0.5;
        
        // 岩石表面细节
        r += rockTexture * 25;
        g += rockTexture * 18;
        b += rockTexture * 15;
        
        // 冷却岩石区域 - 更暗的斑块
        const cooledRock = Math.sin(u * Math.PI * 5 + v * 3) * Math.cos(v * Math.PI * 4);
        if (cooledRock > 0.4) {
          const coolIntensity = (cooledRock - 0.4) / 0.6;
          r -= coolIntensity * 15;
          g -= coolIntensity * 12;
          b -= coolIntensity * 8;
        }
        
        // 熔岩裂缝 - 更细更少，但更亮
        const lava1 = Math.sin(u * Math.PI * 12 + v * 3) * Math.sin(v * Math.PI * 10);
        const lava2 = Math.sin(u * Math.PI * 7 - v * 5) * Math.sin(v * Math.PI * 6 + u * 4);
        const lava3 = Math.sin(u * Math.PI * 18 + v * 8) * Math.sin(v * Math.PI * 15 - u * 6);
        const lavaStripe = Math.max(lava1, lava2, lava3 * 0.7);
        
        if (lavaStripe > 0.78) { // 更高阈值，裂缝更少
          const glowAmount = (lavaStripe - 0.78) / 0.22;
          const glow = glowAmount * glowAmount;
          // 熔岩发光 - 橙红色
          r += glow * 80;
          g += glow * 40;
          b += glow * 15;
        }
        
        // 熔岩湖泊
        for (let li = 0; li < 3; li++) {
          const lx = seededRandom(80 + li) * 0.7 + 0.15;
          const ly = seededRandom(85 + li) * 0.6 + 0.2;
          const lr = 0.04 + seededRandom(90 + li) * 0.03;
          const dist = Math.sqrt(Math.pow(u - lx, 2) + Math.pow(v - ly, 2));
          if (dist < lr) {
            const lakeIntensity = 1 - dist / lr;
            // 熔岩湖发光
            r += lakeIntensity * 60;
            g += lakeIntensity * 25;
            b += lakeIntensity * 8;
          }
        }
        
        // 陨石坑纹理 - 更多
        for (let ci = 0; ci < 6; ci++) {
          const cx = seededRandom(100 + ci) * 0.85 + 0.075;
          const cy = seededRandom(110 + ci) * 0.75 + 0.125;
          const cr = 0.025 + seededRandom(120 + ci) * 0.035;
          const dist = Math.sqrt(Math.pow(u - cx, 2) + Math.pow(v - cy, 2));
          if (dist < cr) {
            if (dist < cr * 0.7) {
              const depth = (1 - dist / (cr * 0.7)) * 18;
              r -= depth;
              g -= depth * 0.8;
              b -= depth * 0.7;
            }
            // 坑边缘
            if (dist > cr * 0.75) {
              const rimBright = (dist - cr * 0.75) / (cr * 0.25) * 12;
              r += rimBright;
              g += rimBright * 0.8;
              b += rimBright * 0.6;
            }
          }
        }
        
        // 表面纹理噪点
        const surfaceNoise = simpleNoise(u * 70, v * 70, baseHue + 40) * 10;
        r += surfaceNoise * 0.8;
        g += surfaceNoise * 0.6;
        b += surfaceNoise * 0.5;
        
      } else if (type === 'ocean') {
        // 海洋行星 - 高对比度地球风格，深蓝海洋、明显大陆、白云
        
        // 深蓝海洋基础色
        r = palette.primary.r;
        g = palette.primary.g;
        b = palette.primary.b;
        
        // 海洋深浅变化 - 更明显的洋流和深度
        const oceanDepth1 = Math.sin(v * Math.PI) * 0.2;
        const oceanDepth2 = Math.sin(u * Math.PI * 4 + v * 2.5) * 0.12;
        const oceanDepth3 = Math.cos(u * Math.PI * 7 - v * 5) * 0.08;
        const oceanCurrent1 = Math.sin(u * Math.PI * 10 + v * 15) * 0.05;
        const oceanCurrent2 = Math.cos(u * Math.PI * 6 - v * 8) * 0.04;
        const oceanDepth = oceanDepth1 + oceanDepth2 + oceanDepth3 + oceanCurrent1 + oceanCurrent2;
        
        // 浅水区更亮更绿
        r += oceanDepth * 15;
        g += oceanDepth * 40;
        b += oceanDepth * 55;
        
        // 深海沟 - 更暗
        const trench = Math.sin(u * Math.PI * 2 + 0.5) * Math.cos(v * Math.PI * 3);
        if (trench < -0.6) {
          const trenchDepth = (-trench - 0.6) / 0.4;
          r -= trenchDepth * 15;
          g -= trenchDepth * 20;
          b -= trenchDepth * 10;
        }
        
        // 大陆板块 - 更大更明显
        const continent1 = Math.sin(u * Math.PI * 2.2 + 0.2) * Math.cos(v * Math.PI * 1.5 + 0.3);
        const continent2 = Math.sin(u * Math.PI * 2.8 - 1.5) * Math.cos(v * Math.PI * 1.8 - 0.6);
        const continent3 = Math.sin(u * Math.PI * 1.5 + 2.5) * Math.cos(v * Math.PI * 2.2 + 1.2);
        const continent4 = Math.sin(u * Math.PI * 3.5 + 0.8) * Math.cos(v * Math.PI * 2.5 - 1.0);
        
        const landMass = Math.max(continent1, continent2 * 0.85, continent3 * 0.7, continent4 * 0.6);
        if (landMass > 0.25) {
          const landIntensity = Math.min(1, (landMass - 0.25) / 0.5);
          
          // 陆地颜色 - 更鲜明的绿色和棕色
          const baseGreen = 100 + landIntensity * 80;
          const baseBrown = 70 + landIntensity * 50;
          
          // 植被区域（靠近海岸更绿）
          const vegetation = Math.sin(u * Math.PI * 15 + v * 10) * 0.3 + 0.5;
          const landR = baseBrown + vegetation * 30;
          const landG = baseGreen + vegetation * 40;
          const landB = 50 + vegetation * 20;
          
          r = r * (1 - landIntensity * 0.9) + landR * landIntensity * 0.9;
          g = g * (1 - landIntensity * 0.9) + landG * landIntensity * 0.9;
          b = b * (1 - landIntensity * 0.9) + landB * landIntensity * 0.9;
          
          // 山脉 - 更高更亮
          const mountain1 = Math.sin(u * Math.PI * 25 + v * 18) * Math.cos(v * Math.PI * 22);
          const mountain2 = Math.sin(u * Math.PI * 18 - v * 12) * Math.cos(u * Math.PI * 20);
          const mountain = Math.max(mountain1, mountain2);
          if (mountain > 0.6 && landIntensity > 0.4) {
            const mountainHeight = (mountain - 0.6) / 0.4 * 35;
            r += mountainHeight;
            g += mountainHeight * 0.85;
            b += mountainHeight * 0.6;
          }
          
          // 沙漠区域（内陆）
          const desertZone = Math.sin(u * Math.PI * 3 + 1.2) * Math.cos(v * Math.PI * 2.5);
          if (desertZone > 0.5 && landIntensity > 0.5) {
            const desertIntensity = (desertZone - 0.5) / 0.5 * landIntensity;
            r += desertIntensity * 50;
            g += desertIntensity * 30;
            b -= desertIntensity * 20;
          }
        }
        
        // 极地冰盖 - 更大更白
        const polarDist = Math.abs(v - 0.5) * 2;
        if (polarDist > 0.7) {
          const iceIntensity = (polarDist - 0.7) / 0.3;
          const iceCap = Math.pow(iceIntensity, 1.5);
          r = r * (1 - iceCap * 0.85) + 250 * iceCap * 0.85;
          g = g * (1 - iceCap * 0.85) + 252 * iceCap * 0.85;
          b = b * (1 - iceCap * 0.85) + 255 * iceCap * 0.85;
        }
        
        // 云层系统 - 更明显的白云
        const cloud1 = Math.sin(u * Math.PI * 6 + v * 3) * Math.cos(v * Math.PI * 5);
        const cloud2 = Math.sin(u * Math.PI * 10 - v * 6) * 0.7;
        const cloud3 = Math.sin(u * Math.PI * 4 + v * 8) * Math.cos(u * Math.PI * 12) * 0.5;
        const cloud4 = Math.sin(u * Math.PI * 15 + v * 5) * 0.4;
        const cloudCover = Math.max(cloud1, cloud2, cloud3, cloud4);
        
        if (cloudCover > 0.35) {
          const cloudIntensity = (cloudCover - 0.35) / 0.65;
          const cloudBright = cloudIntensity * 60;
          r += cloudBright;
          g += cloudBright;
          b += cloudBright * 0.95;
        }
        
        // 飓风/气旋
        for (let hi = 0; hi < 2; hi++) {
          const hx = seededRandom(50 + hi) * 0.6 + 0.2;
          const hy = 0.3 + seededRandom(55 + hi) * 0.4;
          const hd = Math.sqrt(Math.pow((u - hx) * 2.5, 2) + Math.pow((v - hy) * 3, 2));
          if (hd < 0.08) {
            const spiralAngle = Math.atan2(v - hy, u - hx);
            const spiral = Math.sin(hd * 80 + spiralAngle * 3);
            const hurricaneCloud = (1 - hd / 0.08) * (spiral * 0.5 + 0.5) * 40;
            r += hurricaneCloud;
            g += hurricaneCloud;
            b += hurricaneCloud * 0.9;
          }
        }
        
        // 大气散射 - 边缘更蓝
        const atmosphereScatter = Math.pow(Math.abs(v - 0.5) * 2, 0.6) * 0.15;
        g += atmosphereScatter * 8;
        b += atmosphereScatter * 25;
        
      } else if (type === 'desert') {
        // 沙漠行星 - 真实火星风格，沙丘、峡谷、尘暴
        
        // 基础颜色
        const baseMix = Math.sin(v * Math.PI) * 0.1 + 0.45;
        r = palette.primary.r * (1 - baseMix) + palette.secondary.r * baseMix;
        g = palette.primary.g * (1 - baseMix) + palette.secondary.g * baseMix;
        b = palette.primary.b * (1 - baseMix) + palette.secondary.b * baseMix;
        
        // 多层沙丘系统
        const dune1 = Math.sin(v * Math.PI * 6 + u * 2) * 0.18;
        const dune2 = Math.sin(v * Math.PI * 14 + u * 4) * 0.1;
        const dune3 = Math.sin(v * Math.PI * 25 + u * 8) * 0.05;
        const dune4 = Math.cos(u * Math.PI * 3 + v * 5) * 0.12; // 横向沙丘
        const dunePattern = dune1 + dune2 + dune3 + dune4;
        
        r += dunePattern * 25;
        g += dunePattern * 18;
        b += dunePattern * 8;
        
        // 峡谷和裂谷系统
        const canyon1 = Math.sin(u * Math.PI * 1.5 + 0.8) * Math.cos(v * Math.PI * 8);
        const canyon2 = Math.sin(u * Math.PI * 2.2 - 1.5) * Math.cos(v * Math.PI * 6 + u * 3);
        if (canyon1 > 0.75 || canyon2 > 0.8) {
          const canyonDepth = Math.max((canyon1 - 0.75) / 0.25, (canyon2 - 0.8) / 0.2) * 0.6;
          r -= canyonDepth * 35;
          g -= canyonDepth * 30;
          b -= canyonDepth * 20;
        }
        
        // 高地区域 - 更亮的岩石
        const highland = Math.sin(u * Math.PI * 2.8 + v * 1.2) * Math.cos(v * Math.PI * 2);
        if (highland > 0.5) {
          const highlandBright = (highland - 0.5) / 0.5 * 20;
          r += highlandBright;
          g += highlandBright * 0.85;
          b += highlandBright * 0.6;
        }
        
        // 陨石坑
        for (let ci = 0; ci < 6; ci++) {
          const cx = seededRandom(70 + ci) * 0.85 + 0.075;
          const cy = seededRandom(80 + ci) * 0.7 + 0.15;
          const cr = 0.03 + seededRandom(90 + ci) * 0.05;
          const dist = Math.sqrt(Math.pow(u - cx, 2) + Math.pow(v - cy, 2));
          if (dist < cr) {
            const rimDist = Math.abs(dist - cr * 0.8) / (cr * 0.2);
            if (rimDist < 1) {
              const rimBright = (1 - rimDist) * 18;
              r += rimBright;
              g += rimBright * 0.9;
              b += rimBright * 0.7;
            }
            if (dist < cr * 0.6) {
              const depth = (1 - dist / (cr * 0.6)) * 15;
              r -= depth;
              g -= depth * 0.9;
              b -= depth * 0.7;
            }
          }
        }
        
        // 极地冰盖 - 火星风格的干冰
        const polarDist = Math.abs(v - 0.5) * 2;
        if (polarDist > 0.8) {
          const iceIntensity = (polarDist - 0.8) / 0.2;
          r = r * (1 - iceIntensity * 0.5) + 230 * iceIntensity * 0.5;
          g = g * (1 - iceIntensity * 0.5) + 225 * iceIntensity * 0.5;
          b = b * (1 - iceIntensity * 0.5) + 220 * iceIntensity * 0.5;
        }
        
        // 沙尘暴纹理
        const dustStorm = simpleNoise(u * 20, v * 20, baseHue) * 0.5 + 
                          simpleNoise(u * 40, v * 40, baseHue + 20) * 0.3;
        if (dustStorm > 0.6) {
          const stormIntensity = (dustStorm - 0.6) / 0.4 * 15;
          r += stormIntensity;
          g += stormIntensity * 0.8;
          b += stormIntensity * 0.5;
        }
        
        // 表面细节噪点
        const surfaceNoise = simpleNoise(u * 70, v * 70, baseHue + 40) * 8;
        r += surfaceNoise;
        g += surfaceNoise * 0.85;
        b += surfaceNoise * 0.6;
      } else {
        r = palette.primary.r;
        g = palette.primary.g;
        b = palette.primary.b;
      }
      
      // 增强对比度 - 让颜色更鲜明
      const contrastFactor = 1.15;
      const midPoint = 128;
      r = midPoint + (r - midPoint) * contrastFactor;
      g = midPoint + (g - midPoint) * contrastFactor;
      b = midPoint + (b - midPoint) * contrastFactor;
      
      // 最终颜色限制（确保不会出现黑色）
      data[i] = Math.max(25, Math.min(255, Math.round(r)));
      data[i + 1] = Math.max(25, Math.min(255, Math.round(g)));
      data[i + 2] = Math.max(25, Math.min(255, Math.round(b)));
      data[i + 3] = 255; // 完全不透明
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  const texture = new THREE.CanvasTexture(canvas);
  // 优化纹理质量 - 各向异性过滤和更好的采样
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16; // 各向异性过滤，提升斜角观看质量
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
};

// 创建真实感行星环纹理 - 微粒尘埃带，有密度变化
const createRealisticRingTexture = (planetType: 'gas_giant' | 'ice_giant' | 'rocky' | 'lava' | 'ocean' | 'desert') => {
  const width = 512;
  const height = 64;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // 根据行星类型选择环的颜色
  let baseColor: { r: number, g: number, b: number };
  if (planetType === 'gas_giant') {
    baseColor = { r: 180, g: 150, b: 100 }; // 棕金色（类土星环）
  } else if (planetType === 'ice_giant') {
    baseColor = { r: 140, g: 160, b: 190 }; // 蓝灰色
  } else {
    baseColor = { r: 150, g: 145, b: 140 }; // 灰色岩石碎片
  }
  
  for (let x = 0; x < width; x++) {
    // 环的径向位置（0-1）
    const radialPos = x / width;
    
    // 密度变化 - 模拟真实行星环的结构
    // 卡西尼缝隙
    const cassiniGap1 = Math.abs(radialPos - 0.35) < 0.03 ? 0.2 : 1;
    const cassiniGap2 = Math.abs(radialPos - 0.55) < 0.02 ? 0.3 : 1;
    const cassiniGap3 = Math.abs(radialPos - 0.75) < 0.015 ? 0.4 : 1;
    
    // 环的整体密度分布（中间密，两边疏）
    const densityProfile = Math.sin(radialPos * Math.PI) * 0.7 + 0.3;
    
    // 细微密度变化
    const microDensity = 0.7 + Math.sin(radialPos * 50) * 0.15 + Math.sin(radialPos * 120) * 0.1;
    
    const totalDensity = densityProfile * cassiniGap1 * cassiniGap2 * cassiniGap3 * microDensity;
    
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      
      // 环厚度方向的密度（中间厚，边缘薄）
      const thicknessDensity = Math.cos((y / height - 0.5) * Math.PI) * 0.5 + 0.5;
      
      // 随机噪点（模拟微粒）
      const noise = (Math.random() - 0.5) * 30;
      
      // 光照效果（左边亮，右边暗）
      const lightFactor = 1 - (radialPos * 0.3);
      
      const finalDensity = totalDensity * thicknessDensity;
      
      data[i] = Math.max(0, Math.min(255, baseColor.r * lightFactor + noise));
      data[i + 1] = Math.max(0, Math.min(255, baseColor.g * lightFactor + noise));
      data[i + 2] = Math.max(0, Math.min(255, baseColor.b * lightFactor + noise * 0.8));
      data[i + 3] = Math.round(finalDensity * 200); // 透明度
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
};

// 行星类型预设 - 真实天文风格，每种类型都不同
const CINEMATIC_PLANET_PRESETS = [
  // 气态巨行星（类木星）- 棕橙条纹
  { hue: 35, type: 'gas_giant' as const, name: '木星型' },
  { hue: 40, type: 'gas_giant' as const, name: '土星型' },
  { hue: 30, type: 'gas_giant' as const, name: '热木星' },
  // 冰巨星（类海王星/天王星）- 蓝青色
  { hue: 200, type: 'ice_giant' as const, name: '海王星型' },
  { hue: 180, type: 'ice_giant' as const, name: '天王星型' },
  { hue: 210, type: 'ice_giant' as const, name: '冰巨星' },
  // 海洋行星（类地球）- 蓝绿色
  { hue: 200, type: 'ocean' as const, name: '地球型' },
  { hue: 190, type: 'ocean' as const, name: '水世界' },
  { hue: 210, type: 'ocean' as const, name: '超级地球' },
  // 沙漠行星（类火星）- 黄棕色
  { hue: 25, type: 'desert' as const, name: '火星型' },
  { hue: 35, type: 'desert' as const, name: '沙漠世界' },
  { hue: 40, type: 'desert' as const, name: '干旱行星' },
];

// 真实星球纹理路径（不包含地球）- 增加更多种类
const PLANET_TEXTURE_PATHS = [
  '/textures/saturnTexture.jpeg',    // 0 - 土星（带环用）
  '/textures/jupiterTexture.jpeg',   // 1 - 木星
  '/textures/uranusTexture.jpeg',    // 2 - 天王星
  '/textures/venusTexture.jpeg',     // 3 - 金星
  '/textures/marsTexture.jpeg',      // 4 - 火星
  '/textures/jupiterTexture.jpeg',   // 5 - 木星
  '/textures/uranusTexture.jpeg',    // 6 - 天王星
  '/textures/mercuryTexture.jpeg',   // 7 - 水星
  '/textures/plutoTexture.jpeg',     // 8 - 冥王星
  '/textures/saturnTexture.jpeg',    // 9 - 土星
];

const PlanetOrnaments = ({
  state,
  onSelect,
  focusPoint,
  pinchActive
}: {
  state: 'CHAOS' | 'FORMED',
  onSelect?: (path: string, borderColor?: string, isClick?: boolean) => void,
  focusPoint?: { x: number; y: number } | null,
  pinchActive?: boolean
}) => {
  const { camera } = useThree();
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const pinchRef = useRef(false);
  const maxCount = CONFIG.counts.ornamentsChaos;
  const formedCount = CONFIG.counts.ornamentsFormed;
  const groupRef = useRef<THREE.Group>(null);
  const focusRef = useRef<number | null>(null);
  const targetNdc = useRef(new THREE.Vector2());
  const proj = useRef(new THREE.Vector3());

  // 预加载真实星球纹理
  const realTextures = useMemo(() => {
    const loader = new THREE.TextureLoader();
    return PLANET_TEXTURE_PATHS.map(path => {
      const tex = loader.load(path);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    });
  }, []);

  // 预加载土星环纹理
  const saturnRingTexture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/textures/saturnRingsTexture.jpeg');
    tex.colorSpace = THREE.SRGBColorSpace;
    // 设置纹理环绕方式，确保正确映射
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }, []);

  // 创建正确UV映射的土星环几何体
  const createSaturnRingGeometry = useMemo(() => {
    return (innerRadius: number, outerRadius: number, segments: number = 128) => {
      const geometry = new THREE.RingGeometry(innerRadius, outerRadius, segments);
      // 修正UV映射 - 让贴图从内到外正确显示
      const pos = geometry.attributes.position;
      const uv = geometry.attributes.uv;
      
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const r = Math.sqrt(x * x + y * y);
        // UV的v坐标从内圈(0)到外圈(1)线性映射
        const v = (r - innerRadius) / (outerRadius - innerRadius);
        // UV的u坐标围绕圆环
        const angle = Math.atan2(y, x);
        const u = (angle + Math.PI) / (2 * Math.PI);
        uv.setXY(i, u, v);
      }
      uv.needsUpdate = true;
      return geometry;
    };
  }, []);

  // 生成真实天文行星数据 - 带碰撞检测
  const data = useMemo(() => {
    // 存储已生成的星球位置和大小，用于碰撞检测
    const placedPlanets: { pos: THREE.Vector3; radius: number }[] = [];
    
    // 碰撞检测函数 - 检查新位置是否与已有星球碰撞
    const checkCollision = (newPos: THREE.Vector3, newRadius: number): boolean => {
      for (const planet of placedPlanets) {
        const distance = newPos.distanceTo(planet.pos);
        // 两球体积不重叠的最小距离 = 两球半径之和 + 安全间隙
        const minDistance = (newRadius + planet.radius) * 1.3; // 30%安全间隙
        if (distance < minDistance) {
          return true; // 发生碰撞
        }
      }
      return false; // 无碰撞
    };
    
    // 生成不碰撞的位置
    const generateNonCollidingPosition = (
      baseRadius: number, 
      radiusVariation: number, 
      planetRadius: number,
      maxAttempts: number = 50
    ): THREE.Vector3 => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const radius = baseRadius + Math.random() * radiusVariation;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        const pos = new THREE.Vector3(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.cos(phi) * 0.7, // Y压扁
          radius * Math.sin(phi) * Math.sin(theta)
        );
        
        if (!checkCollision(pos, planetRadius)) {
          return pos;
        }
      }
      // 如果多次尝试都碰撞，增大半径重试
      const fallbackRadius = baseRadius * 1.5 + Math.random() * radiusVariation * 2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      return new THREE.Vector3(
        fallbackRadius * Math.sin(phi) * Math.cos(theta),
        fallbackRadius * Math.cos(phi) * 0.7,
        fallbackRadius * Math.sin(phi) * Math.sin(theta)
      );
    };
    
    return new Array(maxCount).fill(0).map((_, i) => {
      // 根据索引分配不同层次的星球
      const depthLayer = i / maxCount; // 0-1 用于深度分层
      
      // 每颗星球独特的随机种子
      const planetSeed = i * 1000 + Math.random() * 100;
      
      // 聚合态位置 - 闪电内部精致分布（也需要碰撞检测）
      const hollowRadius = 18;
      const hollowHeight = 50;
      let anchor: THREE.Vector3;
      let anchorAttempts = 0;
      do {
        anchor = new THREE.Vector3(
          (Math.random() - 0.5) * hollowRadius,
          (Math.random() - 0.5) * hollowHeight,
          (Math.random() - 0.5) * 12
        );
        anchorAttempts++;
      } while (anchorAttempts < 20 && placedPlanets.slice(0, Math.min(i, 20)).some(p => 
        anchor.distanceTo(p.pos) < 3
      ));

      // 散开态位置 - 使用球面均匀分布，确保各个方向都有星球
      // 近处大星球，远处小星球 - 远处更多
      let baseRadiusDist: number;
      let radiusVariation: number;
      let sizeMultiplier: number;
      
      if (depthLayer < 0.08) {
        // 前景层 - 近处超大星球（少）
        baseRadiusDist = 150;
        radiusVariation = 80;
        sizeMultiplier = 5.0 + Math.random() * 3.0; // 5-8
      } else if (depthLayer < 0.2) {
        // 中近景层 - 大星球
        baseRadiusDist = 250;
        radiusVariation = 100;
        sizeMultiplier = 3.0 + Math.random() * 2.0; // 3-5
      } else if (depthLayer < 0.4) {
        // 中景层 - 中等星球
        baseRadiusDist = 380;
        radiusVariation = 120;
        sizeMultiplier = 1.5 + Math.random() * 1.5; // 1.5-3
      } else if (depthLayer < 0.65) {
        // 远景层 - 较小星球（更多）
        baseRadiusDist = 550;
        radiusVariation = 150;
        sizeMultiplier = 0.7 + Math.random() * 0.8; // 0.7-1.5
      } else {
        // 最远层 - 小星球/卫星（最多）
        baseRadiusDist = 750;
        radiusVariation = 200;
        sizeMultiplier = 0.3 + Math.random() * 0.4; // 0.3-0.7
      }
      
      // 计算星球实际半径（用于碰撞检测）
      const actualPlanetRadius = sizeMultiplier * 1.2; // 基础半径 * 大小系数
      
      // 生成不碰撞的位置
      const chaosPos = generateNonCollidingPosition(baseRadiusDist, radiusVariation, actualPlanetRadius);
      
      // 记录已放置的星球
      placedPlanets.push({ pos: chaosPos.clone(), radius: actualPlanetRadius });

      // 选择星球类型 - 确保每颗星球类型不同
      const preset = CINEMATIC_PLANET_PRESETS[i % CINEMATIC_PLANET_PRESETS.length];
      const planetSize = sizeMultiplier;
      
      // 不再做视觉补偿，保留真实的近大远小透视效果
      const compensatedSize = sizeMultiplier; // 直接使用原始大小，不补偿

      // 使用真实星球纹理（循环使用8种纹理）
      // 有星环的行星使用木星纹理（索引0）- 降低星环概率，只有15%的大型气态巨行星有星环
      const hasRing = preset.type === 'gas_giant' && 
                      planetSize > 1.2 && Math.random() > 0.85;
      const textureIndex = hasRing ? 0 : (i % PLANET_TEXTURE_PATHS.length);
      
      const ringTexture = hasRing ? createRealisticRingTexture(preset.type) : null;
      // 星环倾斜角度 - 只在X轴上倾斜，保持纹理水平
      // X轴倾斜约15-30度，让星环看起来像真实土星那样优雅
      const ringTilt = Math.PI / 8 + Math.random() * Math.PI / 12; // 22.5° 到 37.5° X轴倾斜
      // Y轴只做小范围旋转，避免纹理变竖
      const ringYaw = (Math.random() - 0.5) * Math.PI / 3;  // -30° 到 30° Y轴旋转
      
      // 行星轴倾斜 - 保持纹理基本水平，只有轻微倾斜
      const axisTilt = (Math.random() - 0.5) * 0.1;
      
      // 大气层颜色（根据行星类型）
      const getAtmosphereColor = () => {
        switch (preset.type) {
          case 'gas_giant': return new THREE.Color('#c9a055'); // 棕金色
          case 'ice_giant': return new THREE.Color('#7090c0'); // 蓝色
          case 'ocean': return new THREE.Color('#4a8fcc'); // 天蓝色
          case 'lava': return new THREE.Color('#805040'); // 柔和棕色
          case 'desert': return new THREE.Color('#b08050'); // 棕色
          default: return new THREE.Color('#8090a0'); // 灰蓝色
        }
      };
      const atmosphereColor = getAtmosphereColor();
      
      // 自发光强度 - 熔岩行星更亮
      const emissiveIntensity = preset.type === 'lava' ? 0.3 : 0.02;
      
      const rotationSpeed = {
        x: 0.02 + Math.random() * 0.03,  // 往下转
        y: -(0.03 + Math.random() * 0.1), // 往右转（负值）
        z: (Math.random() - 0.5) * 0.02
      };

      return {
        anchor,
        chaosPos,
        planetSize,
        compensatedSize, // 新增：透视补偿后的大小
        preset,
        textureIndex, // 使用纹理索引而不是直接存储纹理
        hasRing,
        ringTexture,
        ringTilt,
        ringYaw,
        axisTilt,
        atmosphereColor,
        emissiveIntensity,
        currentPos: anchor.clone(),
        rotationSpeed,
        orbitPhase: Math.random() * Math.PI * 2,
        orbitSpeed: 0.02 + Math.random() * 0.05,
        floatPhase: Math.random() * Math.PI * 2,
        floatSpeed: 0.15 + Math.random() * 0.2,
        greeting: NEW_YEAR_GREETINGS[i % NEW_YEAR_GREETINGS.length]
      };
    });
  }, [maxCount]);

  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    const time = stateObj.clock.elapsedTime;

    groupRef.current.children.forEach((group, i) => {
      const objData = data[i];
      const shouldShow = !isFormed || i < formedCount;
      const targetScale = shouldShow ? 1 : 0;
      
      const target = isFormed ? objData.anchor : objData.chaosPos;
      objData.currentPos.lerp(target, delta * (isFormed ? 2.5 : 1.0));
      group.position.copy(objData.currentPos);
      
      const currentScale = group.scale.x;
      const newScale = MathUtils.damp(currentScale, targetScale, 3, delta);
      group.scale.setScalar(newScale);

      // 星球不自转，保持固定角度
      
      // 聚合态漂浮
      if (isFormed) {
        const floatX = Math.sin(time * objData.floatSpeed + objData.floatPhase) * 0.2;
        const floatY = Math.cos(time * objData.floatSpeed * 0.7 + objData.floatPhase) * 0.3;
        group.position.x += floatX;
        group.position.y += floatY;
      }
    });

    // 手势检测
    if (!isFormed && focusPoint && groupRef.current && camera) {
      targetNdc.current.set(focusPoint.x * 2 - 1, 1 - focusPoint.y * 2);
      let bestIdx: number | null = null;
      let bestDist = Infinity;
      groupRef.current.children.forEach((child, idx) => {
        proj.current.setFromMatrixPosition(child.matrixWorld).project(camera);
        const dx = proj.current.x - targetNdc.current.x;
        const dy = proj.current.y - targetNdc.current.y;
        const dist = Math.hypot(dx, dy);
        if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
      });
      const threshold = 0.25;
      const resolved = bestDist < threshold ? bestIdx : null;
      if (resolved !== focusRef.current) {
        focusRef.current = resolved;
        setFocusedIndex(resolved);
      }
    } else if (focusRef.current !== null && !focusPoint) {
      focusRef.current = null;
      setFocusedIndex(null);
    }
  });

  useEffect(() => {
    if (pinchActive && !pinchRef.current) {
      pinchRef.current = true;
      if (focusedIndex !== null && onSelect) {
        const target = data[focusedIndex % data.length];
        const colorStr = `hsl(${target.preset.hue}, 50%, 50%)`;
        onSelect(CONFIG.photos.body[focusedIndex % CONFIG.photos.body.length], colorStr, false);
      }
    } else if (!pinchActive && pinchRef.current) {
      pinchRef.current = false;
    }
  }, [pinchActive, focusedIndex, data, onSelect]);

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => {
        const isFocused = focusedIndex === i;
        const isChaos = state === 'CHAOS';
        
        // FORMED 状态下使用原始大小缩小，CHAOS 状态下使用透视补偿后的大小（确保视觉大小一致）
        const baseScale = isChaos ? obj.compensatedSize : obj.planetSize * 0.08;
        const scale = isFocused ? baseScale * 1.15 : baseScale;
        
        // 星环只在散开态(CHAOS)显示
        const showRing = obj.hasRing && state === 'CHAOS';
        
        return (
          <group
            key={i}
            onClick={(e) => { 
              e.stopPropagation(); 
              const colorStr = obj.atmosphereColor.getStyle();
              onSelect?.(CONFIG.photos.body[i % CONFIG.photos.body.length], colorStr, true);
            }}
          >
            {/* 带星环的星球 - 星球和星环一起倾斜，星环围绕赤道 */}
            {showRing ? (
              <group rotation={[obj.ringTilt, obj.ringYaw, 0]}>
                {/* 主体球 */}
                <mesh scale={[scale, scale, scale]}>
                  <sphereGeometry args={[1, 64, 64]} />
                  <meshStandardMaterial 
                    map={realTextures[obj.textureIndex]}
                    roughness={0.85}
                    metalness={0.0}
                    emissive={new THREE.Color(obj.atmosphereColor).multiplyScalar(0.08)}
                    emissiveIntensity={0.05}
                    envMapIntensity={0.15}
                  />
                </mesh>
                {/* 星环 - 围绕赤道（水平放置，因为整个group已经倾斜） */}
                <mesh scale={[scale, scale, scale]} rotation={[Math.PI / 2, 0, 0]} geometry={createSaturnRingGeometry(1.4, 2.3, 128)}>
                  <meshBasicMaterial 
                    map={saturnRingTexture}
                    transparent 
                    opacity={0.9}
                    side={THREE.DoubleSide} 
                    depthWrite={false}
                  />
                </mesh>
              </group>
            ) : (
              /* 不带星环的星球 - 纹理保持水平，轻微倾斜 */
              <mesh scale={[scale, scale, scale]} rotation={[0.15, 0, 0]}>
                <sphereGeometry args={[1, 64, 64]} />
                <meshStandardMaterial 
                  map={realTextures[obj.textureIndex]}
                  roughness={obj.preset.type === 'gas_giant' ? 0.85 : obj.preset.type === 'ice_giant' ? 0.8 : 0.9}
                  metalness={0.0}
                  emissive={obj.preset.type === 'lava' ? new THREE.Color('#704030') : new THREE.Color(obj.atmosphereColor).multiplyScalar(0.08)}
                  emissiveIntensity={obj.preset.type === 'lava' ? 0.25 : 0.05}
                  envMapIntensity={0.15}
                />
              </mesh>
            )}
            
            {/* 边缘大气光晕 */}
            {isChaos && (
              <mesh scale={[scale * 1.02, scale * 1.02, scale * 1.02]}>
                <sphereGeometry args={[1, 24, 24]} />
                <meshBasicMaterial 
                  color={obj.atmosphereColor} 
                  transparent 
                  opacity={0.08} 
                  blending={THREE.AdditiveBlending} 
                  side={THREE.BackSide} 
                />
              </mesh>
            )}
            
            {/* 聚焦时的轻微高亮 */}
            {isFocused && isChaos && (
              <mesh scale={[scale * 1.05, scale * 1.05, scale * 1.05]}>
                <sphereGeometry args={[1, 24, 24]} />
                <meshBasicMaterial 
                  color="#ffffff" 
                  transparent 
                  opacity={0.1} 
                  side={THREE.BackSide} 
                />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
};

// --- Component: Christmas Elements ---
const ChristmasElements = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const count = state === 'FORMED' ? CONFIG.counts.elementsFormed : CONFIG.counts.elementsChaos;
  const groupRef = useRef<THREE.Group>(null);

  const boxGeometry = useMemo(() => new THREE.BoxGeometry(0.8, 0.8, 0.8), []);
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(0.5, 16, 16), []);
  const caneGeometry = useMemo(() => new THREE.CylinderGeometry(0.15, 0.15, 1.2, 8), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map(() => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*60, (Math.random()-0.5)*60, (Math.random()-0.5)*60);
      const [tx, ty, tz] = getLightningPosition(1.3); // 元素厚度
      let baseTarget = new THREE.Vector3(tx, ty, tz);
      baseTarget = applyMidGap(baseTarget);
      const targetPos = mergeRightLane(Math.random() < 0.35 ? addSideFill(baseTarget) : baseTarget);
      targetPos.z += (Math.random() < 0.5 ? -1 : 1) * 0.5 + (Math.random() - 0.5) * 0.1;
      // 去掉右侧多余支线：中段偏右的点向左推（更强）
      const hollowMidTop = CONFIG.tree.height * 0.05;
      const hollowMidBottom = -CONFIG.tree.height * 0.55;
      if (targetPos.y < hollowMidTop && targetPos.y > hollowMidBottom && targetPos.x > 0.2) {
        targetPos.x -= 4 + Math.random() * 3.5;
        targetPos.z += (Math.random() - 0.5) * 0.3;
      }
      // 清除右侧直线延伸：更右的直接移出 (x>1.5)
      if (targetPos.y < hollowMidTop && targetPos.y > hollowMidBottom && targetPos.x > 1.5) {
        targetPos.x -= 8 + Math.random() * 4;
        targetPos.y += (Math.random() - 0.5) * 0.6;
      }
      // 清除左下大团：底部左半区上移并收敛
      if (targetPos.y < -CONFIG.tree.height * 0.22 && targetPos.x < 0.8) {
        targetPos.y += CONFIG.tree.height * 0.18;
        targetPos.x = -1.2 + (Math.random() - 0.5) * 1.2;
        targetPos.z += (Math.random() - 0.5) * 0.4;
      }
      // 下半段减量：将部分点上移并缩小
      if (targetPos.y < -CONFIG.tree.height * 0.15 && Math.random() < 0.7) {
        targetPos.y += CONFIG.tree.height * 0.16;
      }

      // Boxes + cylinders only (去掉球体避免顶部圆点)
      const type = Math.random() < 0.5 ? 0 : 2;
      let color; let scale = 1;
      if (type === 0) { color = CONFIG.colors.giftColors[Math.floor(Math.random() * CONFIG.colors.giftColors.length)]; scale = 0.8 + Math.random() * 0.4; }
      else { color = Math.random() > 0.5 ? CONFIG.colors.red : CONFIG.colors.white; scale = 0.7 + Math.random() * 0.3; }
      if (targetPos.y < -CONFIG.tree.height * 0.15) scale *= 0.6 + Math.random() * 0.3;

      const rotationSpeed = { x: (Math.random()-0.5)*2.0, y: (Math.random()-0.5)*2.0, z: (Math.random()-0.5)*2.0 };
      return { type, chaosPos, targetPos, color, scale, currentPos: chaosPos.clone(), chaosRotation: new THREE.Euler(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI), rotationSpeed };
    });
  }, [boxGeometry, sphereGeometry, caneGeometry]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    groupRef.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;
      objData.currentPos.lerp(target, delta * 2.8);
      mesh.position.copy(objData.currentPos);
      if (isFormed) {
        mesh.rotation.set(-Math.PI / 2, 0, 0);
      } else {
        mesh.rotation.x += delta * objData.rotationSpeed.x; mesh.rotation.y += delta * objData.rotationSpeed.y; mesh.rotation.z += delta * objData.rotationSpeed.z;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => {
        let geometry; if (obj.type === 0) geometry = boxGeometry; else geometry = caneGeometry;
        return ( <mesh key={i} scale={[obj.scale, obj.scale, obj.scale]} geometry={geometry} rotation={obj.chaosRotation}>
          <meshStandardMaterial color={obj.color} roughness={0.3} metalness={0.4} emissive={obj.color} emissiveIntensity={0.2} />
        </mesh> )})}
    </group>
  );
};

// --- Component: Fairy Lights ---
const FairyLights = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const count = state === 'FORMED' ? CONFIG.counts.lightsFormed : CONFIG.counts.lightsChaos;
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.8, 8, 8), []);

  const data = useMemo(() => {
    return new Array(count).fill(0).map(() => {
      const chaosPos = new THREE.Vector3((Math.random()-0.5)*60, (Math.random()-0.5)*60, (Math.random()-0.5)*60);
      const [tx, ty, tz] = getLightningPosition(1.1); // 彩灯厚度
      let baseTarget = new THREE.Vector3(tx, ty, tz);
      baseTarget = applyMidGap(baseTarget);
      const targetPos = Math.random() < 0.35 ? addSideFill(baseTarget) : baseTarget;
      targetPos.z += (Math.random() < 0.5 ? -1 : 1) * 0.4 + (Math.random() - 0.5) * 0.1;
      const color = CONFIG.colors.lights[Math.floor(Math.random() * CONFIG.colors.lights.length)];
      const speed = 2 + Math.random() * 3;
      return { chaosPos, targetPos, color, speed, currentPos: chaosPos.clone(), timeOffset: Math.random() * 100 };
    });
  }, []);

  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    const time = stateObj.clock.elapsedTime;
    groupRef.current.children.forEach((child, i) => {
      const objData = data[i];
      const target = isFormed ? objData.targetPos : objData.chaosPos;
      objData.currentPos.lerp(target, delta * 3.0);
      const mesh = child as THREE.Mesh;
      mesh.position.copy(objData.currentPos);
      const intensity = (Math.sin(time * objData.speed + objData.timeOffset) + 1) / 2;
      if (mesh.material) { (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = isFormed ? 3 + intensity * 4 : 0; }
    });
  });

  return (
    <group ref={groupRef}>
      {data.map((obj, i) => ( <mesh key={i} scale={[0.15, 0.15, 0.15]} geometry={geometry}>
          <meshStandardMaterial color={obj.color} emissive={obj.color} emissiveIntensity={0} toneMapped={false} />
        </mesh> ))}
    </group>
  );
};

// --- Component: Festive Confetti (CHAOS only) ---
// removed per request for cleaner view

// --- Component: Flame Particle (火焰粒子) ---
const FlameParticle = ({ 
  startPos, 
  endPos, 
  delay, 
  speed, 
  color, 
  size,
  state 
}: { 
  startPos: THREE.Vector3; 
  endPos: THREE.Vector3; 
  delay: number; 
  speed: number; 
  color: THREE.Color;
  size: number;
  state: 'CHAOS' | 'FORMED';
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const progress = useRef(delay);
  const lifespan = 1 / speed;
  
  useFrame((stateObj, delta) => {
    if (!meshRef.current) return;
    const isFormed = state === 'FORMED';
    
    if (isFormed) {
      progress.current += delta * speed;
      if (progress.current > 1) progress.current = progress.current % 1;
      
      const t = progress.current;
      // 沿路径移动
      meshRef.current.position.lerpVectors(startPos, endPos, t);
      
      // 添加火焰飘动效果
      const time = stateObj.clock.elapsedTime;
      const wobble = Math.sin(time * 8 + delay * 10) * 0.8;
      const wobbleY = Math.cos(time * 6 + delay * 8) * 0.4;
      meshRef.current.position.x += wobble;
      meshRef.current.position.y += wobbleY;
      meshRef.current.position.z += Math.sin(time * 5 + delay * 12) * 0.5;
      
      // 火焰大小脉动 - 中间最大，两端小
      const lifeFade = Math.sin(t * Math.PI);
      const pulse = 0.7 + Math.sin(time * 12 + delay * 20) * 0.3;
      meshRef.current.scale.setScalar(size * lifeFade * pulse);
      
      // 透明度
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = lifeFade * 0.8;
    } else {
      meshRef.current.scale.setScalar(0);
    }
  });
  
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial 
        color={color} 
        transparent 
        opacity={0} 
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
};

// --- Component: Bolt Glow (火焰能量边缘效果) ---
const BoltGlow = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  
  // 火焰颜色渐变 - 蓝色系：核心白 -> 青蓝 -> 深蓝 -> 紫蓝
  const flameColors = useMemo(() => [
    new THREE.Color('#FFFFFF'),  // 核心白
    new THREE.Color('#E0F4FF'),  // 冰白
    new THREE.Color('#00FFFF'),  // 青色
    new THREE.Color('#00BFFF'),  // 深天蓝
    new THREE.Color('#1E90FF'),  // 道奇蓝
    new THREE.Color('#4169E1'),  // 皇家蓝
    new THREE.Color('#6A5ACD'),  // 石板蓝
    new THREE.Color('#7B68EE'),  // 中石板蓝
    new THREE.Color('#9370DB'),  // 中紫
  ], []);
  
  // 生成火焰粒子数据
  const flameParticles = useMemo(() => {
    const particles: {
      startPos: THREE.Vector3;
      endPos: THREE.Vector3;
      delay: number;
      speed: number;
      color: THREE.Color;
      size: number;
      layer: number;
    }[] = [];
    
    // 沿闪电路径生成多层火焰粒子
    for (let segIdx = 0; segIdx < lightningPath.length; segIdx++) {
      const curr = lightningPath[segIdx];
      const next = lightningPath[(segIdx + 1) % lightningPath.length];
      
      // 每段生成多个粒子
      const particlesPerSegment = 25;
      
      for (let p = 0; p < particlesPerSegment; p++) {
        // 多层火焰效果
        const layers = 5;
        for (let layer = 0; layer < layers; layer++) {
          const layerOffset = layer * 0.8; // 层间距离
          const t = p / particlesPerSegment;
          
          // 基础位置
          const baseStart = new THREE.Vector3().lerpVectors(curr, next, t);
          const baseEnd = new THREE.Vector3().lerpVectors(curr, next, Math.min(1, t + 0.15));
          
          // 添加层偏移和随机性 - 火焰向外扩散
          const perpX = (Math.random() - 0.5) * (2 + layer * 1.5);
          const perpY = (Math.random() - 0.5) * (1 + layer * 0.8);
          const perpZ = (Math.random() - 0.5) * (2 + layer * 1.2);
          
          const startPos = baseStart.clone().add(new THREE.Vector3(perpX, perpY, perpZ));
          const endPos = baseEnd.clone().add(new THREE.Vector3(
            perpX + (Math.random() - 0.5) * 2,
            perpY + (Math.random() - 0.5) * 1.5,
            perpZ + (Math.random() - 0.5) * 1.5
          ));
          
          // 颜色 - 内层更亮，外层更紫
          const colorIndex = Math.min(flameColors.length - 1, layer + Math.floor(Math.random() * 2));
          const color = flameColors[colorIndex].clone();
          
          // 大小 - 内层小而亮，外层大而淡
          const size = layer === 0 ? 0.3 + Math.random() * 0.4 : 
                       layer === 1 ? 0.5 + Math.random() * 0.6 :
                       layer === 2 ? 0.8 + Math.random() * 0.8 :
                       1.0 + Math.random() * 1.2;
          
          particles.push({
            startPos,
            endPos,
            delay: Math.random(),
            speed: 0.3 + Math.random() * 0.4,
            color,
            size,
            layer
          });
        }
      }
    }
    
    return particles;
  }, [flameColors]);
  
  // 创建火焰光晕管道 - 作为背景辉光（直线路径）
  const glowTubes = useMemo(() => {
    const tubes: { geometry: THREE.TubeGeometry; color: string; opacity: number }[] = [];
    
    for (let segIdx = 0; segIdx < lightningPath.length; segIdx++) {
      const curr = lightningPath[segIdx];
      const next = lightningPath[(segIdx + 1) % lightningPath.length];
      
      // 直线路径 - 只用起点和终点，不添加任何抖动
      const curve = new THREE.LineCurve3(curr.clone(), next.clone());
      
      // 多层辉光 - 蓝色系
      tubes.push({ geometry: new THREE.TubeGeometry(curve, 2, 0.4, 8, false), color: '#FFFFFF', opacity: 0.9 });
      tubes.push({ geometry: new THREE.TubeGeometry(curve, 2, 1.0, 8, false), color: '#00FFFF', opacity: 0.5 });
      tubes.push({ geometry: new THREE.TubeGeometry(curve, 2, 2.5, 8, false), color: '#00BFFF', opacity: 0.25 });
      tubes.push({ geometry: new THREE.TubeGeometry(curve, 2, 5.0, 8, false), color: '#1E90FF', opacity: 0.12 });
      tubes.push({ geometry: new THREE.TubeGeometry(curve, 2, 8.0, 8, false), color: '#4169E1', opacity: 0.06 });
    }
    
    return tubes;
  }, []);
  
  // 管道材质
  const tubeMaterials = useMemo(() => {
    return glowTubes.map(({ color, opacity }) => {
      return new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    });
  }, [glowTubes]);

  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    timeRef.current = stateObj.clock.elapsedTime;
    
    // 更新管道辉光
    tubeMaterials.forEach((mat, i) => {
      const baseOpacity = glowTubes[i].opacity;
      const pulse = 0.85 + Math.sin(timeRef.current * 3 + i * 0.5) * 0.15;
      const flicker = 0.9 + Math.random() * 0.1; // 火焰闪烁
      const targetOpacity = isFormed ? baseOpacity * pulse * flicker : 0;
      mat.opacity = MathUtils.damp(mat.opacity, targetOpacity, 4, delta);
    });
  });

  return (
    <group ref={groupRef}>
      {/* 背景辉光管道 */}
      {glowTubes.map((tube, i) => (
        <mesh key={`tube-${i}`} geometry={tube.geometry} material={tubeMaterials[i]} />
      ))}
      
      {/* 火焰粒子 */}
      {flameParticles.map((particle, i) => (
        <FlameParticle
          key={`flame-${i}`}
          startPos={particle.startPos}
          endPos={particle.endPos}
          delay={particle.delay}
          speed={particle.speed}
          color={particle.color}
          size={particle.size}
          state={state}
        />
      ))}
    </group>
  );
};

// --- Component: Lightning Sparks (霹雳电弧效果) ---
const LightningSparks = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  
  // 生成电弧数据 - 增强霹雳效果
  const sparksData = useMemo(() => {
    const sparks: {
      tubeGeometry: THREE.TubeGeometry;
      baseOpacity: number;
      flickerSpeed: number;
      flickerPhase: number;
      color: string;
      isBranch: boolean; // 是否是分支电弧
    }[] = [];
    
    // 沿闪电路径生成电弧 - 增加数量
    for (let segIdx = 0; segIdx < lightningPath.length - 1; segIdx++) {
      const curr = lightningPath[segIdx];
      const next = lightningPath[segIdx + 1];
      
      // 每段生成更多电弧
      const sparksPerSegment = 12 + Math.floor(Math.random() * 8);
      
      for (let s = 0; s < sparksPerSegment; s++) {
        const t = Math.random();
        const basePoint = new THREE.Vector3().lerpVectors(curr, next, t);
        
        // 电弧方向 - 随机向外
        const angle = Math.random() * Math.PI * 2;
        const outwardDir = new THREE.Vector3(
          Math.cos(angle),
          (Math.random() - 0.5) * 0.5,
          Math.sin(angle)
        ).normalize();
        
        // 生成不规则的电弧路径点 - 更长更锐利
        const points: THREE.Vector3[] = [basePoint.clone()];
        let currentPoint = basePoint.clone();
        const segments = 3 + Math.floor(Math.random() * 4); // 更多段
        const maxLength = 8 + Math.random() * 15; // 更长
        
        for (let i = 0; i < segments; i++) {
          const segmentLength = maxLength / segments * (0.5 + Math.random() * 1.0);
          // 更锐利的转折 - 增加抖动
          const jitter = new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 5
          );
          const direction = outwardDir.clone().add(jitter).normalize();
          currentPoint = currentPoint.clone().add(direction.multiplyScalar(segmentLength));
          points.push(currentPoint.clone());
        }
        
        // 创建曲线和管道几何体 - 更粗
        const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.05);
        const tubeGeometry = new THREE.TubeGeometry(curve, 12, 0.2 + Math.random() * 0.15, 6, false);
        
        // 颜色变化 - 更亮的白色和青色
        const colors = ['#FFFFFF', '#FFFFFF', '#F0FFFF', '#E0FFFF', '#00FFFF'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        
        sparks.push({
          tubeGeometry,
          baseOpacity: 0.7 + Math.random() * 0.3,
          flickerSpeed: 15 + Math.random() * 25, // 更快闪烁
          flickerPhase: Math.random() * Math.PI * 2,
          color,
          isBranch: false
        });
        
        // 添加分支电弧 - 从主电弧末端分叉
        if (Math.random() > 0.5 && points.length > 2) {
          const branchStart = points[Math.floor(points.length / 2)];
          const branchPoints: THREE.Vector3[] = [branchStart.clone()];
          let branchPoint = branchStart.clone();
          const branchSegments = 2 + Math.floor(Math.random() * 2);
          const branchLength = 4 + Math.random() * 8;
          
          for (let b = 0; b < branchSegments; b++) {
            const branchJitter = new THREE.Vector3(
              (Math.random() - 0.5) * 6,
              (Math.random() - 0.5) * 4,
              (Math.random() - 0.5) * 6
            );
            branchPoint = branchPoint.clone().add(branchJitter.normalize().multiplyScalar(branchLength / branchSegments));
            branchPoints.push(branchPoint.clone());
          }
          
          if (branchPoints.length >= 2) {
            const branchCurve = new THREE.CatmullRomCurve3(branchPoints, false, 'catmullrom', 0.05);
            const branchGeometry = new THREE.TubeGeometry(branchCurve, 8, 0.1 + Math.random() * 0.1, 4, false);
            
            sparks.push({
              tubeGeometry: branchGeometry,
              baseOpacity: 0.5 + Math.random() * 0.3,
              flickerSpeed: 20 + Math.random() * 30,
              flickerPhase: Math.random() * Math.PI * 2,
              color: '#00FFFF',
              isBranch: true
            });
          }
        }
      }
    }
    
    return sparks;
  }, []);
  
  // 创建材质数组
  const materials = useMemo(() => {
    return sparksData.map(spark => {
      return new THREE.MeshBasicMaterial({
        color: spark.color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    });
  }, [sparksData]);
  
  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    timeRef.current = stateObj.clock.elapsedTime;
    
    // 更新每个电弧的透明度 - 更强烈的闪烁效果
    materials.forEach((mat, i) => {
      const spark = sparksData[i];
      
      // 更激烈的闪烁 - 多重频率叠加
      const flicker1 = Math.sin(timeRef.current * spark.flickerSpeed + spark.flickerPhase);
      const flicker2 = Math.sin(timeRef.current * spark.flickerSpeed * 2.3 + spark.flickerPhase * 1.5);
      const flicker3 = Math.sin(timeRef.current * spark.flickerSpeed * 0.7 + spark.flickerPhase * 3);
      const combinedFlicker = (flicker1 + flicker2 * 0.5 + flicker3 * 0.3) / 1.8;
      
      // 更频繁的出现 - 降低阈值
      const shouldShow = combinedFlicker > -0.1;
      
      // 分支电弧闪烁更快
      const intensityMult = spark.isBranch ? 1.2 : 1.0;
      
      const targetOpacity = isFormed && shouldShow ? spark.baseOpacity * (0.5 + combinedFlicker * 0.5) * intensityMult : 0;
      mat.opacity = MathUtils.lerp(mat.opacity, targetOpacity, delta * 25);
    });
  });
  
  return (
    <group ref={groupRef}>
      {sparksData.map((spark, i) => (
        <mesh key={`spark-${i}`} geometry={spark.tubeGeometry} material={materials[i]} />
      ))}
    </group>
  );
};

// --- Component: Inner Planets (闪电内部精致宇宙) - 真实天文风格 ---
const InnerPlanets = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const groupRef = useRef<THREE.Group>(null);
  const count = CONFIG.counts.innerPlanets;
  
  // 预加载真实星球纹理
  const realTextures = useMemo(() => {
    const loader = new THREE.TextureLoader();
    return PLANET_TEXTURE_PATHS.map(path => {
      const tex = loader.load(path);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    });
  }, []);

  // 预加载土星环纹理
  const saturnRingTexture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/textures/saturnRingsTexture.jpeg');
    tex.colorSpace = THREE.SRGBColorSpace;
    // 设置纹理环绕方式，确保正确映射
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }, []);

  // 创建正确UV映射的土星环几何体
  const createSaturnRingGeometry = useMemo(() => {
    return (innerRadius: number, outerRadius: number, segments: number = 128) => {
      const geometry = new THREE.RingGeometry(innerRadius, outerRadius, segments);
      // 修正UV映射 - 让贴图从内到外正确显示
      const pos = geometry.attributes.position;
      const uv = geometry.attributes.uv;
      
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const r = Math.sqrt(x * x + y * y);
        // UV的v坐标从内圈(0)到外圈(1)线性映射
        const v = (r - innerRadius) / (outerRadius - innerRadius);
        // UV的u坐标围绕圆环
        const angle = Math.atan2(y, x);
        const u = (angle + Math.PI) / (2 * Math.PI);
        uv.setXY(i, u, v);
      }
      uv.needsUpdate = true;
      return geometry;
    };
  }, []);
  
  // 使用真实天文行星预设
  const planetsData = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const hollowRadius = 16;
      const hollowHeight = 45;
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * hollowRadius,
        (Math.random() - 0.5) * hollowHeight,
        (Math.random() - 0.5) * 12
      );
      
      // 闪电内部的星球更精致，大小分布更集中
      const sizeType = Math.random();
      let size;
      if (sizeType < 0.2) {
        size = 2.0 + Math.random() * 1.5; // 主星球
      } else if (sizeType < 0.5) {
        size = 1.0 + Math.random() * 1.0; // 中等
      } else {
        size = 0.3 + Math.random() * 0.5; // 小卫星
      }
      
      const preset = CINEMATIC_PLANET_PRESETS[(i + 5) % CINEMATIC_PLANET_PRESETS.length]; // 偏移确保多样性
      
      // 有星环的行星使用木星纹理（索引0）- 降低星环概率
      const hasRing = preset.type === 'gas_giant' && size > 2.0 && Math.random() > 0.8;
      const textureIndex = hasRing ? 0 : ((i + 3) % PLANET_TEXTURE_PATHS.length);
      
      const ringTexture = hasRing ? createRealisticRingTexture(preset.type) : null;
      // 星环倾斜角度 - 只在X轴上倾斜，保持纹理水平
      const ringTilt = Math.PI / 8 + Math.random() * Math.PI / 12; // 22.5° 到 37.5° X轴倾斜
      const ringYaw = (Math.random() - 0.5) * Math.PI / 3;  // -30° 到 30° Y轴旋转，避免纹理变竖
      const axisTilt = (Math.random() - 0.5) * 0.1; // 保持纹理基本水平
      
      // 大气层颜色
      const getAtmosphereColor = () => {
        switch (preset.type) {
          case 'gas_giant': return new THREE.Color('#c9a055');
          case 'ice_giant': return new THREE.Color('#7090c0');
          case 'ocean': return new THREE.Color('#4a8fcc');
          case 'lava': return new THREE.Color('#805040'); // 柔和棕色
          case 'desert': return new THREE.Color('#b08050');
          default: return new THREE.Color('#8090a0');
        }
      };
      const atmosphereColor = getAtmosphereColor();
      
      const rotationSpeed = 0.03 + Math.random() * 0.08;
      const orbitSpeed = 0.015 + Math.random() * 0.03;
      const orbitRadius = 0.2 + Math.random() * 0.5;
      
      return { 
        pos, size, preset, textureIndex,
        hasRing, ringTexture, ringTilt, ringYaw, axisTilt,
        rotationSpeed, orbitSpeed, orbitRadius, 
        atmosphereColor,
        phase: Math.random() * Math.PI * 2 
      };
    });
  }, [count]);

  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    const time = stateObj.clock.elapsedTime;
    
    groupRef.current.children.forEach((child, i) => {
      const planet = child as THREE.Group;
      const data = planetsData[i];
      
      // FORMED 状态下隐藏，CHAOS 状态下显示
      const targetScale = isFormed ? 0 : 1;
      planet.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 3);
      
      if (!isFormed) {
        const orbitX = Math.sin(time * data.orbitSpeed + data.phase) * data.orbitRadius;
        const orbitZ = Math.cos(time * data.orbitSpeed + data.phase) * data.orbitRadius;
        planet.position.set(
          data.pos.x + orbitX,
          data.pos.y,
          data.pos.z + orbitZ
        );
        // 星球不自转，保持固定角度
      }
    });
  });

  return (
    <group ref={groupRef}>
      {planetsData.map((planet, i) => (
        <group key={i} position={[planet.pos.x, planet.pos.y, planet.pos.z]}>
          {/* 带星环的星球 - 星球和星环一起倾斜，星环围绕赤道 */}
          {planet.hasRing ? (
            <group rotation={[planet.ringTilt, planet.ringYaw, 0]}>
              {/* 星球主体 */}
              <mesh>
                <sphereGeometry args={[planet.size, 64, 64]} />
                <meshStandardMaterial
                  map={realTextures[planet.textureIndex]}
                  roughness={0.9}
                  metalness={0.0}
                  emissiveIntensity={0.02}
                />
              </mesh>
              {/* 星环 - 围绕赤道 */}
              <mesh rotation={[Math.PI / 2, 0, 0]} geometry={createSaturnRingGeometry(planet.size * 1.4, planet.size * 2.3, 64)}>
                <meshBasicMaterial
                  map={saturnRingTexture}
                  transparent
                  opacity={0.9}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            </group>
          ) : (
            /* 不带星环的星球 - 纹理保持水平，轻微倾斜 */
            <mesh rotation={[0.15, 0, 0]}>
              <sphereGeometry args={[planet.size, 64, 64]} />
              <meshStandardMaterial
                map={realTextures[planet.textureIndex]}
                roughness={0.9}
                metalness={0.0}
                emissive={planet.preset.type === 'lava' ? new THREE.Color('#704030') : undefined}
                emissiveIntensity={planet.preset.type === 'lava' ? 0.2 : 0.02}
              />
            </mesh>
          )}
          
          {/* 边缘大气光晕 */}
          <mesh>
            <sphereGeometry args={[planet.size * 1.02, 24, 24]} />
            <meshBasicMaterial
              color={planet.atmosphereColor}
              transparent
              opacity={0.06}
              side={THREE.BackSide}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
};

// --- Component: Flowing Stars (流动星空) ---
const FlowingStars = () => {
  const starsRef = useRef<THREE.Points>(null);
  
  const { positions, velocities, colors, sizes } = useMemo(() => {
    const count = 20000; // 增加到20000个粒子
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      // 使用平方根分布，让星星从中心向外渐变
      const u = Math.random();
      const radiusRatio = Math.sqrt(u); // 平方根让更多星星在外围
      const radius = 200 + radiusRatio * 900; // 200-1100 范围
      
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      
      // 流动速度 - 向外扩散，增大速度
      velocities[i * 3] = (Math.random() - 0.5) * 1.5;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 1.0;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
      
      // 颜色变化 - 远处更暗，增加一些蓝色和紫色调
      const colorVariation = Math.random();
      const distanceFade = 1 - (radiusRatio * 0.3);
      
      // 随机添加不同色调
      const colorType = Math.random();
      if (colorType < 0.7) {
        // 大部分是白色/淡蓝色
        colors[i * 3] = (0.7 + colorVariation * 0.3) * distanceFade;
        colors[i * 3 + 1] = (0.7 + colorVariation * 0.3) * distanceFade;
        colors[i * 3 + 2] = (0.85 + colorVariation * 0.15) * distanceFade;
      } else if (colorType < 0.9) {
        // 一些淡紫色
        colors[i * 3] = (0.6 + colorVariation * 0.3) * distanceFade;
        colors[i * 3 + 1] = (0.5 + colorVariation * 0.3) * distanceFade;
        colors[i * 3 + 2] = (0.8 + colorVariation * 0.2) * distanceFade;
      } else {
        // 少量青色
        colors[i * 3] = (0.4 + colorVariation * 0.3) * distanceFade;
        colors[i * 3 + 1] = (0.7 + colorVariation * 0.3) * distanceFade;
        colors[i * 3 + 2] = (0.9 + colorVariation * 0.1) * distanceFade;
      }
      
      // 大小变化 - 近处大，远处小，增加尺寸多样性
      sizes[i] = (Math.random() * 2.5 + 0.5) * (1.8 - radiusRatio * 0.6);
    }
    
    return { positions, velocities, colors, sizes };
  }, []);
  
  // 自定义星星着色器（十字形，支持近大远小）
  const starMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vViewZDepth;
        
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          
          // 使用视图空间的 Z 深度（相机空间距离）
          vViewZDepth = -mvPosition.z;
          
          // 近大远小：基于视图空间深度
          float distanceScale = 1.0 / (1.0 + vViewZDepth * 0.002);
          gl_PointSize = size * distanceScale * (400.0 / vViewZDepth);
          
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vViewZDepth;
        
        void main() {
          vec2 center = gl_PointCoord - 0.5;
          
          // 计算十字形状
          float horizontal = abs(center.y);
          float vertical = abs(center.x);
          
          // 十字的宽度和长度
          float crossWidth = 0.08;
          float crossLength = 0.5;
          
          // 判断是否在十字范围内
          bool inCross = (horizontal < crossWidth && vertical < crossLength) || 
                        (vertical < crossWidth && horizontal < crossLength);
          
          if (!inCross) discard;
          
          // 计算到中心的距离，用于渐变
          float dist = min(
            horizontal < crossWidth ? vertical : 1.0,
            vertical < crossWidth ? horizontal : 1.0
          );
          
          // 中心亮，边缘暗
          float alpha = 1.0 - smoothstep(0.0, crossLength, dist);
          alpha = pow(alpha, 0.8) * 0.9;
          
          // 远处的星星更暗一些
          float distanceFade = 1.0 - smoothstep(300.0, 1200.0, vViewZDepth);
          alpha *= (0.4 + distanceFade * 0.5); // 稍微降低透明度
          
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);
  
  // 星星流动动画
  useFrame((_, delta) => {
    if (starsRef.current) {
      const pos = starsRef.current.geometry.attributes.position.array as Float32Array;
      
      for (let i = 0; i < pos.length / 3; i++) {
        // 应用速度，加快流动
        pos[i * 3] += velocities[i * 3] * delta * 50;
        pos[i * 3 + 1] += velocities[i * 3 + 1] * delta * 50;
        pos[i * 3 + 2] += velocities[i * 3 + 2] * delta * 50;
        
        // 边界检测 - 超出范围重置
        const dist = Math.sqrt(
          pos[i * 3] ** 2 + 
          pos[i * 3 + 1] ** 2 + 
          pos[i * 3 + 2] ** 2
        );
        
        if (dist > 1300 || dist < 180) {
          const u = Math.random();
          const radiusRatio = Math.sqrt(u);
          const radius = 200 + radiusRatio * 900;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          
          pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
          pos[i * 3 + 1] = radius * Math.cos(phi);
          pos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
        }
      }
      
      starsRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });
  
  return (
    <points ref={starsRef} material={starMaterial}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
    </points>
  );
};

// --- Component: Milky Way Galaxy (银河背景 - 流动星尘) ---
const MilkyWayGalaxy = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<THREE.Points>(null);
  
  // 生成银河星尘粒子 - 螺旋结构
  const { positions, colors, sizes } = useMemo(() => {
    const count = 8000; // 减少粒子数量
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    
    // 银河参数
    const arms = 5; // 5条旋臂
    const armWidth = 0.5; // 旋臂宽度散布
    const coreRadius = 150; // 核心半径
    
    for (let i = 0; i < count; i++) {
      // 随机选择一条旋臂
      const armIndex = i % arms;
      const armAngle = (armIndex / arms) * Math.PI * 2;
      
      // 距离中心的距离 (0 ~ 1)
      const distance = Math.pow(Math.random(), 1.5); // 稍微聚集在中心
      const radius = coreRadius + distance * 1000;
      
      // 螺旋角：随半径增加而旋转
      const spiralAngle = distance * Math.PI * 4; // 旋转两圈
      
      // 随机散布
      const randomOffset = (Math.random() - 0.5) * armWidth * (2.0 - distance); // 外围散布更小，保持形状
      const angle = armAngle + spiralAngle + randomOffset;
      
      // 垂直散布：中心厚，边缘薄
      const heightSpread = 80 * (1 - distance * 0.6);
      const height = (Math.random() - 0.5) * heightSpread;
      
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = height;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      
      // 颜色分布
      // 核心：金/白 -> 中间：紫/红 -> 边缘：深蓝/紫
      const mixRatio = distance;
      
      let r, g, b;
      if (mixRatio < 0.2) {
        // 核心区域 - 金白色
        r = 1.0;
        g = 0.9 + Math.random() * 0.1;
        b = 0.7 + Math.random() * 0.3;
      } else if (mixRatio < 0.6) {
        // 中间区域 - 紫红/亮紫
        r = 0.6 + Math.random() * 0.4;
        g = 0.2 + Math.random() * 0.2;
        b = 0.8 + Math.random() * 0.2;
      } else {
        // 边缘区域 - 深蓝/深紫
        r = 0.2 + Math.random() * 0.2;
        g = 0.3 + Math.random() * 0.3;
        b = 0.7 + Math.random() * 0.3;
      }
      
      // 增加亮度
      const brightness = 0.5 + Math.random() * 0.5;
      colors[i * 3] = r * brightness;
      colors[i * 3 + 1] = g * brightness;
      colors[i * 3 + 2] = b * brightness;
      
      // 大小分布：核心粒子较大，外围较小但有偶尔的大星
      if (Math.random() < 0.05) {
        sizes[i] = Math.random() * 6 + 2; // 亮星
      } else {
        sizes[i] = Math.random() * 2 + 0.5; // 普通尘埃
      }
    }
    
    return { positions, colors, sizes };
  }, []);
  
  // 自定义星星着色器（十字形，支持近大远小）
  const starMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vViewZDepth;
        
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          
          // 使用视图空间的 Z 深度
          vViewZDepth = -mvPosition.z;
          
          // 近大远小
          float distanceScale = 1.0 / (1.0 + vViewZDepth * 0.0015);
          gl_PointSize = size * distanceScale * (400.0 / vViewZDepth);
          
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vViewZDepth;
        
        void main() {
          vec2 center = gl_PointCoord - 0.5;
          float dist = length(center);
          
          // 圆形粒子，超出半径丢弃
          if (dist > 0.5) discard;
          
          // 柔和的圆形渐变
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          alpha = pow(alpha, 1.5) * 0.6;
          
          // 远处的星星更暗一些
          float distanceFade = 1.0 - smoothstep(400.0, 1300.0, vViewZDepth);
          alpha *= (0.3 + distanceFade * 0.5);
          
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);
  
  // 快速旋转，营造流动感
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08;
    }
  });
  
  if (state === 'FORMED') return null;
  
  return (
    <group ref={groupRef}>
      <points ref={particlesRef} material={starMaterial}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
          <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
        </bufferGeometry>
      </points>
    </group>
  );
};

// === SHADER 宇宙背景系统 (只在 CHAOS 状态显示) ===

// GLSL 噪声函数
const noiseGLSL = `
// Simplex 3D Noise 
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float snoise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  float n_ = 1.0/7.0; 
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); 

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );  

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}

// Fractal Brownian Motion (FBM) for cloud-like details
float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;
    for (int i = 0; i < 5; i++) {
        value += amplitude * snoise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}
`;

// 宇宙背景顶点着色器
const cosmicBackgroundVertex = `
varying vec2 vUv;
varying vec3 vPosition;
void main() {
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// 宇宙背景片段着色器 - 真实银河效果（密集星星版）
const cosmicBackgroundFragment = `
uniform float uTime;
varying vec2 vUv;
varying vec3 vPosition;

${noiseGLSL}

// 生成随机星星的hash函数
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

// 生成星星场
float starField(vec3 pos, float scale, float threshold) {
  vec3 p = pos * scale;
  vec3 i = floor(p);
  vec3 f = fract(p);
  
  float star = 0.0;
  
  // 检查周围的格子
  for(int x = -1; x <= 1; x++) {
    for(int y = -1; y <= 1; y++) {
      for(int z = -1; z <= 1; z++) {
        vec3 cell = i + vec3(float(x), float(y), float(z));
        vec3 cellPos = vec3(hash3(cell), hash3(cell + 100.0), hash3(cell + 200.0));
        vec3 starPos = cell + cellPos;
        
        float d = length(p - starPos);
        float brightness = hash3(cell + 300.0);
        
        if(brightness > threshold) {
          float size = (brightness - threshold) / (1.0 - threshold);
          size = size * 0.015 + 0.003;
          float s = 1.0 - smoothstep(0.0, size, d);
          s = pow(s, 2.0);
          star = max(star, s * brightness);
        }
      }
    }
  }
  
  return star;
}

void main() {
  vec3 pos = normalize(vPosition);
  
  // 非常缓慢的旋转
  float angle = uTime * 0.001; 
  mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  pos.xz = rot * pos.xz;

  // -- 银河带定义 - 斜着从左下到右上穿过画面中央 --
  // 使用y轴为主，让银河水平穿过画面
  vec3 bandNormal = normalize(vec3(0.35, 1.0, 0.15));
  float lat = dot(pos, bandNormal);
  
  // 银河带mask - 宽度适中
  float bandWidth = 0.4;
  float bandMask = 1.0 - smoothstep(0.0, bandWidth, abs(lat));
  bandMask = pow(bandMask, 0.8);
  
  // 银河核心更亮
  float coreMask = 1.0 - smoothstep(0.0, 0.15, abs(lat));
  coreMask = pow(coreMask, 1.5);
  
  // -- 背景：纯黑 + 稀疏星星 --
  vec3 finalColor = vec3(0.0);
  
  // 背景稀疏星星（全天空）
  float bgStars1 = starField(pos, 80.0, 0.97);
  float bgStars2 = starField(pos, 120.0, 0.98);
  float bgStars3 = starField(pos, 200.0, 0.985);
  float bgStars = bgStars1 * 0.8 + bgStars2 * 0.6 + bgStars3 * 0.4;
  finalColor += vec3(0.9, 0.92, 1.0) * bgStars * 0.5;
  
  // -- 银河区域：大量密集星星 --
  
  // 银河内的密集星星 - 多层叠加
  float galaxyStars1 = starField(pos, 150.0, 0.85) * bandMask;
  float galaxyStars2 = starField(pos, 250.0, 0.82) * bandMask;
  float galaxyStars3 = starField(pos, 400.0, 0.80) * bandMask;
  float galaxyStars4 = starField(pos, 600.0, 0.78) * bandMask;
  
  // 核心区域更密集
  float coreStars1 = starField(pos, 300.0, 0.70) * coreMask;
  float coreStars2 = starField(pos, 500.0, 0.65) * coreMask;
  
  float allGalaxyStars = galaxyStars1 * 0.9 + galaxyStars2 * 0.7 + galaxyStars3 * 0.5 + galaxyStars4 * 0.3;
  allGalaxyStars += coreStars1 * 0.8 + coreStars2 * 0.5;
  
  // 星星颜色变化 - 蓝白为主，少量暖色
  vec3 starColor1 = vec3(0.85, 0.88, 1.0);   // 蓝白色
  vec3 starColor2 = vec3(0.95, 0.95, 1.0);   // 纯白
  vec3 starColor3 = vec3(1.0, 0.92, 0.85);   // 微暖
  
  float colorMix = snoise(pos * 20.0) * 0.5 + 0.5;
  vec3 galaxyStarColor = mix(starColor1, starColor2, colorMix);
  float warmMix = pow(max(snoise(pos * 15.0 + 50.0), 0.0), 3.0);
  galaxyStarColor = mix(galaxyStarColor, starColor3, warmMix * 0.3);
  
  finalColor += galaxyStarColor * allGalaxyStars * 0.9;
  
  // -- 银河的淡淡辉光（非常微弱，不要雾蒙蒙） --
  float glowNoise = fbm(pos * 3.0) * 0.5 + 0.5;
  float glow = bandMask * glowNoise * 0.08; // 非常微弱的辉光
  vec3 glowColor = vec3(0.4, 0.45, 0.6);
  finalColor += glowColor * glow;
  
  // 核心区域稍亮一点的辉光
  float coreGlow = coreMask * 0.06;
  finalColor += vec3(0.5, 0.52, 0.65) * coreGlow;
  
  // -- 暗尘带效果 --
  float dustNoise = fbm(pos * 4.0 + vec3(100.0, 0.0, 0.0));
  float dustLane = smoothstep(0.4, 0.7, dustNoise);
  float dustZone = 1.0 - smoothstep(0.0, 0.1, abs(lat));
  float dust = dustLane * dustZone * 0.3;
  finalColor *= (1.0 - dust * 0.5); // 暗尘带让部分区域变暗
  
  // -- 一些特别亮的星星 --
  float brightStars = starField(pos, 50.0, 0.995);
  finalColor += vec3(1.0, 1.0, 1.0) * brightStars * 1.5;
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

// 星星顶点着色器
const starVertexShader = `
attribute float size;
attribute float brightness;
varying float vBrightness;

void main() {
  vBrightness = brightness;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  
  // Size attenuation
  gl_PointSize = size * (800.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

// 星星片段着色器
const starFragmentShader = `
varying float vBrightness;

void main() {
  // Soft circular particle
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  
  if (dist > 0.5) discard;
  
  // Soft glow core
  float glow = 1.0 - (dist * 2.0);
  glow = pow(glow, 2.0);
  
  vec3 starColor = vec3(0.95, 0.98, 1.0);
  
  gl_FragColor = vec4(starColor, glow * vBrightness);
}
`;

// --- Component: Shader Star Field (着色器星空 - CHAOS状态) ---
const ShaderStarField = ({ count = 12000 }: { count?: number }) => {
  const meshRef = useRef<THREE.Points>(null);

  const [positions, brightness, sizes] = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const brightness = new Float32Array(count);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // 均匀球形分布
      const r = 150 + Math.random() * 600; // 深度范围
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // 亮度
      brightness[i] = Math.random() * 0.8 + 0.2;

      // 大小：大部分小星星，少数亮星
      const sizeRoll = Math.random();
      if (sizeRoll > 0.99) sizes[i] = 3.0 + Math.random() * 2.0;
      else if (sizeRoll > 0.95) sizes[i] = 2.0 + Math.random() * 1.5;
      else sizes[i] = 0.5 + Math.random() * 1.5;
    }

    return [positions, brightness, sizes];
  }, [count]);

  useFrame((state) => {
    // 非常缓慢的旋转
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.003;
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

// --- Component: Cosmic Background (宇宙银河背景球 - CHAOS状态) ---
const CosmicBackground = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    }
  });

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
  }), []);

  return (
    <group>
      {/* 巨大的背景球体 */}
      <mesh ref={meshRef} scale={[1500, 1500, 1500]} renderOrder={-1000}>
        <sphereGeometry args={[1, 64, 64]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={cosmicBackgroundVertex}
          fragmentShader={cosmicBackgroundFragment}
          uniforms={uniforms}
          side={THREE.BackSide}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
    </group>
  );
};

// --- Component: Cosmic Dust (宇宙微尘 - 小圆点填充背景) ---
const CosmicDust = () => {
  const dustRef = useRef<THREE.Points>(null);
  
  const { positions, colors, sizes } = useMemo(() => {
    const count = 15000; // 15000个微尘粒子
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      // 球形均匀分布
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 300 + Math.random() * 800; // 300-1100范围
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi);
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      
      // 紫色调微尘
      const brightness = 0.3 + Math.random() * 0.4;
      colors[i * 3] = brightness * 0.8;     // R - 紫色偏多
      colors[i * 3 + 1] = brightness * 0.5; // G - 少绿
      colors[i * 3 + 2] = brightness * 1.0; // B - 蓝紫色
      
      // 基础尺寸（会在着色器中根据距离调整）
      sizes[i] = Math.random() * 1.2 + 0.3;
    }
    
    return { positions, colors, sizes };
  }, []);
  
  // 自定义材质，支持近大远小
  const dustMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vViewZDepth;
        
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          
          // 使用视图空间的 Z 深度
          vViewZDepth = -mvPosition.z;
          
          // 近大远小
          float distanceScale = 1.0 / (1.0 + vViewZDepth * 0.003);
          gl_PointSize = size * distanceScale * (250.0 / vViewZDepth);
          
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vViewZDepth;
        
        void main() {
          // 圆形粒子
          vec2 center = gl_PointCoord - 0.5;
          float dist = length(center);
          
          if (dist > 0.5) discard;
          
          // 柔和渐变
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          alpha = pow(alpha, 1.5);
          
          // 远处更透明
          float distanceFade = 1.0 - smoothstep(300.0, 1100.0, vViewZDepth);
          alpha *= (0.2 + distanceFade * 0.4);
          
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);
  
  // 缓慢旋转
  useFrame((_, delta) => {
    if (dustRef.current) {
      dustRef.current.rotation.y += delta * 0.02;
      dustRef.current.rotation.x += delta * 0.01;
    }
  });
  
  return (
    <points ref={dustRef} material={dustMaterial}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        <bufferAttribute attach="attributes-size" args={[sizes, 1]} />
      </bufferGeometry>
    </points>
  );
};

// --- Component: Galaxy Trails (银河光流拖尾) ---
const GalaxyTrails = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const groupRef = useRef<THREE.Group>(null);
  const linesRef = useRef<THREE.LineSegments>(null);

  const { positions, colors } = useMemo(() => {
    const count = 1000; // 减少数量
    const positions = new Float32Array(count * 6); // 每个线条2个点，每个点3个坐标
    const colors = new Float32Array(count * 6);
    
    const arms = 5;
    const coreRadius = 150;

    for (let i = 0; i < count; i++) {
      const armIndex = i % arms;
      const armAngle = (armIndex / arms) * Math.PI * 2;
      
      const distance = Math.pow(Math.random(), 1.2);
      const radius = coreRadius + distance * 900;
      const spiralAngle = distance * Math.PI * 4;
      const angle = armAngle + spiralAngle + (Math.random() - 0.5) * 0.5;
      
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = (Math.random() - 0.5) * 60 * (1 - distance * 0.5);

      // 拖尾长度 - 变得非常短，像光点
      const tailLength = 2 + Math.random() * 4; // 很短的拖尾，2-6单位
      
      // 拖尾方向（切线方向）
      const tangentAngle = angle + Math.PI / 2;
      const tx = Math.cos(tangentAngle) * tailLength;
      const tz = Math.sin(tangentAngle) * tailLength;

      // 起点
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      
      // 终点
      positions[i * 6 + 3] = x - tx;
      positions[i * 6 + 4] = y;
      positions[i * 6 + 5] = z - tz;

      // 颜色 - 亮白/青/紫
      const brightness = 0.8 + Math.random() * 0.5; // 更亮
      const colorType = Math.random();
      
      let r, g, b;
      if (colorType > 0.7) {
        // 青色光点
        r = 0.4; g = 0.9; b = 1.0;
      } else if (colorType > 0.4) {
        // 紫色光点
        r = 0.9; g = 0.6; b = 1.0;
      } else {
        // 白色光点
        r = 1.0; g = 1.0; b = 1.0;
      }

      // 起点颜色（高亮）
      colors[i * 6] = r * brightness;
      colors[i * 6 + 1] = g * brightness;
      colors[i * 6 + 2] = b * brightness;

      // 终点颜色（快速衰减）
      colors[i * 6 + 3] = r * 0.1;
      colors[i * 6 + 4] = g * 0.1;
      colors[i * 6 + 5] = b * 0.1;
    }

    return { positions, colors };
  }, []);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.12;
    }
  });

  if (state === 'FORMED') return null;

  return (
    <group ref={groupRef}>
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[colors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.6} // 提高不透明度，让光点更明显
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          linewidth={2} // 如果浏览器支持
        />
      </lineSegments>
    </group>
  );
};

// --- Component: Nebula Background (宇宙星云背景 - 始终可见) ---
const NebulaBackground = () => {
  const groupRef = useRef<THREE.Group>(null);
  
  // 创建多层星云平面
  const nebulaLayers = useMemo(() => [
    // 后方大星云
    { position: [0, 0, -500] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: 800, color1: '#1a0a3e', color2: '#0a1a3e', opacity: 0.4 },
    // 左侧星云
    { position: [-400, 50, -300] as [number, number, number], rotation: [0, 0.3, 0.1] as [number, number, number], scale: 500, color1: '#2a1050', color2: '#102050', opacity: 0.3 },
    // 右侧星云
    { position: [350, -30, -350] as [number, number, number], rotation: [0, -0.2, -0.1] as [number, number, number], scale: 450, color1: '#0a2040', color2: '#1a1050', opacity: 0.3 },
    // 顶部星云
    { position: [0, 300, -400] as [number, number, number], rotation: [0.4, 0, 0] as [number, number, number], scale: 600, color1: '#150830', color2: '#081530', opacity: 0.25 },
    // 底部星云
    { position: [50, -250, -350] as [number, number, number], rotation: [-0.3, 0.1, 0] as [number, number, number], scale: 500, color1: '#0a1530', color2: '#150a30', opacity: 0.25 },
  ], []);
  
  // 创建星云纹理
  const textures = useMemo(() => {
    return nebulaLayers.map(layer => {
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      
      const centerX = size / 2;
      const centerY = size / 2;
      
      // 基础渐变
      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size / 2);
      gradient.addColorStop(0, layer.color1);
      gradient.addColorStop(0.4, layer.color2);
      gradient.addColorStop(0.7, 'rgba(0,0,0,0.3)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      
      // 添加一些亮点模拟星星
      for (let i = 0; i < 30; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const radius = Math.random() * 2 + 0.5;
        const brightness = Math.random() * 0.4 + 0.2;
        
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
        ctx.fill();
      }
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return texture;
    });
  }, [nebulaLayers]);
  
  useFrame((stateObj) => {
    if (!groupRef.current) return;
    const time = stateObj.clock.elapsedTime;
    
    // 只更新星云平面（前5个子元素）
    for (let i = 0; i < nebulaLayers.length && i < groupRef.current.children.length; i++) {
      const mesh = groupRef.current.children[i] as THREE.Mesh;
      const basePos = nebulaLayers[i].position;
      mesh.position.x = basePos[0] + Math.sin(time * 0.02 + i) * 10;
      mesh.position.y = basePos[1] + Math.cos(time * 0.015 + i * 0.5) * 8;
    }
  });
  
  return (
    <group ref={groupRef}>
      {nebulaLayers.map((layer, i) => (
        <mesh key={i} position={layer.position} rotation={layer.rotation}>
          <planeGeometry args={[layer.scale, layer.scale]} />
          <meshBasicMaterial
            map={textures[i]}
            transparent
            opacity={layer.opacity}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      
      {/* 额外的发光星云球体 */}
      <mesh position={[-200, 100, -450]}>
        <sphereGeometry args={[80, 32, 32]} />
        <meshBasicMaterial color="#1a0a40" transparent opacity={0.15} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[250, -80, -400]}>
        <sphereGeometry args={[60, 32, 32]} />
        <meshBasicMaterial color="#0a1a40" transparent opacity={0.12} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[0, 150, -500]}>
        <sphereGeometry args={[100, 32, 32]} />
        <meshBasicMaterial color="#150830" transparent opacity={0.1} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
};

// --- Component: Shooting Star (流星) - CSS风格渐变线条 + 模糊光晕 ---
const ShootingStar = ({ 
  startPos, 
  speed, 
  length,
  color,
  delay,
  state 
}: { 
  startPos: THREE.Vector3;
  speed: number;
  length: number;
  color: string;
  delay: number;
  state: 'CHAOS' | 'FORMED';
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const progress = useRef(-delay);
  const lifespan = 2;
  
  // 创建流星纹理 - 右边亮（头部），左边透明（尾部）
  const meteorTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 8;
    const ctx = canvas.getContext('2d')!;
    
    // 渐变方向：左边透明（尾部） -> 右边亮（头部）
    const gradient = ctx.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');      // 尾部透明
    gradient.addColorStop(0.6, 'rgba(255, 255, 255, 0.4)');  // 渐亮
    gradient.addColorStop(0.9, color);                        // 颜色
    gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');      // 头部最亮
    
    // 纵向柔和边缘
    for (let y = 0; y < 8; y++) {
      const dist = Math.abs(y - 4) / 4;
      const alpha = 1 - dist * dist;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, y, 256, 1);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, [color]);
  
  // 模糊光晕纹理
  const glowTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    
    const gradient = ctx.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.2)');
    gradient.addColorStop(0.9, color);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.8)');
    
    for (let y = 0; y < 32; y++) {
      const dist = Math.abs(y - 16) / 16;
      const alpha = Math.pow(1 - dist, 2) * 0.5;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = gradient;
      ctx.fillRect(0, y, 256, 1);
    }
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, [color]);
  
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const isFormed = state === 'FORMED';
    
    if (isFormed) {
      progress.current += delta * speed;
      
      if (progress.current > lifespan) {
        progress.current = -Math.random() * 4 - 1;
      }
      
      if (progress.current < 0) {
        groupRef.current.visible = false;
        return;
      }
      
      groupRef.current.visible = true;
      
      const t = progress.current / lifespan;
      
      // 从右上到左下移动
      const moveDistance = t * 500;
      const currentPos = startPos.clone();
      currentPos.x -= moveDistance * 0.6;
      currentPos.y -= moveDistance * 0.8;
      
      groupRef.current.position.copy(currentPos);
      
      // 淡入淡出
      const fade = t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1;
      
      groupRef.current.children.forEach(child => {
        if ((child as THREE.Mesh).material) {
          const mat = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
          mat.opacity = fade * (child.userData.isGlow ? 0.6 : 0.9);
        }
      });
    } else {
      groupRef.current.visible = false;
    }
  });
  
  // 流星倾斜角度 - 头朝左下，尾朝右上
  // 运动方向是(-0.6, -0.8)，流星body要沿着这个方向
  // 角度 = atan2(-0.8, -0.6) + PI = 约233度，但我们要让纹理的左边（亮头）朝向运动方向
  const angle = Math.atan2(-0.8, -0.6); // 约 -126度 = -2.21弧度
  
  return (
    <group ref={groupRef}>
      {/* 主线条 */}
      <mesh rotation={[0, 0, angle]}>
        <planeGeometry args={[length, 1.5]} />
        <meshBasicMaterial 
          map={meteorTexture}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      
      {/* 模糊光晕层1 */}
      <mesh rotation={[0, 0, angle]} userData={{ isGlow: true }}>
        <planeGeometry args={[length, 4]} />
        <meshBasicMaterial 
          map={glowTexture}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      
      {/* 模糊光晕层2 */}
      <mesh rotation={[0, 0, angle]} userData={{ isGlow: true }}>
        <planeGeometry args={[length, 8]} />
        <meshBasicMaterial 
          map={glowTexture}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
};

// --- Component: Shooting Stars System (流星群) ---
const ShootingStars = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const meteors = useMemo(() => {
    // 流星配置 - 从右上方不同位置出发
    const configs = [
      { x: 0, y: 0, d: 1, color: '#7DF9FF' },   // 青色
      { x: 80, y: 30, d: 2, color: '#ffffff' },
      { x: 160, y: -20, d: 3, color: '#ffffff' },
      { x: 50, y: 60, d: 1.5, color: '#B0E0E6' }, // 粉蓝
      { x: 120, y: 80, d: 2.5, color: '#ffffff' },
      { x: 200, y: 40, d: 3.5, color: '#E0FFFF' }, // 蓝白
    ];
    
    return configs.map((cfg, idx) => {
      // 起始位置在右上方
      const startPos = new THREE.Vector3(
        100 + cfg.x,      // 右侧
        200 + cfg.y,      // 上方
        -50 + idx * 10    // 不同深度
      );
      
      return {
        startPos,
        speed: 0.5 + Math.random() * 0.3,
        length: 60 + Math.random() * 40,
        color: cfg.color,
        delay: cfg.d + idx * 0.8,
      };
    });
  }, []);
  
  return (
    <group>
      {meteors.map((meteor, i) => (
        <ShootingStar
          key={i}
          startPos={meteor.startPos}
          speed={meteor.speed}
          length={meteor.length}
          color={meteor.color}
          delay={meteor.delay}
          state={state}
        />
      ))}
    </group>
  );
};

// --- Component: Orbiting Planet (环绕动态星球) ---
// NASA天文摄影风格星球纹理 - 大面积昼面、暗部保留纹理、整体亮度提升
const createRealisticSciFiPlanetTexture = (
  planetType: 'earth_like' | 'gas_giant' | 'rocky' | 'ice' | 'desert' | 'volcanic',
  size: number
) => {
  const resolution = Math.min(1024, Math.max(512, Math.floor(size * 60)));
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d')!;
  
  const seed = planetType.length * 1000 + size * 100;
  const seededRandom = (s: number) => {
    const x = Math.sin(s * 12.9898 + seed) * 43758.5453;
    return x - Math.floor(x);
  };
  
  // 噪声函数
  const noise2D = (x: number, y: number, freq: number, noiseSeed: number = 0) => {
    const nx = x * freq + noiseSeed + seed * 0.1;
    const ny = y * freq + noiseSeed * 1.3;
    return (Math.sin(nx * 1.2) * Math.cos(ny * 0.9) + 
            Math.sin(nx * 2.4 + ny * 1.1) * 0.5 +
            Math.cos(nx * 0.7 - ny * 1.8) * 0.3) / 1.8;
  };
  
  const fbm = (x: number, y: number, octaves: number = 4) => {
    let value = 0, amplitude = 1, frequency = 1, maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      value += noise2D(x, y, frequency * 0.008, i * 127) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return value / maxValue;
  };
  
  // 根据类型定义颜色 - 大幅提亮
  const brightnessBoost = 1.5;
  let palette: { primary: {r:number,g:number,b:number}, secondary: {r:number,g:number,b:number}, highlight: {r:number,g:number,b:number}, shadow: {r:number,g:number,b:number} };
  
  switch (planetType) {
    case 'earth_like':
      palette = {
        primary: { r: 70 * brightnessBoost, g: 120 * brightnessBoost, b: 180 * brightnessBoost },
        secondary: { r: 90 * brightnessBoost, g: 140 * brightnessBoost, b: 200 * brightnessBoost },
        highlight: { r: 220, g: 245, b: 255 },
        shadow: { r: 50, g: 85, b: 130 }
      };
      break;
    case 'gas_giant':
      palette = {
        primary: { r: 200 * brightnessBoost, g: 165 * brightnessBoost, b: 110 * brightnessBoost },
        secondary: { r: 220 * brightnessBoost, g: 185 * brightnessBoost, b: 130 * brightnessBoost },
        highlight: { r: 255, g: 245, b: 220 },
        shadow: { r: 130, g: 100, b: 65 }
      };
      break;
    case 'rocky':
      palette = {
        primary: { r: 150 * brightnessBoost, g: 145 * brightnessBoost, b: 140 * brightnessBoost },
        secondary: { r: 170 * brightnessBoost, g: 165 * brightnessBoost, b: 160 * brightnessBoost },
        highlight: { r: 235, g: 230, b: 225 },
        shadow: { r: 95, g: 90, b: 85 }
      };
      break;
    case 'ice':
      palette = {
        primary: { r: 120 * brightnessBoost, g: 160 * brightnessBoost, b: 200 * brightnessBoost },
        secondary: { r: 140 * brightnessBoost, g: 180 * brightnessBoost, b: 220 * brightnessBoost },
        highlight: { r: 235, g: 250, b: 255 },
        shadow: { r: 70, g: 110, b: 150 }
      };
      break;
    case 'desert':
      palette = {
        primary: { r: 200 * brightnessBoost, g: 160 * brightnessBoost, b: 110 * brightnessBoost },
        secondary: { r: 220 * brightnessBoost, g: 180 * brightnessBoost, b: 130 * brightnessBoost },
        highlight: { r: 255, g: 250, b: 230 },
        shadow: { r: 140, g: 105, b: 70 }
      };
      break;
    case 'volcanic':
      palette = {
        primary: { r: 100, g: 60, b: 50 },
        secondary: { r: 120, g: 75, b: 60 },
        highlight: { r: 255, g: 160, b: 80 },
        shadow: { r: 60, g: 40, b: 35 }
      };
      break;
  }
  
  // 限制颜色范围
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  palette.primary.r = clamp(palette.primary.r);
  palette.primary.g = clamp(palette.primary.g);
  palette.primary.b = clamp(palette.primary.b);
  palette.secondary.r = clamp(palette.secondary.r);
  palette.secondary.g = clamp(palette.secondary.g);
  palette.secondary.b = clamp(palette.secondary.b);
  
  const imageData = ctx.getImageData(0, 0, resolution, resolution);
  const data = imageData.data;
  
  // 简单的伪随机噪声函数
  const simpleNoise2 = (x: number, y: number, noiseSeed: number) => {
    const n = Math.sin(x * 12.9898 + y * 78.233 + noiseSeed) * 43758.5453;
    return n - Math.floor(n);
  };
  
  // 使用等距柱状投影 - 整个矩形纹理，无圆形裁剪
  for (let py = 0; py < resolution; py++) {
    for (let px = 0; px < resolution; px++) {
      const i = (py * resolution + px) * 4;
      
      // UV坐标：u = 经度 (0-1), v = 纬度 (0-1)
      const u = px / resolution;
      const v = py / resolution;
      
      // 表面纹理
      let r: number, g: number, b: number;
      
      if (planetType === 'gas_giant') {
        // 气态巨行星 - 多层条纹 + 涡旋
        const band1 = Math.sin(v * resolution * 0.035) * 0.35;
        const band2 = Math.sin(v * resolution * 0.08 + u * 0.8) * 0.2;
        const band3 = Math.sin(v * resolution * 0.15) * 0.1;
        const bandNoise = band1 + band2 + band3;
        
        const mix = (bandNoise + 0.65) / 1.3;
        const clampedMix = Math.max(0.15, Math.min(0.85, mix));
        r = palette.primary.r * (1 - clampedMix) + palette.secondary.r * clampedMix;
        g = palette.primary.g * (1 - clampedMix) + palette.secondary.g * clampedMix;
        b = palette.primary.b * (1 - clampedMix) + palette.secondary.b * clampedMix;
        
        // 细节噪点
        const detail = simpleNoise2(u * 40, v * 40, size) * 10;
        r += detail; g += detail * 0.9; b += detail * 0.7;
        
      } else if (planetType === 'earth_like') {
        // 类地球 - 海洋 + 云层
        r = palette.primary.r; g = palette.primary.g; b = palette.primary.b;
        
        // 海洋深浅
        const oceanDepth = Math.sin(v * Math.PI) * 0.2 + Math.sin(u * Math.PI * 5 + v * 3) * 0.1;
        r += oceanDepth * 20;
        g += oceanDepth * 30;
        b += oceanDepth * 45;
        
        // 云层
        const cloud = Math.sin(u * Math.PI * 8 + v * 4) * Math.sin(v * Math.PI * 5);
        if (cloud > 0.4) {
          const cloudIntensity = (cloud - 0.4) / 0.6 * 35;
          r += cloudIntensity;
          g += cloudIntensity;
          b += cloudIntensity * 0.85;
        }
        
      } else if (planetType === 'volcanic') {
        // 火山行星 - 暗红色 + 熔岩裂缝
        r = palette.primary.r + 25; g = palette.primary.g + 15; b = palette.primary.b + 10;
        
        // 多层熔岩
        const lava1 = Math.sin(u * Math.PI * 10 + v * 2) * Math.sin(v * Math.PI * 8);
        const lava2 = Math.sin(u * Math.PI * 6 - v * 4) * Math.sin(v * Math.PI * 5 + u * 3);
        const lavaStripe = Math.max(lava1, lava2);
        
        if (lavaStripe > 0.55) {
          const glowAmount = (lavaStripe - 0.55) / 0.45;
          const glow = glowAmount * glowAmount;
          r += glow * (palette.highlight.r - palette.primary.r) * 0.7;
          g += glow * (palette.highlight.g - palette.primary.g) * 0.5;
          b += glow * (palette.highlight.b - palette.primary.b) * 0.3;
        }
        
      } else if (planetType === 'ice') {
        // 冰冻星球 - 蓝白色 + 冰层纹理
        const iceMix = Math.sin(v * Math.PI) * 0.2 + 0.4;
        const iceDetail = Math.sin(u * Math.PI * 10 + v * 6) * 0.1;
        const clampedMix = Math.max(0.2, Math.min(0.8, iceMix + iceDetail));
        
        r = palette.primary.r * (1 - clampedMix) + palette.secondary.r * clampedMix;
        g = palette.primary.g * (1 - clampedMix) + palette.secondary.g * clampedMix;
        b = palette.primary.b * (1 - clampedMix) + palette.secondary.b * clampedMix;
        
        // 冰层高光
        const iceHighlight = simpleNoise2(u * 25, v * 25, size) * 15;
        r += iceHighlight * 0.8;
        g += iceHighlight * 0.9;
        b += iceHighlight;
        
      } else if (planetType === 'desert') {
        // 沙漠星球 - 沙丘纹理
        const dune1 = Math.sin(v * Math.PI * 6 + u * 2) * 0.2;
        const dune2 = Math.sin(v * Math.PI * 14 + u * 4) * 0.1;
        const desertMix = dune1 + dune2 + 0.5;
        
        const clampedMix = Math.max(0.2, Math.min(0.8, desertMix));
        r = palette.primary.r * (1 - clampedMix) + palette.secondary.r * clampedMix;
        g = palette.primary.g * (1 - clampedMix) + palette.secondary.g * clampedMix;
        b = palette.primary.b * (1 - clampedMix) + palette.secondary.b * clampedMix;
        
        // 沙尘细节
        const dustDetail = simpleNoise2(u * 35, v * 35, size) * 12;
        r += dustDetail;
        g += dustDetail * 0.85;
        b += dustDetail * 0.6;
        
      } else if (planetType === 'rocky') {
        // 岩石星球 - 陨石坑 + 地形
        const terrain = Math.sin(v * Math.PI) * 0.2 + Math.sin(u * Math.PI * 8 + v * 5) * 0.1;
        const clampedMix = Math.max(0.2, Math.min(0.8, terrain + 0.4));
        
        r = palette.primary.r * (1 - clampedMix) + palette.secondary.r * clampedMix;
        g = palette.primary.g * (1 - clampedMix) + palette.secondary.g * clampedMix;
        b = palette.primary.b * (1 - clampedMix) + palette.secondary.b * clampedMix;
        
        // 陨石坑
        const crater = simpleNoise2(u * 20, v * 20, size);
        if (crater > 0.82) {
          const craterRim = (crater - 0.82) / 0.18 * 18;
          r += craterRim; g += craterRim; b += craterRim;
        }
        
      } else {
        // 其他类型 - 纬度渐变
        const gradientMix = Math.sin(v * Math.PI) * 0.2 + 0.4;
        const clampedMix = Math.max(0.25, Math.min(0.75, gradientMix));
        r = palette.primary.r * (1 - clampedMix) + palette.secondary.r * clampedMix;
        g = palette.primary.g * (1 - clampedMix) + palette.secondary.g * clampedMix;
        b = palette.primary.b * (1 - clampedMix) + palette.secondary.b * clampedMix;
        const brightVariation = Math.abs(Math.sin(v * Math.PI * 3)) * 6;
        r += brightVariation; g += brightVariation; b += brightVariation;
      }
      
      // 增强对比度 - 让颜色更鲜明
      const contrastFactor = 1.15;
      const midPoint = 128;
      r = midPoint + (r - midPoint) * contrastFactor;
      g = midPoint + (g - midPoint) * contrastFactor;
      b = midPoint + (b - midPoint) * contrastFactor;
      
      // 确保颜色不会太暗
      data[i] = clamp(Math.max(25, Math.round(r)));
      data[i + 1] = clamp(Math.max(25, Math.round(g)));
      data[i + 2] = clamp(Math.max(25, Math.round(b)));
      data[i + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  const texture = new THREE.CanvasTexture(canvas);
  // 优化纹理质量 - 各向异性过滤和更好的采样
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 16; // 各向异性过滤，提升斜角观看质量
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
};

// 写实风格星环 - 有光照反射
const createSciFiRingTexture = (brightness: number) => {
  const width = 1024; // 提高分辨率
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  
  // 深色半透明环，融入紫色宇宙氛围
  for (let x = 0; x < width; x++) {
    // 模拟光照：左侧稍亮，右侧暗
    const lightFactor = 1 - (x / width) * 0.3;
    const baseLight = (40 + brightness * 30) * lightFactor;
    
    for (let y = 0; y < height; y++) {
      // 环的密度变化
      const distFromCenter = Math.abs(y - height / 2) / (height / 2);
      const ringDensity = Math.sin(distFromCenter * Math.PI) * 0.7 + 0.3;
      
      // 添加噪声
      const noise = (Math.random() - 0.5) * 15;
      
      // 深色调，带紫色
      const r = Math.min(255, baseLight + noise + 30);
      const g = Math.min(255, baseLight + noise + 20);
      const b = Math.min(255, baseLight + noise + 40); // 偏紫
      const alpha = ringDensity * (0.35 + Math.random() * 0.2);
      
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  
  // 添加卡西尼缝隙
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, height * 0.35, width, height * 0.08);
  ctx.fillRect(0, height * 0.6, width, height * 0.05);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
};

const OrbitingPlanet = ({
  basePosition,
  planetSize,
  planetType,
  hasRing,
  floatSpeed,
  floatRange,
  state
}: {
  basePosition: THREE.Vector3;
  planetSize: number;
  planetType: 'earth_like' | 'gas_giant' | 'rocky' | 'ice' | 'desert' | 'volcanic';
  hasRing: boolean;
  floatSpeed: number;
  floatRange: number;
  state: 'CHAOS' | 'FORMED';
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const planetRef = useRef<THREE.Mesh>(null);
  const phaseRef = useRef(Math.random() * Math.PI * 2);
  
  const texture = useMemo(() => {
    // 使用新的纹理生成方式，颜色更协调
    const typeMap: Record<string, string> = {
      'earth_like': 'rocky',
      'gas_giant': 'gas',
      'rocky': 'rocky',
      'ice': 'rocky',
      'desert': 'rocky',
      'volcanic': 'volcanic'
    };
    const colorMap: Record<string, string> = {
      'earth_like': '#3a6090',    // 深蓝色
      'gas_giant': '#9a7a50',     // 深金棕色
      'rocky': '#606060',         // 灰色
      'ice': '#5a7a95',           // 深冰蓝
      'desert': '#8a7050',        // 深沙色
      'volcanic': '#1a0808'       // 深暗红（不再是鲜红）
    };
    return generateProceduralTexture(typeMap[planetType], colorMap[planetType]);
  }, [planetType]);
  
  const ringTexture = useMemo(() => {
    return hasRing ? createSciFiRingTexture(0.6) : null;
  }, [hasRing]);
  
  // 根据类型选择大气层颜色（更深沉）
  const getRimColor = () => {
    switch (planetType) {
      case 'earth_like': return '#3a5a80';
      case 'gas_giant': return '#8a6a40';
      case 'ice': return '#5070a0';
      case 'desert': return '#806040';
      case 'volcanic': return '#3a1a20'; // 深紫红色，不再是鲜红
      default: return '#5060a0';
    }
  };
  
  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const time = stateObj.clock.elapsedTime;
    const isFormed = state === 'FORMED';
    
    // 目标透明度 - 只在CHAOS状态显示
    const targetScale = isFormed ? 0 : 1;
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 2);
    
    if (isFormed) {
      // 简单的原地浮动
      const floatX = Math.sin(time * floatSpeed + phaseRef.current) * floatRange;
      const floatY = Math.cos(time * floatSpeed * 0.7 + phaseRef.current) * floatRange * 0.8;
      const floatZ = Math.sin(time * floatSpeed * 0.5 + phaseRef.current * 1.3) * floatRange * 0.5;
      
      groupRef.current.position.set(
        basePosition.x + floatX,
        basePosition.y + floatY,
        basePosition.z + floatZ
      );
      
      // 缓慢自转
      if (planetRef.current) {
        planetRef.current.rotation.y += delta * 0.05;
      }
    }
  });
  
  const rimColor = getRimColor();
  
  return (
    <group ref={groupRef} position={[basePosition.x, basePosition.y, basePosition.z]}>
      {/* 星球主体 - 高质量材质 */}
      <mesh ref={planetRef}>
        <sphereGeometry args={[planetSize, 128, 128]} />
        <meshStandardMaterial
          map={texture}
          roughness={planetType === 'gas_giant' ? 0.7 : planetType === 'ice' ? 0.3 : 0.8}
          metalness={planetType === 'ice' ? 0.2 : 0.05}
          emissive={planetType === 'volcanic' ? new THREE.Color('#2a0a0a') : new THREE.Color(rimColor).multiplyScalar(0.05)}
          emissiveIntensity={planetType === 'volcanic' ? 0.15 : 0.05}
          envMapIntensity={0.4}
          side={THREE.FrontSide}
        />
      </mesh>
      
      {/* 边缘大气光晕 - 更柔和 */}
      <mesh scale={[1.03, 1.03, 1.03]}>
        <sphereGeometry args={[planetSize, 32, 32]} />
        <meshBasicMaterial
          color={rimColor}
          transparent
          opacity={0.08}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      
      {/* 星环 - 横向环绕（类似土星环） */}
      {hasRing && ringTexture && (
        <group rotation={[Math.PI / 2.5, 0.15, 0]}>
          <mesh>
            <ringGeometry args={[planetSize * 1.25, planetSize * 2.1, 128]} />
            <meshBasicMaterial
              map={ringTexture}
              transparent
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
    </group>
  );
};

// --- Component: Dynamic Orbiting Planets (动态环绕星球系统) ---
const DynamicOrbitingPlanets = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const planets = useMemo(() => {
    // 写实科幻风格星球 - 深沉神秘的颜色
    return [
      // 左上方 - 类地球（深蓝海洋）
      {
        basePosition: new THREE.Vector3(-180, 100, -150),
        planetSize: 14,
        planetType: 'earth_like' as const,
        hasRing: false,
        floatSpeed: 0.3,
        floatRange: 5,
      },
      // 右上方 - 气态巨星（类木星棕橙条纹）
      {
        basePosition: new THREE.Vector3(200, 90, -120),
        planetSize: 20,
        planetType: 'gas_giant' as const,
        hasRing: true,
        floatSpeed: 0.25,
        floatRange: 6,
      },
      // 右下方 - 岩石星球（灰棕色）
      {
        basePosition: new THREE.Vector3(170, -100, -140),
        planetSize: 10,
        planetType: 'rocky' as const,
        hasRing: false,
        floatSpeed: 0.4,
        floatRange: 4,
      },
      // 左下方 - 冰冻星球（深蓝灰）
      {
        basePosition: new THREE.Vector3(-160, -90, -100),
        planetSize: 8,
        planetType: 'ice' as const,
        hasRing: false,
        floatSpeed: 0.5,
        floatRange: 3,
      },
      // 顶部偏左 - 沙漠星球（暗棕色）
      {
        basePosition: new THREE.Vector3(-80, 160, -180),
        planetSize: 16,
        planetType: 'desert' as const,
        hasRing: true,
        floatSpeed: 0.2,
        floatRange: 5,
      },
    ];
  }, []);
  
  return (
    <group>
      {planets.map((planet, i) => (
        <OrbitingPlanet key={i} {...planet} state={state} />
      ))}
    </group>
  );
};

// --- Component: Cosmic Nebula (宇宙星云背景 - 散开态) ---
const CosmicNebula = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  // removed per request to delete floating cubes
  return null;
};

// --- Component: Bolt Fill (闪电内部的宇宙星云) ---
const BoltFill = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const count = CONFIG.counts.fillDots;
  const groupRef = useRef<THREE.Points>(null);

  const { positions, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    // 闪电中心镂空区域 - 扩大范围
    const hollowRadius = 25;
    const hollowHeight = 70;
    for (let i = 0; i < count; i++) {
      // 在闪电中心镂空区域内分布，模拟宇宙星云
      // 使用高斯分布让中心更密集
      const gaussX = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
      const gaussY = (Math.random() + Math.random() + Math.random()) / 3 - 0.5;
      const p = new THREE.Vector3(
        gaussX * hollowRadius * 2,
        gaussY * hollowHeight * 2,
        (Math.random() - 0.5) * 20
      );
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      
      // 宇宙星云渐变色 - 更丰富的颜色（去除粉色）
      const tVal = Math.random();
      const nebulaColors = [
        new THREE.Color('#FFFFFF'),  // 白色星星
        new THREE.Color('#87CEEB'),  // 天蓝
        new THREE.Color('#DDA0DD'),  // 淡紫
        new THREE.Color('#B0C4DE'),  // 淡钢蓝
        new THREE.Color('#00CED1'),  // 青色
        new THREE.Color('#9370DB'),  // 中紫
        new THREE.Color('#4169E1'),  // 皇家蓝
      ];
      let tint;
      if (tVal < 0.2) {
        // 明亮的白色/蓝色星星
        tint = nebulaColors[Math.floor(Math.random() * 2)].clone();
      } else if (tVal < 0.5) {
        // 星云色彩
        tint = nebulaColors[2 + Math.floor(Math.random() * 3)].clone();
        tint.multiplyScalar(0.7);
      } else {
        // 暗淡的背景星尘
        tint = nebulaColors[5 + Math.floor(Math.random() * 2)].clone();
        tint.multiplyScalar(0.4);
      }
      col[i * 3] = tint.r;
      col[i * 3 + 1] = tint.g;
      col[i * 3 + 2] = tint.b;
      
      // 不同大小的星星
      siz[i] = tVal < 0.2 ? 0.4 + Math.random() * 0.4 : 0.15 + Math.random() * 0.2;
    }
    return { positions: pos, colors: col, sizes: siz };
  }, [count]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const targetAlpha = state === 'FORMED' ? 0.5 : 0;
    const mat = groupRef.current.material as THREE.PointsMaterial;
    mat.opacity = MathUtils.damp(mat.opacity, targetAlpha, 4, delta);
  });

  return (
    <points ref={groupRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.22}
        transparent
        depthWrite={false}
        vertexColors
        opacity={0}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  );
};

// --- Component: Disperse Particles (散开时的宇宙粒子爆炸效果) ---
const DisperseParticles = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const pointsRef = useRef<THREE.Points>(null);
  const progressRef = useRef(0);
  const count = CONFIG.counts.disperseParticles;
  
  // 生成粒子数据 - 从闪电形状散开到宇宙各处
  const { startPositions, endPositions, colors, sizes, speeds } = useMemo(() => {
    const startPositions = new Float32Array(count * 3);
    const endPositions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const speeds = new Float32Array(count);
    
    for (let i = 0; i < count; i++) {
      // 起始位置 - 闪电形状内部
      const [lx, ly, lz] = getLightningPosition();
      startPositions[i * 3] = lx + (Math.random() - 0.5) * 10;
      startPositions[i * 3 + 1] = ly + (Math.random() - 0.5) * 10;
      startPositions[i * 3 + 2] = lz + (Math.random() - 0.5) * 10;
      
      // 终点位置 - 球形均匀分布到宇宙各处
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 80 + Math.random() * 400; // 80-480范围
      
      endPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      endPositions[i * 3 + 1] = radius * Math.cos(phi);
      endPositions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      
      // 颜色 - 蓝紫白色调，明亮
      const colorChoice = Math.random();
      if (colorChoice < 0.35) {
        // 白色/淡蓝
        colors[i * 3] = 0.85 + Math.random() * 0.15;
        colors[i * 3 + 1] = 0.88 + Math.random() * 0.12;
        colors[i * 3 + 2] = 1.0;
      } else if (colorChoice < 0.6) {
        // 青色
        colors[i * 3] = 0.4 + Math.random() * 0.3;
        colors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
        colors[i * 3 + 2] = 1.0;
      } else if (colorChoice < 0.85) {
        // 紫色
        colors[i * 3] = 0.6 + Math.random() * 0.3;
        colors[i * 3 + 1] = 0.4 + Math.random() * 0.2;
        colors[i * 3 + 2] = 0.9 + Math.random() * 0.1;
      } else {
        // 金色点缀
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.85 + Math.random() * 0.15;
        colors[i * 3 + 2] = 0.4 + Math.random() * 0.3;
      }
      
      // 大小
      const distFactor = radius / 480;
      sizes[i] = (1.5 - distFactor * 0.6) * (0.7 + Math.random() * 0.5);
      
      // 速度 - 随机化让动画更自然
      speeds[i] = 0.5 + Math.random() * 1.0;
    }
    
    return { startPositions, endPositions, colors, sizes, speeds };
  }, [count]);
  
  useFrame((_, delta) => {
    if (!pointsRef.current) return;
    
    const geometry = pointsRef.current.geometry;
    const positions = geometry.attributes.position.array as Float32Array;
    
    // 目标进度
    const targetProgress = state === 'CHAOS' ? 1 : 0;
    
    // 平滑过渡
    progressRef.current = MathUtils.lerp(progressRef.current, targetProgress, delta * 2.5);
    
    // 更新每个粒子位置
    for (let i = 0; i < count; i++) {
      const speed = speeds[i];
      const p = Math.min(1, Math.max(0, progressRef.current * speed));
      
      // 使用easeOutQuart让散开更有爆发感
      const eased = 1 - Math.pow(1 - p, 4);
      
      positions[i * 3] = MathUtils.lerp(startPositions[i * 3], endPositions[i * 3], eased);
      positions[i * 3 + 1] = MathUtils.lerp(startPositions[i * 3 + 1], endPositions[i * 3 + 1], eased);
      positions[i * 3 + 2] = MathUtils.lerp(startPositions[i * 3 + 2], endPositions[i * 3 + 2], eased);
    }
    
    geometry.attributes.position.needsUpdate = true;
    
    // 透明度随进度变化
    const material = pointsRef.current.material as THREE.ShaderMaterial;
    material.uniforms.uOpacity.value = progressRef.current * 0.85;
  });
  
  // 初始位置数组 - 用于渲染
  const positionsArray = useMemo(() => new Float32Array(startPositions), [startPositions]);
  
  // 自定义圆形粒子材质
  const disperseMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 0 }
      },
      vertexShader: `
        attribute vec3 color;
        varying vec3 vColor;
        
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 5.0 * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vColor;
        
        void main() {
          vec2 center = gl_PointCoord - 0.5;
          float dist = length(center);
          
          if (dist > 0.5) discard;
          
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          alpha = pow(alpha, 1.2) * uOpacity;
          
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);
  
  return (
    <points ref={pointsRef} material={disperseMaterial}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positionsArray} itemSize={3} />
        <bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} />
      </bufferGeometry>
    </points>
  );
};

// --- Component: Top Star (次元核心光球) ---
const TopStar = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const groupRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((stateObj, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.3;
      const targetScale = state === 'FORMED' ? 1 : 0;
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 3);
    }
    if (glowRef.current) {
      const time = stateObj.clock.elapsedTime;
      const pulse = 1 + Math.sin(time * 2) * 0.15;
      glowRef.current.scale.setScalar(pulse * 2.5);
    }
  });

  return (
    <group ref={groupRef} position={[0, CONFIG.tree.height / 2 + 8, 0]}>
      <Float speed={2} rotationIntensity={0.3} floatIntensity={0.3}>
        {/* 核心光球 */}
        <mesh>
          <sphereGeometry args={[1.2, 32, 32]} />
          <meshStandardMaterial
            color="#FFFFFF"
            emissive="#FFFFFF"
            emissiveIntensity={3}
            roughness={0}
            metalness={0}
            toneMapped={false}
          />
        </mesh>
        {/* 内层光晕 - 青色 */}
        <mesh ref={glowRef}>
          <sphereGeometry args={[1, 24, 24]} />
          <meshBasicMaterial
            color="#00FFFF"
            transparent
            opacity={0.4}
            side={THREE.BackSide}
          />
        </mesh>
        {/* 外层光晕 - 紫色 */}
        <mesh scale={[3.5, 3.5, 3.5]}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial
            color="#8A2BE2"
            transparent
            opacity={0.2}
            side={THREE.BackSide}
          />
        </mesh>
        {/* 能量环 */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.8, 2.2, 64]} />
          <meshBasicMaterial
            color="#00FFFF"
            transparent
            opacity={0.6}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh rotation={[Math.PI / 3, Math.PI / 4, 0]}>
          <ringGeometry args={[2.0, 2.3, 64]} />
          <meshBasicMaterial
            color="#9370DB"
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
          />
        </mesh>
      </Float>
    </group>
  );
};

// --- Main Scene Experience ---
const Experience = ({
  sceneState,
  rotationSpeed,
  rotationSpeedVertical,
  onPhotoSelect,
  focusPoint,
  pinchActive
}: {
  sceneState: 'CHAOS' | 'FORMED',
  rotationSpeed: number,
  rotationSpeedVertical: number,
  onPhotoSelect: (path: string, borderColor?: string, isClick?: boolean) => void,
  focusPoint?: { x: number; y: number } | null,
  pinchActive?: boolean
}) => {
  const controlsRef = useRef<any>(null);
  const sceneGroupRef = useRef<THREE.Group>(null);
  
  // 平滑插值的目标速度
  const smoothSpeedX = useRef(0);
  const smoothSpeedY = useRef(0);
  // 惯性速度
  const velocityX = useRef(0);
  const velocityY = useRef(0);

  // Auto-spin when dispersed; gesture can add/subtract spin (只允许水平旋转)
  useFrame((_, delta) => {
    if (sceneGroupRef.current) {
      if (sceneState === 'CHAOS') {
        // 平滑插值手势输入 - 更丝滑的过渡
        const lerpFactor = 0.12; // 提高响应速度
        smoothSpeedX.current = MathUtils.lerp(smoothSpeedX.current, rotationSpeed, lerpFactor);
        // 禁用垂直旋转
        // smoothSpeedY.current = MathUtils.lerp(smoothSpeedY.current, rotationSpeedVertical, lerpFactor);
        
        // 计算目标速度 - 只有水平方向
        const targetVelX = smoothSpeedX.current * 8;
        
        // 惯性系统 - 缓慢衰减
        const friction = 0.96; // 摩擦力，越接近1惯性越大
        const acceleration = 0.2; // 提高加速度
        
        // 如果有手势输入，加速到目标速度；否则惯性衰减
        if (Math.abs(rotationSpeed) > 0.003) {
          velocityX.current = MathUtils.lerp(velocityX.current, targetVelX, acceleration);
        } else {
          velocityX.current *= friction;
        }
        
        // 只允许水平自转
        const baseSpin = 0.05; // 降低基础自转，让手势控制更突出
        sceneGroupRef.current.rotation.y += (baseSpin + velocityX.current) * delta;
        // 禁用垂直旋转
        // sceneGroupRef.current.rotation.x += velocityY.current * delta;
      }
    }
  });

  // Keep formed state facing front
  useEffect(() => {
    if (sceneState === 'FORMED' && sceneGroupRef.current) {
      sceneGroupRef.current.rotation.set(0, 0, 0);
    }
  }, [sceneState]);

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 320]} fov={50} near={0.1} far={2000} />
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableRotate={false}
        enableZoom={true}
        minDistance={120}
        maxDistance={500}
        autoRotate={false}
        maxPolarAngle={Math.PI / 1.7}
      />

      <color attach="background" args={['#000000']} />
      
      {/* Shader 宇宙银河背景 - 暂时禁用，性能问题 */}
      {/* {sceneState === 'CHAOS' && <CosmicBackground />} */}
      
      {/* Shader 星空 - 只在CHAOS状态显示 */}
      {sceneState === 'CHAOS' && <ShaderStarField count={10000} />}
      
      {/* 雾效 - CHAOS状态下减弱，避免遮挡银河 */}
      <fog attach="fog" args={[sceneState === 'CHAOS' ? '#000005' : '#0a0520', sceneState === 'CHAOS' ? 800 : 400, sceneState === 'CHAOS' ? 2000 : 1500]} />
      
      {/* 静态星空背景 - 减少数量避免性能问题 */}
      <Stars radius={400} depth={200} count={sceneState === 'CHAOS' ? 5000 : 8000} factor={8} saturation={0.4} fade speed={0.15} />
      <Stars radius={700} depth={350} count={sceneState === 'CHAOS' ? 3000 : 5000} factor={10} saturation={0.35} fade speed={0.1} />
      <Stars radius={1000} depth={450} count={sceneState === 'CHAOS' ? 2000 : 3000} factor={12} saturation={0.3} fade speed={0.08} />
      
      {/* 远景微弱星星 - 只在CHAOS状态显示，减少数量 */}
      {sceneState === 'CHAOS' && (
        <>
          <Stars radius={1300} depth={600} count={2000} factor={15} saturation={0.2} fade speed={0.05} />
        </>
      )}
      
      {/* 流动星空 - 动态层，只在FORMED状态显示 */}
      {sceneState === 'FORMED' && <FlowingStars />}
      
      {/* 宇宙微尘 - 两种状态都显示，增加星空感 */}
      <CosmicDust />
      
      {/* 散开时的宇宙粒子爆炸效果 */}
      <DisperseParticles state={sceneState} />
      
      {/* 银河背景 - 流动星尘，只在散开态显示 */}
      <MilkyWayGalaxy state={sceneState} />
      
      {/* 星云背景层 - 禁用，会出现方块 */}
      {/* {sceneState === 'FORMED' && <NebulaBackground />} */}
      
      {/* 流星效果 - 只在散开态显示 */}
      <ShootingStars state={sceneState} />
      
      {/* 动态环绕星球 - 已移除 */}
      {/* <DynamicOrbitingPlanets state={sceneState} /> */}

      {/* 深空感光照系统 - 增强紫色氛围 */}
      <ambientLight intensity={sceneState === 'CHAOS' ? 0.3 : 0.8} color="#604070" />
      
      {/* 半球光 - 模拟太空中的紫色散射 */}
      <hemisphereLight 
        intensity={sceneState === 'CHAOS' ? 0.4 : 0.5} 
        color="#8070b0" 
        groundColor="#301040" 
      />
      
      {/* 主光源 - 左上方，带有淡紫色调 */}
      <directionalLight 
        position={[-150, 100, 100]} 
        intensity={sceneState === 'CHAOS' ? 2.0 : 2.3} 
        color="#f0e8ff" 
      />
      
      {/* 紫色背光 - 右侧，营造深邃感 */}
      <directionalLight 
        position={[100, 50, 80]} 
        intensity={1.2} 
        color="#c0a0ff" 
      />
      
      {/* 紫色侧光 - 增强氛围 */}
      <directionalLight 
        position={[0, -100, -200]} 
        intensity={0.8} 
        color="#6040a0" 
      />
      
      {/* 中心恒星光 - 只在CHAOS状态显示，增强深空感 */}
      {sceneState === 'CHAOS' && (
        <>
          <pointLight position={[0, 0, 0]} intensity={1200} color="#ffffff" distance={4500} decay={1.5} />
          {/* 紫色环境光晕 */}
          <pointLight position={[0, 0, 0]} intensity={800} color="#8060ff" distance={2000} decay={2} />
        </>
      )}
      {/* 原有点光源 - 只在FORMED状态显示 */}
      {sceneState === 'FORMED' && (
        <>
          <pointLight position={[80, 80, 80]} intensity={200} color="#FFFFFF" />
          <pointLight position={[-80, 30, -80]} intensity={150} color="#00FFFF" />
          <pointLight position={[0, -60, 30]} intensity={100} color="#8A2BE2" />
          <pointLight position={[0, 60, 60]} intensity={180} color="#FFFFFF" />
        </>
      )}

      {/* 闪电效果 - 独立于旋转组，只淡入淡出不旋转 */}
      <BoltGlow state={sceneState} />
      <LightningSparks state={sceneState} />
      <BoltFill state={sceneState} />
      <TopStar state={sceneState} />
      
      <group ref={sceneGroupRef} position={[0, 0, 0]}>
        <Foliage state={sceneState} />
        <Suspense fallback={null}>
           <PlanetOrnaments
             state={sceneState}
             onSelect={onPhotoSelect}
             focusPoint={focusPoint}
             pinchActive={pinchActive}
           />
           <FairyLights state={sceneState} />
        </Suspense>
        {/* InnerPlanets 已移除 - 避免散开态中心光点 */}
        {/* <InnerPlanets state={sceneState} /> */}
        {/* CosmicNebula removed to eliminate floating cubes */}
        {/* Sparkles 只在FORMED状态显示 */}
        {sceneState === 'FORMED' && (
          <>
            <Sparkles count={1500} scale={150} size={18} speed={0} opacity={0.5} color="#8A2BE2" />
            <Sparkles count={1000} scale={130} size={12} speed={0} opacity={0.4} color="#00FFFF" />
            <Sparkles count={800} scale={100} size={8} speed={0} opacity={0.35} color="#87CEEB" />
          </>
        )}
      </group>

      <EffectComposer>
        <Bloom luminanceThreshold={0.6} luminanceSmoothing={0.2} intensity={1.8} radius={0.5} mipmapBlur />
        <Vignette eskil={false} offset={0.25} darkness={0.6} />
      </EffectComposer>
    </>
  );
};

// --- Gesture Controller ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GestureController = ({ onGesture, onMove, onMoveVertical, onStatus, debugMode, onPoint, onPinch }: any) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pinchRef = useRef(false);

  useEffect(() => {
    let gestureRecognizer: GestureRecognizer;
    let requestRef: number;

    const setup = async () => {
      onStatus("DOWNLOADING AI...");
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
        gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 1
        });
        onStatus("REQUESTING CAMERA...");
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            onStatus("AI READY: SHOW HAND");
            predictWebcam();
          }
        } else {
            onStatus("ERROR: CAMERA PERMISSION DENIED");
        }
      } catch (err: any) {
        onStatus(`ERROR: ${err.message || 'MODEL FAILED'}`);
      }
    };

    const predictWebcam = () => {
      if (gestureRecognizer && videoRef.current && canvasRef.current) {
        if (videoRef.current.videoWidth > 0) {
            const results = gestureRecognizer.recognizeForVideo(videoRef.current, Date.now());
            const ctx = canvasRef.current.getContext("2d");
            if (ctx && debugMode) {
                ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                canvasRef.current.width = videoRef.current.videoWidth; canvasRef.current.height = videoRef.current.videoHeight;
                if (results.landmarks) for (const landmarks of results.landmarks) {
                        const drawingUtils = new DrawingUtils(ctx);
                        drawingUtils.drawConnectors(landmarks, GestureRecognizer.HAND_CONNECTIONS, { color: "#FFD700", lineWidth: 2 });
                        drawingUtils.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 1 });
                }
            } else if (ctx && !debugMode) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

            // 手势识别 - 张开手掌/握拳切换状态
            if (results.gestures.length > 0) {
              const name = results.gestures[0][0].categoryName; 
              const score = results.gestures[0][0].score;
              if (score > 0.4) {
                if (name === "Open_Palm") onGesture("CHAOS"); 
                if (name === "Closed_Fist") onGesture("FORMED");
                if (debugMode) onStatus(`DETECTED: ${name}`);
              }
            }
            
            // 手部位置追踪 - 独立于手势识别，只要检测到手就追踪
            if (results.landmarks && results.landmarks.length > 0) {
              const hand = results.landmarks[0][0];
              // 横向速度 - 手在左右移动（增大系数，降低阈值）
              const speedX = (0.5 - hand.x) * 0.35;
              onMove(Math.abs(speedX) > 0.005 ? speedX : 0);
              // 纵向速度 - 手在上下移动
              const speedY = (0.5 - hand.y) * 0.35;
              onMoveVertical?.(Math.abs(speedY) > 0.005 ? speedY : 0);
              onPoint?.({ x: hand.x, y: hand.y });
              
              // 捏合检测
              const thumbTip = results.landmarks[0][4];
              const indexTip = results.landmarks[0][8];
              const dx = thumbTip.x - indexTip.x;
              const dy = thumbTip.y - indexTip.y;
              const dz = (thumbTip.z || 0) - (indexTip.z || 0);
              const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
              const isPinch = dist < 0.08;
              if (isPinch && !pinchRef.current) { pinchRef.current = true; onPinch?.(true); }
              else if (!isPinch && pinchRef.current) { pinchRef.current = false; onPinch?.(false); }
              
              if (debugMode && results.gestures.length === 0) onStatus("TRACKING HAND");
            } else { 
              onMove(0); 
              onMoveVertical?.(0); 
              onPoint?.(null); 
              if (pinchRef.current) { pinchRef.current = false; onPinch?.(false); } 
              if (debugMode) onStatus("AI READY: NO HAND"); 
            }
        }
        requestRef = requestAnimationFrame(predictWebcam);
      }
    };
    setup();
    return () => cancelAnimationFrame(requestRef);
  }, [onGesture, onMove, onStatus, debugMode]);

  return (
    <>
      <video ref={videoRef} style={{ opacity: debugMode ? 0.6 : 0, position: 'fixed', top: 0, right: 0, width: debugMode ? '320px' : '1px', zIndex: debugMode ? 100 : -1, pointerEvents: 'none', transform: 'scaleX(-1)' }} playsInline muted autoPlay />
      <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, right: 0, width: debugMode ? '320px' : '1px', height: debugMode ? 'auto' : '1px', zIndex: debugMode ? 101 : -1, pointerEvents: 'none', transform: 'scaleX(-1)' }} />
    </>
  );
};

// --- Mouse Controller ---
const MouseController = ({ 
  onMove, 
  onMoveVertical, 
  sceneState 
}: { 
  onMove: (speed: number) => void; 
  onMoveVertical: (speed: number) => void;
  sceneState: 'CHAOS' | 'FORMED';
}) => {
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (sceneState !== 'CHAOS') return;
      isDragging.current = true;
      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || sceneState !== 'CHAOS') return;
      
      const deltaX = e.clientX - lastPos.current.x;
      const deltaY = e.clientY - lastPos.current.y;
      
      // 将鼠标移动转换为旋转速度
      const sensitivity = 0.008;
      onMove(deltaX * sensitivity);
      onMoveVertical(-deltaY * sensitivity);
      
      lastPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      // 停止时重置速度为0，让惯性系统接管
      onMove(0);
      onMoveVertical(0);
    };

    const handleMouseLeave = () => {
      if (isDragging.current) {
        isDragging.current = false;
        onMove(0);
        onMoveVertical(0);
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [sceneState, onMove, onMoveVertical]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 2,
        cursor: sceneState === 'CHAOS' ? 'grab' : 'default',
        pointerEvents: sceneState === 'CHAOS' ? 'auto' : 'none',
      }}
    />
  );
};

// --- App Entry ---
export default function GrandTreeApp() {
  const [sceneState, setSceneState] = useState<'CHAOS' | 'FORMED'>('FORMED'); // 初始即为合并后的闪电形态
  const [rotationSpeed, setRotationSpeed] = useState(0);
  const [rotationSpeedVertical, setRotationSpeedVertical] = useState(0);
  const [mouseRotationSpeed, setMouseRotationSpeed] = useState(0);
  const [mouseRotationSpeedVertical, setMouseRotationSpeedVertical] = useState(0);
  const [aiStatus, setAiStatus] = useState("INITIALIZING...");
  const [debugMode, setDebugMode] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<{ path: string, message: string, borderColor: string } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [pinchActive, setPinchActive] = useState(false);
  const [isClickTriggered, setIsClickTriggered] = useState(false); // 新增：跟踪是否是点击触发的预览

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (sceneState === 'FORMED') setFocusPoint(null);
    if (sceneState === 'FORMED') {
      setPinchActive(false);
    }
  }, [sceneState]);

  // 图片弹出后一直显示，直到用户点击屏幕才关闭
  // 不再因为松开捏合手势而自动关闭

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
      <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}>
        <Canvas dpr={[1, 2]} gl={{ toneMapping: THREE.ReinhardToneMapping }} shadows>
            <Experience
              sceneState={sceneState}
              rotationSpeed={rotationSpeed + mouseRotationSpeed}
              rotationSpeedVertical={rotationSpeedVertical + mouseRotationSpeedVertical}
              focusPoint={focusPoint}
              pinchActive={pinchActive}
            onPhotoSelect={(path: string, borderColor?: string, isClick?: boolean) => {
                const message = NEW_YEAR_GREETINGS[Math.floor(Math.random() * NEW_YEAR_GREETINGS.length)];
                setSelectedPhoto({ path, message, borderColor: borderColor ?? '#fff' });
                setIsClickTriggered(isClick ?? false); // 设置是否是点击触发
              }}
            />
        </Canvas>
      </div>
      
      {/* 鼠标控制器 - 在CHAOS状态下启用 */}
      <MouseController
        onMove={setMouseRotationSpeed}
        onMoveVertical={setMouseRotationSpeedVertical}
        sceneState={sceneState}
      />
      
      <GestureController
        onGesture={setSceneState}
        onMove={setRotationSpeed}
        onMoveVertical={setRotationSpeedVertical}
        onStatus={setAiStatus}
        debugMode={debugMode}
        onPoint={setFocusPoint}
        onPinch={(active: boolean) => setPinchActive(active)}
      />



      {/* UI - Buttons */}
      <div style={{ position: 'absolute', bottom: isMobile ? '20px' : '30px', right: isMobile ? '20px' : '40px', zIndex: 10, display: 'flex', gap: isMobile ? '8px' : '10px', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', width: isMobile ? '180px' : 'auto' }}>
        <button onClick={() => setDebugMode(!debugMode)} style={{ width: isMobile ? '100%' : 'auto', padding: '12px 15px', backgroundColor: debugMode ? '#FFD700' : 'rgba(0,0,0,0.5)', border: '1px solid #FFD700', color: debugMode ? '#000' : '#FFD700', fontFamily: 'sans-serif', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
           {debugMode ? 'HIDE DEBUG' : '🛠 DEBUG'}
        </button>
        <button onClick={() => setSceneState(s => s === 'CHAOS' ? 'FORMED' : 'CHAOS')} style={{ width: isMobile ? '100%' : 'auto', padding: '12px 30px', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255, 215, 0, 0.5)', color: '#FFD700', fontFamily: 'serif', fontSize: '14px', fontWeight: 'bold', letterSpacing: '3px', textTransform: 'uppercase', cursor: 'pointer', backdropFilter: 'blur(4px)' }}>
           {sceneState === 'CHAOS' ? 'Assemble Tree' : 'Disperse'}
        </button>
      </div>

      {/* UI - Photo Preview */}
      {selectedPhoto && (
        <div onClick={() => { setSelectedPhoto(null); setIsClickTriggered(false); }} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 'min(94vw, 560px)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: selectedPhoto.borderColor, borderRadius: '18px', padding: '16px', boxShadow: '0 24px 70px rgba(0,0,0,0.65)' }}>
              <div style={{ borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
                <img
                  src={selectedPhoto.path}
                  alt="Selected memory"
                  style={{
                    display: 'block',
                    maxWidth: 'min(88vw, 528px)',
                    maxHeight: '65vh',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain'
                  }}
                />
              </div>
              <div style={{ marginTop: '14px', padding: '10px 8px 0', textAlign: 'center', color: '#222', fontSize: '16px', fontWeight: 600, letterSpacing: '0.5px' }}>
                {selectedPhoto.message}
              </div>
            </div>
            {/* 保存和分享按钮 */}
            <div style={{ display: 'flex', gap: '40px', justifyContent: 'center' }}>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const response = await fetch(selectedPhoto.path);
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `memory-${Date.now()}.jpg`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error('保存图片失败:', err);
                  }
                }}
                style={{
                  flex: 1,
                  maxWidth: '160px',
                  padding: '14px 24px',
                  backgroundColor: 'rgba(255, 215, 0, 0.9)',
                  border: 'none',
                  borderRadius: '12px',
                  color: '#222',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(255, 215, 0, 0.3)',
                  transition: 'all 0.2s ease'
                }}
              >
                保存寄语
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // 分享功能暂未实现
                  console.log('分享功能待实现');
                }}
                style={{
                  flex: 1,
                  maxWidth: '160px',
                  padding: '14px 24px',
                  backgroundColor: 'rgba(255, 255, 255, 0.15)',
                  border: '1px solid rgba(255, 215, 0, 0.5)',
                  borderRadius: '12px',
                  color: '#FFD700',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backdropFilter: 'blur(4px)',
                  transition: 'all 0.2s ease'
                }}
              >
                分享寄语
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UI - AI Status */}
      <div style={{ position: 'absolute', top: '32px', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', zIndex: 10 }}>
        <div style={{ color: '#FFD700', fontSize: '22px', letterSpacing: '1.5px', fontWeight: 'bold', textShadow: '0 0 10px rgba(255,215,0,0.6)' }}>
          光子工作室祝大家新年快乐！
        </div>
        <div style={{ color: '#FFD700', fontSize: '22px', letterSpacing: '1.5px', fontWeight: 'bold', textShadow: '0 0 10px rgba(255,215,0,0.6)' }}>
          感谢每一个闪闪发光的你
        </div>
        <div style={{ color: aiStatus.includes('ERROR') ? '#FF0000' : 'rgba(255, 215, 0, 0.4)', fontSize: '10px', letterSpacing: '2px', background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '4px' }}>
          {aiStatus}
        </div>
      </div>
    </div>
  );
}