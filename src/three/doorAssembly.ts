import * as THREE from 'three';
import { DRIVER_DOOR_HINGE } from './interiorTransitionShots';

export interface DriverDoorAssembly {
  readonly pivot: THREE.Group;
  readonly extractedPartCount: number;
}

interface ComponentBounds {
  readonly box: THREE.Box3;
}

class DisjointSet {
  private readonly parents: Int32Array;

  public constructor(size: number) {
    this.parents = new Int32Array(size);
    for (let index = 0; index < size; index += 1) this.parents[index] = index;
  }

  public find(value: number): number {
    let root = value;
    while (this.parents[root] !== root) root = this.parents[root]!;
    while (this.parents[value] !== value) {
      const parent = this.parents[value]!;
      this.parents[value] = root;
      value = parent;
    }
    return root;
  }

  public union(left: number, right: number): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parents[rightRoot] = leftRoot;
  }
}

function materialNameOf(mesh: THREE.Mesh): string | null {
  if (Array.isArray(mesh.material)) return null;
  return mesh.material.name || null;
}

function isInside(
  box: THREE.Box3,
  limits: { readonly xMin: number; readonly xMax: number; readonly yMin: number; readonly yMax: number; readonly zMin: number; readonly zMax: number },
): boolean {
  return box.min.x >= limits.xMin && box.max.x <= limits.xMax
    && box.min.y >= limits.yMin && box.max.y <= limits.yMax
    && box.min.z >= limits.zMin && box.max.z <= limits.zMax;
}

function isDriverDoorComponent(materialName: string, box: THREE.Box3, flattenedInterior: boolean): boolean {
  if (materialName === 'ext_body') {
    return isInside(box, { xMin: 0.72, xMax: 0.93, yMin: 0.12, yMax: 0.9, zMin: -0.58, zMax: 0.785 });
  }
  if (materialName === 'ext_glass') {
    return isInside(box, { xMin: 0.58, xMax: 0.82, yMin: 0.8, yMax: 1.23, zMin: -0.62, zMax: 0.58 });
  }
  if (materialName === 'ext_chrome') {
    // The exterior handle is a connected chrome component. Keeping this rule
    // narrow avoids pulling nearby window and body trim into the door pivot.
    return isInside(box, { xMin: 0.82, xMax: 0.94, yMin: 0.65, yMax: 0.86, zMin: -0.58, zMax: -0.18 })
      || isInside(box, { xMin: 0.8, xMax: 0.86, yMin: 0.76, yMax: 0.85, zMin: 0.42, zMax: 0.53 });
  }
  if (materialName === 'ext_carbon' || materialName === 'side_mirror_glass') {
    return isInside(box, { xMin: 0.8, xMax: 1, yMin: 0.84, yMax: 0.96, zMin: 0.42, zMax: 0.56 });
  }
  if (materialName === 'darkgrayplastic') {
    return isInside(box, { xMin: 0.78, xMax: 0.9, yMin: 0.75, yMax: 0.98, zMin: 0.4, zMax: 0.57 })
      || isInside(box, { xMin: 0.7, xMax: 0.88, yMin: 0.24, yMax: 0.99, zMin: -0.5, zMax: 0.73 })
      || isInside(box, { xMin: 0.88, xMax: 0.9, yMin: 0.72, yMax: 0.77, zMin: -0.52, zMax: -0.48 });
  }
  if (materialName === 'black_plastic') {
    return isInside(box, { xMin: 0.7, xMax: 0.88, yMin: 0.24, yMax: 0.99, zMin: -0.5, zMax: 0.73 });
  }
  if (flattenedInterior && materialName.startsWith('INT_')) {
    // Mobile GLBs join the left/right doors and cockpit by material. Connected
    // component bounds recover only the +X driver-door pieces from those joins.
    return isInside(box, { xMin: 0.6, xMax: 0.94, yMin: 0.08, yMax: 0.94, zMin: -0.62, zMax: 0.8 });
  }
  return false;
}

