import * as THREE from 'three';

export interface VehicleLightStages {
  running: number;
  lowBeam: number;
  highBeam: number;
}

type VehicleLightStage = keyof VehicleLightStages;

interface FrontLightContract {
  readonly rootName: string;
  readonly childName: string;
  readonly materialName: 'ext_chrome' | 'material';
  readonly positionCount: number;
  readonly indexCount: number;
  readonly marker: string;
  readonly stage: VehicleLightStage;
  readonly emissive: THREE.ColorRepresentation;
  readonly intensity: number;
}

interface RearLightContract {
  readonly materialName: 'tail_lights_red' | 'redled';
  readonly marker: string;
  readonly emissive: THREE.ColorRepresentation;
  readonly intensity: number;
}

interface ResolvedFrontLight {
  readonly contract: FrontLightContract;
  readonly mesh: THREE.Mesh;
  readonly sourceMaterial: THREE.MeshStandardMaterial;
}

interface MaterialMarkerSnapshot {
  readonly hadMarker: boolean;
  readonly marker: unknown;
  readonly hadChannel: boolean;
  readonly channel: unknown;
  readonly hadSource: boolean;
  readonly source: unknown;
}

interface LightMaterialState {
  readonly material: THREE.MeshStandardMaterial;
  readonly stage: VehicleLightStage;
  readonly baseEmissive: THREE.Color;
  readonly baseIntensity: number;
  readonly activeEmissive: THREE.Color;
  readonly activeIntensity: number;
  readonly markerSnapshot: MaterialMarkerSnapshot;
}

export interface VehicleLightAssembly {
  readonly spotRig: THREE.Group;
  readonly detachedMaterials: readonly THREE.Material[];
  render(blend: number): void;
  dispose(): void;
}

const FRONT_LIGHT_CONTRACTS: readonly FrontLightContract[] = [
  { rootName: 'DRL_20', childName: 'Object_43', materialName: 'material', positionCount: 174, indexCount: 714, marker: 'drive-drl', stage: 'running', emissive: '#d8f2ff', intensity: 2.8 },
  { rootName: 'parklight_leds_17', childName: 'Object_39', materialName: 'ext_chrome', positionCount: 252, indexCount: 720, marker: 'drive-park', stage: 'running', emissive: '#d7efff', intensity: 3.2 },
  { rootName: 'licenseplatelight_15', childName: 'Object_35', materialName: 'ext_chrome', positionCount: 8, indexCount: 12, marker: 'drive-license', stage: 'running', emissive: '#fff0cf', intensity: 1.7 },
  { rootName: 'lowbeam_lens_16', childName: 'Object_37', materialName: 'ext_chrome', positionCount: 212, indexCount: 960, marker: 'drive-low-beam', stage: 'lowBeam', emissive: '#e5f6ff', intensity: 4.2 },
  { rootName: 'highbeam_lens_14', childName: 'Object_33', materialName: 'ext_chrome', positionCount: 106, indexCount: 480, marker: 'drive-high-beam', stage: 'highBeam', emissive: '#d9f2ff', intensity: 5.2 },
] as const;

const REAR_LIGHT_CONTRACTS: readonly RearLightContract[] = [
  { materialName: 'tail_lights_red', marker: 'drive-tail-glass', emissive: '#ff1208', intensity: 1.05 },
  { materialName: 'redled', marker: 'drive-tail-led', emissive: '#ff1c10', intensity: 1.65 },
] as const;

const HEADLIGHT_X = 0.7;
const HEADLIGHT_Y = 0.63;
const HEADLIGHT_Z = 2.14;
const HEADLIGHT_TARGET_Y = 0.04;
const HEADLIGHT_TARGET_Z = 9.8;

function meshMaterials(mesh: THREE.Mesh): readonly THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function captureMarkerSnapshot(material: THREE.Material): MaterialMarkerSnapshot {
  return {
    hadMarker: Object.prototype.hasOwnProperty.call(material.userData, 'driveLightMarker'),
    marker: material.userData.driveLightMarker,
    hadChannel: Object.prototype.hasOwnProperty.call(material.userData, 'driveLightChannel'),
    channel: material.userData.driveLightChannel,
    hadSource: Object.prototype.hasOwnProperty.call(material.userData, 'driveLightSource'),
    source: material.userData.driveLightSource,
  };
}

