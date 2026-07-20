/**
 * Builds the web GLB without changing texture resolution, texture encoding,
 * node names, material slots, or topology. The downloaded source archive
 * stores the intended blue body paint as a separate PNG, so that texture is
 * embedded into ext_body before geometry-only Meshopt compression.
 */
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const input = resolve('public/models/norka-r35-original.glb');
const paintInput = resolve('public/textures/norka-paint-reference.png');
await Promise.all([access(input), access(paintInput)]);

const arg = process.argv.indexOf('--variant');
const requested = arg >= 0 ? process.argv[arg + 1] : 'desktop';
const variants = requested === 'all' ? ['desktop', 'mobile'] : [requested];
if (!variants.every((value) => value === 'desktop' || value === 'mobile')) {
  throw new Error('Variant must be desktop, mobile, or all.');
}

const paintImage = new Uint8Array(await readFile(paintInput));
await MeshoptEncoder.ready;

for (const variant of variants) {
  const output = resolve(`public/models/norka-r35-${variant}.glb`);
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const document = await io.read(input);
  const bodyMaterial = document.getRoot().listMaterials().find((material) => material.getName() === 'ext_body');
  const bodyTexture = bodyMaterial?.getBaseColorTexture();
  if (!bodyMaterial || !bodyTexture) throw new Error('The ext_body base-color texture was not found.');

  bodyTexture
    .setImage(paintImage)
    .setMimeType('image/png');

  await document.transform(meshopt({
    encoder: MeshoptEncoder,
    level: 'medium',
    quantizationVolume: 'mesh',
    quantizePosition: 16,
    quantizeNormal: 12,
    quantizeTexcoord: 16,
    quantizeGeneric: 16,
    quantizeWeight: 12,
    quantizeColor: 8,
  }));

  await io.write(output, document);
  console.log(`Wrote ${output}`);
}
