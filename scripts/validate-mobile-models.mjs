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
const wheelSuspensionPairs = [
  ['WHEEL_LF_74', 'SUSP_LF_56'],
  ['WHEEL_LR_85', 'SUSP_LR_58'],
  ['WHEEL_RF_96', 'SUSP_RF_60'],
  ['WHEEL_RR_107', 'SUSP_RR_62'],
];
const wheelSuspensionNodeNames = wheelSuspensionPairs.flat();
const maxMobilePrimitiveDefinitions = 102;
const maxMobileBasePrimitiveDraws = 127;

function readPivotMetrics(root) {
  return Object.fromEntries(wheelSuspensionNodeNames.map((name) => {
    const matches = root.listNodes().filter((node) => node.getName() === name);
    if (matches.length !== 1) return [name, { count: matches.length }];

    const node = matches[0];
    let descendantMeshes = 0;
    let descendantPrimitives = 0;
    node.traverse((descendant) => {
      const mesh = descendant.getMesh();
      if (!mesh) return;
      descendantMeshes += 1;
      descendantPrimitives += mesh.listPrimitives().length;
    });
    return [name, {
      bounds: getBounds(node),
      count: 1,
      descendantMeshes,
      descendantPrimitives,
      directChildren: node.listChildren().length,
      hasMesh: Boolean(node.getMesh()),
      worldMatrix: [...node.getWorldMatrix()],
      worldTranslation: [...node.getWorldTranslation()],
    }];
  }));
}

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
  let basePrimitiveDraws = 0;
  for (const sourceScene of root.listScenes()) {
    sourceScene.traverse((node) => {
      basePrimitiveDraws += node.getMesh()?.listPrimitives().length ?? 0;
    });
  }
  if (extensions.has('EXT_mesh_gpu_instancing')) await document.transform(uninstance());
  const scene = root.listScenes()[0];
  assert.ok(scene, `${file}: missing scene`);
  return {
    alphaModes,
    basePrimitiveDraws,
    bounds: getBounds(scene),
    bytes: (await stat(file)).size,
    extensions,
    materialNames,
    nodeNames: new Set(root.listNodes().map((node) => node.getName())),
    pivotMetrics: readPivotMetrics(root),
    primitiveDefinitions,
    renderVertices: report.scenes.properties[0]?.renderVertexCount ?? 0,
    textureSizes,
    textures: root.listTextures().length,
  };
}

function assertBoundsClose(actual, expected, label, tolerance = 0.0001) {
  for (const edge of ['min', 'max']) {
    for (let axis = 0; axis < 3; axis += 1) {
      assert.ok(
        Math.abs(actual[edge][axis] - expected[edge][axis]) <= tolerance,
        `${label}: ${edge}[${axis}] changed from ${expected[edge][axis]} to ${actual[edge][axis]}`,
      );
    }
  }
}

function assertArrayClose(actual, expected, label, tolerance = 0.0001) {
  assert.equal(actual.length, expected.length, `${label}: array length changed`);
  for (let index = 0; index < expected.length; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= tolerance,
      `${label}: value[${index}] changed from ${expected[index]} to ${actual[index]}`,
    );
  }
}

function assertWheelSuspensionPivots(metrics, originalMetrics, label) {
  for (const name of wheelSuspensionNodeNames) {
    const actual = metrics.pivotMetrics[name];
    const expected = originalMetrics.pivotMetrics[name];
    assert.equal(actual.count, 1, `${label}: expected exactly one protected pivot ${name}, found ${actual.count}`);
    assert.equal(expected.count, 1, `original: expected exactly one source pivot ${name}, found ${expected.count}`);
    assert.equal(actual.hasMesh, false, `${label}: ${name} must remain a mesh-free transform pivot`);
    assert.equal(actual.directChildren, expected.directChildren, `${label}: ${name} direct-child count changed`);
    assert.equal(actual.descendantMeshes, expected.descendantMeshes, `${label}: ${name} mesh subtree changed`);
    assert.equal(actual.descendantPrimitives, expected.descendantPrimitives, `${label}: ${name} primitive subtree changed`);
    assertArrayClose(actual.worldMatrix, expected.worldMatrix, `${label}: ${name} world matrix`);
    assertBoundsClose(actual.bounds, expected.bounds, `${label}: ${name} bounds`);
  }

  for (const [wheelName, suspensionName] of wheelSuspensionPairs) {
    assertArrayClose(
      metrics.pivotMetrics[wheelName].worldTranslation,
      metrics.pivotMetrics[suspensionName].worldTranslation,
      `${label}: ${wheelName}/${suspensionName} pivot centers`,
    );
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
  assert.ok(metrics.primitiveDefinitions <= maxMobilePrimitiveDefinitions, `${variant}: primitive definition count regressed`);
  assert.ok(metrics.basePrimitiveDraws <= maxMobileBasePrimitiveDraws, `${variant}: base primitive draw count regressed`);
  assert.ok(metrics.extensions.has('EXT_mesh_gpu_instancing'), `${variant}: instancing extension missing`);
  assert.ok(metrics.nodeNames.has('DOOR_INT_L_158'), `${variant}: protected driver-door interior missing`);
  assert.ok(metrics.nodeNames.has('DOOR_INT_L_anim_160'), `${variant}: protected driver-door actuator missing`);
  assert.ok(metrics.nodeNames.has('STEER_HR_232'), `${variant}: protected steering-wheel pivot missing`);
  assertWheelSuspensionPivots(metrics, original, variant);
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
  primitiveDefs: metrics.primitiveDefinitions,
  baseDraws: metrics.basePrimitiveDraws,
  renderVertices: metrics.renderVertices,
  textures: metrics.textures,
}])));
console.log('Mobile model validation passed.');
