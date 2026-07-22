/**
 * Builds self-contained desktop, mobile, and compatibility GLBs without
 * simplifying or welding geometry. Mobile-only outputs instance/join static
 * opaque meshes while preserving transparent draw boundaries. Surface vectors
 * use visually lossless 16-bit normalized attributes. Desktop/mobile use
 * semantic KTX2/Basis compression; compatibility tiers use standard PNG
 * textures so GPUs never expand an unnecessarily large fallback asset.
 */
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRTextureBasisu } from '@gltf-transform/extensions';
import { compressTexture, dedup, flatten, getTextureColorSpace, instance, join, listTextureSlots, prune, quantize, reorder, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const input = resolve('public/models/norka-r35-original.glb');
const referenceInputs = {
  paint: resolve('public/textures/paint.png'),
  carbon: resolve('public/textures/carbon_fiberao.dds_10_1.png'),
  carbonNormal: resolve('public/textures/carbon_n_vecarz.png'),
  glass: resolve('public/textures/glass.png'),
  seams: resolve('public/textures/cuciture_57.png'),
  decals: resolve('public/textures/INT_Decals_51.png'),
  decalsNormal: resolve('public/textures/INT_Decals_NM.png'),
};
await Promise.all([access(input), ...Object.values(referenceInputs).map((path) => access(path))]);

const arg = process.argv.indexOf('--variant');
const requested = arg >= 0 ? process.argv[arg + 1] : 'all';
const supportedVariants = ['desktop', 'mobile', 'mobile-low', 'fallback', 'mobile-fallback'];
const ktx2Variants = new Set(['desktop', 'mobile', 'mobile-low']);
const variants = requested === 'all' ? supportedVariants : [requested];
if (!variants.every((value) => supportedVariants.includes(value))) {
  throw new Error(`Variant must be ${supportedVariants.join(', ')}, or all.`);
}
const encodeToKTX2 = variants.some((variant) => ktx2Variants.has(variant))
  ? (await import('ktx2-encoder')).encodeToKTX2
  : null;

const sourceImages = Object.fromEntries(await Promise.all(
  Object.entries(referenceInputs).map(async ([name, path]) => [name, new Uint8Array(await readFile(path))]),
));
await MeshoptEncoder.ready;

const heroReferenceNames = new Set(['paint', 'carbon', 'carbonNormal', 'glass']);
function getReferenceMaxSize(variant, name) {
  if (variant === 'desktop') return Number.POSITIVE_INFINITY;
  if (variant === 'fallback') return 1024;
  if (variant === 'mobile') {
    if (name === 'paint') return 2048;
    if (name === 'carbon' || name === 'glass') return 1024;
    return Number.POSITIVE_INFINITY;
  }
  if (variant === 'mobile-low') return heroReferenceNames.has(name) ? 1024 : 512;
  return heroReferenceNames.has(name) ? 512 : 256;
}

async function prepareReferenceImages(variant) {
  const prepared = {};
  for (const [name, image] of Object.entries(sourceImages)) {
    // Balanced mobile keeps fine paint/decal detail while moving the broad,
    // highly tiled carbon and glass maps to 1K. Low tiers cap every secondary
    // reference as well, preventing a single overlooked map from defeating
    // the tier's memory budget. Desktop and its fallback retain their existing
    // limits unchanged.
    const maxSize = getReferenceMaxSize(variant, name);
    const metadata = await sharp(image).metadata();
    if ((metadata.width ?? 0) <= maxSize && (metadata.height ?? 0) <= maxSize) {
      prepared[name] = image;
      continue;
    }
    prepared[name] = new Uint8Array(await sharp(image)
      .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true, kernel: sharp.kernel.lanczos3 })
      // Disabling adaptive PNG filters is lossless and compresses this tiled
      // carbon reference substantially better after Lanczos resampling.
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer());
  }

  // The supplied decal set packs its opacity mask into the normal map's alpha
  // channel. glTF normal slots ignore alpha, so move that mask to base color
  // where alpha-tested decal materials can sample it without another texture.
  const { data: decalRGB, info: decalInfo } = await sharp(prepared.decals)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: decalAlpha, info: alphaInfo } = await sharp(prepared.decalsNormal)
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (decalInfo.width !== alphaInfo.width || decalInfo.height !== alphaInfo.height) {
    throw new Error('Decal base color and packed alpha dimensions do not match.');
  }
  const decalRGBA = Buffer.alloc(decalInfo.width * decalInfo.height * 4);
  for (let pixel = 0; pixel < decalInfo.width * decalInfo.height; pixel += 1) {
    decalRGBA[pixel * 4] = decalRGB[pixel * 3];
    decalRGBA[pixel * 4 + 1] = decalRGB[pixel * 3 + 1];
    decalRGBA[pixel * 4 + 2] = decalRGB[pixel * 3 + 2];
    decalRGBA[pixel * 4 + 3] = decalAlpha[pixel];
  }
  prepared.decals = new Uint8Array(await sharp(decalRGBA, {
    raw: { width: decalInfo.width, height: decalInfo.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false })
    .toBuffer());

  return prepared;
}

