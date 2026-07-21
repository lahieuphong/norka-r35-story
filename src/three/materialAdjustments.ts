import * as THREE from 'three';

export interface ReferenceMaterialMaps {
  readonly paint: THREE.Texture;
  readonly carbon: THREE.Texture;
  readonly carbonNormal: THREE.Texture;
  readonly glass: THREE.Texture;
}

interface MaterialProfile {
  readonly metalness: number;
  readonly roughness: number;
  readonly specularIntensity: number;
  readonly color?: readonly [number, number, number];
  readonly colorFactor?: number;
  readonly map?: 'paint' | 'carbon' | 'glass';
  readonly normal?: Readonly<{ channel: number; repeat: number }>;
  readonly normalScale?: number;
  readonly opacity?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly alphaTest?: number;
  readonly envMapIntensity?: number;
}

// Linear color and PBR values recovered from the material profile attached to
// the vecarz Sketchfab edition. The downloaded GLB contains the same geometry,
// but not these viewer-side overrides.
const MATERIAL_PROFILES = {
  back_masking: { metalness: 1, roughness: 0.17523862929867975, specularIntensity: 1 },
  chrome_8C8D8DFF: { metalness: 1, roughness: 0.1630481159561629, specularIntensity: 0.4, color: [1, 1, 1] },
  painted_metal_smooth_930000FF: { metalness: 0, roughness: 0.76, specularIntensity: 0.4 },
  gtr_009_gtr_007_diff: { metalness: 1, roughness: 0.37638209945020784, specularIntensity: 0.2 },
  plastic_smooth_010101FF: { metalness: 1, roughness: 0.6811449330131292, specularIntensity: 0.1, color: [0.03282970664197667, 0.03282970664197667, 0.03282970664197667] },
  black_glass: { metalness: 1, roughness: 0.05, specularIntensity: 1 },
  black_plastic: { metalness: 1, roughness: 0.5348587729029269, specularIntensity: 0.3, colorFactor: 0.047238239202252806 },
  ext_body: { metalness: 0.5409540295741854, roughness: 0.24228645268252244, specularIntensity: 1, map: 'paint', clearcoat: 0.4190488961490168, clearcoatRoughness: 0, envMapIntensity: 0.55 },
  ext_carbon: { metalness: 1, roughness: 0.9005741731784325, specularIntensity: 0.6872401896843876, map: 'carbon', normal: { channel: 2, repeat: 75.32969931927695 } },
  ext_chrome: { metalness: 1, roughness: 0.05, specularIntensity: 1 },
  darkgrayplastic: { metalness: 1, roughness: 0.8700978898221403, specularIntensity: 0.3, color: [0.007726100576177697, 0.007726100576177697, 0.007726100576177697], normal: { channel: 2, repeat: 86.58520248957117 }, clearcoat: 0.010666699174702246, clearcoatRoughness: 0.13257183259987076 },
  material: { metalness: 1, roughness: 0.23009593934000558, specularIntensity: 1 },
  CSR2_Engine: { metalness: 1, roughness: 1, specularIntensity: 1 },
  CSR2_EngineA: { metalness: 1, roughness: 1, specularIntensity: 1 },
  CSR2_SpecularTint: { metalness: 0.8335263497945898, roughness: 0.24228645268252244, specularIntensity: 0.4, clearcoat: 1, clearcoatRoughness: 0.18133388596993819 },
  ext_glass: { metalness: 1, roughness: 0.05, specularIntensity: 1, map: 'glass', opacity: 1, clearcoat: 1, clearcoatRoughness: 0 },
  ext_grill: { metalness: 1, roughness: 0.32152478940888196, specularIntensity: 0.2, color: [0.015876293507004053, 0.015876293507004053, 0.015876293507004053], opacity: 1 },
  CSR2_Badge: { metalness: 0, roughness: 0.5, specularIntensity: 0.4 },
  region_plates: { metalness: 0.7116212163694212, roughness: 0.5897160829442527, specularIntensity: 0.4, color: [0.018704943955272956, 0.018704943955272956, 0.018704943955272956], normal: { channel: 0, repeat: 7.270133001658157 } },
  tail_lights_red: { metalness: 1, roughness: 0.10209554924357864, specularIntensity: 0.8, opacity: 0.7969548097670393, clearcoat: 1, clearcoatRoughness: 0 },
  redled: { metalness: 0, roughness: 0.05, specularIntensity: 1 },
  tail_light_reverse_indicator: { metalness: 1, roughness: 0, specularIntensity: 0.8, color: [0.12256760431052603, 0.12256760431052603, 0.12256760431052603], normalScale: 0.15085760261364606, opacity: 0.5104777462178932, clearcoat: 1, clearcoatRoughness: 0 },
  side_mirror_glass: { metalness: 0.9432409698772415, roughness: 0, specularIntensity: 0.8 },
  caliperrs: { metalness: 1, roughness: 0.4921919762041179, specularIntensity: 0.2 },
  towhook: { metalness: 1, roughness: 0.5, specularIntensity: 0.7 },
  CENTER: { metalness: 0, roughness: 0.5, specularIntensity: 0.4 },
  EXT_Disc: { metalness: 0, roughness: 0.27276273603881457, specularIntensity: 0.5, normalScale: 0.5531445429167022 },
  Material_56: { metalness: 1, roughness: 0.4373346661627921, specularIntensity: 0.4 },
  lugnuts: { metalness: 1, roughness: 1, specularIntensity: 0.2 },
  Material_53: { metalness: 1, roughness: 0.99, specularIntensity: 0.4, normalScale: 0.7360022430544549, opacity: 1 },
  '03_-_Default': { metalness: 1, roughness: 0.17523862929867975, specularIntensity: 0.2, color: [0.07149847734860362, 0.07149847734860362, 0.07149847734860362], clearcoat: 1, clearcoatRoughness: 0.04 },
  Material_52: { metalness: 1, roughness: 0.2971437627238483, specularIntensity: 0.4, opacity: 1 },
  ism_jzx100_solid: { metalness: 0, roughness: 0.9, specularIntensity: 0.2 },
  tiresss: { metalness: 0.7055259596981628, roughness: 0.5104777462178932, specularIntensity: 0.06, normalScale: 0.7847642964245224 },
  INT_Cockpit_OCC_PLASTIC: { metalness: 1, roughness: 0.23009593934000558, specularIntensity: 0.6, color: [0.001712375681525524, 0.001712375681525524, 0.001712375681525524] },
  INT_Decals_PlLASTIC: { metalness: 1, roughness: 0.05, specularIntensity: 0.2 },
  INT_Decals_EMISSIVE: { metalness: 1, roughness: 0.5, specularIntensity: 1 },
  INT_Decals_EMISSIVE_Ref: { metalness: 1, roughness: 0, specularIntensity: 0.6 },
  INT_Decals_Chrome: { metalness: 0, roughness: 0.05, specularIntensity: 0.6 },
  INT_Belt_NM: { metalness: 0, roughness: 0.99, specularIntensity: 0, colorFactor: 0.13257183259987076 },
  INT_Cockpit_OCC_Carpaint: { metalness: 1, roughness: 1, specularIntensity: 0.8 },
  INT_Decals_PlLASTIC_ref: { metalness: 1, roughness: 0.05, specularIntensity: 0.6 },
  INT_Decals_ALu: { metalness: 1, roughness: 0.35809632943643255, specularIntensity: 0.8 },
  INT_Net_NM: { metalness: 0.9859077665760504, roughness: 0.4678109495190842, specularIntensity: 0 },
  INT_Decals_FLAT_alfa: { metalness: 0, roughness: 0.99, specularIntensity: 0, alphaTest: 0.2971437627238483 },
  INT_Decals_Metal_Alfa: { metalness: 0, roughness: 0.05, specularIntensity: 0.2 },
  INT_Seams: { metalness: 0.5043824895466348, roughness: 0.9127646865209493, specularIntensity: 0, color: [1, 0.002739801090440838, 0.002739801090440838], alphaTest: 0.7116212163694212 },
  INT_Cockpit_OCC_Skin: { metalness: 1, roughness: 0.7116212163694212, specularIntensity: 0.3, color: [0.005572829822086463, 0.005572829822086463, 0.005572829822086463] },
  INT_Cockpit_OCC_AUDIO: { metalness: 1, roughness: 1, specularIntensity: 0.5, colorFactor: 0 },
  INT_Cockpit_OCC_METAL_black: { metalness: 0.5958113396155111, roughness: 0.4190488961490168, specularIntensity: 0, colorFactor: 0.047238239202252806 },
  INT_Cockpit_OCC_Alu: { metalness: 1, roughness: 1, specularIntensity: 0.4, color: [0.007149217809741786, 0.007149217809741786, 0.007149217809741786] },
  INT_Cockpit_OCC_Fabric: { metalness: 1, roughness: 1, specularIntensity: 0, colorFactor: 0.00457144250344382 },
  INT_Cockpit_OCC_Skin_red: { metalness: 1, roughness: 0.4190488961490168, specularIntensity: 0.4, colorFactor: 0.028952469188477523 },
  INT_Decals_FLAT: { metalness: 0, roughness: 0.99, specularIntensity: 0, alphaTest: 0.03504772585973595 },
  INT_carpet_OCC: { metalness: 1, roughness: 1, specularIntensity: 0.2, colorFactor: 0.03504772585973595 },
  INT_Cockpit_OCC_Skin_rough: { metalness: 1, roughness: 0.5348587729029269, specularIntensity: 0.6, color: [0.006598275912249235, 0.006598275912249235, 0.006598275912249235] },
  INT_Cockpit_OCC_Carbon: { metalness: 0.5470492862454438, roughness: 0.5287635162316685, specularIntensity: 0.08380977922980336, color: [0.010299700791112492, 0.010299700791112492, 0.010299700791112492], colorFactor: 0.041142982530994375 },
  INT_Cockpit_OCC_Skin_points: { metalness: 1, roughness: 1, specularIntensity: 0.1, colorFactor: 0.05333349587351123 },
  INT_Decals_Display: { metalness: 1, roughness: 0.22400068266874718, specularIntensity: 0.1 },
  INT_Glass_DISPLAY: { metalness: 1, roughness: 0.16914337262742132, specularIntensity: 1, opacity: 0 },
  Mirror: { metalness: 0.9493362265484999, roughness: 0, specularIntensity: 1 },
  INT_Display_Glass: { metalness: 1, roughness: 0, specularIntensity: 1, color: [1, 1, 1], opacity: 0.11428606258609549 },
  EXT_Details: { metalness: 1, roughness: 1, specularIntensity: 1, alphaTest: 0.24228645268252244 },
  hood_undertext: { metalness: 1, roughness: 1, specularIntensity: 1 },
} as const satisfies Readonly<Record<string, MaterialProfile>>;

