import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VehicleInteractionRig } from './VehicleInteractionRig';
import { writeVehicleLightStages, type VehicleLightStages } from './vehicleLightAssembly';

interface Props {
  readonly interactionRig: VehicleInteractionRig;
  readonly mobileOptimized: boolean;
}

const HEADLIGHT_X = 0.7;
const HEADLIGHT_Y = 0.63;
const HEADLIGHT_Z = 2.14;
const BEAM_LENGTH = 6;
const BEAM_FAR_WIDTH = 1.5;
const BEAM_GROUND_Y = 0.035;
const GLOW_Z = 2.19;
const EFFECT_DISPOSAL_TIMERS = new WeakMap<object, number>();
const BEAM_RIGHT_USER_DATA = { driveLightMarker: 'drive-headlight-beam', driveLightChannel: 'highBeam', driveLightSide: 'right' } as const;
const BEAM_LEFT_USER_DATA = { driveLightMarker: 'drive-headlight-beam', driveLightChannel: 'highBeam', driveLightSide: 'left' } as const;
const GLOW_RIGHT_USER_DATA = { driveLightMarker: 'drive-headlight-glow', driveLightChannel: 'highBeam', driveLightSide: 'right' } as const;
const GLOW_LEFT_USER_DATA = { driveLightMarker: 'drive-headlight-glow', driveLightChannel: 'highBeam', driveLightSide: 'left' } as const;

const beamVertexShader = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const beamFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3 uColor;
  uniform float uBlend;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float travel = 1.0 - vUv.y;
    float centered = abs(vUv.x * 2.0 - 1.0);
    float halfWidth = mix(0.10, 1.0, travel);
    float lateral = 1.0 - smoothstep(halfWidth * 0.55, halfWidth, centered);
    lateral *= lateral;
    float nearFade = smoothstep(0.02, 0.14, travel);
    float farFade = 1.0 - smoothstep(0.68, 1.0, travel);
    float alpha = clamp(uBlend, 0.0, 1.0) * uOpacity * lateral * nearFade * farFade;
    if (alpha <= 0.0005) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;

const glowVertexShader = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3 uColor;
  uniform float uBlend;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    float radius = length((vUv - 0.5) * 2.0);
    float halo = 1.0 - smoothstep(0.05, 1.0, radius);
    halo *= halo;
    float core = 1.0 - smoothstep(0.0, 0.28, radius);
    float alpha = clamp(uBlend, 0.0, 1.0) * uOpacity * max(halo, core * 0.68);
    if (alpha <= 0.0005) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;

export function VehicleLightEffects({ interactionRig, mobileOptimized }: Props) {
  const lightStages = useRef<VehicleLightStages>({ running: 0, lowBeam: 0, highBeam: 0 });
  const resources = useMemo(() => {
    const beamGeometry = new THREE.PlaneGeometry(BEAM_FAR_WIDTH, BEAM_LENGTH);
    // Lay a tapered, shader-softened light pool just above the road. The
    // geometry starts at the lamp's Z and extends forward without hard volume
    // silhouettes in the showroom.
    beamGeometry.rotateX(-Math.PI / 2);
    beamGeometry.translate(0, 0, BEAM_LENGTH / 2);
    beamGeometry.computeBoundingSphere();
    beamGeometry.name = 'drive-headlight-beam-geometry';
    beamGeometry.userData.driveLightMarker = 'drive-headlight-beam-geometry';

    const glowSize = mobileOptimized ? 0.24 : 0.27;
    const glowGeometry = new THREE.PlaneGeometry(glowSize, glowSize);
    glowGeometry.name = 'drive-headlight-glow-geometry';
    glowGeometry.userData.driveLightMarker = 'drive-headlight-glow-geometry';
    const beamMaterial = new THREE.ShaderMaterial({
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      fragmentShader: beamFragmentShader,
      side: THREE.FrontSide,
      toneMapped: false,
      transparent: true,
      uniforms: {
        uBlend: { value: 0 },
        uColor: { value: new THREE.Color('#d5efff') },
        uOpacity: { value: mobileOptimized ? 0.014 : 0.022 },
      },
      vertexShader: beamVertexShader,
    });
    beamMaterial.name = 'drive-headlight-beam-material';
    beamMaterial.userData.driveLightMarker = 'drive-headlight-beam-material';
    beamMaterial.userData.driveLightChannel = 'highBeam';
    const glowMaterial = new THREE.ShaderMaterial({
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      fragmentShader: glowFragmentShader,
      side: THREE.FrontSide,
      toneMapped: false,
      transparent: true,
      uniforms: {
        uBlend: { value: 0 },
        uColor: { value: new THREE.Color('#e4f6ff') },
        uOpacity: { value: mobileOptimized ? 0.16 : 0.22 },
      },
      vertexShader: glowVertexShader,
    });
    glowMaterial.name = 'drive-headlight-glow-material';
    glowMaterial.userData.driveLightMarker = 'drive-headlight-glow-material';
    glowMaterial.userData.driveLightChannel = 'highBeam';

    return { beamGeometry, beamMaterial, glowGeometry, glowMaterial };
  }, [mobileOptimized]);

  useEffect(() => {
    const pendingDisposal = EFFECT_DISPOSAL_TIMERS.get(resources);
    if (pendingDisposal !== undefined) {
      window.clearTimeout(pendingDisposal);
      EFFECT_DISPOSAL_TIMERS.delete(resources);
    }
    return () => {
      const timer = window.setTimeout(() => {
        resources.beamGeometry.dispose();
        resources.beamMaterial.dispose();
        resources.glowGeometry.dispose();
        resources.glowMaterial.dispose();
        EFFECT_DISPOSAL_TIMERS.delete(resources);
      }, 0);
      EFFECT_DISPOSAL_TIMERS.set(resources, timer);
    };
  }, [resources]);

  useFrame(() => {
    writeVehicleLightStages(interactionRig.driveLightBlend, lightStages.current);
    resources.beamMaterial.uniforms.uBlend!.value = lightStages.current.highBeam;
    resources.glowMaterial.uniforms.uBlend!.value = lightStages.current.highBeam;
  });

  return (
    <>
      <mesh name={'drive-headlight-beam-right'} userData={BEAM_RIGHT_USER_DATA} dispose={null} geometry={resources.beamGeometry} material={resources.beamMaterial} position={[-HEADLIGHT_X, BEAM_GROUND_Y, HEADLIGHT_Z]} renderOrder={3} />
      <mesh name={'drive-headlight-beam-left'} userData={BEAM_LEFT_USER_DATA} dispose={null} geometry={resources.beamGeometry} material={resources.beamMaterial} position={[HEADLIGHT_X, BEAM_GROUND_Y, HEADLIGHT_Z]} renderOrder={3} />
      <mesh name={'drive-headlight-glow-right'} userData={GLOW_RIGHT_USER_DATA} dispose={null} geometry={resources.glowGeometry} material={resources.glowMaterial} position={[-HEADLIGHT_X, HEADLIGHT_Y, GLOW_Z]} renderOrder={4} />
      <mesh name={'drive-headlight-glow-left'} userData={GLOW_LEFT_USER_DATA} dispose={null} geometry={resources.glowGeometry} material={resources.glowMaterial} position={[HEADLIGHT_X, HEADLIGHT_Y, GLOW_Z]} renderOrder={4} />
    </>
  );
}
