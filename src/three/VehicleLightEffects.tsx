import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { VehicleInteractionRig } from './VehicleInteractionRig';
import { resolveVehicleLightBlend, writeVehicleLightStages, type VehicleHeadlightAnchors, type VehicleLightStages } from './vehicleLightAssembly';

interface Props {
  readonly headlightAnchors: VehicleHeadlightAnchors;
  readonly interactionRig: VehicleInteractionRig;
  readonly manualLightsOn: boolean;
  readonly mobileOptimized: boolean;
}

const FRONT_FLARE_WIDTH = 2.05;
const FRONT_FLARE_HEIGHT = 1.08;
const LOW_BEAM_PATTERN_WIDTH = 5;
const LOW_BEAM_PATTERN_LENGTH = 7;
const LOW_BEAM_PATTERN_Y = -0.06;
const LOW_BEAM_PATTERN_ORIGIN_OFFSET = 0.08;
const REAR_LIGHT_X = 0.59;
const REAR_LIGHT_Y = 0.745;
const REAR_GLOW_Z = -2.145;
const REAR_SPILL_Y = -0.04;
const REAR_SPILL_Z = -2.7;
const EFFECT_DISPOSAL_TIMERS = new WeakMap<object, number>();
const ROAD_PATTERN_USER_DATA = { driveLightMarker: 'drive-headlight-road-pattern', driveLightChannel: 'lowBeam' } as const;
const GLOW_RIGHT_USER_DATA = { driveLightMarker: 'drive-headlight-glow', driveLightChannel: 'lowBeam', driveLightSide: 'right' } as const;
const GLOW_LEFT_USER_DATA = { driveLightMarker: 'drive-headlight-glow', driveLightChannel: 'lowBeam', driveLightSide: 'left' } as const;
const REAR_GLOW_RIGHT_USER_DATA = { driveLightMarker: 'drive-tail-glow', driveLightChannel: 'running', driveLightSide: 'right' } as const;
const REAR_GLOW_LEFT_USER_DATA = { driveLightMarker: 'drive-tail-glow', driveLightChannel: 'running', driveLightSide: 'left' } as const;
const REAR_SPILL_USER_DATA = { driveLightMarker: 'drive-tail-ground-spill', driveLightChannel: 'running' } as const;