function stripRuntimeOverriddenTextures(document) {
  const materials = new Map(document.getRoot().listMaterials().map((material) => [material.getName(), material]));

  // These maps are always replaced by solid colors or the shared carbon
  // normal at runtime. Removing them before prune avoids downloading and
  // transcoding pixels that can never reach the shader.
  materials.get('darkgrayplastic')?.setBaseColorTexture(null).setNormalTexture(null);
  materials.get('region_plates')?.setBaseColorTexture(null).setNormalTexture(null);
  materials.get('03_-_Default')?.setBaseColorTexture(null);

  // Runtime intentionally disables these emissive maps as part of the
  // recovered Sketchfab material profile.
  for (const name of ['INT_Decals_EMISSIVE', 'INT_Decals_EMISSIVE_Ref', 'INT_Decals_Display']) {
    materials.get(name)?.setEmissiveTexture(null);
  }
}

function isolateTransparentMeshInstances(document) {
  // `instance()` has no filter option. De-link shared BLEND/MASK meshes first
  // so the transform cannot batch them: Three.js sorts transparent objects,
  // but cannot sort individual members within an InstancedMesh.
  for (const scene of document.getRoot().listScenes()) {
    const nodesByMesh = new Map();
    scene.traverse((node) => {
      const mesh = node.getMesh();
      if (!mesh) return;
      const nodes = nodesByMesh.get(mesh) ?? [];
      nodes.push(node);
      nodesByMesh.set(mesh, nodes);
    });
    for (const [mesh, nodes] of nodesByMesh) {
      if (nodes.length < 2) continue;
      const isOpaque = mesh.listPrimitives().every((primitive) => primitive.getMaterial()?.getAlphaMode() === 'OPAQUE');
      if (isOpaque) continue;
      for (const node of nodes.slice(1)) {
        const clonedMesh = mesh.clone();
        // Mesh.clone() keeps references to the same Primitive objects. Give
        // each protected mesh its own Primitive wrapper so the later quantize
        // pass cannot apply the same position compensation more than once;
        // accessors and materials remain shared until that pass clones them.
        for (const primitive of [...clonedMesh.listPrimitives()]) clonedMesh.removePrimitive(primitive);
        for (const primitive of mesh.listPrimitives()) clonedMesh.addPrimitive(primitive.clone());
        node.setMesh(clonedMesh);
      }
    }
  }
}

async function optimizeMobileGeometry(document) {
  // Material identities and names drive runtime profiles, so intentionally do
  // not include MATERIAL or TEXTURE in deduplication. Shared opaque geometry is
  // instanced first; remaining static opaque primitives are flattened/joined.
  await document.transform(dedup({
    propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH],
  }));
  isolateTransparentMeshInstances(document);
  await document.transform(
    instance({ min: 2 }),
    flatten(),
    join({
      filter: (node) => node.getMesh()?.listPrimitives()
        .every((primitive) => primitive.getMaterial()?.getAlphaMode() === 'OPAQUE') ?? false,
    }),
  );
}

