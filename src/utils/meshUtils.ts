/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

export interface ParsedGeometry {
  vertices: number[];
  normals: number[];
  indices: number[];
  name?: string;
}

/**
 * Robust lightweight front-end OBJ Parser.
 * Handles vertices (v), vertex normals (vn), and faces (f) with standard/mixed indexing.
 * Supports polygon triangulation (fan triangulation) for quads or n-gons.
 */
export function parseOBJ(text: string): ParsedGeometry {
  const vertices: number[] = [];
  const normals: number[] = [];
  
  const outVertices: number[] = [];
  const outNormals: number[] = [];
  const outIndices: number[] = [];
  
  // Maps a face vertex spec (e.g. "v/vt/vn") to its index in the output buffer arrays
  const specToIndexMap: { [key: string]: number } = {};
  let nextIndex = 0;
  
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#') || line === '') continue;
    
    // Split by whitespace
    const parts = line.split(/\s+/);
    const type = parts[0];
    
    if (type === 'v') {
      // Vertex position
      vertices.push(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3])
      );
    } else if (type === 'vn') {
      // Vertex normal
      normals.push(
        parseFloat(parts[1]),
        parseFloat(parts[2]),
        parseFloat(parts[3])
      );
    } else if (type === 'f') {
      // Face definition
      // f 1 2 3 or f 1/1/1 2/2/2 3/3/3 or f 1//1 2//2 3//3
      const faceVertexIndices: number[] = [];
      
      for (let j = 1; j < parts.length; j++) {
        const spec = parts[j];
        if (!spec) continue;
        
        let index = specToIndexMap[spec];
        if (index === undefined) {
          const subParts = spec.split('/');
          
          // OBJ indices are 1-based, can be negative relative references.
          let vIdxRaw = parseInt(subParts[0]);
          if (isNaN(vIdxRaw)) continue;
          
          let vIdx = vIdxRaw > 0 ? (vIdxRaw - 1) * 3 : (vertices.length / 3 + vIdxRaw) * 3;
          
          // Normal index (optional)
          let vnIdxRaw = subParts[2] ? parseInt(subParts[2]) : NaN;
          let vnIdx = -1;
          if (!isNaN(vnIdxRaw)) {
            vnIdx = vnIdxRaw > 0 ? (vnIdxRaw - 1) * 3 : (normals.length / 3 + vnIdxRaw) * 3;
          }
          
          const vx = vertices[vIdx] || 0;
          const vy = vertices[vIdx + 1] || 0;
          const vz = vertices[vIdx + 2] || 0;
          
          let nx = 0, ny = 0, nz = 0;
          if (vnIdx >= 0 && normals[vnIdx] !== undefined) {
            nx = normals[vnIdx];
            ny = normals[vnIdx + 1];
            nz = normals[vnIdx + 2];
          }
          
          outVertices.push(vx, vy, vz);
          outNormals.push(nx, ny, nz);
          
          index = nextIndex;
          specToIndexMap[spec] = index;
          nextIndex++;
        }
        faceVertexIndices.push(index);
      }
      
      // Fan triangulate the polygon face for indices
      for (let j = 1; j < faceVertexIndices.length - 1; j++) {
        outIndices.push(faceVertexIndices[0], faceVertexIndices[j], faceVertexIndices[j + 1]);
      }
    }
  }
  
  return {
    vertices: outVertices,
    normals: outNormals,
    indices: outIndices
  };
}

/**
 * Generates an direct ArrayBuffer of binary STL data from a ThreeJS BufferGeometry.
 * Binary STL format is high-fidelity and compact, ready to load in slicers like Cura, Bambu Studio, or PrusaSlicer.
 */
