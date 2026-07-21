/**
 * Builds self-contained desktop and mobile GLBs without simplifying, welding,
 * joining, or removing geometry. Normals and tangents stay as their original
 * float32 values so reflections remain smooth. Only the three 4096px reference
 * maps are resized to 2048px in the mobile artifact to avoid GPU texture-memory
 * pressure on phones.
 */
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const input = resolve('public/models/norka-r35-original.glb');
const referenceInputs = {
  paint: resolve('public/textures/norka-paint-reference.png'),
  carbon: resolve('public/textures/norka-carbon-base.png'),
  carbonNormal: resolve('public/textures/norka-carbon-normal.png'),
  glass: resolve('public/textures/norka-glass-reference.png'),
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
  if (variant === 'desktop') return sourceImages;
  const prepared = {};
  for (const [name, image] of Object.entries(sourceImages)) {
    const metadata = await sharp(image).metadata();
    if ((metadata.width ?? 0) <= 2048 && (metadata.height ?? 0) <= 2048) {
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
  return prepared;
}

function embedReferenceMaterials(document, images) {
  const materials = new Map(document.getRoot().listMaterials().map((material) => [material.getName(), material]));
  const bodyMaterial = materials.get('ext_body');
  const carbonMaterial = materials.get('ext_carbon');
  const glassMaterial = materials.get('ext_glass');
  const bodyTexture = bodyMaterial?.getBaseColorTexture();
  const carbonTexture = carbonMaterial?.getBaseColorTexture();
  const glassTexture = glassMaterial?.getBaseColorTexture();
  if (!bodyMaterial || !carbonMaterial || !glassMaterial || !bodyTexture || !carbonTexture || !glassTexture) {
    throw new Error('One or more reference material texture slots were not found.');
  }

  bodyTexture.setName('norka-paint-reference').setImage(images.paint).setMimeType('image/png');
  carbonTexture.setName('norka-carbon-reference').setImage(images.carbon).setMimeType('image/png');
  glassTexture.setName('norka-glass-reference').setImage(images.glass).setMimeType('image/png');

  const carbonNormalTexture = document
    .createTexture('norka-carbon-normal-reference')
    .setImage(images.carbonNormal)
    .setMimeType('image/png');
  carbonMaterial.setNormalTexture(carbonNormalTexture);
  carbonMaterial.getNormalTextureInfo()?.setTexCoord(2);
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
      // Excluding NORMAL and TANGENT is deliberate: reflections retain the
      // exact float32 surface vectors from the source GLB.
      pattern: /^(POSITION|TEXCOORD|JOINTS|WEIGHTS|COLOR)(_[0-9]+)?$/,
      quantizationVolume: 'mesh',
      quantizePosition: 16,
      quantizeTexcoord: 16,
      quantizeWeight: 12,
      quantizeColor: 8,
      normalizeWeights: true,
    }),
  );
  document
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });

  await io.write(output, document);
  console.log(`Wrote ${output} with float32 normals/tangents and ${variant === 'mobile' ? '2048px' : '4096px'} reference maps.`);
}
