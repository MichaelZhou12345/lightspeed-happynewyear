/**
 * Common GLSL noise functions
 */
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

export const cosmicBackgroundVertex = `
varying vec2 vUv;
varying vec3 vPosition;
void main() {
  vUv = uv;
  vPosition = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const cosmicBackgroundFragment = `
uniform float uTime;
varying vec2 vUv;
varying vec3 vPosition;

${noiseGLSL}

void main() {
  // Normalize position for spherical projection
  vec3 pos = normalize(vPosition);
  
  // Rotate entire sky slightly over time
  float angle = uTime * 0.005; 
  mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  pos.xz = rot * pos.xz;

  // -- MILKY WAY LIGHT BAND --
  
  // 1. Orientation: Define the diagonal plane of the galaxy
  vec3 bandNormal = normalize(vec3(0.5, 0.8, 0.3));
  float lat = dot(pos, bandNormal); // -1.0 to 1.0 (Distance from galactic plane)
  
  // 2. Band Shape: Create the main glowing strip
  // It's brightest at lat=0, fading out quickly
  float bandWidth = 0.45;
  float bandMask = 1.0 - smoothstep(0.0, bandWidth, abs(lat));
  
  // 3. Texture: Add cloud noise
  float clouds = fbm(pos * 2.5 + vec3(uTime * 0.01));
  float detail = fbm(pos * 6.0);
  
  // 4. Dark Rift (Dust Lanes):
  // We want dark patches primarily in the core of the band
  float dustStructure = smoothstep(0.4, 0.7, detail);
  float dustZone = 1.0 - smoothstep(0.0, 0.2, abs(lat)); // Only affect the center
  float dust = dustStructure * dustZone * 0.85; // 0.85 is dust darkness intensity
  
  // 5. Compose Brightness
  // Base cloudiness + band fade - dust
  float brightness = (clouds * 0.6 + 0.4) * bandMask; 
  brightness = smoothstep(0.1, 1.0, brightness); // Increase contrast
  brightness = max(0.0, brightness - dust); // Apply dust mask
  
  // -- COLORING --
  
  vec3 deepSpace = vec3(0.0, 0.002, 0.008); // The void
  
  // Galaxy colors
  vec3 outerGlow = vec3(0.1, 0.05, 0.25); // Deep Purple edges
  vec3 innerGlow = vec3(0.2, 0.4, 0.7);   // Cosmic Blue mid
  vec3 coreGlow  = vec3(0.9, 0.85, 0.8);  // White/Yellow core
  
  vec3 finalColor = deepSpace;
  
  // Gradient mix based on brightness intensity
  vec3 bandColor = mix(outerGlow, innerGlow, smoothstep(0.0, 0.5, brightness));
  bandColor = mix(bandColor, coreGlow, smoothstep(0.5, 1.0, brightness));
  
  // Add the band to the scene
  finalColor += bandColor * brightness;
  
  // Extra: Subtle background star noise everywhere to simulate distant galaxies
  float bgNoise = pow(max(snoise(pos * 60.0), 0.0), 12.0);
  finalColor += vec3(bgNoise) * 0.25;
  
  // Vignette for cinematic feel
  float vignette = 1.0 - dot(vUv - 0.5, vUv - 0.5) * 0.5;
  
  gl_FragColor = vec4(finalColor * vignette, 1.0);
}
`;

// -- STAR SHADERS --

export const starVertexShader = `
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

export const starFragmentShader = `
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