function cloneCompactSubset(source: THREE.BufferGeometry, sourceIndices: readonly number[]): THREE.BufferGeometry {
  const compactVertices: number[] = [];
  const vertexMap = new Map<number, number>();
  const compactIndices = sourceIndices.map((sourceVertex) => {
    const existing = vertexMap.get(sourceVertex);
    if (existing !== undefined) return existing;
    const compactVertex = compactVertices.length;
    compactVertices.push(sourceVertex);
    vertexMap.set(sourceVertex, compactVertex);
    return compactVertex;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.name = source.name;
  geometry.userData = { ...source.userData };
  Object.entries(source.attributes).forEach(([name, attribute]) => {
    const interleaved = attribute instanceof THREE.InterleavedBufferAttribute;
    const sourceArray = interleaved ? attribute.data.array : attribute.array;
    const sourceStride = interleaved ? attribute.data.stride : attribute.itemSize;
    const sourceOffset = interleaved ? attribute.offset : 0;
    const ArrayType = sourceArray.constructor as new (length: number) => typeof sourceArray;
    const values = new ArrayType(compactVertices.length * attribute.itemSize);
    compactVertices.forEach((sourceVertex, compactVertex) => {
      const sourceBase = sourceVertex * sourceStride + sourceOffset;
      const targetOffset = compactVertex * attribute.itemSize;
      for (let component = 0; component < attribute.itemSize; component += 1) {
        values[targetOffset + component] = sourceArray[sourceBase + component]!;
      }
    });
    const compactAttribute = new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized);
    compactAttribute.name = attribute.name;
    compactAttribute.setUsage(interleaved ? attribute.data.usage : attribute.usage);
    if (!interleaved) compactAttribute.gpuType = attribute.gpuType;
    geometry.setAttribute(name, compactAttribute);
  });
  const IndexArray = compactVertices.length <= 65_535 ? Uint16Array : Uint32Array;
  geometry.setIndex(new THREE.BufferAttribute(new IndexArray(compactIndices), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeDoorMesh(source: THREE.Mesh, geometry: THREE.BufferGeometry): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, source.material);
  mesh.name = `${source.name || 'mesh'}__driver-door`;
  mesh.castShadow = source.castShadow;
  mesh.receiveShadow = source.receiveShadow;
  mesh.renderOrder = source.renderOrder;
  mesh.frustumCulled = source.frustumCulled;
  mesh.layers.mask = source.layers.mask;
  return mesh;
}

function dequantizePositionForWorldBake(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  if (!position || (!position.normalized && position.array instanceof Float32Array)) return;
  const values = new Float32Array(position.count * 3);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const offset = vertex * 3;
    values[offset] = position.getX(vertex);
    values[offset + 1] = position.getY(vertex);
    values[offset + 2] = position.getZ(vertex);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(values, 3));
}

function partitionIndexedMesh(
  mesh: THREE.Mesh,
  materialName: string,
  flattenedInterior: boolean,
  pivot: THREE.Group,
): boolean {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!position || !index || index.count < 3) return false;

  const components = new DisjointSet(position.count);
  for (let offset = 0; offset + 2 < index.count; offset += 3) {
    const first = index.getX(offset);
    const second = index.getX(offset + 1);
    const third = index.getX(offset + 2);
    components.union(first, second);
    components.union(first, third);
  }

  mesh.updateWorldMatrix(true, false);
  const componentBounds = new Map<number, ComponentBounds>();
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const root = components.find(vertex);
    let component = componentBounds.get(root);
    if (!component) {
      component = { box: new THREE.Box3() };
      componentBounds.set(root, component);
    }
    point.fromBufferAttribute(position, vertex).applyMatrix4(mesh.matrixWorld);
    component.box.expandByPoint(point);
  }

  const selectedRoots = new Set<number>();
  componentBounds.forEach(({ box }, root) => {
    if (isDriverDoorComponent(materialName, box, flattenedInterior)) selectedRoots.add(root);
  });
  if (selectedRoots.size === 0) return false;

  const baseIndices: number[] = [];
  const doorIndices: number[] = [];
  for (let offset = 0; offset + 2 < index.count; offset += 3) {
    const first = index.getX(offset);
    const target = selectedRoots.has(components.find(first)) ? doorIndices : baseIndices;
    target.push(first, index.getX(offset + 1), index.getX(offset + 2));
  }
  if (doorIndices.length === 0) return false;

  const baseGeometry = cloneCompactSubset(geometry, baseIndices);
  const doorGeometry = cloneCompactSubset(geometry, doorIndices);
  // Mobile POSITION accessors are normalized Int16 and rely on the source
  // node's dequantization matrix. The extracted door is baked into scene
  // coordinates, so convert positions to Float32 first to prevent values
  // outside [-1, 1] from being clamped during applyMatrix4/translate.
  dequantizePositionForWorldBake(doorGeometry);
  doorGeometry.applyMatrix4(mesh.matrixWorld);
  doorGeometry.translate(-DRIVER_DOOR_HINGE[0], -DRIVER_DOOR_HINGE[1], -DRIVER_DOOR_HINGE[2]);
  mesh.geometry = baseGeometry;
  pivot.add(makeDoorMesh(mesh, doorGeometry));
  return true;
}

function isDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  let parent = object.parent;
  while (parent) {
    if (parent === ancestor) return true;
    parent = parent.parent;
  }
  return false;
}

/**
 * The source car stores the outer door inside whole-car meshes. This one-time
 * preparation separates disconnected geometry components inside the measured
 * driver-door envelope, removes them from the static meshes, and places them
 * beneath a single hinge. No source GLB is mutated.
 */
export function createDriverDoorAssembly(scene: THREE.Group): DriverDoorAssembly | null {
  scene.updateWorldMatrix(true, true);
  const namedInteriorDoor = scene.getObjectByName('DOOR_INT_L_158');
  const namedDoorActuator = scene.getObjectByName('DOOR_INT_L_anim_160');
  const flattenedInterior = !namedInteriorDoor;
  const pivot = new THREE.Group();
  pivot.name = 'NORKA_DRIVER_DOOR_RUNTIME';
  pivot.position.set(...DRIVER_DOOR_HINGE);

  const candidates: THREE.Mesh[] = [];
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (namedInteriorDoor && (object === namedInteriorDoor || isDescendantOf(object, namedInteriorDoor))) return;
    const materialName = materialNameOf(object);
    if (!materialName) return;
    if (materialName === 'ext_body' || materialName === 'ext_glass' || materialName === 'ext_chrome'
      || materialName === 'ext_carbon' || materialName === 'darkgrayplastic'
      || materialName === 'black_plastic' || materialName === 'side_mirror_glass'
      || (flattenedInterior && materialName.startsWith('INT_'))) {
      candidates.push(object);
    }
  });

  let extractedPartCount = 0;
  candidates.forEach((mesh) => {
    const materialName = materialNameOf(mesh);
    if (materialName && partitionIndexedMesh(mesh, materialName, flattenedInterior, pivot)) extractedPartCount += 1;
  });

  scene.add(pivot);
  scene.updateWorldMatrix(true, true);
  if (namedInteriorDoor) {
    pivot.attach(namedInteriorDoor);
    extractedPartCount += 1;
  }
  if (namedDoorActuator) {
    pivot.attach(namedDoorActuator);
    extractedPartCount += 1;
  }
  pivot.updateWorldMatrix(true, true);
  return extractedPartCount > 0 ? { pivot, extractedPartCount } : null;
}