function restoreMarkerSnapshot(material: THREE.Material, snapshot: MaterialMarkerSnapshot): void {
  if (snapshot.hadMarker) material.userData.driveLightMarker = snapshot.marker;
  else delete material.userData.driveLightMarker;
  if (snapshot.hadChannel) material.userData.driveLightChannel = snapshot.channel;
  else delete material.userData.driveLightChannel;
  if (snapshot.hadSource) material.userData.driveLightSource = snapshot.source;
  else delete material.userData.driveLightSource;
}

function createMaterialState(
  material: THREE.MeshStandardMaterial,
  stage: VehicleLightStage,
  marker: string,
  sourceName: string,
  emissive: THREE.ColorRepresentation,
  intensity: number,
): LightMaterialState {
  const markerSnapshot = captureMarkerSnapshot(material);
  material.userData.driveLightMarker = marker;
  material.userData.driveLightChannel = stage;
  material.userData.driveLightSource = sourceName;
  return {
    material,
    stage,
    baseEmissive: material.emissive.clone(),
    baseIntensity: material.emissiveIntensity,
    activeEmissive: new THREE.Color(emissive),
    activeIntensity: intensity,
    markerSnapshot,
  };
}

function resolveFrontLights(root: THREE.Object3D): readonly ResolvedFrontLight[] | null {
  const objectsByName = new Map<string, THREE.Object3D[]>();
  root.traverse((object) => {
    const matches = objectsByName.get(object.name);
    if (matches) matches.push(object);
    else objectsByName.set(object.name, [object]);
  });

  const resolved: ResolvedFrontLight[] = [];
  for (const contract of FRONT_LIGHT_CONTRACTS) {
    const rootMatches = objectsByName.get(contract.rootName) ?? [];
    const lightRoot = rootMatches[0];
    if (rootMatches.length !== 1 || !lightRoot || lightRoot instanceof THREE.Mesh || lightRoot.children.length !== 1) return null;
    const mesh = lightRoot.children[0];
    if (!(mesh instanceof THREE.Mesh) || mesh.name !== contract.childName) return null;
    const materials = meshMaterials(mesh);
    const material = materials[0];
    const position = mesh.geometry.getAttribute('position');
    if (
      materials.length !== 1
      || !(material instanceof THREE.MeshStandardMaterial)
      || material.name !== contract.materialName
      || position?.count !== contract.positionCount
      || (mesh.geometry.index?.count ?? 0) !== contract.indexCount
    ) return null;
    resolved.push({ contract, mesh, sourceMaterial: material });
  }
  return resolved;
}

function resolveRearLights(root: THREE.Object3D): readonly THREE.MeshStandardMaterial[] | null {
  const matches = new Map<string, Set<THREE.MeshStandardMaterial>>(
    REAR_LIGHT_CONTRACTS.map(({ materialName }) => [materialName, new Set()]),
  );
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    meshMaterials(object).forEach((material) => {
      if (material instanceof THREE.MeshStandardMaterial) matches.get(material.name)?.add(material);
    });
  });
  const resolved: THREE.MeshStandardMaterial[] = [];
  for (const contract of REAR_LIGHT_CONTRACTS) {
    const materials = [...(matches.get(contract.materialName) ?? [])];
    if (materials.length !== 1) return null;
    resolved.push(materials[0]!);
  }
  return resolved;
}

function createSpotLight(side: 'left' | 'right', x: number): { readonly light: THREE.SpotLight; readonly target: THREE.Object3D } {
  const name = `drive-headlight-${side}`;
  const light = new THREE.SpotLight('#d9f2ff', 0, 12, 0.22, 0.7, 2);
  light.name = name;
  light.position.set(x, HEADLIGHT_Y, HEADLIGHT_Z);
  light.castShadow = false;
  light.visible = true;
  light.userData.driveLightMarker = 'drive-headlight-spot';
  light.userData.driveLightChannel = 'lowBeam+highBeam';
  light.userData.driveLightSide = side;
  const target = new THREE.Object3D();
  target.name = `${name}-target`;
  target.position.set(x, HEADLIGHT_TARGET_Y, HEADLIGHT_TARGET_Z);
  target.userData.driveLightMarker = 'drive-headlight-target';
  target.userData.driveLightSide = side;
  light.target = target;
  return { light, target };
}