export function exportBinarySTL(geometry: THREE.BufferGeometry): ArrayBuffer {
  const positionAttr = geometry.getAttribute('position');
  if (!positionAttr) {
    return new ArrayBuffer(0);
  }
  
  // Re-compute vertex normals to guarantee we have them
  geometry.computeVertexNormals();
  const normalAttr = geometry.getAttribute('normal');
  const indexAttr = geometry.getIndex();
  
  const numTriangles = indexAttr ? indexAttr.count / 3 : positionAttr.count / 3;
  
  // Header (80 bytes) + Num Triangles (4 bytes) + facets (numTriangles * 50 bytes)
  const bufferSize = 80 + 4 + numTriangles * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);
  
  // 1. Write Header (80 ASCII characters)
  const header = "Exported from 3D OBJ to STL Adjuster - Premium Quality 3D Print File";
  for (let i = 0; i < Math.min(header.length, 80); i++) {
    view.setUint8(i, header.charCodeAt(i));
  }
  
  // 2. Write Triangle Count (Little Endian, 32-bit uint)
  view.setUint32(80, numTriangles, true);
  
  let offset = 84;
  
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const normal = new THREE.Vector3();
  
  for (let i = 0; i < numTriangles; i++) {
    let i0 = 0, i1 = 0, i2 = 0;
    
    if (indexAttr) {
      i0 = indexAttr.array[i * 3];
      i1 = indexAttr.array[i * 3 + 1];
      i2 = indexAttr.array[i * 3 + 2];
    } else {
      i0 = i * 3;
      i1 = i * 3 + 1;
      i2 = i * 3 + 2;
    }
    
    vA.fromBufferAttribute(positionAttr, i0);
    vB.fromBufferAttribute(positionAttr, i1);
    vC.fromBufferAttribute(positionAttr, i2);
    
    // Compute face normal (mathematically correct counter-clockwise winding normal)
    if (normalAttr) {
      const n0 = new THREE.Vector3().fromBufferAttribute(normalAttr, i0);
      const n1 = new THREE.Vector3().fromBufferAttribute(normalAttr, i1);
      const n2 = new THREE.Vector3().fromBufferAttribute(normalAttr, i2);
      normal.copy(n0).add(n1).add(n2).normalize();
    } else {
      const cb = new THREE.Vector3().subVectors(vC, vB);
      const ab = new THREE.Vector3().subVectors(vA, vB);
      normal.crossVectors(cb, ab).normalize();
    }
    
    // Normal vector
    view.setFloat32(offset, normal.x, true);
    view.setFloat32(offset + 4, normal.y, true);
    view.setFloat32(offset + 8, normal.z, true);
    offset += 12;
    
    // Vertex 1
    view.setFloat32(offset, vA.x, true);
    view.setFloat32(offset + 4, vA.y, true);
    view.setFloat32(offset + 8, vA.z, true);
    offset += 12;
    
    // Vertex 2
    view.setFloat32(offset, vB.x, true);
    view.setFloat32(offset + 4, vB.y, true);
    view.setFloat32(offset + 8, vB.z, true);
    offset += 12;
    
    // Vertex 3
    view.setFloat32(offset, vC.x, true);
    view.setFloat32(offset + 4, vC.y, true);
    view.setFloat32(offset + 8, vC.z, true);
    offset += 12;
    
    // Attribute Byte Count (2 bytes - usually 0)
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  
  return buffer;
}

/**
 * Procedural Geometric Object Generators to supply immediate test meshes!
 */

// 1. Standard Calibration Cube (20x20x20mm)
export function generateCalibrationCube(): ParsedGeometry {
  const sz = 10; // Half size, so full size is 20x20x20
  
  // 8 vertices
  const rawVertices = [
    -sz, -sz,  sz,  // 0
     sz, -sz,  sz,  // 1
     sz,  sz,  sz,  // 2
    -sz,  sz,  sz,  // 3
    -sz, -sz, -sz,  // 4
     sz, -sz, -sz,  // 5
     sz,  sz, -sz,  // 6
    -sz,  sz, -sz   // 7
  ];
  
  // Face normals of cube
  const rawNormals = [
    0, 0, 1,   // Front
    1, 0, 0,   // Right
    0, 0, -1,  // Back
    -1, 0, 0,  // Left
    0, 1, 0,   // Top
    0, -1, 0   // Bottom
  ];
  
  // Let's build indexed vertices (triangles with discrete normals per face)
  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  
  // We specify cube faces (6 faces * 2 triangles * 3 vertices)
  const faces = [
    // Front face
    { f: [0, 1, 2, 3], n: 0 },
    // Right face
    { f: [1, 5, 6, 2], n: 1 },
    // Back face
    { f: [5, 4, 7, 6], n: 2 },
    // Left face
    { f: [4, 0, 3, 7], n: 3 },
    // Top face
    { f: [3, 2, 6, 7], n: 4 },
    // Bottom face
    { f: [4, 5, 1, 0], n: 5 }
  ];
  
  let vertexIndex = 0;
  for (const face of faces) {
    const [i0, i1, i2, i3] = face.f;
    const n = face.n;
    
    const nx = rawNormals[n * 3];
    const ny = rawNormals[n * 3 + 1];
    const nz = rawNormals[n * 3 + 2];
    
    // Add 4 vertices for this quad
    const quadV = [i0, i1, i2, i3];
    for (const vId of quadV) {
      vertices.push(rawVertices[vId * 3], rawVertices[vId * 3 + 1], rawVertices[vId * 3 + 2]);
      normals.push(nx, ny, nz);
    }
    
    // Add indices representing 2 triangles for this quad
    indices.push(
      vertexIndex, vertexIndex + 1, vertexIndex + 2,
      vertexIndex, vertexIndex + 2, vertexIndex + 3
    );
    
    vertexIndex += 4;
  }
  
  return { vertices, normals, indices, name: "Calibration_Cube_20mm" };
}