const SHADOWLESS_GLASS = new Set(['black_glass', 'ext_glass', 'INT_Glass_DISPLAY', 'INT_Display_Glass']);
const EMISSIVE_DISABLED = new Set(['INT_Decals_EMISSIVE', 'INT_Decals_EMISSIVE_Ref', 'INT_Decals_Display']);

function cloneNormalMap(source: THREE.Texture, channel: number, repeat: number): THREE.Texture {
  const texture = source.clone();
  texture.channel = channel;
  texture.repeat.set(repeat, repeat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function applyProfile(
  material: THREE.MeshStandardMaterial,
  profile: MaterialProfile,
  maps: ReferenceMaterialMaps,
): void {
  const originalMap = material.map;
  material.metalness = profile.metalness;
  material.roughness = profile.roughness;
  material.envMapIntensity = profile.envMapIntensity ?? 1;

  if (profile.map) material.map = maps[profile.map];

  if (profile.color) {
    material.color.setRGB(...profile.color);
    material.color.multiplyScalar(profile.colorFactor ?? 1);
    // Solid Sketchfab albedo still needs its original alpha atlas for cutout decals.
    if (profile.alphaTest !== undefined && originalMap) {
      material.map = null;
      material.alphaMap = originalMap;
    } else {
      material.map = null;
    }
  } else {
    material.color.setScalar(profile.colorFactor ?? 1);
  }

  if (profile.normal) {
    material.normalMap = cloneNormalMap(maps.carbonNormal, profile.normal.channel, profile.normal.repeat);
    material.normalScale.set(1, 1);
  } else if (profile.normalScale !== undefined) {
    material.normalScale.setScalar(profile.normalScale);
  }

  if (profile.opacity !== undefined) {
    material.transparent = true;
    material.opacity = profile.opacity;
    material.depthWrite = false;
  }

  if (profile.alphaTest !== undefined) {
    material.alphaTest = profile.alphaTest;
    material.transparent = false;
    material.depthWrite = true;
  }

  if (material instanceof THREE.MeshPhysicalMaterial) {
    material.specularIntensity = profile.specularIntensity;
    material.clearcoat = profile.clearcoat ?? 0;
    material.clearcoatRoughness = profile.clearcoatRoughness ?? 0;
  }
}

function applyTextureSampling(material: THREE.Material, anisotropy: number): void {
  if (anisotropy <= 1) return;
  Object.values(material).forEach((value) => {
    if (!(value instanceof THREE.Texture) || value.anisotropy >= anisotropy) return;
    value.anisotropy = anisotropy;
    value.needsUpdate = true;
  });
}

export function applyMaterialAdjustments(root: THREE.Object3D, maps: ReferenceMaterialMaps, anisotropy = 1): void {
  const visited = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;

    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some((material) => SHADOWLESS_GLASS.has(material.name))) {
      object.castShadow = false;
      object.receiveShadow = false;
    }

    materials.forEach((material) => {
      if (visited.has(material)) return;
      visited.add(material);
      if (!(material instanceof THREE.MeshStandardMaterial)) return;

      const profile: MaterialProfile | undefined = MATERIAL_PROFILES[material.name as keyof typeof MATERIAL_PROFILES];
      if (profile) applyProfile(material, profile, maps);

      if (SHADOWLESS_GLASS.has(material.name)) {
        material.transparent = true;
        material.depthWrite = false;
      }

      if (EMISSIVE_DISABLED.has(material.name)) {
        material.emissiveMap = null;
        material.emissive.setRGB(0, 0, 0);
        material.emissiveIntensity = 0;
      }

      applyTextureSampling(material, anisotropy);
      material.needsUpdate = true;
    });
  });
}