async function prepareFallbackTextures(document) {
  // Standard PNG is decoded natively on every WebGL2 browser and needs no
  // Basis worker. Keep the supplied reference maps at 1024px for clarity;
  // secondary maps are capped at 512px to bound RGBA CPU + GPU memory.
  await document.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: 'png',
      resize: [1024, 1024],
      effort: 100,
      pattern: /^norka-(paint|carbon|carbon-normal|glass)-reference/,
    }),
  );
  await Promise.all(document.getRoot().listTextures()
    .filter((texture) => !/^norka-(paint|carbon|carbon-normal|glass)-reference/.test(texture.getName()))
    .map((texture) => compressTexture(texture, {
      encoder: sharp,
      targetFormat: 'png',
      resize: [512, 512],
      effort: 100,
    })));
}

async function prepareMobileTierTextures(document, heroSize, secondarySize) {
  const heroPattern = /^norka-(paint|carbon|carbon-normal|glass)-reference/;
  await document.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: 'png',
      resize: [heroSize, heroSize],
      effort: 100,
      pattern: heroPattern,
    }),
  );
  await Promise.all(document.getRoot().listTextures()
    .filter((texture) => !heroPattern.test(texture.getName()))
    .map((texture) => compressTexture(texture, {
      encoder: sharp,
      targetFormat: 'png',
      resize: [secondarySize, secondarySize],
      effort: 100,
    })));
}

function embedReferenceMaterials(document, images) {
  const materials = new Map(document.getRoot().listMaterials().map((material) => [material.getName(), material]));
  const bodyMaterial = materials.get('ext_body');
  const carbonMaterial = materials.get('ext_carbon');
  const glassMaterial = materials.get('ext_glass');
  const seamsMaterial = materials.get('INT_Seams');
  const decalsMaterial = materials.get('INT_Decals_PlLASTIC');
  const bodyTexture = bodyMaterial?.getBaseColorTexture();
  const carbonTexture = carbonMaterial?.getBaseColorTexture();
  const glassTexture = glassMaterial?.getBaseColorTexture();
  const seamsTexture = seamsMaterial?.getBaseColorTexture();
  const decalsTexture = decalsMaterial?.getBaseColorTexture();
  const decalsNormalTexture = decalsMaterial?.getNormalTexture();
  if (!bodyMaterial || !carbonMaterial || !glassMaterial || !bodyTexture || !carbonTexture || !glassTexture || !seamsTexture || !decalsTexture || !decalsNormalTexture) {
    throw new Error('One or more reference material texture slots were not found.');
  }

  bodyTexture.setName('norka-paint-reference').setImage(images.paint).setMimeType('image/png');
  carbonTexture.setName('norka-carbon-reference').setImage(images.carbon).setMimeType('image/png');
  glassTexture.setName('norka-glass-reference').setImage(images.glass).setMimeType('image/png');
  seamsTexture.setName('norka-seams-reference').setImage(images.seams).setMimeType('image/png');
  decalsTexture.setName('norka-interior-decals-reference').setImage(images.decals).setMimeType('image/png');
  decalsNormalTexture.setName('norka-interior-decals-normal-reference').setImage(images.decalsNormal).setMimeType('image/png');

  const carbonNormalTexture = document
    .createTexture('norka-carbon-normal-reference')
    .setImage(images.carbonNormal)
    .setMimeType('image/png');
  carbonMaterial.setNormalTexture(carbonNormalTexture);
  carbonMaterial.getNormalTextureInfo()?.setTexCoord(2);
}

