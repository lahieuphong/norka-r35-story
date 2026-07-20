import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const file = resolve(process.argv[2] ?? 'public/models/norka-r35-original.glb');
const data = await readFile(file);
if (data.toString('ascii', 0, 4) !== 'glTF') throw new Error('Input is not a binary glTF/GLB file.');
const version = data.readUInt32LE(4);
const length = data.readUInt32LE(8);
let offset = 12;
let json;
while (offset < length) {
  const chunkLength = data.readUInt32LE(offset);
  const chunkType = data.readUInt32LE(offset + 4);
  offset += 8;
  const chunk = data.subarray(offset, offset + chunkLength);
  offset += chunkLength;
  if (chunkType === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').replace(/[\0\s]+$/u, ''));
}
if (!json) throw new Error('GLB JSON chunk was not found.');
const count = (name) => Array.isArray(json[name]) ? json[name].length : 0;
const externalImages = (json.images ?? []).flatMap((image) => typeof image.uri === 'string' ? [image.uri] : []);
const externalBuffers = (json.buffers ?? []).flatMap((buffer) => typeof buffer.uri === 'string' ? [buffer.uri] : []);
console.log(JSON.stringify({
  file: relative(process.cwd(), file),
  version,
  byteLength: length,
  asset: json.asset,
  extensionsUsed: json.extensionsUsed ?? [],
  counts: {
    scenes: count('scenes'), nodes: count('nodes'), meshes: count('meshes'), materials: count('materials'),
    textures: count('textures'), images: count('images'), animations: count('animations'), cameras: count('cameras'),
  },
  externalImages,
  externalBuffers,
  namedNodesFound: (json.nodes ?? []).map((node) => node.name).filter((name) => [
    'body_11','carbon_12','Engine_23','WHEEL_LF_74','WHEEL_LR_85','WHEEL_RF_96','WHEEL_RR_107',
    'SUSP_LF_56','SUSP_LR_58','SUSP_RF_60','SUSP_RR_62','hoodanim_242','hood_236','hood_grills_237',
    'hood_latch_238','hood_parts_239','hood_vents_240','COCKPIT_HR_233','STEER_HR_232',
  ].includes(name)),
}, null, 2));
