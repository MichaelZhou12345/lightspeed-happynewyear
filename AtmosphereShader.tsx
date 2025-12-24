
import * as THREE from 'three';

export const AtmosphereShader = {
  uniforms: {
    color: { value: new THREE.Color('#ffffff') },
    coefficient: { value: 0.1 },
    power: { value: 1.2 }
  },
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      // 转换法线到视图空间
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 color;
    uniform float coefficient;
    uniform float power;
    varying vec3 vNormal;
    void main() {
      // 在视图空间中，vNormal.z 实际上就是 dot(Normal, ViewVector)
      // 这种方式比在顶点着色器计算 vEyeVector 更稳定
      float intensity = pow(coefficient + 1.0 - max(vNormal.z, 0.0), power);
      gl_FragColor = vec4(color, intensity);
    }
  `
};