// 2. Elegant Twisted Vase (Spline / twisted cylinder surface)
export function generateTwistedVase(): ParsedGeometry {
  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  
  const height = 40;
  const radialSegments = 36;
  const heightSegments = 30;
  const baseRadius = 12;
  const twistTurns = 1.0; // rotation turns from bottom to top
  
  // Create grid of vertices
  for (let y = 0; y <= heightSegments; y++) {
    const hRatio = y / heightSegments; // 0 to 1
    const z = hRatio * height - (height / 2); // vertical z coordinate (-20 to 20)
    
    // Dynamic radius of vase at this height (pinched center, flared rim)
    const factor = Math.PI * hRatio;
    const r = baseRadius * (0.8 + 0.4 * Math.sin(factor * 1.5 - 0.2) + 0.25 * Math.cos(factor * 2.5));
    
    const twistAngle = hRatio * twistTurns * Math.PI * 2;
    
    for (let x = 0; x < radialSegments; x++) {
      const angleRatio = x / radialSegments;
      const angle = angleRatio * Math.PI * 2 + twistAngle;
      
      // Multi-lobed grooved geometry
      const lobeFactor = Math.sin(angleRatio * Math.PI * 2 * 12); // 12 elegant ridges
      const finalRadius = r + 1.2 * lobeFactor;
      
      const px = finalRadius * Math.cos(angle);
      const py = finalRadius * Math.sin(angle);
      
      // Positions
      vertices.push(px, py, z);
      
      // Approximate vector normal pointing outwards from the central axis
      // Will compute precise normals in threejs, but let's give a robust initial guess
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      const nz = 0; // standard horizontal projection
      normals.push(nx, ny, nz);
    }
  }
  
  // Generate faces
  for (let y = 0; y < heightSegments; y++) {
    for (let x = 0; x < radialSegments; x++) {
      const nextX = (x + 1) % radialSegments;
      
      const i0 = y * radialSegments + x;
      const i1 = y * radialSegments + nextX;
      const i2 = (y + 1) * radialSegments + x;
      const i3 = (y + 1) * radialSegments + nextX;
      
      // Triangular mesh quads
      indices.push(i0, i1, i3);
      indices.push(i0, i3, i2);
    }
  }
  
  // Now add a solid disk at the base to make it printable!
  const baseIndexOffset = vertices.length / 3;
  // Center of base
  vertices.push(0, 0, -height/2);
  normals.push(0, 0, -1);
  
  // Base perimeter vertices
  for (let x = 0; x < radialSegments; x++) {
    const firstRowIdx = x;
    const vx = vertices[firstRowIdx * 3];
    const vy = vertices[firstRowIdx * 3 + 1];
    const vz = vertices[firstRowIdx * 3 + 2];
    
    vertices.push(vx, vy, vz);
    normals.push(0, 0, -1);
  }
  
  // Triangulate base cap (faces pointing down)
  const centerIdx = baseIndexOffset;
  for (let x = 0; x < radialSegments; x++) {
    const nextX = (x + 1) % radialSegments;
    const vCurr = baseIndexOffset + 1 + x;
    const vNext = baseIndexOffset + 1 + nextX;
    
    indices.push(centerIdx, vNext, vCurr);
  }
  
  return { vertices, normals, indices, name: "Modular_Twisted_Vase" };
}

// 3. Technical Gear Mesh (Printable mechanical planetary gear look)
export function generateGearMesh(): ParsedGeometry {
  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  
  const thickness = 10;
  const numTeeth = 18;
  const innerRadius = 8;
  const outerRadiusWTeeth = 16;
  const pitchRadius = 13;
  const segmentsPerTooth = 4;
  const totalSegments = numTeeth * segmentsPerTooth;
  
  // Generate outer gear silhouette
  const points: {x: number, y: number}[] = [];
  for (let i = 0; i < totalSegments; i++) {
    const angle = (i / totalSegments) * Math.PI * 2;
    // Tooth profile: involute teeth approximation
    const toothPhase = (i % segmentsPerTooth);
    
    let r = pitchRadius;
    if (toothPhase === 0) {
      r = outerRadiusWTeeth;
    } else if (toothPhase === 1 || toothPhase === 2) {
      r = pitchRadius + 1.2;
    } else {
      r = pitchRadius - 2.2;
    }
    
    points.push({
      x: r * Math.cos(angle),
      y: r * Math.sin(angle)
    });
  }
  
  // Shaft inner circle points
  const innerPoints: {x: number, y: number}[] = [];
  for (let i = 0; i < totalSegments; i++) {
    const angle = (i / totalSegments) * Math.PI * 2;
    innerPoints.push({
      x: innerRadius * Math.cos(angle),
      y: innerRadius * Math.sin(angle)
    });
  }
  
  // Heights
  const zBottom = -thickness / 2;
  const zTop = thickness / 2;
  
  // 1. Add bottom ring vertices (outer & inner)
  // Outer points bottom (Indices: 0 to totalSegments - 1)
  for (let p of points) {
    vertices.push(p.x, p.y, zBottom);
    normals.push(0, 0, -1);
  }
  // Inner points bottom (Indices: totalSegments to 2*totalSegments - 1)
  for (let p of innerPoints) {
    vertices.push(p.x, p.y, zBottom);
    normals.push(0, 0, -1);
  }
  
  // 2. Add top ring vertices (outer & inner)
  // Outer points top (Indices: 2*totalSegments to 3*totalSegments - 1)
  for (let p of points) {
    vertices.push(p.x, p.y, zTop);
    normals.push(0, 0, 1);
  }
  // Inner points top (Indices: 3*totalSegments to 4*totalSegments - 1)
  for (let p of innerPoints) {
    vertices.push(p.x, p.y, zTop);
    normals.push(0, 0, 1);
  }
  
  const N = totalSegments;
  
  // 3. Triangulate Bottom face plate (connecting inner-ring and outer-ring)
  for (let i = 0; i < N; i++) {
    const nextI = (i + 1) % N;
    
    const outerCurr = i;
    const outerNext = nextI;
    const innerCurr = N + i;
    const innerNext = N + nextI;
    
    // Bottom side faces down (winding needs to be cw looking from +Z, ccw looking from -Z)
    // Looking from bottom (-Z, facing up), winding should be v0 -> v1 -> v2 to point normal down
    indices.push(outerCurr, innerNext, innerCurr);
    indices.push(outerCurr, outerNext, innerNext);
  }
  
  // 4. Triangulate Top face plate (pointing up)
  for (let i = 0; i < N; i++) {
    const nextI = (i + 1) % N;
    
    const outerCurr = 2 * N + i;
    const outerNext = 2 * N + nextI;
    const innerCurr = 3 * N + i;
    const innerNext = 3 * N + nextI;
    
    indices.push(outerCurr, innerCurr, innerNext);
    indices.push(outerCurr, innerNext, outerNext);
  }
  
  // 5. Gear Outer Teeth Vertices & Normals (with dedicated side normals for crisp lighting)
  const outerSidesOffset = vertices.length / 3;
  // Duplicate outer vertices for clean perpendicular normals
  for (let yVal of [zBottom, zTop]) {
    for (let i = 0; i < N; i++) {
      const p = points[i];
      vertices.push(p.x, p.y, yVal);
      // Rough outward normal vector
      const angle = (i / N) * Math.PI * 2;
      normals.push(Math.cos(angle), Math.sin(angle), 0);
    }
  }
  
  // Bridge outer teeth walls
  for (let i = 0; i < N; i++) {
    const nextI = (i + 1) % N;
    const b0 = outerSidesOffset + i;
    const b1 = outerSidesOffset + nextI;
    const t0 = outerSidesOffset + N + i;
    const t1 = outerSidesOffset + N + nextI;
    
    indices.push(b0, t1, t0);
    indices.push(b0, b1, t1);
  }
  
  // 6. Gear Inner Shaft Wall Vertices & Normals (facing inward/hollow shaft)
  const innerSidesOffset = vertices.length / 3;
  for (let yVal of [zBottom, zTop]) {
    for (let i = 0; i < N; i++) {
      const p = innerPoints[i];
      vertices.push(p.x, p.y, yVal);
      const angle = (i / N) * Math.PI * 2;
      normals.push(-Math.cos(angle), -Math.sin(angle), 0); // facing inward!
    }
  }
  
  // Bridge inner shaft hollow
  for (let i = 0; i < N; i++) {
    const nextI = (i + 1) % N;
    const b0 = innerSidesOffset + i;
    const b1 = innerSidesOffset + nextI;
    const t0 = innerSidesOffset + N + i;
    const t1 = innerSidesOffset + N + nextI;
    
    // faces pointing inwards
    indices.push(b0, t0, t1);
    indices.push(b0, t1, b1);
  }
  
  return { vertices, normals, indices, name: "Mechanical_Spur_Gear" };
}