const beamVertexShader = /* glsl */`
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const roadPatternVertexShader = /* glsl */`
  varying vec2 vUv;
  varying float vViewAlignment;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec3 worldForward = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    vec2 toCamera = cameraPosition.xz - worldPosition.xz;
    vec2 forward = worldForward.xz;
    float denominator = max(length(toCamera) * length(forward), 0.0001);
    vViewAlignment = clamp(dot(toCamera, forward) / denominator, 0.0, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const beamFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3 uColor;
  uniform float uBlend;
  uniform float uLampOffset;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vViewAlignment;

  void main() {
    float travel = 1.0 - vUv.y;
    float lateral = vUv.x * 2.0 - 1.0;
    float lampCenter = uLampOffset * (1.0 - travel * 0.18);
    float lobeWidth = mix(0.075, 0.42, smoothstep(0.0, 0.9, travel));
    float leftLobe = exp(-pow((lateral + lampCenter) / lobeWidth, 2.0));
    float rightLobe = exp(-pow((lateral - lampCenter) / lobeWidth, 2.0));
    float twinLobes = 1.0 - (1.0 - leftLobe) * (1.0 - rightLobe);
    float mergedWidth = mix(0.14, 0.68, travel);
    float mergedFill = exp(-pow(lateral / mergedWidth, 2.0)) * smoothstep(0.10, 0.34, travel);
    float spread = mix(uLampOffset + 0.14, 1.0, smoothstep(0.0, 0.88, travel));
    float roadEdge = 1.0 - smoothstep(spread * 0.76, spread, abs(lateral));
    float nearFade = smoothstep(0.015, 0.12, travel);
    float farCutoff = 1.0 - smoothstep(0.8, 1.0, travel + abs(lateral) * 0.035);
    float midBand = exp(-pow((travel - 0.34) / 0.30, 2.0));
    float longitudinal = 0.42 + 0.58 * midBand;
    float distribution = max(twinLobes, mergedFill * 0.66);
    float energy = roadEdge * nearFade * farCutoff * longitudinal * distribution;
    float sideViewFade = smoothstep(0.14, 0.46, vViewAlignment);
    float alpha = clamp(uBlend, 0.0, 1.0) * uOpacity * energy * sideViewFade;
    if (alpha <= 0.0005) discard;
    vec3 color = mix(uColor, vec3(1.0), distribution * 0.38);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

const flareFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3 uColor;
  uniform vec3 uCoreColor;
  uniform float uBlend;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    vec2 point = (vUv - 0.5) * 2.0;
    float haloRadius = length(vec2(point.x * 1.9, point.y));
    float rayRadius = length(point);
    float core = exp(-haloRadius * haloRadius * 160.0);
    float innerHalo = exp(-haloRadius * haloRadius * 22.0);
    float outerHalo = exp(-haloRadius * haloRadius * 4.8);
    float horizontal = exp(-abs(point.y) * 72.0) * exp(-abs(point.x) * 2.7);
    float vertical = exp(-abs(point.x) * 64.0) * exp(-abs(point.y) * 4.0);
    float diagonalA = exp(-abs(point.y - point.x * 0.62) * 50.0) * exp(-rayRadius * 3.6);
    float diagonalB = exp(-abs(point.y + point.x * 0.62) * 50.0) * exp(-rayRadius * 3.6);
    float star = horizontal * 0.62 + vertical * 0.52 + (diagonalA + diagonalB) * 0.1;
    float edgeFade = 1.0 - smoothstep(0.78, 1.0, max(abs(point.x), abs(point.y)));
    float energy = (core * 1.4 + innerHalo * 0.62 + outerHalo * 0.15 + star) * edgeFade;
    float alpha = clamp(uBlend, 0.0, 1.0) * uOpacity * clamp(energy, 0.0, 1.0);
    if (alpha <= 0.0005) discard;
    vec3 color = mix(uColor, uCoreColor, clamp(core * 2.0 + innerHalo * 0.52, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
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
  uniform vec3 uCoreColor;
  uniform float uBlend;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    vec2 point = (vUv - 0.5) * 2.0;
    float radius = length(point);
    float halo = 1.0 - smoothstep(0.05, 1.0, radius);
    halo *= halo;
    float core = 1.0 - smoothstep(0.0, 0.28, radius);
    float horizontal = (1.0 - smoothstep(0.025, 0.12, abs(point.y)))
      * (1.0 - smoothstep(0.18, 1.0, abs(point.x)));
    float vertical = (1.0 - smoothstep(0.025, 0.12, abs(point.x)))
      * (1.0 - smoothstep(0.12, 0.82, abs(point.y)));
    float flare = max(horizontal, vertical * 0.52) * (1.0 - smoothstep(0.08, 1.0, radius));
    float energy = max(halo * 0.78, max(core, flare * 0.62));
    float alpha = clamp(uBlend, 0.0, 1.0) * uOpacity * energy;
    if (alpha <= 0.0005) discard;
    vec3 color = mix(uColor, uCoreColor, clamp(core * 0.82 + flare * 0.38, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

const spillFragmentShader = /* glsl */`
  precision highp float;

  uniform vec3 uColor;
  uniform float uBlend;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    vec2 point = (vUv - 0.5) * 2.0;
    float field = 1.0 - smoothstep(0.08, 1.0, length(vec2(point.x * 0.78, point.y)));
    float rightLobe = 1.0 - smoothstep(0.04, 0.72, length(vec2(point.x + 0.42, point.y * 0.9)));
    float leftLobe = 1.0 - smoothstep(0.04, 0.72, length(vec2(point.x - 0.42, point.y * 0.9)));
    float reflection = max(field * 0.58, max(rightLobe, leftLobe));
    reflection *= reflection;
    float alpha = clamp(uBlend, 0.0, 1.0) * uOpacity * reflection;
    if (alpha <= 0.0005) discard;
    gl_FragColor = vec4(uColor, alpha);
    #include <colorspace_fragment>
  }
`;

export function VehicleLightEffects({ headlightAnchors, interactionRig, manualLightsOn, mobileOptimized }: Props) {
  const lightStages = useRef<VehicleLightStages>({ running: 0, lowBeam: 0, highBeam: 0 });
  const frontCenterX = (headlightAnchors.left.x + headlightAnchors.right.x) * 0.5;
  const frontOriginZ = Math.max(headlightAnchors.left.z, headlightAnchors.right.z) + LOW_BEAM_PATTERN_ORIGIN_OFFSET;
  const normalizedLampOffset = THREE.MathUtils.clamp(
    Math.abs(headlightAnchors.left.x - headlightAnchors.right.x) / LOW_BEAM_PATTERN_WIDTH,
    0.18,
    0.42,
  );
  const resources = useMemo(() => {
    const beamGeometry = new THREE.PlaneGeometry(LOW_BEAM_PATTERN_WIDTH, LOW_BEAM_PATTERN_LENGTH);
    beamGeometry.rotateX(-Math.PI / 2);
    beamGeometry.translate(0, 0, LOW_BEAM_PATTERN_LENGTH / 2);
    beamGeometry.computeBoundingSphere();
    beamGeometry.name = 'drive-headlight-road-pattern-geometry';
    beamGeometry.userData.driveLightMarker = 'drive-headlight-road-pattern-geometry';

    const glowGeometry = new THREE.PlaneGeometry(FRONT_FLARE_WIDTH, FRONT_FLARE_HEIGHT);
    glowGeometry.name = 'drive-headlight-glow-geometry';
    glowGeometry.userData.driveLightMarker = 'drive-headlight-glow-geometry';
    const rearGlowGeometry = new THREE.PlaneGeometry(
      mobileOptimized ? 0.46 : 0.52,
      mobileOptimized ? 0.34 : 0.4,
    );
    rearGlowGeometry.name = 'drive-tail-glow-geometry';
    rearGlowGeometry.userData.driveLightMarker = 'drive-tail-glow-geometry';
    const rearSpillGeometry = new THREE.PlaneGeometry(2.9, 2.1);
    rearSpillGeometry.rotateX(-Math.PI / 2);
    rearSpillGeometry.name = 'drive-tail-ground-spill-geometry';
    rearSpillGeometry.userData.driveLightMarker = 'drive-tail-ground-spill-geometry';
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
        uColor: { value: new THREE.Color('#d8e5ed') },
        uLampOffset: { value: normalizedLampOffset },
        uOpacity: { value: mobileOptimized ? 0.12 : 0.16 },
      },
      vertexShader: roadPatternVertexShader,
    });
    beamMaterial.name = 'drive-headlight-road-pattern-material';
    beamMaterial.userData.driveLightMarker = 'drive-headlight-road-pattern-material';
    beamMaterial.userData.driveLightChannel = 'lowBeam';
    const glowMaterial = new THREE.ShaderMaterial({
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      fragmentShader: flareFragmentShader,
      side: THREE.DoubleSide,
      toneMapped: false,
      transparent: true,
      uniforms: {
        uBlend: { value: 0 },
        uColor: { value: new THREE.Color('#dcefff') },
        uCoreColor: { value: new THREE.Color('#ffffff') },
        uOpacity: { value: mobileOptimized ? 0.72 : 0.88 },
      },
      vertexShader: glowVertexShader,
    });
    glowMaterial.name = 'drive-headlight-glow-material';
    glowMaterial.userData.driveLightMarker = 'drive-headlight-glow-material';
    glowMaterial.userData.driveLightChannel = 'lowBeam';
    const rearGlowMaterial = new THREE.ShaderMaterial({
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      fragmentShader: glowFragmentShader,
      side: THREE.DoubleSide,
      toneMapped: false,
      transparent: true,
      uniforms: {
        uBlend: { value: 0 },
        uColor: { value: new THREE.Color('#ff2718') },
        uCoreColor: { value: new THREE.Color('#ffd2c7') },
        uOpacity: { value: mobileOptimized ? 0.3 : 0.4 },
      },
      vertexShader: glowVertexShader,
    });
    rearGlowMaterial.name = 'drive-tail-glow-material';
    rearGlowMaterial.userData.driveLightMarker = 'drive-tail-glow-material';
    rearGlowMaterial.userData.driveLightChannel = 'running';
    const rearSpillMaterial = new THREE.ShaderMaterial({
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      fragmentShader: spillFragmentShader,
      side: THREE.FrontSide,
      toneMapped: false,
      transparent: true,
      uniforms: {
        uBlend: { value: 0 },
        uColor: { value: new THREE.Color('#ff2417') },
        uOpacity: { value: mobileOptimized ? 0.08 : 0.105 },
      },
      vertexShader: beamVertexShader,
    });
    rearSpillMaterial.name = 'drive-tail-ground-spill-material';
    rearSpillMaterial.userData.driveLightMarker = 'drive-tail-ground-spill-material';
    rearSpillMaterial.userData.driveLightChannel = 'running';

    return {
      beamGeometry,
      beamMaterial,
      glowGeometry,
      glowMaterial,
      rearGlowGeometry,
      rearGlowMaterial,
      rearSpillGeometry,
      rearSpillMaterial,
    };
  }, [mobileOptimized, normalizedLampOffset]);

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
        resources.rearGlowGeometry.dispose();
        resources.rearGlowMaterial.dispose();
        resources.rearSpillGeometry.dispose();
        resources.rearSpillMaterial.dispose();
        EFFECT_DISPOSAL_TIMERS.delete(resources);
      }, 0);
      EFFECT_DISPOSAL_TIMERS.set(resources, timer);
    };
  }, [resources]);

  useFrame(() => {
    writeVehicleLightStages(
      resolveVehicleLightBlend(interactionRig.driveLightBlend, manualLightsOn),
      lightStages.current,
    );
    resources.beamMaterial.uniforms.uBlend!.value = lightStages.current.lowBeam;
    resources.glowMaterial.uniforms.uBlend!.value = lightStages.current.lowBeam;
    resources.rearGlowMaterial.uniforms.uBlend!.value = lightStages.current.running;
    resources.rearSpillMaterial.uniforms.uBlend!.value = lightStages.current.running;
  });

  return (
    <>
      <mesh name={'drive-headlight-road-pattern'} userData={ROAD_PATTERN_USER_DATA} dispose={null} geometry={resources.beamGeometry} material={resources.beamMaterial} position={[frontCenterX, LOW_BEAM_PATTERN_Y, frontOriginZ]} renderOrder={3} />
      <mesh name={'drive-headlight-glow-right'} userData={GLOW_RIGHT_USER_DATA} dispose={null} geometry={resources.glowGeometry} material={resources.glowMaterial} position={headlightAnchors.right} renderOrder={5} />
      <mesh name={'drive-headlight-glow-left'} userData={GLOW_LEFT_USER_DATA} dispose={null} geometry={resources.glowGeometry} material={resources.glowMaterial} position={headlightAnchors.left} renderOrder={5} />
      <mesh name={'drive-tail-glow-right'} userData={REAR_GLOW_RIGHT_USER_DATA} dispose={null} geometry={resources.rearGlowGeometry} material={resources.rearGlowMaterial} position={[-REAR_LIGHT_X, REAR_LIGHT_Y, REAR_GLOW_Z]} renderOrder={4} />
      <mesh name={'drive-tail-glow-left'} userData={REAR_GLOW_LEFT_USER_DATA} dispose={null} geometry={resources.rearGlowGeometry} material={resources.rearGlowMaterial} position={[REAR_LIGHT_X, REAR_LIGHT_Y, REAR_GLOW_Z]} renderOrder={4} />
      <mesh name={'drive-tail-ground-spill'} userData={REAR_SPILL_USER_DATA} dispose={null} geometry={resources.rearSpillGeometry} material={resources.rearSpillMaterial} position={[0, REAR_SPILL_Y, REAR_SPILL_Z]} renderOrder={3} />
    </>
  );
}
