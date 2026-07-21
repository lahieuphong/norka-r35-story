/**
 * Builds self-contained desktop and mobile GLBs without simplifying, welding,
 * joining, or removing geometry. Surface vectors use visually lossless 16-bit
 * normalized attributes, and material textures use semantic-aware KTX2/Basis
 * compression with precomputed mipmaps. Desktop keeps the supplied 4096px hero
 * maps; mobile resizes only those oversized maps to 2048px.
 */
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, KHRTextureBasisu } from '@gltf-transform/extensions';
import { getTextureColorSpace, listTextureSlots, prune, quantize, reorder } from '@gltf-transform/functions';
import { encodeToKTX2 } from 'ktx2-encoder';
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
const variants = requested === 'all' ? ['desktop', 'mobile'] : [requested];
if (!variants.every((value) => value === 'desktop' || value === 'mobile')) {
  throw new Error('Variant must be desktop, mobile, or all.');
}

const sourceImages = Object.fromEntries(await Promise.all(
  Object.entries(referenceInputs).map(async ([name, path]) => [name, new Uint8Array(await readFile(path))]),
));
await MeshoptEncoder.ready;

async function prepareReferenceImages(variant) {
  const prepared = {};
  for (const [name, image] of Object.entries(sourceImages)) {
    const metadata = await sharp(image).metadata();
    if (variant === 'desktop' || ((metadata.width ?? 0) <= 2048 && (metadata.height ?? 0) <= 2048)) {
      prepared[name] = image;
      continue;
    }
    prepared[name] = new Uint8Array(await sharp(image)
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true, kernel: sharp.kernel.lanczos3 })
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

async function compressMaterialTextures(document) {
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
    const useUASTC = isColor || isNormal;
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
  await compressMaterialTextures(document);
  document
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  await io.write(output, document);
  console.log(`Wrote ${output} with KTX2 textures, 16-bit surface vectors, and ${variant === 'mobile' ? '2048px' : '4096px'} hero maps.`);
}