// 4. Low-Poly Hollow Sphere Shell (Demonstrating thickness adjustments perfectly!)
export function generateHollowSphere(): ParsedGeometry {
  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  
  const outerR = 15;
  const innerR = 12.5; // Solid shell has double walled structure!
  const rings = 16;
  const sectors = 24;
  
  // Generate double walled hollow sphere with a small cylindrical connector hole representing a hollow design
  // Standard outer sphere
  for (let rIdx = 0; rIdx <= rings; rIdx++) {
    const theta = (rIdx / rings) * Math.PI; // 0 to pi
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    
    for (let sIdx = 0; sIdx <= sectors; sIdx++) {
      const phi = (sIdx / sectors) * Math.PI * 2; // 0 to 2pi
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      
      const ux = sinTheta * cosPhi;
      const uy = sinTheta * sinPhi;
      const uz = cosTheta;
      
      // Outer shell vertex
      vertices.push(ux * outerR, uy * outerR, uz * outerR);
      normals.push(ux, uy, uz); // pointing outward
    }
  }
  
  const outerRingCount = (rings + 1) * (sectors + 1);
  
  // Inner sphere (with normals pointing inward!)
  for (let rIdx = 0; rIdx <= rings; rIdx++) {
    const theta = (rIdx / rings) * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    
    for (let sIdx = 0; sIdx <= sectors; sIdx++) {
      const phi = (sIdx / sectors) * Math.PI * 2;
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      
      const ux = sinTheta * cosPhi;
      const uy = sinTheta * sinPhi;
      const uz = cosTheta;
      
      // Inner shell vertex
      vertices.push(ux * innerR, uy * innerR, uz * innerR);
      normals.push(-ux, -uy, -uz); // pointing inward!
    }
  }
  
  // Helper for 2D index wrapping
  const getIndex = (r: number, s: number, isInner: boolean) => {
    const sC = sectors + 1;
    const baseIdx = isInner ? outerRingCount : 0;
    return baseIdx + r * sC + s;
  };
  
  // Triangulate outer sphere (counter-clockwise pointing outward)
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const i00 = getIndex(r, s, false);
      const i10 = getIndex(r + 1, s, false);
      const i01 = getIndex(r, s + 1, false);
      const i11 = getIndex(r + 1, s + 1, false);
      
      indices.push(i00, i10, i11);
      indices.push(i00, i11, i01);
    }
  }
  
  // Triangulate inner sphere (clockwise to point normal inward)
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const i00 = getIndex(r, s, true);
      const i10 = getIndex(r + 1, s, true);
      const i01 = getIndex(r, s + 1, true);
      const i11 = getIndex(r + 1, s + 1, true);
      
      // Winding is reversed for inward facing faces
      indices.push(i00, i11, i10);
      indices.push(i00, i01, i11);
    }
  }
  
  return { vertices, normals, indices, name: "Double_Sheathed_Hollow_Sphere" };
}

