import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VehicleInteractionRig } from './VehicleInteractionRig';

interface Props {
  readonly interactionRig: VehicleInteractionRig;
}

const vertexShader = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  precision highp float;

  uniform float uBlend;
  uniform float uDistance;
  uniform float uSpeed;
  varying vec2 vUv;

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  void main() {
    float lateral = vUv.x - 0.5;
    // PlaneGeometry is 96 world units long and carries 42 road periods. The
    // 42/96 factor makes one rig distance unit move the pattern one world unit
    // toward -Z, matching wheelRotation = distance / wheelRadius.
    float roadV = vUv.y * 42.0 - uDistance * 0.4375;
    float widthFade = 1.0 - smoothstep(0.43, 0.5, abs(lateral));
    float endFade = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.92, 1.0, vUv.y));

    // CameraRig wraps after 4096 units, equal to 8960 grain cells at this
    // travel scale. Modulo the cell index by the same span for a seamless loop.
    float grainCell = mod(floor(roadV * 5.0), 8960.0);
    float grain = hash21(vec2(floor(vUv.x * 180.0), grainCell));
    vec3 asphalt = vec3(0.047, 0.055, 0.059) + (grain - 0.5) * 0.018;
    float shoulder = smoothstep(0.31, 0.43, abs(lateral));
    asphalt = mix(asphalt, vec3(0.075, 0.083, 0.086), shoulder * 0.68);

    float dashPattern = smoothstep(0.52, 0.6, fract(roadV));
    float centerDash = (1.0 - smoothstep(0.004, 0.011, abs(lateral))) * dashPattern;
    float leftEdge = 1.0 - smoothstep(0.003, 0.008, abs(lateral + 0.245));
    float rightEdge = 1.0 - smoothstep(0.003, 0.008, abs(lateral - 0.245));
    vec3 marking = vec3(0.78, 0.82, 0.79);
    vec3 color = mix(asphalt, marking, clamp(centerDash * 0.72 + leftEdge + rightEdge, 0.0, 1.0));

    float speedMix = smoothstep(3.0, 11.0, uSpeed);
    float streak = pow(max(0.0, sin(roadV * 3.14159265)), 18.0) * speedMix * 0.055;
    color += streak * vec3(0.2, 0.24, 0.25);

    float alpha = clamp(uBlend, 0.0, 1.0) * widthFade * endFade * 0.98;
    if (alpha <= 0.001) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function DriveRoad({ interactionRig }: Props) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    depthTest: true,
    depthWrite: false,
    fragmentShader,
    transparent: true,
    uniforms: {
      uBlend: { value: 0 },
      uDistance: { value: 0 },
      uSpeed: { value: 0 },
    },
    vertexShader,
  }), []);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(() => {
    material.uniforms.uBlend!.value = interactionRig.driveBlend;
    material.uniforms.uDistance!.value = interactionRig.driveDistance;
    material.uniforms.uSpeed!.value = interactionRig.driveSpeed;
  });

  return (
    <mesh position={[0, -0.009, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[14, 96]} />
      <primitive object={material} attach={'material'} />
    </mesh>
  );
}
