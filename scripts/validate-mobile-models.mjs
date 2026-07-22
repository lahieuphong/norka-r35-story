import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { getBounds, Logger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { inspect, uninstance } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const files = {
  original: 'public/models/norka-r35-original.glb',
  mobile: 'public/models/norka-r35-mobile.glb',
  'mobile-low': 'public/models/norka-r35-mobile-low.glb',
  'mobile-fallback': 'public/models/norka-r35-mobile-fallback.glb',
};
const heroTextures = new Set([
  'norka-paint-reference',
  'norka-carbon-reference',
  'norka-carbon-normal-reference',
  'norka-glass-reference',
]);

async function readMetrics(file) {
  const document = await io.read(file);
  document.setLogger(new Logger(Logger.Verbosity.SILENT));
  const root = document.getRoot();
  const report = inspect(document);
  const extensions = new Set(root.listExtensionsUsed().map((extension) => extension.extensionName));
  const textureSizes = root.listTextures().map((texture) => ({
    name: texture.getName(),
    mimeType: texture.getMimeType(),
    size: texture.getSize() ?? [0, 0],
  }));
  const materialNames = root.listMaterials().map((material) => material.getName()).sort();
  const alphaModes = root.listMaterials().map((material) => material.getAlphaMode()).sort();
  const primitiveDefinitions = root.listMeshes()
    .reduce((total, mesh) => total + mesh.listPrimitives().length, 0);
  if (extensions.has('EXT_mesh_gpu_instancing')) await document.transform(uninstance());
  const scene = root.listScenes()[0];
  assert.ok(scene, `${file}: missing scene`);
  return {
    alphaModes,
    bounds: getBounds(scene),
    bytes: (await stat(file)).size,
    extensions,
    materialNames,
    primitiveDefinitions,
    renderVertices: report.scenes.properties[0]?.renderVertexCount ?? 0,
    textureSizes,
    textures: root.listTextures().length,
  };
}

function assertBoundsClose(actual, expected, label) {
  for (const edge of ['min', 'max']) {
    for (let axis = 0; axis < 3; axis += 1) {
      assert.ok(
        Math.abs(actual[edge][axis] - expected[edge][axis]) <= 0.0001,
        `${label}: ${edge}[${axis}] changed from ${expected[edge][axis]} to ${actual[edge][axis]}`,
      );
    }
  }
}

function assertTextureCaps(metrics, heroCap, secondaryCap, label) {
  for (const texture of metrics.textureSizes) {
    const cap = heroTextures.has(texture.name) ? heroCap : secondaryCap;
    assert.ok(
      texture.size[0] <= cap && texture.size[1] <= cap,
      `${label}: ${texture.name || '(unnamed texture)'} is ${texture.size.join('x')}, expected <= ${cap}`,
    );
  }
}

const original = await readMetrics(files.original);
const results = {};
for (const [variant, file] of Object.entries(files).slice(1)) {
  const metrics = await readMetrics(file);
  results[variant] = metrics;
  assert.equal(metrics.renderVertices, original.renderVertices, `${variant}: render topology changed`);
  assert.deepEqual(metrics.materialNames, original.materialNames, `${variant}: material names changed`);
  assert.deepEqual(metrics.alphaModes, original.alphaModes, `${variant}: alpha modes changed`);
  assert.equal(metrics.textures, 50, `${variant}: optimized texture set changed`);
  assert.ok(metrics.primitiveDefinitions <= 80, `${variant}: draw-call reduction regressed`);
  assert.ok(metrics.extensions.has('EXT_mesh_gpu_instancing'), `${variant}: instancing extension missing`);
  assertBoundsClose(metrics.bounds, original.bounds, variant);
}

assertTextureCaps(results.mobile, 2048, 1024, 'mobile');
assertTextureCaps(results['mobile-low'], 1024, 512, 'mobile-low');
assertTextureCaps(results['mobile-fallback'], 512, 256, 'mobile-fallback');
assert.ok(results.mobile.textureSizes.some((texture) => texture.mimeType === 'image/ktx2'), 'mobile: KTX2 missing');
assert.ok(results['mobile-low'].textureSizes.some((texture) => texture.mimeType === 'image/ktx2'), 'mobile-low: KTX2 missing');
assert.ok(results['mobile-fallback'].textureSizes.every((texture) => texture.mimeType !== 'image/ktx2'), 'mobile-fallback: must not contain KTX2');

console.table(Object.fromEntries(Object.entries(results).map(([variant, metrics]) => [variant, {
  bytes: metrics.bytes,
  primitives: metrics.primitiveDefinitions,
  renderVertices: metrics.renderVertices,
  textures: metrics.textures,
}])));
console.log('Mobile model validation passed.');
