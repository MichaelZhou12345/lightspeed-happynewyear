import { useState, useMemo, useRef, useEffect, Suspense } from 'react';
import { Canvas, useFrame, extend, useThree } from '@react-three/fiber';
import {
  OrbitControls,
  Environment,
  PerspectiveCamera,
  shaderMaterial,
  Float,
  Stars,
  Sparkles,
  Html
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
    warmLight: '#FFD54F',
    lights: ['#00FFFF', '#FF00FF', '#8A2BE2', '#FFFFFF'], // 次元能量色
    borders: ['#FFFAF0', '#F0E68C', '#E6E6FA', '#FFB6C1', '#98FB98', '#87CEFA', '#FFDAB9'],
    giftColors: ['#B0C4DE', '#C0C0C0', '#D9D9D9', '#ECEFF1', '#FFD700'],
    candyColors: ['#ECEFF1', '#D9D9D9']
  },
  counts: {
    foliage: 18000,           // 增加粒子密度
    ornamentsChaos: 450,      // 散开态星球数量 - 大幅增加形成星球群落
    ornamentsFormed: 12,      // 聚合态星球数量（闪电肚子里的精致宇宙）
    elementsChaos: 150,       // 散开态装饰
    elementsFormed: 0,
    lightsChaos: 300,
    lightsFormed: 0,
    glowDots: 800,            // 增加发光点
    fillDots: 8000,           // 大量星尘填充宇宙
    innerPlanets: 18,         // 闪电内部精致星球
    nebulaParticles: 3000,    // 星云粒子
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
  
  // Hide green particle cloud in formed state
  if (state === 'FORMED') return null;
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
// NASA天文摄影风格行星纹理生成器 - 真实昼夜分界、大面积柔和光照、暗部保留纹理
const createCinematicPlanetTexture = (
  baseHue: number, 
  type: 'gas_giant' | 'ice_giant' | 'rocky' | 'lava' | 'ocean' | 'desert',
  size: number,
  seed: number = Math.random() * 10000
) => {
  const resolution = Math.min(512, Math.max(256, Math.floor(size * 80)));
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
  
  const centerX = resolution / 2;
  const centerY = resolution / 2;
  const radius = resolution / 2;
  
  // ========== NASA风格光照系统 ==========
  // 光照方向：左上方太阳光，角度更平缓以产生大面积昼面
  const lightDir = { x: -0.55, y: -0.45, z: 0.70 };
  const lightLen = Math.sqrt(lightDir.x ** 2 + lightDir.y ** 2 + lightDir.z ** 2);
  lightDir.x /= lightLen;
  lightDir.y /= lightLen;
  lightDir.z /= lightLen;
  
  // 根据行星类型定义颜色调色板 - 提升基础亮度40%
  const getColorPalette = (planetType: typeof type, hue: number) => {
    // 亮度提升系数
    const brightnessBoost = 1.4;
    const clampColor = (v: number) => Math.min(255, v * brightnessBoost);
    
    switch (planetType) {
      case 'gas_giant':
        // 类木星 - 棕橙黄条纹，更明亮
        return {
          primary: { r: clampColor(190 + seededRandom(1) * 40), g: clampColor(155 + seededRandom(2) * 35), b: clampColor(95 + seededRandom(3) * 30) },
          secondary: { r: clampColor(215 + seededRandom(4) * 30), g: clampColor(175 + seededRandom(5) * 30), b: clampColor(115 + seededRandom(6) * 25) },
          tertiary: { r: clampColor(160 + seededRandom(7) * 35), g: clampColor(120 + seededRandom(8) * 25), b: clampColor(80 + seededRandom(9) * 20) },
          highlight: { r: 255, g: 245, b: 220 },
          shadow: { r: 120, g: 85, b: 55 } // 暗部更亮，保留细节
        };
      case 'ice_giant':
        // 类海王星/天王星 - 蓝青色，更明亮
        return {
          primary: { r: clampColor(90 + seededRandom(1) * 35), g: clampColor(155 + seededRandom(2) * 45), b: clampColor(200 + seededRandom(3) * 40) },
          secondary: { r: clampColor(110 + seededRandom(4) * 25), g: clampColor(175 + seededRandom(5) * 35), b: clampColor(220 + seededRandom(6) * 30) },
          tertiary: { r: clampColor(70 + seededRandom(7) * 25), g: clampColor(125 + seededRandom(8) * 35), b: clampColor(175 + seededRandom(9) * 35) },
          highlight: { r: 230, g: 245, b: 255 },
          shadow: { r: 60, g: 100, b: 145 } // 暗部蓝色调，保留纹理
        };
      case 'rocky':
        // 岩石行星 - 灰棕色，更明亮
        return {
          primary: { r: clampColor(145 + seededRandom(1) * 45), g: clampColor(135 + seededRandom(2) * 40), b: clampColor(125 + seededRandom(3) * 35) },
          secondary: { r: clampColor(165 + seededRandom(4) * 35), g: clampColor(155 + seededRandom(5) * 30), b: clampColor(145 + seededRandom(6) * 25) },
          tertiary: { r: clampColor(115 + seededRandom(7) * 35), g: clampColor(105 + seededRandom(8) * 30), b: clampColor(95 + seededRandom(9) * 25) },
          highlight: { r: 235, g: 230, b: 225 },
          shadow: { r: 85, g: 80, b: 75 } // 暗部保留岩石纹理
        };
      case 'lava':
        // 熔岩行星 - 暗红黑带发光裂缝
        return {
          primary: { r: clampColor(85 + seededRandom(1) * 25), g: clampColor(50 + seededRandom(2) * 20), b: clampColor(40 + seededRandom(3) * 15) },
          secondary: { r: clampColor(105 + seededRandom(4) * 25), g: clampColor(60 + seededRandom(5) * 20), b: clampColor(45 + seededRandom(6) * 15) },
          tertiary: { r: clampColor(65 + seededRandom(7) * 20), g: clampColor(40 + seededRandom(8) * 15), b: clampColor(30 + seededRandom(9) * 12) },
          highlight: { r: 255, g: 160, b: 80 }, // 熔岩发光更亮
          shadow: { r: 55, g: 35, b: 28 }
        };
      case 'ocean':
        // 海洋行星 - 深蓝绿色，更明亮
        return {
          primary: { r: clampColor(60 + seededRandom(1) * 35), g: clampColor(105 + seededRandom(2) * 45), b: clampColor(160 + seededRandom(3) * 45) },
          secondary: { r: clampColor(80 + seededRandom(4) * 30), g: clampColor(130 + seededRandom(5) * 40), b: clampColor(180 + seededRandom(6) * 40) },
          tertiary: { r: clampColor(50 + seededRandom(7) * 25), g: clampColor(85 + seededRandom(8) * 35), b: clampColor(130 + seededRandom(9) * 35) },
          highlight: { r: 210, g: 240, b: 255 },
          shadow: { r: 45, g: 75, b: 115 }
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
  
  for (let py = 0; py < resolution; py++) {
    for (let px = 0; px < resolution; px++) {
      const i = (py * resolution + px) * 4;
      
      const dx = (px - centerX) / radius;
      const dy = (py - centerY) / radius;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // 球体外部透明
      if (dist > 1) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
        continue;
      }
      
      // 球面法线计算
      const nz = Math.sqrt(Math.max(0, 1 - dist * dist));
      const nx = dx;
      const ny = dy;
      
      // 球面UV坐标（用于纹理映射）
      const theta = Math.atan2(ny, nx);
      const phi = Math.acos(nz);
      const u = (theta + Math.PI) / (2 * Math.PI);
      const v = phi / Math.PI;
      
      // ========== NASA风格真实物理光照 ==========
      // 兰伯特漫反射 - 产生大面积柔和的昼面
      let diffuse = -(nx * lightDir.x + ny * lightDir.y + nz * lightDir.z);
      diffuse = Math.max(0, diffuse);
      
      // 柔化光照过渡（使用更平滑的曲线，避免硬边）
      // 使用 smoothstep 风格的过渡
      diffuse = diffuse * diffuse * (3 - 2 * diffuse); // smoothstep
      diffuse = Math.pow(diffuse, 0.6); // 进一步柔化
      
      // ========== 关键：大面积半球光照 ==========
      // 昼面占据约半个球体，亮度柔和自然过渡
      // 使用半球环境光确保整体明亮
      const hemisphereLight = 0.45 + nz * 0.15; // 基础环境光大幅提升
      
      // 边缘光（菲涅尔效应）- 轻微的边缘增亮
      const fresnel = Math.pow(1 - nz, 2.5) * 0.12;
      
      // ========== 关键：暗面保留纹理可见 ==========
      // 最终光照强度 - 确保暗面也有足够亮度看到细节
      // 暗面最低亮度提升到35%，确保纹理可见
      let lighting = diffuse * 0.55 + hemisphereLight + fresnel;
      lighting = Math.max(0.35, Math.min(1.15, lighting)); // 最暗35%，允许略微过曝
      
      // ========== 行星表面纹理 ==========
      let r: number, g: number, b: number;
      
      if (type === 'gas_giant') {
        // 气态巨行星 - 柔和水平条纹
        const bandY = v * resolution;
        const bandFreq = 0.03 + seededRandom(10) * 0.015;
        const bandNoise = Math.sin(bandY * bandFreq) * 0.4 + 
                          Math.sin(bandY * bandFreq * 2.1 + u * 6) * 0.2 +
                          Math.sin(bandY * bandFreq * 3.5 + u * 3) * 0.1;
        
        // 柔和的大红斑（可选）
        const spotU = 0.3 + seededRandom(11) * 0.4;
        const spotV = 0.4 + seededRandom(12) * 0.2;
        const spotDist = Math.sqrt((u - spotU) ** 2 + (v - spotV) ** 2);
        const spotInfluence = spotDist < 0.1 ? Math.pow(1 - spotDist / 0.1, 2) * 0.3 : 0;
        
        // 条纹颜色混合 - 更柔和
        const bandMix = (bandNoise + 0.7) / 1.4; // 压缩范围
        r = palette.primary.r * (1 - bandMix) + palette.secondary.r * bandMix;
        g = palette.primary.g * (1 - bandMix) + palette.secondary.g * bandMix;
        b = palette.primary.b * (1 - bandMix) + palette.secondary.b * bandMix;
        
        // 柔和的大红斑
        if (spotInfluence > 0) {
          r = r * (1 - spotInfluence) + 210 * spotInfluence;
          g = g * (1 - spotInfluence) + 150 * spotInfluence;
          b = b * (1 - spotInfluence) + 120 * spotInfluence;
        }
        
        // 细节噪声 - 更柔和
        const detail = fbm(px * 2, py * 0.5, 4) * 10;
        r += detail;
        g += detail * 0.9;
        b += detail * 0.7;
        
      } else if (type === 'ice_giant') {
        // 冰巨星 - 柔和的蓝色渐变
        const cloudLayer = fbm(px, py, 4, 0.5) * 0.4 + 0.5;
        const atmosphereBand = Math.sin(v * Math.PI * 6 + fbm(px * 0.4, py * 0.4, 3) * 1.5) * 0.1;
        
        // 柔和颜色渐变
        const gradientMix = v * 0.4 + cloudLayer * 0.3;
        r = palette.primary.r * (1 - gradientMix) + palette.secondary.r * gradientMix;
        g = palette.primary.g * (1 - gradientMix) + palette.secondary.g * gradientMix;
        b = palette.primary.b * (1 - gradientMix) + palette.secondary.b * gradientMix;
        
        // 柔和大气带
        r += atmosphereBand * 15;
        g += atmosphereBand * 18;
        b += atmosphereBand * 22;
        
        // 柔和云层高光
        const cloudHighlight = Math.pow(cloudLayer, 2) * 15;
        r += cloudHighlight;
        g += cloudHighlight;
        b += cloudHighlight;
        
      } else if (type === 'rocky') {
        // 岩石行星 - 柔和的高地/低地变化，淡化陨石坑
        const surfaceRough = fbm(px, py, 4, 0.5);
        const highlands = fbm(px * 0.5, py * 0.5, 3, 0.5);
        
        // 基础岩石颜色 - 柔和的高地/低地变化
        const rockMix = surfaceRough * 0.25 + highlands * 0.25 + 0.25;
        r = palette.primary.r * (1 - rockMix) + palette.secondary.r * rockMix;
        g = palette.primary.g * (1 - rockMix) + palette.secondary.g * rockMix;
        b = palette.primary.b * (1 - rockMix) + palette.secondary.b * rockMix;
        
        // 高地轻微变亮
        if (highlands > 0.55) {
          const highlandBoost = (highlands - 0.55) * 20;
          r += highlandBoost;
          g += highlandBoost;
          b += highlandBoost;
        }
        
        // 表面轻微纹理变化（非常柔和）
        const roughness = (seededRandom(px * py) - 0.5) * 8;
        r += roughness;
        g += roughness;
        b += roughness;
        
      } else if (type === 'lava') {
        // 熔岩行星 - 柔和暗色表面 + 发光裂缝
        const crackPattern = fbm(px * 1.8, py * 1.8, 4, 0.5);
        const lavaRiver = Math.sin(px * 0.04 + fbm(px, py, 2) * 2) * 0.5 + 0.5;
        
        // 暗色基底 - 更亮一些
        r = palette.primary.r + 35;
        g = palette.primary.g + 20;
        b = palette.primary.b + 15;
        
        // 熔岩裂缝发光 - 柔和
        const crackGlow = crackPattern > 0.6 ? Math.pow((crackPattern - 0.6) / 0.4, 1.5) : 0;
        const riverGlow = lavaRiver > 0.75 ? (lavaRiver - 0.75) / 0.25 * 0.3 : 0;
        const totalGlow = Math.max(crackGlow * 0.6, riverGlow);
        
        r += totalGlow * (palette.highlight.r - palette.primary.r);
        g += totalGlow * (palette.highlight.g - palette.primary.g);
        b += totalGlow * (palette.highlight.b - palette.primary.b);
        
        // 柔和表面纹理
        const surfaceNoise = (seededRandom(px + py * resolution) - 0.5) * 8;
        r += surfaceNoise;
        g += surfaceNoise * 0.6;
        b += surfaceNoise * 0.4;
        
      } else if (type === 'ocean') {
        // 海洋行星 - 柔和蓝色海洋 + 云层
        const oceanDepth = fbm(px, py, 4, 0.5);
        const cloudCover = fbm(px * 0.6 + 100, py * 0.6 + 100, 3, 0.5);
        const landMass = fbm(px * 1.1, py * 1.1, 4, 0.5);
        
        // 海洋基底
        r = palette.primary.r;
        g = palette.primary.g;
        b = palette.primary.b;
        
        // 柔和海洋深度变化
        const depthVariation = oceanDepth * 20;
        r += depthVariation * 0.3;
        g += depthVariation * 0.5;
        b += depthVariation * 0.8;
        
        // 柔和陆地（绿棕色）
        if (landMass > 0.58) {
          const landInfluence = (landMass - 0.58) / 0.42 * 0.5;
          r = r * (1 - landInfluence) + 130 * landInfluence;
          g = g * (1 - landInfluence) + 155 * landInfluence;
          b = b * (1 - landInfluence) + 100 * landInfluence;
        }
        
        // 柔和云层（白色覆盖）
        if (cloudCover > 0.55) {
          const cloudInfluence = (cloudCover - 0.55) / 0.45 * 0.35;
          r = r * (1 - cloudInfluence) + 250 * cloudInfluence;
          g = g * (1 - cloudInfluence) + 252 * cloudInfluence;
          b = b * (1 - cloudInfluence) + 255 * cloudInfluence;
        }
        
      } else if (type === 'desert') {
        // 沙漠行星 - 柔和沙丘纹理
        const dunePattern = fbm(px * 0.7, py * 1.2, 3, 0.5);
        const sandRipple = Math.sin(px * 0.08 + fbm(px, py, 2) * 3) * 0.5 + 0.5;
        
        // 柔和沙丘颜色
        const duneMix = dunePattern * 0.35 + 0.35;
        r = palette.primary.r * (1 - duneMix) + palette.secondary.r * duneMix;
        g = palette.primary.g * (1 - duneMix) + palette.secondary.g * duneMix;
        b = palette.primary.b * (1 - duneMix) + palette.secondary.b * duneMix;
        
        // 柔和沙纹
        const rippleEffect = sandRipple * 10;
        r += rippleEffect;
        g += rippleEffect * 0.9;
        b += rippleEffect * 0.7;
      } else {
        r = palette.primary.r;
        g = palette.primary.g;
        b = palette.primary.b;
      }
      
      // ========== NASA风格光照应用 ==========
      // 大面积柔和高光区域（占据约半个球体）
      const highlightZone = Math.max(0, diffuse - 0.3) / 0.7; // 更大的高光区域
      const highlightStrength = Math.pow(highlightZone, 1.5) * 0.35;
      
      // 应用主光照 - 昼面亮部柔和
      r = r * lighting + palette.highlight.r * highlightStrength;
      g = g * lighting + palette.highlight.g * highlightStrength;
      b = b * lighting + palette.highlight.b * highlightStrength;
      
      // ========== 边缘大气光晕（非常轻微）==========
      if (dist > 0.88) {
        const edgeFade = (dist - 0.88) / 0.12;
        const atmosphereColor = type === 'lava' 
          ? { r: 255, g: 120, b: 70 }
          : type === 'ice_giant' || type === 'ocean'
          ? { r: 170, g: 210, b: 255 }
          : { r: 190, g: 185, b: 230 };
        
        const atmosphereStrength = edgeFade * 0.2;
        r = r * (1 - atmosphereStrength) + atmosphereColor.r * atmosphereStrength;
        g = g * (1 - atmosphereStrength) + atmosphereColor.g * atmosphereStrength;
        b = b * (1 - atmosphereStrength) + atmosphereColor.b * atmosphereStrength;
      }
      
      // 整体亮度提升40%的最终调整
      r *= 1.1;
      g *= 1.1;
      b *= 1.1;
      
      // 最终颜色限制
      data[i] = Math.max(0, Math.min(255, Math.round(r)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
      data[i + 3] = 255; // 完全不透明
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  const texture = new THREE.CanvasTexture(canvas);
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
  // 岩石行星（类水星/月球）- 灰棕色
  { hue: 30, type: 'rocky' as const, name: '水星型' },
  { hue: 25, type: 'rocky' as const, name: '月球型' },
  { hue: 20, type: 'rocky' as const, name: '小行星' },
  // 熔岩行星 - 暗红发光
  { hue: 10, type: 'lava' as const, name: '熔岩行星' },
  { hue: 5, type: 'lava' as const, name: '火山世界' },
  // 海洋行星（类地球）- 蓝绿色
  { hue: 200, type: 'ocean' as const, name: '地球型' },
  { hue: 190, type: 'ocean' as const, name: '水世界' },
  { hue: 210, type: 'ocean' as const, name: '超级地球' },
  // 沙漠行星（类火星）- 黄棕色
  { hue: 25, type: 'desert' as const, name: '火星型' },
  { hue: 35, type: 'desert' as const, name: '沙漠世界' },
  { hue: 40, type: 'desert' as const, name: '干旱行星' },
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

  // 生成真实天文行星数据
  const data = useMemo(() => {
    return new Array(maxCount).fill(0).map((_, i) => {
      // 根据索引分配不同层次的星球
      const depthLayer = i / maxCount; // 0-1 用于深度分层
      
      // 每颗星球独特的随机种子
      const planetSeed = i * 1000 + Math.random() * 100;
      
      // 聚合态位置 - 闪电内部精致分布
      const hollowRadius = 18;
      const hollowHeight = 50;
      const anchor = new THREE.Vector3(
        (Math.random() - 0.5) * hollowRadius,
        (Math.random() - 0.5) * hollowHeight,
        (Math.random() - 0.5) * 12
      );

      // 散开态位置 - 使用球面均匀分布，确保各个方向都有星球
      // 近处大星球，远处小星球
      let radius: number;
      let sizeMultiplier: number;
      
      if (depthLayer < 0.15) {
        // 前景层 - 近处大星球
        radius = 150 + Math.random() * 100;
        sizeMultiplier = 2.5 + Math.random() * 2.5;
      } else if (depthLayer < 0.4) {
        // 中景层 - 中等星球
        radius = 250 + Math.random() * 150;
        sizeMultiplier = 1.2 + Math.random() * 1.8;
      } else if (depthLayer < 0.7) {
        // 远景层 - 较小星球
        radius = 350 + Math.random() * 150;
        sizeMultiplier = 0.6 + Math.random() * 1.0;
      } else {
        // 最远层 - 小星球/卫星
        radius = 450 + Math.random() * 200;
        sizeMultiplier = 0.3 + Math.random() * 0.5;
      }
      
      // 使用球面坐标系实现均匀分布
      // theta: 水平角度 0-2π (绕Y轴)
      // phi: 垂直角度，使用 acos 确保均匀分布
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      // 转换为笛卡尔坐标 (标准球面坐标)
      const chaosPos = new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta),  // X
        radius * Math.cos(phi) * 0.7,               // Y (压扁，更符合屏幕比例)
        radius * Math.sin(phi) * Math.sin(theta)   // Z
      );

      // 选择星球类型 - 确保每颗星球类型不同
      const preset = CINEMATIC_PLANET_PRESETS[i % CINEMATIC_PLANET_PRESETS.length];
      const planetSize = sizeMultiplier;
      
      // 生成纹理（使用独特seed确保每颗星球纹理不同）
      const texture = createCinematicPlanetTexture(preset.hue, preset.type, planetSize, planetSeed);
      
      // 只有大型气态行星才有环（类土星）
      const hasRing = (preset.type === 'gas_giant') && 
                      planetSize > 2.0 && Math.random() > 0.4;
      const ringTexture = hasRing ? createRealisticRingTexture(preset.type) : null;
      const ringTilt = Math.PI / 5 + Math.random() * Math.PI / 4; // 环的倾斜角度
      
      // 行星轴倾斜
      const axisTilt = (Math.random() - 0.5) * 0.3;
      
      // 大气层颜色（根据行星类型）
      const getAtmosphereColor = () => {
        switch (preset.type) {
          case 'gas_giant': return new THREE.Color('#c9a055'); // 棕金色
          case 'ice_giant': return new THREE.Color('#7090c0'); // 蓝色
          case 'ocean': return new THREE.Color('#4a8fcc'); // 天蓝色
          case 'lava': return new THREE.Color('#a04030'); // 红色
          case 'desert': return new THREE.Color('#b08050'); // 棕色
          default: return new THREE.Color('#8090a0'); // 灰蓝色
        }
      };
      const atmosphereColor = getAtmosphereColor();
      
      // 自发光强度 - 熔岩行星更亮
      const emissiveIntensity = preset.type === 'lava' ? 0.3 : 0.02;
      
      const rotationSpeed = {
        x: (Math.random() - 0.5) * 0.1,
        y: 0.03 + Math.random() * 0.1, // 自转速度
        z: (Math.random() - 0.5) * 0.03
      };

      return {
        anchor,
        chaosPos,
        planetSize,
        preset,
        texture,
        hasRing,
        ringTexture,
        ringTilt,
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

      // 星球自转
      const mainMesh = group.children[0] as THREE.Mesh;
      if (mainMesh) {
        mainMesh.rotation.y += delta * objData.rotationSpeed.y;
      }
      
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
        
        // FORMED 状态下星球缩小到很小，CHAOS 状态下正常大小
        const baseScale = isChaos ? obj.planetSize : obj.planetSize * 0.08;
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
            {/* 主体球 - 完全不透明的固体球体 */}
            <mesh scale={[scale, scale, scale]} rotation={[obj.axisTilt, 0, 0]}>
              <sphereGeometry args={[1, 64, 64]} />
              <meshStandardMaterial 
                map={obj.texture}
                roughness={obj.preset.type === 'gas_giant' ? 0.9 : 0.7}
                metalness={obj.preset.type === 'rocky' ? 0.15 : 0.05}
                emissive={obj.preset.type === 'lava' ? new THREE.Color('#ff3000') : undefined}
                emissiveIntensity={obj.emissiveIntensity}
              />
            </mesh>
            
            {/* 边缘大气光晕 - 非常轻微，淡蓝/淡紫色 */}
            {isChaos && (
              <mesh scale={[scale * 1.02, scale * 1.02, scale * 1.02]}>
                <sphereGeometry args={[1, 32, 32]} />
                <meshBasicMaterial 
                  color={obj.atmosphereColor} 
                  transparent 
                  opacity={0.08} 
                  blending={THREE.AdditiveBlending} 
                  side={THREE.BackSide} 
                />
              </mesh>
            )}

            {/* 行星环 - 真实的微粒尘埃带 */}
            {showRing && obj.ringTexture && (
              <group rotation={[obj.ringTilt, 0.1, 0]}>
                {/* 主环 */}
                <mesh scale={[scale, scale, scale]}>
                  <ringGeometry args={[1.3, 2.3, 128]} />
                  <meshBasicMaterial 
                    map={obj.ringTexture}
                    transparent 
                    side={THREE.DoubleSide} 
                    depthWrite={false}
                  />
                </mesh>
              </group>
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

// --- Component: Inner Planets (闪电内部精致宇宙) - 真实天文风格 ---
const InnerPlanets = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const groupRef = useRef<THREE.Group>(null);
  const count = CONFIG.counts.innerPlanets;
  
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
      
      // 独特的随机种子
      const planetSeed = i * 2000 + 5000;
      
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
      const texture = createCinematicPlanetTexture(preset.hue, preset.type, size, planetSeed);
      
      const hasRing = preset.type === 'gas_giant' && size > 1.5 && Math.random() > 0.5;
      const ringTexture = hasRing ? createRealisticRingTexture(preset.type) : null;
      const ringTilt = Math.PI / 5 + Math.random() * Math.PI / 4;
      const axisTilt = (Math.random() - 0.5) * 0.3;
      
      // 大气层颜色
      const getAtmosphereColor = () => {
        switch (preset.type) {
          case 'gas_giant': return new THREE.Color('#c9a055');
          case 'ice_giant': return new THREE.Color('#7090c0');
          case 'ocean': return new THREE.Color('#4a8fcc');
          case 'lava': return new THREE.Color('#a04030');
          case 'desert': return new THREE.Color('#b08050');
          default: return new THREE.Color('#8090a0');
        }
      };
      const atmosphereColor = getAtmosphereColor();
      
      const rotationSpeed = 0.03 + Math.random() * 0.08;
      const orbitSpeed = 0.015 + Math.random() * 0.03;
      const orbitRadius = 0.2 + Math.random() * 0.5;
      
      return { 
        pos, size, preset, texture,
        hasRing, ringTexture, ringTilt, axisTilt,
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
      
      const targetScale = isFormed ? 1 : 0;
      planet.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), delta * 3);
      
      if (isFormed) {
        const orbitX = Math.sin(time * data.orbitSpeed + data.phase) * data.orbitRadius;
        const orbitZ = Math.cos(time * data.orbitSpeed + data.phase) * data.orbitRadius;
        planet.position.set(
          data.pos.x + orbitX,
          data.pos.y,
          data.pos.z + orbitZ
        );
        const mainMesh = planet.children[0] as THREE.Mesh;
        if (mainMesh) mainMesh.rotation.y += delta * data.rotationSpeed;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {planetsData.map((planet, i) => (
        <group key={i} position={[planet.pos.x, planet.pos.y, planet.pos.z]}>
          {/* 星球主体 - 完全不透明固体 */}
          <mesh rotation={[planet.axisTilt, 0, 0]}>
            <sphereGeometry args={[planet.size, 64, 64]} />
            <meshStandardMaterial
              map={planet.texture}
              roughness={planet.preset.type === 'gas_giant' ? 0.9 : 0.7}
              metalness={planet.preset.type === 'rocky' ? 0.15 : 0.05}
              emissive={planet.preset.type === 'lava' ? new THREE.Color('#ff3000') : undefined}
              emissiveIntensity={planet.preset.type === 'lava' ? 0.25 : 0.01}
            />
          </mesh>
          
          {/* 边缘大气光晕 - 非常轻微 */}
          <mesh rotation={[planet.axisTilt, 0, 0]}>
            <sphereGeometry args={[planet.size * 1.02, 24, 24]} />
            <meshBasicMaterial
              color={planet.atmosphereColor}
              transparent
              opacity={0.06}
              side={THREE.BackSide}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          
          {/* 星环 - 真实微粒尘埃带 */}
          {planet.hasRing && planet.ringTexture && (
            <group rotation={[planet.ringTilt, 0, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[planet.size * 1.3, planet.size * 2.2, 128]} />
                <meshBasicMaterial
                  map={planet.ringTexture}
                  transparent
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            </group>
          )}
        </group>
      ))}
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

// --- Component: Shooting Star (流星) ---
const ShootingStar = ({ 
  startPos, 
  direction, 
  speed, 
  length, 
  color,
  delay,
  state 
}: { 
  startPos: THREE.Vector3;
  direction: THREE.Vector3;
  speed: number;
  length: number;
  color: THREE.Color;
  delay: number;
  state: 'CHAOS' | 'FORMED';
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Line>(null);
  const progress = useRef(-delay); // 负值表示延迟
  const lifespan = 2.5; // 流星生命周期
  
  // 创建流星尾巴的几何体
  const trailGeometry = useMemo(() => {
    const points = [];
    for (let i = 0; i < 20; i++) {
      points.push(new THREE.Vector3(0, 0, -i * (length / 20)));
    }
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [length]);
  
  useFrame((_, delta) => {
    if (!meshRef.current || !trailRef.current) return;
    const isFormed = state === 'FORMED';
    
    if (isFormed) {
      progress.current += delta * speed;
      
      if (progress.current > lifespan) {
        progress.current = -Math.random() * 3; // 随机延迟后重新开始
      }
      
      if (progress.current < 0) {
        meshRef.current.visible = false;
        trailRef.current.visible = false;
        return;
      }
      
      meshRef.current.visible = true;
      trailRef.current.visible = true;
      
      const t = progress.current / lifespan;
      const currentPos = startPos.clone().add(direction.clone().multiplyScalar(t * 800));
      
      meshRef.current.position.copy(currentPos);
      trailRef.current.position.copy(currentPos);
      
      // 让尾巴朝向运动方向
      trailRef.current.lookAt(currentPos.clone().add(direction));
      
      // 淡入淡出
      const fade = t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1;
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = fade * 0.9;
      
      const trailMat = trailRef.current.material as THREE.LineBasicMaterial;
      trailMat.opacity = fade * 0.6;
    } else {
      meshRef.current.visible = false;
      trailRef.current.visible = false;
    }
  });
  
  return (
    <group>
      {/* 流星头部 */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[1.5, 8, 8]} />
        <meshBasicMaterial 
          color={color} 
          transparent 
          opacity={0} 
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      {/* 流星尾巴 */}
      <line ref={trailRef as any} geometry={trailGeometry}>
        <lineBasicMaterial 
          color={color} 
          transparent 
          opacity={0} 
          blending={THREE.AdditiveBlending}
          linewidth={2}
        />
      </line>
    </group>
  );
};

// --- Component: Shooting Stars System (流星群) ---
const ShootingStars = ({ state }: { state: 'CHAOS' | 'FORMED' }) => {
  const meteors = useMemo(() => {
    const count = 15; // 流星数量
    return Array.from({ length: count }, (_, i) => {
      // 随机起始位置 - 从屏幕边缘开始
      const side = Math.random();
      let startPos: THREE.Vector3;
      let direction: THREE.Vector3;
      
      if (side < 0.25) {
        // 从左上方
        startPos = new THREE.Vector3(-400 - Math.random() * 200, 200 + Math.random() * 200, -100 + Math.random() * 200);
        direction = new THREE.Vector3(1, -0.5 - Math.random() * 0.3, 0.2).normalize();
      } else if (side < 0.5) {
        // 从右上方
        startPos = new THREE.Vector3(400 + Math.random() * 200, 200 + Math.random() * 200, -100 + Math.random() * 200);
        direction = new THREE.Vector3(-1, -0.5 - Math.random() * 0.3, 0.2).normalize();
      } else if (side < 0.75) {
        // 从顶部
        startPos = new THREE.Vector3(-200 + Math.random() * 400, 350 + Math.random() * 100, -150 + Math.random() * 300);
        direction = new THREE.Vector3(0.3 - Math.random() * 0.6, -1, 0.1).normalize();
      } else {
        // 从后方斜向前
        startPos = new THREE.Vector3(-300 + Math.random() * 600, 150 + Math.random() * 200, -400);
        direction = new THREE.Vector3(0.2 - Math.random() * 0.4, -0.3, 1).normalize();
      }
      
      // 流星颜色 - 白色、淡蓝、淡黄
      const colors = [
        new THREE.Color('#FFFFFF'),
        new THREE.Color('#E0F4FF'),
        new THREE.Color('#FFFACD'),
        new THREE.Color('#87CEEB'),
        new THREE.Color('#FFE4B5'),
      ];
      
      return {
        startPos,
        direction,
        speed: 0.4 + Math.random() * 0.6,
        length: 30 + Math.random() * 50,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 5, // 随机延迟
      };
    });
  }, []);
  
  return (
    <group>
      {meteors.map((meteor, i) => (
        <ShootingStar
          key={i}
          startPos={meteor.startPos}
          direction={meteor.direction}
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
  const resolution = Math.min(512, Math.max(256, Math.floor(size * 40)));
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
  
  const centerX = resolution / 2;
  const centerY = resolution / 2;
  const radius = resolution / 2;
  
  // 光照方向 - 左上方
  const lightDir = { x: -0.55, y: -0.45, z: 0.70 };
  const lightLen = Math.sqrt(lightDir.x ** 2 + lightDir.y ** 2 + lightDir.z ** 2);
  lightDir.x /= lightLen; lightDir.y /= lightLen; lightDir.z /= lightLen;
  
  for (let py = 0; py < resolution; py++) {
    for (let px = 0; px < resolution; px++) {
      const i = (py * resolution + px) * 4;
      
      const dx = (px - centerX) / radius;
      const dy = (py - centerY) / radius;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist > 1) {
        data[i] = data[i + 1] = data[i + 2] = 0;
        data[i + 3] = 0;
        continue;
      }
      
      const nz = Math.sqrt(Math.max(0, 1 - dist * dist));
      const nx = dx, ny = dy;
      
      // NASA风格光照
      let diffuse = -(nx * lightDir.x + ny * lightDir.y + nz * lightDir.z);
      diffuse = Math.max(0, diffuse);
      diffuse = diffuse * diffuse * (3 - 2 * diffuse);
      diffuse = Math.pow(diffuse, 0.6);
      
      const hemisphereLight = 0.45 + nz * 0.15;
      const fresnel = Math.pow(1 - nz, 2.5) * 0.12;
      let lighting = diffuse * 0.55 + hemisphereLight + fresnel;
      lighting = Math.max(0.35, Math.min(1.15, lighting));
      
      // 表面纹理 - 更柔和
      let r: number, g: number, b: number;
      const noiseVal = fbm(px, py, 3) * 0.6 + 0.2; // 压缩范围，更柔和
      const detailNoise = (seededRandom(px + py * resolution) - 0.5) * 8; // 减少噪声强度
      
      if (planetType === 'gas_giant') {
        const bandNoise = Math.sin(py * 0.04) * 0.35 + Math.sin(py * 0.1 + px * 0.002) * 0.2;
        const mix = (bandNoise + 0.6) / 1.2; // 压缩范围
        r = palette.primary.r * (1 - mix) + palette.secondary.r * mix + detailNoise;
        g = palette.primary.g * (1 - mix) + palette.secondary.g * mix + detailNoise * 0.9;
        b = palette.primary.b * (1 - mix) + palette.secondary.b * mix + detailNoise * 0.7;
      } else if (planetType === 'earth_like') {
        const landMass = fbm(px * 1.0, py * 1.0, 4);
        r = palette.primary.r; g = palette.primary.g; b = palette.primary.b;
        if (landMass > 0.55) {
          const landInfluence = (landMass - 0.55) / 0.45 * 0.6;
          r = r * (1 - landInfluence) + 120 * landInfluence;
          g = g * (1 - landInfluence) + 155 * landInfluence;
          b = b * (1 - landInfluence) + 100 * landInfluence;
        }
        r += detailNoise; g += detailNoise; b += detailNoise;
      } else if (planetType === 'volcanic') {
        r = palette.primary.r + 25; g = palette.primary.g + 15; b = palette.primary.b + 10;
        const crackGlow = noiseVal > 0.6 ? Math.pow((noiseVal - 0.6) / 0.4, 1.5) * 0.5 : 0;
        r += crackGlow * (palette.highlight.r - palette.primary.r);
        g += crackGlow * (palette.highlight.g - palette.primary.g);
        b += crackGlow * (palette.highlight.b - palette.primary.b);
        r += detailNoise; g += detailNoise * 0.5; b += detailNoise * 0.3;
      } else {
        const mix = noiseVal * 0.4 + 0.3; // 更柔和的混合
        r = palette.primary.r * (1 - mix) + palette.secondary.r * mix + detailNoise;
        g = palette.primary.g * (1 - mix) + palette.secondary.g * mix + detailNoise;
        b = palette.primary.b * (1 - mix) + palette.secondary.b * mix + detailNoise;
      }
      
      // 应用光照
      const highlightZone = Math.max(0, diffuse - 0.3) / 0.7;
      const highlightStrength = Math.pow(highlightZone, 1.5) * 0.35;
      r = r * lighting + palette.highlight.r * highlightStrength;
      g = g * lighting + palette.highlight.g * highlightStrength;
      b = b * lighting + palette.highlight.b * highlightStrength;
      
      // 边缘大气
      if (dist > 0.88) {
        const edgeFade = (dist - 0.88) / 0.12;
        const atmoColor = planetType === 'volcanic' ? { r: 255, g: 120, b: 70 } :
                          planetType === 'ice' || planetType === 'earth_like' ? { r: 170, g: 210, b: 255 } :
                          { r: 190, g: 185, b: 230 };
        const atmoStrength = edgeFade * 0.2;
        r = r * (1 - atmoStrength) + atmoColor.r * atmoStrength;
        g = g * (1 - atmoStrength) + atmoColor.g * atmoStrength;
        b = b * (1 - atmoStrength) + atmoColor.b * atmoStrength;
      }
      
      // 整体亮度提升
      r *= 1.1; g *= 1.1; b *= 1.1;
      
      data[i] = clamp(Math.round(r));
      data[i + 1] = clamp(Math.round(g));
      data[i + 2] = clamp(Math.round(b));
      data[i + 3] = 255;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
};

// 写实风格星环 - 有光照反射
const createSciFiRingTexture = (brightness: number) => {
  const width = 512;
  const height = 64;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  
  // 棕金/灰紫色调的环 - 更亮
  for (let x = 0; x < width; x++) {
    // 模拟光照：左侧亮，右侧暗
    const lightFactor = 1 - (x / width) * 0.4;
    const baseLight = (70 + brightness * 50) * lightFactor;
    
    for (let y = 0; y < height; y++) {
      // 环的密度变化
      const distFromCenter = Math.abs(y - height / 2) / (height / 2);
      const ringDensity = Math.sin(distFromCenter * Math.PI) * 0.8 + 0.2;
      
      const variation = (Math.random() - 0.5) * 20;
      const r = Math.min(255, baseLight + variation + 50);
      const g = Math.min(255, baseLight + variation + 35);
      const b = Math.min(255, baseLight + variation + 20);
      const alpha = ringDensity * (0.5 + Math.random() * 0.3);
      
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
    return createRealisticSciFiPlanetTexture(planetType, planetSize);
  }, [planetType, planetSize]);
  
  const ringTexture = useMemo(() => {
    return hasRing ? createSciFiRingTexture(0.6) : null;
  }, [hasRing]);
  
  // 根据类型选择大气层颜色
  const getRimColor = () => {
    switch (planetType) {
      case 'earth_like': return '#4a8fcc';
      case 'gas_giant': return '#c9a055';
      case 'ice': return '#7090c0';
      case 'desert': return '#b08050';
      case 'volcanic': return '#a04030';
      default: return '#6080a0';
    }
  };
  
  useFrame((stateObj, delta) => {
    if (!groupRef.current) return;
    const time = stateObj.clock.elapsedTime;
    const isFormed = state === 'FORMED';
    
    // 目标透明度
    const targetScale = isFormed ? 1 : 0;
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
      {/* 星球主体 - 完全不透明固体 */}
      <mesh ref={planetRef}>
        <sphereGeometry args={[planetSize, 64, 64]} />
        <meshStandardMaterial
          map={texture}
          roughness={planetType === 'gas_giant' ? 0.9 : 0.7}
          metalness={planetType === 'rocky' ? 0.15 : 0.05}
          emissive={planetType === 'volcanic' ? new THREE.Color('#ff3000') : undefined}
          emissiveIntensity={planetType === 'volcanic' ? 0.2 : 0}
        />
      </mesh>
      
      {/* 边缘大气光晕 - 非常轻微，淡蓝/淡紫色 */}
      <mesh scale={[1.02, 1.02, 1.02]}>
        <sphereGeometry args={[planetSize, 32, 32]} />
        <meshBasicMaterial
          color={rimColor}
          transparent
          opacity={0.06}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      
      {/* 星环 - 真实微粒尘埃带 */}
      {hasRing && ringTexture && (
        <group rotation={[1.2, 0.1, 0.2]}>
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
  const groupRef = useRef<THREE.Points>(null);
  const count = CONFIG.counts.nebulaParticles;
  
  const { positions, colors, sizes } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const siz = new Float32Array(count);
    
    // 星云色系 - 蓝紫色为主
    const nebulaHues = [220, 260, 280, 300, 200, 180]; // 蓝、紫、粉、青
    
    for (let i = 0; i < count; i++) {
      // 分布在整个视野范围，形成环绕感
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 200 + Math.random() * 400;
      
      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.6; // 压扁成盘状
      pos[i * 3 + 2] = radius * Math.cos(phi);
      
      // 星云颜色
      const hue = nebulaHues[Math.floor(Math.random() * nebulaHues.length)];
      const saturation = 40 + Math.random() * 40;
      const lightness = 50 + Math.random() * 30;
      const color = new THREE.Color(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
      col[i * 3] = color.r;
      col[i * 3 + 1] = color.g;
      col[i * 3 + 2] = color.b;
      
      // 大小变化
      siz[i] = 0.5 + Math.random() * 2.5;
    }
    
    return { positions: pos, colors: col, sizes: siz };
  }, [count]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const targetAlpha = state === 'CHAOS' ? 0.4 : 0;
    const mat = groupRef.current.material as THREE.PointsMaterial;
    mat.opacity = MathUtils.damp(mat.opacity, targetAlpha, 3, delta);
    
    // 缓慢旋转
    if (state === 'CHAOS') {
      groupRef.current.rotation.y += delta * 0.01;
    }
  });

  return (
    <points ref={groupRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={1.5}
        transparent
        depthWrite={false}
        vertexColors
        opacity={0}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
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
      
      // 宇宙星云渐变色 - 更丰富的颜色
      const tVal = Math.random();
      const nebulaColors = [
        new THREE.Color('#FFFFFF'),  // 白色星星
        new THREE.Color('#87CEEB'),  // 天蓝
        new THREE.Color('#DDA0DD'),  // 淡紫
        new THREE.Color('#FF69B4'),  // 粉红
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
            color="#FF00FF"
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
            color="#FF00FF"
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

  // Auto-spin when dispersed; gesture can add/subtract spin (360度旋转 + 惯性)
  useFrame((_, delta) => {
    if (sceneGroupRef.current) {
      if (sceneState === 'CHAOS') {
        // 平滑插值手势输入 - 更丝滑的过渡
        const lerpFactor = 0.12; // 提高响应速度
        smoothSpeedX.current = MathUtils.lerp(smoothSpeedX.current, rotationSpeed, lerpFactor);
        smoothSpeedY.current = MathUtils.lerp(smoothSpeedY.current, rotationSpeedVertical, lerpFactor);
        
        // 计算目标速度 - 增大系数让旋转更明显
        const targetVelX = smoothSpeedX.current * 8;
        const targetVelY = smoothSpeedY.current * 10;
        
        // 惯性系统 - 缓慢衰减
        const friction = 0.96; // 摩擦力，越接近1惯性越大
        const acceleration = 0.2; // 提高加速度
        
        // 如果有手势输入，加速到目标速度；否则惯性衰减
        if (Math.abs(rotationSpeed) > 0.003 || Math.abs(rotationSpeedVertical) > 0.003) {
          velocityX.current = MathUtils.lerp(velocityX.current, targetVelX, acceleration);
          velocityY.current = MathUtils.lerp(velocityY.current, targetVelY, acceleration);
        } else {
          velocityX.current *= friction;
          velocityY.current *= friction;
        }
        
        // 基础自转 + 手势控制
        const baseSpin = 0.05; // 降低基础自转，让手势控制更突出
        sceneGroupRef.current.rotation.y += (baseSpin + velocityX.current) * delta;
        sceneGroupRef.current.rotation.x += velocityY.current * delta;
        
        // 限制X轴旋转范围
        sceneGroupRef.current.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, sceneGroupRef.current.rotation.x));
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

      <color attach="background" args={['#020210']} />
      <Stars radius={400} depth={200} count={20000} factor={10} saturation={0.3} fade speed={0.5} />
      <Stars radius={600} depth={300} count={8000} factor={6} saturation={0.5} fade speed={0.3} />
      <Environment preset="night" background={false} />
      
      {/* 星云背景层 */}
      <NebulaBackground />
      
      {/* 流星效果 - 只在散开态显示 */}
      <ShootingStars state={sceneState} />
      
      {/* 动态环绕星球 - 只在散开态显示 */}
      <DynamicOrbitingPlanets state={sceneState} />

      {/* NASA风格行星光照系统 - 环境光大幅提升确保行星细节可见 */}
      <ambientLight intensity={0.8} color="#404050" />
      {/* 主太阳光 - 左上方，模拟真实太阳照射 */}
      <directionalLight position={[-150, 100, 100]} intensity={2.5} color="#FFF8E8" />
      {/* 补光 - 右侧柔和光源 */}
      <directionalLight position={[100, 50, 80]} intensity={0.8} color="#E8F0FF" />
      {/* 原有点光源保留但降低强度避免过曝 */}
      <pointLight position={[80, 80, 80]} intensity={200} color="#FF00FF" />
      <pointLight position={[-80, 30, -80]} intensity={150} color="#00FFFF" />
      <pointLight position={[0, -60, 30]} intensity={100} color="#8A2BE2" />
      <pointLight position={[0, 60, 60]} intensity={180} color="#FFFFFF" />

      {/* 闪电效果 - 独立于旋转组，只淡入淡出不旋转 */}
      <BoltGlow state={sceneState} />
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
           <ChristmasElements state={sceneState} />
           <FairyLights state={sceneState} />
        </Suspense>
        <InnerPlanets state={sceneState} />
        <CosmicNebula state={sceneState} />
        <Sparkles count={1500} scale={150} size={18} speed={0.25} opacity={0.5} color="#8A2BE2" />
        <Sparkles count={1000} scale={130} size={12} speed={0.4} opacity={0.4} color="#00FFFF" />
        <Sparkles count={800} scale={100} size={8} speed={0.3} opacity={0.35} color="#FF69B4" />
      </group>

      <EffectComposer>
        <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.15} intensity={2.5} radius={0.7} mipmapBlur />
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

// --- App Entry ---
export default function GrandTreeApp() {
  const [sceneState, setSceneState] = useState<'CHAOS' | 'FORMED'>('FORMED'); // 初始即为合并后的闪电形态
  const [rotationSpeed, setRotationSpeed] = useState(0);
  const [rotationSpeedVertical, setRotationSpeedVertical] = useState(0);
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

  useEffect(() => {
    // 只有在手势捏合触发的预览才会因为松开手势而关闭
    // 点击触发的预览不受pinchActive影响
    if (!pinchActive && selectedPhoto && !isClickTriggered) {
      setSelectedPhoto(null); // 松开捏合时关闭预览
    }
  }, [pinchActive, selectedPhoto, isClickTriggered]);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
      <div style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}>
        <Canvas dpr={[1, 2]} gl={{ toneMapping: THREE.ReinhardToneMapping }} shadows>
            <Experience
              sceneState={sceneState}
              rotationSpeed={rotationSpeed}
              rotationSpeedVertical={rotationSpeedVertical}
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
      <GestureController
        onGesture={setSceneState}
        onMove={setRotationSpeed}
        onMoveVertical={setRotationSpeedVertical}
        onStatus={setAiStatus}
        debugMode={debugMode}
        onPoint={setFocusPoint}
        onPinch={(active: boolean) => setPinchActive(active)}
      />

      {/* UI - Stats */}
      <div style={{ position: 'absolute', bottom: '30px', left: '40px', color: '#888', zIndex: 10, fontFamily: 'sans-serif', userSelect: 'none' }}>
        <div style={{ marginBottom: '15px' }}>
          <p style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Memories</p>
          <p style={{ fontSize: '24px', color: '#FFD700', fontWeight: 'bold', margin: 0 }}>
            {CONFIG.counts.ornamentsChaos.toLocaleString()} <span style={{ fontSize: '10px', color: '#555', fontWeight: 'normal' }}>POLAROIDS (CHAOS)</span>
          </p>
        </div>
        <div>
          <p style={{ fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>Foliage</p>
          <p style={{ fontSize: '24px', color: '#004225', fontWeight: 'bold', margin: 0 }}>
            {(CONFIG.counts.foliage / 1000).toFixed(0)}K <span style={{ fontSize: '10px', color: '#555', fontWeight: 'normal' }}>EMERALD NEEDLES</span>
          </p>
        </div>
      </div>

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
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 'min(94vw, 520px)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: selectedPhoto.borderColor, borderRadius: '14px', padding: '10px', boxShadow: '0 24px 70px rgba(0,0,0,0.65)' }}>
              <div style={{ borderRadius: '10px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
                <img
                  src={selectedPhoto.path}
                  alt="Selected memory"
                  style={{
                    display: 'block',
                    maxWidth: 'min(90vw, 500px)',
                    maxHeight: '70vh',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain'
                  }}
                />
              </div>
              <div style={{ marginTop: '10px', padding: '8px 6px 0', textAlign: 'center', color: '#222', fontSize: '15px', fontWeight: 600, letterSpacing: '0.5px' }}>
                {selectedPhoto.message}
              </div>
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