export function writeVehicleLightStages(blend: number, target: VehicleLightStages): VehicleLightStages {
  const normalized = THREE.MathUtils.clamp(blend, 0, 1);
  target.running = THREE.MathUtils.smoothstep(normalized, 0, 0.36);
  target.lowBeam = THREE.MathUtils.smoothstep(normalized, 0.22, 0.7);
  target.highBeam = THREE.MathUtils.smoothstep(normalized, 0.58, 1);
  return target;
}

export function createVehicleLightAssembly(root: THREE.Object3D): VehicleLightAssembly | null {
  const frontLights = resolveFrontLights(root);
  const rearMaterials = resolveRearLights(root);
  if (!frontLights || !rearMaterials) return null;

  const frontMaterials = frontLights.map(({ sourceMaterial }) => sourceMaterial.clone());
  const materialStates: LightMaterialState[] = [];
  frontLights.forEach(({ contract, mesh, sourceMaterial }, index) => {
    const isolated = frontMaterials[index]!;
    isolated.name = sourceMaterial.name;
    mesh.material = isolated;
    materialStates.push(createMaterialState(isolated, contract.stage, contract.marker, sourceMaterial.name, contract.emissive, contract.intensity));
  });
  rearMaterials.forEach((material, index) => {
    const contract = REAR_LIGHT_CONTRACTS[index]!;
    materialStates.push(createMaterialState(material, 'running', contract.marker, contract.materialName, contract.emissive, contract.intensity));
  });

  const attachedMaterials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) meshMaterials(object).forEach((material) => attachedMaterials.add(material));
  });
  const detachedMaterials = [...new Set(frontLights.map(({ sourceMaterial }) => sourceMaterial))]
    .filter((material) => !attachedMaterials.has(material));

  const spotRig = new THREE.Group();
  spotRig.name = 'drive-headlight-rig';
  spotRig.userData.driveLightMarker = 'drive-headlight-rig';
  const leftSpot = createSpotLight('left', HEADLIGHT_X);
  const rightSpot = createSpotLight('right', -HEADLIGHT_X);
  spotRig.add(leftSpot.light, leftSpot.target, rightSpot.light, rightSpot.target);
  const spots = [leftSpot.light, rightSpot.light] as const;
  const stages: VehicleLightStages = { running: 0, lowBeam: 0, highBeam: 0 };
  let renderedBlend = Number.NaN;
  let disposed = false;

  const render = (blend: number): void => {
    if (disposed) return;
    const normalized = THREE.MathUtils.clamp(blend, 0, 1);
    if (renderedBlend === normalized) return;
    renderedBlend = normalized;
    writeVehicleLightStages(normalized, stages);
    materialStates.forEach((state) => {
      const stageBlend = stages[state.stage];
      state.material.emissive.copy(state.baseEmissive).lerp(state.activeEmissive, stageBlend);
      state.material.emissiveIntensity = THREE.MathUtils.lerp(state.baseIntensity, state.activeIntensity, stageBlend);
    });
    const intensity = stages.lowBeam * 14 + stages.highBeam * 28;
    const angle = THREE.MathUtils.lerp(0.22, 0.14, stages.highBeam);
    const distance = THREE.MathUtils.lerp(12, 20, stages.highBeam);
    const penumbra = THREE.MathUtils.lerp(0.7, 0.42, stages.highBeam);
    spots.forEach((spot) => {
      spot.intensity = intensity;
      spot.angle = angle;
      spot.distance = distance;
      spot.penumbra = penumbra;
    });
  };

  return {
    spotRig,
    detachedMaterials,
    render,
    dispose: () => {
      if (disposed) return;
      render(0);
      materialStates.forEach((state) => {
        state.material.emissive.copy(state.baseEmissive);
        state.material.emissiveIntensity = state.baseIntensity;
        restoreMarkerSnapshot(state.material, state.markerSnapshot);
      });
      frontLights.forEach(({ mesh, sourceMaterial }) => { mesh.material = sourceMaterial; });
      spots.forEach((spot) => {
        spot.intensity = 0;
        spot.castShadow = false;
        spot.dispose();
      });
      spotRig.clear();
      disposed = true;
    },
  };
}