async function decodeImage(image) {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

async function decodeNormalImage(image) {
  // Alpha is not sampled by glTF normal slots. Force it opaque so devices
  // using ETC-family targets can choose the smaller RGB GPU format.
  const { data, info } = await sharp(image).removeAlpha().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

async function compressMaterialTextures(document, variant) {
  if (!encodeToKTX2) throw new Error('KTX2 encoder was not initialized.');
  const textures = document.getRoot().listTextures();
  let compressed = 0;
  for (const [index, texture] of textures.entries()) {
    const image = texture.getImage();
    const size = texture.getSize();
    if (!image || !size) continue;

    // Tiny maps consume negligible VRAM and are faster to load directly than
    // dispatching another Basis transcode job in the browser.
    if (size[0] < 128 && size[1] < 128) continue;

    const slots = listTextureSlots(texture);
    const isNormal = slots.includes('normalTexture');
    const isColor = getTextureColorSpace(texture) === 'srgb';
    // Paint is opaque and visually tolerant of high-quality ETC1S at 2K/1K,
    // saving substantially more GPU memory than shrinking its resolution.
    // Keep desktop byte-for-byte behavior and retain UASTC for normals and all
    // other color maps, including glass/decal maps whose alpha must stay crisp.
    const isMobilePaint = variant !== 'desktop' && texture.getName() === 'norka-paint-reference';
    const useUASTC = !isMobilePaint && (isColor || isNormal);
    const encoded = await encodeToKTX2(image, {
      imageDecoder: isNormal ? decodeNormalImage : decodeImage,
      isUASTC: useUASTC,
      uastcLDRQualityLevel: 3,
      qualityLevel: 255,
      compressionLevel: 6,
      generateMipmap: true,
      needSupercompression: useUASTC,
      enableRDO: false,
      isNormalMap: isNormal,
      isPerceptual: isColor,
      isSetKTX2SRGBTransferFunc: isColor,
      enableDebug: false,
    });
    texture.setImage(encoded).setMimeType('image/ktx2');
    compressed += 1;
    console.log(`  KTX2 ${index + 1}/${textures.length}: ${texture.getName() || slots.join('+') || 'texture'} (${size.join('x')}, ${useUASTC ? 'UASTC' : 'ETC1S'})`);
  }
  if (compressed > 0) document.createExtension(KHRTextureBasisu).setRequired(true);
}

for (const variant of variants) {
  const output = resolve(`public/models/norka-r35-${variant}.glb`);
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const document = await io.read(input);
  const images = await prepareReferenceImages(variant);
  embedReferenceMaterials(document, images);
  stripRuntimeOverriddenTextures(document);

  if (variant.startsWith('mobile')) await optimizeMobileGeometry(document);

  await document.transform(
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({
      // 16-bit normalized normals/tangents have sub-pixel angular error while
      // halving their GPU attribute storage and memory bandwidth.
      pattern: /^(POSITION|NORMAL|TANGENT|TEXCOORD|JOINTS|WEIGHTS|COLOR)(_[0-9]+)?$/,
      quantizationVolume: 'mesh',
      quantizePosition: 16,
      quantizeNormal: 16,
      quantizeTexcoord: 16,
      quantizeWeight: 12,
      quantizeColor: 8,
      normalizeWeights: true,
    }),
    // Convert constant maps to material factors. Keep all attributes because
    // runtime material restoration intentionally reuses higher UV channels.
    prune({
      keepAttributes: true,
      keepIndices: true,
      keepLeaves: true,
      keepSolidTextures: false,
    }),
  );
  if (variant === 'mobile-low') await prepareMobileTierTextures(document, 1024, 512);
  if (variant === 'fallback') await prepareFallbackTextures(document);
  else if (variant === 'mobile-fallback') await prepareMobileTierTextures(document, 512, 256);
  else await compressMaterialTextures(document, variant);
  document
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  await io.write(output, document);
  const textureProfile = variant === 'fallback'
    ? 'standard PNG textures (1024px references / 512px secondary)'
    : variant === 'mobile-fallback'
      ? 'standard PNG textures (512px hero / 256px secondary)'
      : variant === 'mobile-low'
        ? 'KTX2 textures (1024px hero / 512px secondary)'
        : variant === 'mobile'
          ? 'KTX2 textures (2048px paint / 1024px carbon and glass)'
          : 'KTX2 textures and 4096px hero maps';
  console.log(`Wrote ${output} with ${textureProfile} and 16-bit surface vectors.`);
}
