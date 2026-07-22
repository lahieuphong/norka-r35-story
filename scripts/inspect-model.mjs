import { stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { inspect } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const file = resolve(process.argv[2] ?? 'public/models/norka-r35-desktop.glb');
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const document = await io.read(file);
const root = document.getRoot();
const report = inspect(document);
const textures = report.textures.properties;
const fileStats = await stat(file);
const sum = (values) => values.reduce((total, value) => total + value, 0);
const toMiB = (bytes) => Number((bytes / 1024 / 1024).toFixed(2));
const textureGPUBytes = sum(textures.map((texture) => texture.gpuSize ?? 0));
const textureSourceBytes = sum(textures.map((texture) => texture.size));
const geometryGPUBytes = sum(root.listAccessors().map((accessor) => accessor.getArray()?.byteLength ?? 0));
const rgba32MipBytes = (width, height) => {
  let total = 0;
  while (true) {
    total += width * height * 4;
    if (width === 1 && height === 1) return total;
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
  }
};
const rgba32FallbackTextureBytes = sum(root.listTextures().map((texture, index) => {
  if (texture.getMimeType() !== 'image/ktx2') return textures[index]?.gpuSize ?? 0;
  const size = texture.getSize();
  return size ? rgba32MipBytes(size[0], size[1]) : 0;
}));
const decodedStandardImageBytes = sum(root.listTextures().map((texture) => {
  if (texture.getMimeType() === 'image/ktx2') return 0;
  const size = texture.getSize();
  return size ? size[0] * size[1] * 4 : 0;
}));
const textureTexels = sum(root.listTextures().map((texture) => {
  const size = texture.getSize();
  return size ? size[0] * size[1] : 0;
}));
const compressedTextures = textures.filter((texture) => texture.mimeType === 'image/ktx2');
const interestingNodeNames = new Set([
  'body_11', 'carbon_12', 'Engine_23', 'WHEEL_LF_74', 'WHEEL_LR_85', 'WHEEL_RF_96', 'WHEEL_RR_107',
  'SUSP_LF_56', 'SUSP_LR_58', 'SUSP_RF_60', 'SUSP_RR_62', 'hoodanim_242', 'hood_236', 'hood_grills_237',
  'hood_latch_238', 'hood_parts_239', 'hood_vents_240', 'COCKPIT_HR_233', 'STEER_HR_232',
]);

console.log(JSON.stringify({
  file: relative(process.cwd(), file),
  byteLength: fileStats.size,
  asset: root.getAsset(),
  extensionsUsed: root.listExtensionsUsed().map((extension) => extension.extensionName),
  counts: {
    scenes: root.listScenes().length,
    nodes: root.listNodes().length,
    meshes: root.listMeshes().length,
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
    animations: root.listAnimations().length,
  },
  gpuEstimate: {
    nominalTextureBytes: textureGPUBytes,
    nominalTextureMiB: toMiB(textureGPUBytes),
    rgba32KtxWorstCaseTextureBytes: rgba32FallbackTextureBytes,
    rgba32KtxWorstCaseTextureMiB: toMiB(rgba32FallbackTextureBytes),
    geometryBytes: geometryGPUBytes,
    geometryMiB: toMiB(geometryGPUBytes),
    nominalCombinedBytes: textureGPUBytes + geometryGPUBytes,
    nominalCombinedMiB: toMiB(textureGPUBytes + geometryGPUBytes),
    rgba32KtxWorstCaseCombinedBytes: rgba32FallbackTextureBytes + geometryGPUBytes,
    rgba32KtxWorstCaseCombinedMiB: toMiB(rgba32FallbackTextureBytes + geometryGPUBytes),
    decodedStandardImageCpuBytes: decodedStandardImageBytes,
    decodedStandardImageCpuMiB: toMiB(decodedStandardImageBytes),
    units: 'bytes',
    notMeasuredRuntime: true,
    note: 'Model-only estimates. Nominal KTX2 bytes vary by ASTC/ETC/BC target; RGBA32 is the no-compression KTX worst case. Excludes retained KTX mip copies, workers, GLB cache, framebuffer, HDR, PMREM, shadows, compositor and driver overhead.',
  },
  texturePayload: {
    sourceBytes: textureSourceBytes,
    texels: textureTexels,
    ktx2: compressedTextures.length,
    uastc: compressedTextures.filter((texture) => texture.compression === 'UASTC').length,
    etc1s: compressedTextures.filter((texture) => texture.compression === 'ETC1S').length,
    uncompressed: textures.length - compressedTextures.length,
  },
  largestTextures: [...textures]
    .sort((a, b) => (b.gpuSize ?? 0) - (a.gpuSize ?? 0))
    .slice(0, 8)
    .map(({ name, resolution, compression, mimeType, gpuSize }) => ({ name, resolution, compression: compression || mimeType, gpuSize })),
  renderVertices: report.scenes.properties[0]?.renderVertexCount ?? 0,
  uploadVertices: report.scenes.properties[0]?.uploadVertexCount ?? 0,
  namedNodesFound: root.listNodes().map((node) => node.getName()).filter((name) => interestingNodeNames.has(name)),
}, null, 2));