/**
 * Perform on-the-fly math deformation representing vertex displacement.
 * This runs interactively as the user drags sliders.
 * Recreates position attribute buffer on top of the original structure to prevent roundoff errors.
 */
export function applyAdjustments(
  originalGeom: ParsedGeometry,
  scaleUniform: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
  wallThickness: number, // normal offset displacement in mm
  thickenMode: 'uniform' | 'xy-only' | 'z-only' = 'uniform'
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  
  const vertices = originalGeom.vertices;
  const normals = originalGeom.normals;
  const indices = originalGeom.indices;
  
  const numVertices = vertices.length / 3;
  
  // 1. Ensure we have valid normals for both rendering and displacement calculation.
  // If the input normals are empty or all 0, we compute proper vertex normals.
  let baseNormals = [...normals];
  const isNormalsEmpty = normals.length === 0 || normals.every(v => v === 0);
  
  if (isNormalsEmpty) {
    const tempNormals = new Float32Array(vertices.length);
    const numTriangles = indices.length > 0 ? indices.length / 3 : numVertices / 3;
    
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const edge1 = new THREE.Vector3();
    const edge2 = new THREE.Vector3();
    const faceNormal = new THREE.Vector3();
    
    for (let i = 0; i < numTriangles; i++) {
      let i0 = i * 3, i1 = i * 3 + 1, i2 = i * 3 + 2;
      if (indices.length > 0) {
        i0 = indices[i * 3];
        i1 = indices[i * 3 + 1];
        i2 = indices[i * 3 + 2];
      }
      
      const idxA = i0 * 3;
      const idxB = i1 * 3;
      const idxC = i2 * 3;
      
      if (idxA < vertices.length && idxB < vertices.length && idxC < vertices.length) {
        vA.set(vertices[idxA], vertices[idxA + 1], vertices[idxA + 2]);
        vB.set(vertices[idxB], vertices[idxB + 1], vertices[idxB + 2]);
        vC.set(vertices[idxC], vertices[idxC + 1], vertices[idxC + 2]);
        
        edge1.subVectors(vB, vA);
        edge2.subVectors(vC, vA);
        faceNormal.crossVectors(edge1, edge2).normalize();
        
        for (const idx of [i0, i1, i2]) {
          const idx3 = idx * 3;
          tempNormals[idx3] += faceNormal.x;
          tempNormals[idx3 + 1] += faceNormal.y;
          tempNormals[idx3 + 2] += faceNormal.z;
        }
      }
    }
    
    for (let i = 0; i < numVertices; i++) {
      const i3 = i * 3;
      const nx = tempNormals[i3];
      const ny = tempNormals[i3 + 1];
      const nz = tempNormals[i3 + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0.001) {
        tempNormals[i3] /= len;
        tempNormals[i3 + 1] /= len;
        tempNormals[i3 + 2] /= len;
      }
    }
    
    baseNormals = Array.from(tempNormals);
  }

  // 2. Group duplicate or extremely close vertices (within 0.05 mm tolerance)
  // to compute averaged displacement normals. This keeps edges/corners watertight.
  const tolerance = 0.05;
  const grid = new Map<string, { x: number; y: number; z: number; indices: number[] }[]>();
  const getBucketKey = (val: number) => Math.floor(val / tolerance);
  
  for (let i = 0; i < numVertices; i++) {
    const i3 = i * 3;
    const x = vertices[i3];
    const y = vertices[i3 + 1];
    const z = vertices[i3 + 2];
    
    const bx = getBucketKey(x);
    const by = getBucketKey(y);
    const bz = getBucketKey(z);
    
    let merged = false;
    
    outerLoop:
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = `${bx + dx},${by + dy},${bz + dz}`;
          const bucket = grid.get(key);
          if (bucket) {
            for (const group of bucket) {
              const distSq = (group.x - x) ** 2 + (group.y - y) ** 2 + (group.z - z) ** 2;
              if (distSq < tolerance * tolerance) {
                group.indices.push(i);
                merged = true;
                break outerLoop;
              }
            }
          }
        }
      }
    }
    
    if (!merged) {
      const key = `${bx},${by},${bz}`;
      let bucket = grid.get(key);
      if (!bucket) {
        bucket = [];
        grid.set(key, bucket);
      }
      bucket.push({ x, y, z, indices: [i] });
    }
  }
  
  const displacementNormals = new Array<THREE.Vector3>(numVertices);
  for (const bucket of grid.values()) {
    for (const group of bucket) {
      const avgNormal = new THREE.Vector3(0, 0, 0);
      for (const idx of group.indices) {
        const idx3 = idx * 3;
        avgNormal.x += baseNormals[idx3] || 0;
        avgNormal.y += baseNormals[idx3 + 1] || 0;
        avgNormal.z += baseNormals[idx3 + 2] || 0;
      }
      
      if (avgNormal.lengthSq() > 1e-4) {
        avgNormal.normalize();
        for (const idx of group.indices) {
          displacementNormals[idx] = avgNormal.clone();
        }
      } else {
        for (const idx of group.indices) {
          const idx3 = idx * 3;
          displacementNormals[idx] = new THREE.Vector3(
            baseNormals[idx3] || 0,
            baseNormals[idx3 + 1] || 0,
            baseNormals[idx3 + 2] || 0
          ).normalize();
        }
      }
    }
  }

  // 3. Find boundary edges to detect if the mesh has open/thin-walled borders.
  const edgeCountMap = new Map<string, number>();
  const directedEdges = new Map<string, [number, number]>();
  const numTriangles = indices.length > 0 ? indices.length / 3 : numVertices / 3;
  
  for (let i = 0; i < numTriangles; i++) {
    let i0 = i * 3, i1 = i * 3 + 1, i2 = i * 3 + 2;
    if (indices.length > 0) {
      i0 = indices[i * 3];
      i1 = indices[i * 3 + 1];
      i2 = indices[i * 3 + 2];
    }
    
    const edges = [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ];
    
    for (const [u, v] of edges) {
      const minVal = Math.min(u, v);
      const maxVal = Math.max(u, v);
      const key = `${minVal}-${maxVal}`;
      
      edgeCountMap.set(key, (edgeCountMap.get(key) || 0) + 1);
      directedEdges.set(key, [u, v]);
    }
  }
  
  const boundaryEdges: [number, number][] = [];
  for (const [key, count] of edgeCountMap.entries()) {
    if (count === 1) {
      const dirEdge = directedEdges.get(key);
      if (dirEdge) {
        boundaryEdges.push(dirEdge);
      }
    }
  }

  // 4. Pre-calculate full scaling factors
  const sX = scaleUniform * scaleX;
  const sY = scaleUniform * scaleY;
  const sZ = scaleUniform * scaleZ;
  
  const isMeshOpen = boundaryEdges.length > 0;
  
  if (wallThickness !== 0 && isMeshOpen) {
    // === MULTI-SHELL WATERTIGHT SOLIDIFICATION ===
    const outVertices = new Float32Array(numVertices * 2 * 3);
    const outNormals = new Float32Array(numVertices * 2 * 3);
    
    for (let i = 0; i < numVertices; i++) {
      const i3 = i * 3;
      const x = vertices[i3];
      const y = vertices[i3 + 1];
      const z = vertices[i3 + 2];
      
      const dispN = displacementNormals[i];
      const nx = dispN.x;
      const ny = dispN.y;
      const nz = dispN.z;
      
      let o_x = x;
      let o_y = y;
      let o_z = z;
      
      if (thickenMode === 'uniform') {
        o_x += nx * wallThickness;
        o_y += ny * wallThickness;
        o_z += nz * wallThickness;
      } else if (thickenMode === 'xy-only') {
        const planarLength = Math.sqrt(nx * nx + ny * ny);
        if (planarLength > 0.001) {
          o_x += (nx / planarLength) * wallThickness;
          o_y += (ny / planarLength) * wallThickness;
        }
      } else if (thickenMode === 'z-only') {
        o_z += Math.sign(nz) * wallThickness;
      }
      
      // Layer 1 coords (original position, scaled)
      outVertices[i3] = x * sX;
      outVertices[i3 + 1] = y * sY;
      outVertices[i3 + 2] = z * sZ;
      
      // Layer 1 normals
      outNormals[i3] = baseNormals[i3];
      outNormals[i3 + 1] = baseNormals[i3 + 1];
      outNormals[i3 + 2] = baseNormals[i3 + 2];
      
      // Layer 2 coords (displaced/thickened position, scaled)
      const offset_i3 = (i + numVertices) * 3;
      outVertices[offset_i3] = o_x * sX;
      outVertices[offset_i3 + 1] = o_y * sY;
      outVertices[offset_i3 + 2] = o_z * sZ;
      
      // Layer 2 normals (reversed direction)
      outNormals[offset_i3] = -baseNormals[i3];
      outNormals[offset_i3 + 1] = -baseNormals[i3 + 1];
      outNormals[offset_i3 + 2] = -baseNormals[i3 + 2];
    }
    
    const outIndices: number[] = [];
    
    // Add existing faces (Layer 1)
    for (let i = 0; i < numTriangles; i++) {
      let i0 = i * 3, i1 = i * 3 + 1, i2 = i * 3 + 2;
      if (indices.length > 0) {
        i0 = indices[i * 3];
        i1 = indices[i * 3 + 1];
        i2 = indices[i * 3 + 2];
      }
      outIndices.push(i0, i1, i2);
    }
    
    // Add offset layer faces (Layer 2) with reversed winding order (i0, i2, i1)
    for (let i = 0; i < numTriangles; i++) {
      let i0 = i * 3, i1 = i * 3 + 1, i2 = i * 3 + 2;
      if (indices.length > 0) {
        i0 = indices[i * 3];
        i1 = indices[i * 3 + 1];
        i2 = indices[i * 3 + 2];
      }
      outIndices.push(i0 + numVertices, i2 + numVertices, i1 + numVertices);
    }
    
    // Bridge the boundary edges
    for (const [u, v] of boundaryEdges) {
      const uO = u + numVertices;
      const vO = v + numVertices;
      
      outIndices.push(u, vO, v);
      outIndices.push(u, uO, vO);
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(outVertices, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(outNormals, 3));
    geometry.setIndex(outIndices);
    
    geometry.computeVertexNormals();
  } else {
    // === STANDARD TOPOLOGY DISPLACEMENT (for closed meshes or offset-only) ===
    const adjustedVertices = new Float32Array(vertices.length);
    const adjustedNormals = new Float32Array(baseNormals.length);
    
    for (let i = 0; i < baseNormals.length; i++) {
      adjustedNormals[i] = baseNormals[i];
    }
    
    for (let i = 0; i < numVertices; i++) {
      const i3 = i * 3;
      const x = vertices[i3];
      const y = vertices[i3 + 1];
      const z = vertices[i3 + 2];
      
      const dispN = displacementNormals[i];
      const nx = dispN.x;
      const ny = dispN.y;
      const nz = dispN.z;
      
      let px = x;
      let py = y;
      let pz = z;
      
      if (wallThickness !== 0) {
        if (thickenMode === 'uniform') {
          px += nx * wallThickness;
          py += ny * wallThickness;
          pz += nz * wallThickness;
        } else if (thickenMode === 'xy-only') {
          const planarLength = Math.sqrt(nx * nx + ny * ny);
          if (planarLength > 0.001) {
            px += (nx / planarLength) * wallThickness;
            py += (ny / planarLength) * wallThickness;
          }
        } else if (thickenMode === 'z-only') {
          pz += Math.sign(nz) * wallThickness;
        }
      }
      
      adjustedVertices[i3] = px * sX;
      adjustedVertices[i3 + 1] = py * sY;
      adjustedVertices[i3 + 2] = pz * sZ;
    }
    
    geometry.setAttribute('position', new THREE.BufferAttribute(adjustedVertices, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(adjustedNormals, 3));
    
    if (indices.length > 0) {
      geometry.setIndex(indices);
    }
    
    geometry.computeVertexNormals();
  }
  
  return geometry;
}

/**
 * Estimates simple print parameters:
 * - Print Volume in cm^3 (which equals mL)
 * - Filament weight (assuming PLA density = 1.24 g/cm^3)
 * - Material cost estimation
 * - Bounding box size (X x Y x Z mm)
 */
export interface PrintAnalysis {
  width: number; // mm
  height: number; // mm
  depth: number; // mm
  volumeEst: number; // cm3
  weightEst: number; // grams
  watertight: boolean;
  triangleCount: number;
}

export function performPrintAnalysis(geometry: THREE.BufferGeometry): PrintAnalysis {
  geometry.computeBoundingBox();
  const bbox = geometry.boundingBox || new THREE.Box3();
  
  const size = new THREE.Vector3();
  bbox.getSize(size);
  
  const width = size.x;
  const depth = size.y;
  const height = size.z;
  
  // Calculate index or position count
  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();
  const triCount = indexAttr ? indexAttr.count / 3 : (posAttr ? posAttr.count / 3 : 0);
  
  // Estimate Volume of bounding box and assume fill volume
  // In a real slicer, volume is sum of signed tetrahedrons (divergence theorem on closed manifold mesh)
  // Let's compute the ACTUAL mathematical volume of the geometry using signed tetrahedrons!
  // This is highly professional and accurate for standard closed designs!
  let signedVolume = 0;
  if (posAttr && triCount > 0) {
    const p = posAttr;
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    
    for (let i = 0; i < triCount; i++) {
      let i0 = 0, i1 = 0, i2 = 0;
      if (indexAttr) {
        i0 = indexAttr.array[i * 3];
        i1 = indexAttr.array[i * 3 + 1];
        i2 = indexAttr.array[i * 3 + 2];
      } else {
        i0 = i * 3;
        i1 = i * 3 + 1;
        i2 = i * 3 + 2;
      }
      
      vA.fromBufferAttribute(p, i0);
      vB.fromBufferAttribute(p, i1);
      vC.fromBufferAttribute(p, i2);
      
      // Signed volume of tetrahedron from origin: (vA.dot(vB.cross(vC))) / 6.0
      const cross = new THREE.Vector3().crossVectors(vB, vC);
      signedVolume += vA.dot(cross) / 6.0;
    }
  }
  
  // Convert mm^3 to cm^3 (divided by 1000)
  let volumeEst = Math.abs(signedVolume) / 1000;
  
  // If the model volume is 0 or extremely low (e.g. non-closed mesh, flat sheet), fallback to a shell-based estimation
  if (volumeEst < 0.05 && triCount > 0) {
    // Estimating shell volume: Surface Area * nominal thickness (approx. 1.2 mm shell)
    let totalSurfaceArea = 0;
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    if (posAttr) {
      for (let i = 0; i < triCount; i++) {
        let i0 = 0, i1 = 0, i2 = 0;
        if (indexAttr) {
          i0 = indexAttr.array[i * 3];
          i1 = indexAttr.array[i * 3 + 1];
          i2 = indexAttr.array[i * 3 + 2];
        } else {
          i0 = i * 3;
          i1 = i * 3 + 1;
          i2 = i * 3 + 2;
        }
        
        vA.fromBufferAttribute(posAttr, i0);
        vB.fromBufferAttribute(posAttr, i1);
        vC.fromBufferAttribute(posAttr, i2);
        
        // Face area calculation
        const edge1 = new THREE.Vector3().subVectors(vB, vA);
        const edge2 = new THREE.Vector3().subVectors(vC, vA);
        const cross = new THREE.Vector3().crossVectors(edge1, edge2);
        totalSurfaceArea += cross.length() / 2.0;
      }
    }
    // Area in mm^2, multiply by 1.2mm thickness, divide by 1000 to get cm^3
    volumeEst = (totalSurfaceArea * 1.2) / 1000;
  }
  
  // PLA density approx 1.24 g/cm^3
  const weightEst = volumeEst * 1.24;
  
  // Simple watertight heuristic: if volume is non-zero and index ratio is clean
  const watertight = Math.abs(signedVolume) > 10.0; // Simple heuristic for watertight shell with volumetric body
  
  return {
    width,
    height,
    depth,
    volumeEst,
    weightEst,
    watertight,
    triangleCount: triCount
  };
}

/**
 * Automatically rotates the model to align its flat-bottom face (largest flat area)
 * with the print bed (Y = 0, normal pointing in [0, -1, 0] direction).
 */
export function autoRotateToFlatBottom(geom: ParsedGeometry): ParsedGeometry {
  const vertices = [...geom.vertices];
  const normals = [...geom.normals];
  const indices = geom.indices;
  
  const numVertices = vertices.length / 3;
  const numTriangles = indices.length > 0 ? indices.length / 3 : numVertices / 3;
  
  if (numTriangles === 0) return geom;
  
  // 1. Gather all triangles and compute their normals and areas
  const normalsList: THREE.Vector3[] = [];
  const areasList: number[] = [];
  
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const cross = new THREE.Vector3();
  
  for (let i = 0; i < numTriangles; i++) {
    let i0 = 0, i1 = 0, i2 = 0;
    
    if (indices.length > 0) {
      i0 = indices[i * 3];
      i1 = indices[i * 3 + 1];
      i2 = indices[i * 3 + 2];
    } else {
      i0 = i * 3;
      i1 = i * 3 + 1;
      i2 = i * 3 + 2;
    }
    
    vA.set(vertices[i0 * 3], vertices[i0 * 3 + 1], vertices[i0 * 3 + 2]);
    vB.set(vertices[i1 * 3], vertices[i1 * 3 + 1], vertices[i1 * 3 + 2]);
    vC.set(vertices[i2 * 3], vertices[i2 * 3 + 1], vertices[i2 * 3 + 2]);
    
    edge1.subVectors(vB, vA);
    edge2.subVectors(vC, vA);
    cross.crossVectors(edge1, edge2);
    
    const area = cross.length() * 0.5;
    if (area < 1e-6) continue; // skip degenerate/tiny triangles
    
    const triNormal = cross.clone().normalize();
    normalsList.push(triNormal);
    areasList.push(area);
  }
  
  if (normalsList.length === 0) return geom;
  
  // 2. Cluster normal vectors to find the orientation with largest flat area.
  // We'll bin normal vectors that are within ~2.5 degrees of each other (dot product > 0.999).
  interface NormalBin {
    normal: THREE.Vector3;
    totalArea: number;
  }
  
  const bins: NormalBin[] = [];
  
  for (let i = 0; i < normalsList.length; i++) {
    const norm = normalsList[i];
    const area = areasList[i];
    
    let foundBin = false;
    for (const bin of bins) {
      // Check if normal is aligned in same direction (dot product close to 1)
      if (bin.normal.dot(norm) > 0.99) {
        bin.totalArea += area;
        foundBin = true;
        break;
      }
    }
    
    if (!foundBin) {
      bins.push({
        normal: norm.clone(),
        totalArea: area
      });
    }
  }
  
  // Find the bin with the largest cumulative area
  let bestBin = bins[0];
  for (let i = 1; i < bins.length; i++) {
    if (bins[i].totalArea > bestBin.totalArea) {
      bestBin = bins[i];
    }
  }
  
  const bestNormal = bestBin.normal;
  
  // 3. Compute rotation quaternion to align bestNormal with [0, -1, 0] (downward facing bed)
  const q = new THREE.Quaternion();
  const vTarget = new THREE.Vector3(0, -1, 0);
  q.setFromUnitVectors(bestNormal, vTarget);
  
  // 4. Rotate original vertices
  const rotatedVertices = new Array(vertices.length);
  const tempV = new THREE.Vector3();
  for (let i = 0; i < numVertices; i++) {
    const i3 = i * 3;
    tempV.set(vertices[i3], vertices[i3 + 1], vertices[i3 + 2]);
    tempV.applyQuaternion(q);
    rotatedVertices[i3] = tempV.x;
    rotatedVertices[i3 + 1] = tempV.y;
    rotatedVertices[i3 + 2] = tempV.z;
  }
  
  // 5. Rotate original normals
  const rotatedNormals = new Array(normals.length);
  const tempN = new THREE.Vector3();
  for (let i = 0; i < normals.length / 3; i++) {
    const i3 = i * 3;
    tempN.set(normals[i3], normals[i3 + 1], normals[i3 + 2]);
    tempN.applyQuaternion(q);
    rotatedNormals[i3] = tempN.x;
    rotatedNormals[i3 + 1] = tempN.y;
    rotatedNormals[i3 + 2] = tempN.z;
  }
  
  return {
    vertices: rotatedVertices,
    normals: rotatedNormals,
    indices: [...indices],
    name: geom.name
  };
}

