/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Maximize2, Zap, ZoomIn, Eye, Layers, RotateCcw } from 'lucide-react';

interface ThreeViewerProps {
  geometry: THREE.BufferGeometry;
  materialColor: string;
  wireframe: boolean;
  showGrid: boolean;
  showNormals: boolean;
  materialFinish: 'matte' | 'metal' | 'shiny' | 'translucent';
  buildPlateSize: number; // e.g. 200 mm
  cameraKey: number;     // increment to trigger camera auto-focus reset
}

export default function ThreeViewer({
  geometry,
  materialColor,
  wireframe,
  showGrid,
  showNormals,
  materialFinish,
  buildPlateSize,
  cameraKey
}: ThreeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // ThreeJS state references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const wireframeMeshRef = useRef<THREE.Mesh | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const bedBorderRef = useRef<THREE.LineSegments | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);
  const normalsHelperRef = useRef<THREE.LineSegments | null>(null);
  const boundingBoxHelperRef = useRef<THREE.BoxHelper | null>(null);

  // Track previous cameraKey — start at -1 so initial render always auto-focuses
  const prevCameraKeyRef = useRef<number>(-1);
  // Skip first run of build plate effect — scene init already creates the initial plate
  const buildPlateFirstRunRef = useRef<boolean>(true);

  // Track dimensions for UI overlay
  const [loading, setLoading] = useState(true);

  // 1. Initialize Scene, Camera, Renderer, Controls
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // A. Setup Scene and Fog for ambient background blending
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0b0e'); // Immersive solid ink black bg
    sceneRef.current = scene;

    // B. Setup Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(48, 48, 48); // default perspective (isometric diagonal)
    cameraRef.current = camera;

    // C. Setup WebGL Renderer with antialiasing
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true // Required for any screenshot extraction
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    // D. Setup Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // Prevent going underneath the Heated Printing Plate
    controls.minDistance = 5;
    controls.maxDistance = 300;
    controlsRef.current = controls;

    // E. Setup Dynamic Studio Lights (mimicking a SLA/FDM 3D Printing Chamber)
    const ambientLight = new THREE.AmbientLight('#ffffff', 0.45);
    scene.add(ambientLight);

    // Main Studio directional light with shadows
    const dirLight1 = new THREE.DirectionalLight('#ffffff', 0.8);
    dirLight1.position.set(60, 100, 50);
    dirLight1.castShadow = true;
    dirLight1.shadow.mapSize.width = 1024;
    dirLight1.shadow.mapSize.height = 1024;
    dirLight1.shadow.camera.near = 0.5;
    dirLight1.shadow.camera.far = 250;
    const boundary = 40;
    dirLight1.shadow.camera.left = -boundary;
    dirLight1.shadow.camera.right = boundary;
    dirLight1.shadow.camera.top = boundary;
    dirLight1.shadow.camera.bottom = -boundary;
    scene.add(dirLight1);

    // Warm fill light (Violet)
    const fillLight = new THREE.DirectionalLight('#a855f7', 0.45); // elegant violet fill matching Immersive palette
    fillLight.position.set(-60, 30, -50);
    scene.add(fillLight);

    // Rim highlight light (Cyan)
    const rimLight = new THREE.DirectionalLight('#06b6d4', 0.6); // high-contrast cyan rim highlight matching Immersive palette
    rimLight.position.set(0, -20, 40);
    scene.add(rimLight);

    // F. Setup the Heated Build Plate Base
    createBuildPlate(scene, buildPlateSize);

    // G. Animation loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    // H. Resize Observer to watch container changes and prevent hardcoded window bounds
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(width, height);
      }
    });
    resizeObserver.observe(containerRef.current);

    setLoading(false);

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      renderer.dispose();
      controls.dispose();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle building plate rebuild on size slider change
  const createBuildPlate = (scene: THREE.Scene, size: number) => {
    // Remove existing plate elements
    if (gridHelperRef.current) scene.remove(gridHelperRef.current);
    if (bedBorderRef.current) scene.remove(bedBorderRef.current);
    if (axesHelperRef.current) scene.remove(axesHelperRef.current);

    // 1. Heated build plate grid (fine matrix pattern)
    // Build plate coordinates are typically X: [-size/2, size/2], Y: [-size/2, size/2], and Z starts at 0 going upwards.
    // In ThreeJS default, coordinates are X (lateral), Y (height), Z (depth).
    // Let's lay the heated plate horizontally on XZ domain!
    const grid = new THREE.GridHelper(size, 20, '#06b6d4', '#1e222b'); // cyan grid center lines + sleek carbon matrix guides
    grid.position.y = 0; // Bed surface sits at Y=0
    scene.add(grid);
    gridHelperRef.current = grid;

    // 2. Build plate outer golden-PEI magnetic outline boundary
    const hSize = size / 2;
    const borderGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-hSize, 0, -hSize),
      new THREE.Vector3(hSize, 0, -hSize),
      new THREE.Vector3(hSize, 0, -hSize),
      new THREE.Vector3(hSize, 0, hSize),
      new THREE.Vector3(hSize, 0, hSize),
      new THREE.Vector3(-hSize, 0, hSize),
      new THREE.Vector3(-hSize, 0, hSize),
      new THREE.Vector3(-hSize, 0, -hSize),
    ]);
    const borderMaterial = new THREE.LineBasicMaterial({
      color: '#06b6d4', // Glowing high-fidelity PEI magnetic border in Cyan matching Immersive Theme
      linewidth: 2,
      transparent: true,
      opacity: 0.7
    });
    const bedBorder = new THREE.LineSegments(borderGeometry, borderMaterial);
    scene.add(bedBorder);
    bedBorderRef.current = bedBorder;

    // 3. Coordinate axis guidance
    const axes = new THREE.AxesHelper(size * 0.4);
    axes.position.set(-hSize + 1, 0.1, -hSize + 1); // offset slightly above plate in corner
    scene.add(axes);
    axesHelperRef.current = axes;
  };

  // Update build plate when size changes without reinitializing the whole scene
  useEffect(() => {
    if (buildPlateFirstRunRef.current) {
      buildPlateFirstRunRef.current = false;
      return;
    }
    if (!sceneRef.current) return;
    createBuildPlate(sceneRef.current, buildPlateSize);
  }, [buildPlateSize]);

  // Re-render Plate grid visibility settings
  useEffect(() => {
    if (gridHelperRef.current) gridHelperRef.current.visible = showGrid;
    if (bedBorderRef.current) bedBorderRef.current.visible = showGrid;
    if (axesHelperRef.current) axesHelperRef.current.visible = showGrid;
  }, [showGrid]);

  // 2. Handle active model geometry, color, and finish changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !geometry) return;

    // Remove old mesh representations
    if (meshRef.current) scene.remove(meshRef.current);
    if (wireframeMeshRef.current) scene.remove(wireframeMeshRef.current);
    if (boundingBoxHelperRef.current) scene.remove(boundingBoxHelperRef.current);
    if (normalsHelperRef.current) scene.remove(normalsHelperRef.current);

    // Position and align the geometry so its lowest bounds sit exactly onto the build plate (Y = 0)
    geometry.computeBoundingBox();
    const bbox = geometry.boundingBox || new THREE.Box3();
    const sizeVec = new THREE.Vector3();
    bbox.getSize(sizeVec);
    const centerVec = new THREE.Vector3();
    bbox.getCenter(centerVec);

    // Create a translation buffer so the model is centered on the floor X-Z dimensions, and sits flat at Y=0!
    // Offset standard OBJ geometry coordinates to build plate coordinates.
    // X goes parallel, Y goes up in standard printer workspace! Let's translate:
    // ThreeJS coordinates: X=left/right, Y=up/down, Z=front/back.
    // Let's offset the coordinates so geometry is flat at Y = 0 and resides at XZ center.
    geometry.translate(-centerVec.x, -bbox.min.y, -centerVec.z);
    
    // Recompute bounding box for the transformed state
    geometry.computeBoundingBox();
    bbox.copy(geometry.boundingBox!);
    bbox.getCenter(centerVec);

    // Setup material properties matching the chosen filament finish
    let material: THREE.Material;
    
    const matColorObj = new THREE.Color(materialColor);
    
    if (materialFinish === 'metal') {
      material = new THREE.MeshStandardMaterial({
        color: matColorObj,
        metalness: 0.9,
        roughness: 0.15,
        wireframe: false,
        side: THREE.DoubleSide
      });
    } else if (materialFinish === 'shiny') {
      material = new THREE.MeshPhysicalMaterial({
        color: matColorObj,
        metalness: 0.1,
        roughness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide
      });
    } else if (materialFinish === 'translucent') {
      material = new THREE.MeshPhysicalMaterial({
        color: matColorObj,
        metalness: 0.05,
        roughness: 0.2,
        transparent: true,
        opacity: 0.65,
        transmission: 0.6, // Glass-like plastic SLA liquid resin simulation!
        thickness: 5.0,
        side: THREE.DoubleSide
      });
    } else {
      // Standard PLA Matte filament finish
      material = new THREE.MeshStandardMaterial({
        color: matColorObj,
        metalness: 0.15,
        roughness: 0.85,
        side: THREE.DoubleSide
      });
    }

    // Main 3D Solid Mesh
    const mainMesh = new THREE.Mesh(geometry, material);
    mainMesh.castShadow = true;
    mainMesh.receiveShadow = true;
    scene.add(mainMesh);
    meshRef.current = mainMesh;

    // Overlay Wireframe mesh if wireframe mode is enabled
    if (wireframe) {
      const wireframeMat = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        wireframe: true,
        transparent: true,
        opacity: 0.35,
        depthWrite: false
      });
      const wireframeMesh = new THREE.Mesh(geometry, wireframeMat);
      scene.add(wireframeMesh);
      wireframeMeshRef.current = wireframeMesh;
    }

    // Visual model bounding box check
    const bboxHelper = new THREE.BoxHelper(mainMesh, '#8b5cf6'); // Geometric boundary box in cyber purple
    bboxHelper.visible = true; // Always helpful to show printed envelope bounds
    scene.add(bboxHelper);
    boundingBoxHelperRef.current = bboxHelper;

    // Render Normals Helper if toggled
    if (showNormals) {
      const lineNormalsGeom = new THREE.BufferGeometry();
      const posAttr = geometry.getAttribute('position');
      const normalAttr = geometry.getAttribute('normal');
      
      if (posAttr && normalAttr) {
        const linePoints: THREE.Vector3[] = [];
        const scaleNormal = 2.5; // length of normal line vectors
        
        // Stagger / sample normals if vertex count is huge to avoid performance degradation
        const sampleStep = posAttr.count > 5000 ? Math.ceil(posAttr.count / 1000) : 1;
        
        for (let i = 0; i < posAttr.count; i += sampleStep) {
          const vx = posAttr.getX(i);
          const vy = posAttr.getY(i);
          const vz = posAttr.getZ(i);
          
          const nx = normalAttr.getX(i);
          const ny = normalAttr.getY(i);
          const nz = normalAttr.getZ(i);
          
          const start = new THREE.Vector3(vx, vy, vz);
          const end = new THREE.Vector3(vx + nx * scaleNormal, vy + ny * scaleNormal, vz + nz * scaleNormal);
          
          linePoints.push(start, end);
        }
        
        lineNormalsGeom.setFromPoints(linePoints);
        const lineNormalsMat = new THREE.LineBasicMaterial({
          color: '#22c55e', // Vibrant emerald green lines
          linewidth: 1,
          transparent: true,
          opacity: 0.75
        });
        const normalsHelper = new THREE.LineSegments(lineNormalsGeom, lineNormalsMat);
        scene.add(normalsHelper);
        normalsHelperRef.current = normalsHelper;
      }
    }

    // Auto-focus camera ONLY when a new model is loaded (cameraKey changed)
    // This prevents slider/thickness adjustments from jumping the camera
    const shouldResetCamera = cameraKey !== prevCameraKeyRef.current;
    prevCameraKeyRef.current = cameraKey;

    if (shouldResetCamera && controlsRef.current && cameraRef.current) {
      const sizeRadius = sizeVec.length();
      
      // Pivot controls target to the center of the model base sitting on plate
      controlsRef.current.target.set(0, sizeVec.y / 2, 0);
      
      // Move camera back/up to fit model inside view bounds neatly
      const distance = Math.max(sizeRadius * 1.5, 30);
      cameraRef.current.position.set(distance * 0.8, distance * 0.9, distance * 1.1);
      controlsRef.current.update();
    }

  }, [geometry, materialColor, wireframe, showNormals, materialFinish, cameraKey]);

  // Quick viewpoints controls
  const handleAlignView = (view: 'top' | 'front' | 'side' | 'isometric' | 'reset') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const mesh = meshRef.current;
    if (!camera || !controls) return;

    // Determine targeting
    let targetY = 10;
    let sizeRadius = 30;
    if (geometry) {
      geometry.computeBoundingBox();
      const bbox = geometry.boundingBox || new THREE.Box3();
      const sizeVec = new THREE.Vector3();
      bbox.getSize(sizeVec);
      targetY = sizeVec.y / 2;
      sizeRadius = sizeVec.length();
    }
    
    controls.target.set(0, targetY, 0);

    const distance = 60; // dynamic distance representation

    if (view === 'top') {
      camera.position.set(0.01, distance * 1.3, 0); // small delta offset to prevent gimbal lock
    } else if (view === 'front') {
      camera.position.set(0, targetY, distance);
    } else if (view === 'side') {
      camera.position.set(distance, targetY, 0);
    } else if (view === 'isometric') {
      camera.position.set(distance * 0.8, distance * 0.8, distance * 0.8);
    } else if (view === 'reset') {
      const optDistance = Math.max(sizeRadius * 1.5, 30);
      camera.position.set(optDistance * 0.8, optDistance * 0.9, optDistance * 1.1);
    }
    controls.update();
  };

  return (
    <div id="threejs_viewport_outer" ref={containerRef} className="relative w-full h-full min-h-[480px] bg-[#0a0b0e] rounded-none overflow-hidden border border-[#23262d]">
      {/* 3D WebGL Canvas */}
      <canvas id="threejs_canvas" ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0b0e] text-slate-400">
          <Layers className="animate-spin text-cyan-500 w-10 h-10 mb-3" />
          <span className="font-sans text-xs font-semibold uppercase tracking-widest text-accent">Preparing 3D WebGL Chamber...</span>
        </div>
      )}

      {/* Camera View Angle Quick Shortcuts (Lower left float panel) */}
      <div id="three_camera_controls" className="absolute bottom-4 left-4 flex gap-1 p-1 bg-[#101218]/95 rounded-none border border-[#23262d] shadow-2xl backdrop-blur-md">
        <button
          id="btn_align_reset"
          onClick={() => handleAlignView('reset')}
          className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider font-mono text-accent hover:bg-[#1a1d24] hover:text-cyan-300 transition-all cursor-pointer flex items-center gap-1 border-r border-[#23262d]/50 pr-3 mr-1"
          title="Reset camera zoom & rotation to default viewpoint"
        >
          <RotateCcw className="w-3 h-3 text-cyan-500 shrink-0" />
          Reset View
        </button>
        <button
          id="btn_align_isometric"
          onClick={() => handleAlignView('isometric')}
          className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider font-mono text-slate-400 hover:bg-[#1a1d24] hover:text-cyan-400 transition-all cursor-pointer"
          title="Isometric view angle"
        >
          Perspective
        </button>
        <button
          id="btn_align_top"
          onClick={() => handleAlignView('top')}
          className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider font-mono text-slate-400 hover:bg-[#1a1d24] hover:text-cyan-400 transition-all cursor-pointer"
          title="Direct top view alignment"
        >
          Top
        </button>
        <button
          id="btn_align_front"
          onClick={() => handleAlignView('front')}
          className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider font-mono text-slate-400 hover:bg-[#1a1d24] hover:text-cyan-400 transition-all cursor-pointer"
          title="Direct front view alignment"
        >
          Front
        </button>
        <button
          id="btn_align_side"
          onClick={() => handleAlignView('side')}
          className="px-2.5 py-1.5 text-[10px] uppercase tracking-wider font-mono text-slate-400 hover:bg-[#1a1d24] hover:text-cyan-400 transition-all cursor-pointer"
          title="Direct right side view alignment"
        >
          Right
        </button>
      </div>

      {/* Printer Chamber Status Overlay (Upper right float panel) */}
      <div id="print_chamber_badge" className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-[#0d0f14]/85 rounded-none border border-[#23262d]/90 backdrop-blur-md pointer-events-none">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#06b6d4]"></span>
        </span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-accent font-semibold">
          Interactive Print Room
        </span>
      </div>

      {/* Grid Reference Coordinate Axes Indicator Overlay (Bottom right) */}
      <div id="coordinate_axes_marker" className="absolute bottom-4 right-4 text-[9px] font-mono text-slate-500 flex flex-col gap-0.5 bg-[#0d0f14]/80 p-2 border border-[#23262d] pointer-events-none">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-red-500 inline-block"></span>
          <span className="uppercase tracking-wider">X: WIDTH (RED)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-blue-500 inline-block"></span>
          <span className="uppercase tracking-wider">Y: HEIGHT (BLUE)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-green-500 inline-block"></span>
          <span className="uppercase tracking-wider">Z: DEPTH (GREEN)</span>
        </div>
      </div>
    </div>
  );
}
