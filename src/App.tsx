/**
 * @license
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { 
  parseOBJ, 
  exportBinarySTL, 
  generateCalibrationCube, 
  generateTwistedVase, 
  generateGearMesh, 
  generateHollowSphere,
  applyAdjustments,
  performPrintAnalysis,
  autoRotateToFlatBottom,
  ParsedGeometry,
  PrintAnalysis
} from './utils/meshUtils';
import ThreeViewer from './components/ThreeViewer';
import {
  Upload,
  Download,
  RotateCcw,
  Layers,
  Maximize2,
  Info,
  Sliders,
  CheckCircle,
  AlertTriangle,
  Flame,
  Settings,
  HelpCircle,
  FolderOpen,
  RefreshCw,
  X,
  Github,
  Palette
} from 'lucide-react';

export default function App() {
  // Input Model state
  const [originalGeom, setOriginalGeom] = useState<ParsedGeometry>(() => generateCalibrationCube());
  const [adjustedGeom, setAdjustedGeom] = useState<THREE.BufferGeometry | null>(null);
  const [fileName, setFileName] = useState<string>("Calibration_Cube_20mm.obj");
  const [activePreset, setActivePreset] = useState<string>("cube");
  
  // Slide parameter states
  const [uniformScale, setUniformScale] = useState<number>(1.0);
  const [scaleX, setScaleX] = useState<number>(1.0);
  const [scaleY, setScaleY] = useState<number>(1.0);
  const [scaleZ, setScaleZ] = useState<number>(1.0);
  
  // Normal vector displacement thickness
  const [wallThickness, setWallThickness ] = useState<number>(0.0); // Offset in mm
  const [thickenMode, setThickenMode] = useState<'uniform' | 'xy-only' | 'z-only'>('uniform');
  
  // Interactive material aesthetics
  const [materialColor, setMaterialColor] = useState<string>("#f97316"); // Default vibrant Sunset Orange
  const [materialFinish, setMaterialFinish] = useState<'matte' | 'metal' | 'shiny' | 'translucent'>('matte');
  
  // Viewport Settings
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showNormals, setShowNormals] = useState<boolean>(false);
  const [buildPlateSize, setBuildPlateSize] = useState<number>(220); // standard 220x220 build plate size
  const [cameraKey, setCameraKey] = useState<number>(0); // increment to trigger camera auto-focus on new model load
  
  // Feedback states
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [printReport, setPrintReport] = useState<PrintAnalysis | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  type Theme = 'cyber' | 'void' | 'matrix' | 'forge';
  const [theme, setTheme] = useState<Theme>('matrix');
  const [showAbout, setShowAbout] = useState(false);

  const themeNames: Record<Theme, string> = {
    cyber: 'Cyber Dark',
    void: 'Void Purple',
    matrix: 'Matrix Green',
    forge: 'Forge Amber',
  };

  // Auto-clear notification after delay
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Recompute Adjusted Geometry and Real-time print analysis when parameters change
  useEffect(() => {
    if (!originalGeom) return;
    
    try {
      // Re-apply mathematical scaling + normal offsets
      const nextGeom = applyAdjustments(
        originalGeom,
        uniformScale,
        scaleX,
        scaleY,
        scaleZ,
        wallThickness,
        thickenMode
      );
      
      setAdjustedGeom(nextGeom);
      
      // Perform SLA/FDM virtual slicing telemetry
      const analysis = performPrintAnalysis(nextGeom);
      setPrintReport(analysis);
    } catch (err: any) {
      console.error(err);
      setNotification({
        type: 'error',
        text: `Error refining geometry: ${err?.message || err}`
      });
    }
  }, [originalGeom, uniformScale, scaleX, scaleY, scaleZ, wallThickness, thickenMode]);

  // Preset switching selector
  const handleSelectPreset = (preset: string) => {
    let geom: ParsedGeometry;
    let name: string;
    
    if (preset === 'cube') {
      geom = generateCalibrationCube();
      name = "Calibration_Cube_20mm.obj";
    } else if (preset === 'vase') {
      geom = generateTwistedVase();
      name = "Modular_Twisted_Vase.obj";
    } else if (preset === 'gear') {
      geom = generateGearMesh();
      name = "Mechanical_Spur_Gear.obj";
    } else if (preset === 'sphere') {
      geom = generateHollowSphere();
      name = "Double_Sheathed_Hollow_Sphere.obj";
    } else {
      return;
    }
    
    setOriginalGeom(geom);
    setFileName(name);
    setActivePreset(preset);
    
    // Reset parameters so preset is previewed naturally
    setUniformScale(1.0);
    setScaleX(1.0);
    setScaleY(1.0);
    setScaleZ(1.0);
    setWallThickness(0.0);
    
    setNotification({
      type: 'success',
      text: `Loaded preset shape: ${geom.name || name}`
    });
    setCameraKey(prev => prev + 1);
  };

  // Reset modifiers shortcut
  const handleResetModifiers = () => {
    setUniformScale(1.0);
    setScaleX(1.0);
    setScaleY(1.0);
    setScaleZ(1.0);
    setWallThickness(0.0);
    setNotification({
      type: 'info',
      text: "Reset scaling & thickness deformers to original parameters"
    });
  };

  // Automatically rotate model to rest flat on build plate
  const handleAutoOrient = () => {
    if (!originalGeom) return;
    try {
      const optimized = autoRotateToFlatBottom(originalGeom);
      
      // Update the active preset state back to 'custom' or keep if it is structured,
      // but let's mark it custom when mutated so the user knows it has been modified offline
      if (activePreset !== 'custom') {
        setActivePreset('custom');
      }
      
      setOriginalGeom(optimized);
      setNotification({
        type: 'success',
        text: 'Optimized orientation: largest flat face aligned with the print bed'
      });
    } catch (err: any) {
      console.error(err);
      setNotification({
        type: 'error',
        text: `Orientation optimization failed: ${err.message || err}`
      });
    }
  };

  // Drag and Drop files upload handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const processFileText = (text: string, name: string) => {
    try {
      const parsed = parseOBJ(text);
      if (parsed.vertices.length === 0) {
        throw new Error("No readable 3D vertex positions ('v') or face indices ('f') were detected. Please ensure this is a standard Wavefront OBJ file.");
      }
      
      setOriginalGeom(parsed);
      setFileName(name);
      setActivePreset("custom");
      setCameraKey(prev => prev + 1);
      
      // Keep modifiers intact or reset them? Let's keep them, but set a gentle notice
      setNotification({
        type: 'success',
        text: `Loaded model successfully! detected ${parsed.vertices.length / 3} vertices`
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        text: `Failed to load OBJ: ${err.message || err}`
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.obj')) {
        setNotification({
          type: 'error',
          text: "Invalid file type. Please upload a standard wavefront 3D model (.obj) format."
        });
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target && typeof event.target.result === 'string') {
          processFileText(event.target.result, file.name);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target && typeof event.target.result === 'string') {
          processFileText(event.target.result, file.name);
        }
      };
      reader.readAsText(file);
    }
  };

  // STL File Exporter & Downloader — uses native Save As dialog when available
  const handleExportSTL = async () => {
    if (!adjustedGeom) {
      setNotification({ type: 'error', text: "Error exporting: active geometry is empty." });
      return;
    }
    try {
      const stlBuffer = exportBinarySTL(adjustedGeom);
      const rawName = fileName.replace(/\.obj$/i, '');
      const suggestedName = `${rawName}_optimized_x${uniformScale.toFixed(1)}.stl`;

      // Use native Save As dialog (Chrome / Edge / Opera)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName,
            types: [{ description: 'STL 3D Model', accept: { 'application/octet-stream': ['.stl'] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(new Blob([stlBuffer], { type: 'application/octet-stream' }));
          await writable.close();
          setNotification({ type: 'success', text: `Exported: "${handle.name}"` });
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return; // user cancelled
          // fall through to legacy download
        }
      }

      // Fallback: trigger browser download with suggested name
      const blob = new Blob([stlBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = suggestedName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setNotification({ type: 'success', text: `Exported: "${suggestedName}"` });
    } catch (err: any) {
      setNotification({ type: 'error', text: `Export failed: ${err.message || err}` });
    }
  };

  // Default color swatches mimicking actual filaments
  const colors = [
    { name: 'Ceramic Orange', hex: '#f97316' },
    { name: 'PLA Jet Blue', hex: '#2563eb' },
    { name: 'Mint Green', hex: '#10b981' },
    { name: 'Silk Crimson', hex: '#dc2626' },
    { name: 'Solar Yellow', hex: '#eab308' },
    { name: 'Ceramic White', hex: '#f1f5f9' },
    { name: 'Heavy Bronze', hex: '#a15b14' },
    { name: 'Obsidian Slate', hex: '#334155' }
  ];

  return (
    <div id="app_root" data-theme={theme} className="min-h-screen lg:h-screen lg:overflow-hidden bg-[#0a0b0e] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-[#0a0b0e]">
      {/* Fork me on GitHub ribbon */}
      <a
        href="https://github.com/doccaz/meshprep"
        target="_blank"
        rel="noopener noreferrer"
        className="fork-ribbon"
        aria-label="Fork me on GitHub"
      >
        <span>Fork me on GitHub</span>
      </a>

      {/* Premium Top Navigation Row */}
      <header id="app_header" className="border-b border-[#23262d] bg-[#101218] sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-cyan-600 to-indigo-500 p-2 rounded-none text-white shadow-lg shadow-cyan-500/10">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display font-medium tracking-wider text-sm text-cyan-400 uppercase">
              MeshPrep — 3D Print Optimizer & STL Editor
              <span className="ml-2 text-[10px] text-slate-500 font-mono normal-case">v1.0.0</span>
            </h1>
            <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mt-0.5">
              Wavefront OBJ Parser • Solid Vertex Comp • Watertight Binary Export
            </p>
          </div>
        </div>

        {/* Notifications HUD */}
        <div id="header_hud" className="flex items-center gap-3">
          {/* Theme Selector */}
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
              className="bg-[#101218] border border-[#23262d] text-slate-400 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-none cursor-pointer hover:border-slate-700 focus:outline-none focus:border-cyan-500 transition"
              title="Select UI theme"
            >
              {(Object.keys(themeNames) as Theme[]).map((t) => (
                <option key={t} value={t}>{themeNames[t]}</option>
              ))}
            </select>
          </div>

          {/* About Button */}
          <button
            onClick={() => setShowAbout(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:text-cyan-400 border border-[#23262d] hover:border-cyan-500/50 bg-[#101218] hover:bg-[#1a1d24] transition cursor-pointer rounded-none"
            title="About this application"
          >
            <Info className="w-3.5 h-3.5 shrink-0" />
            About
          </button>

          {notification && (
            <div
              id="toast"
              className={`px-4 py-2 rounded-none text-[10px] font-mono uppercase tracking-wider border animate-fadeIn flex items-center gap-2 shadow-lg ${
                notification.type === 'error' 
                ? 'bg-rose-950/20 text-rose-400 border-rose-800/80 shadow-[0_0_12px_rgba(239,68,68,0.15)]' 
                : notification.type === 'success'
                ? 'bg-cyan-950/20 text-accent border-cyan-800/80 shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                : 'bg-[#101218] text-slate-300 border-[#23262d]'
              }`}
            >
              {notification.type === 'error' ? (
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
              ) : notification.type === 'success' ? (
                <CheckCircle className="w-3.5 h-3.5 shrink-0 text-cyan-500" />
              ) : (
                <Info className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
              )}
              <span>{notification.text}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline uppercase tracking-wider">Active Mesh:</span>
            <span className="text-[10px] px-2.5 py-1 bg-[#101218] border border-[#23262d] font-mono text-cyan-400 rounded-none truncate max-w-[200px]" title={fileName}>
              {fileName}
            </span>
          </div>
        </div>
      </header>

      {/* Main Responsive Grid Layout */}
      <main id="app_main_content" className="flex-1 min-h-0 w-full max-w-[1720px] mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Controls & Settings Panel (5 Columns) */}
        <div id="controls_column" className="lg:col-span-5 flex flex-col gap-6 overflow-y-auto min-h-0 pr-1">
          
          {/* Section 1: Mesh Source Options (Presets or Upload) */}
          <div className="bg-[#0d0f14] rounded-none p-5 border border-[#23262d] shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-medium text-slate-200 text-xs uppercase tracking-widest flex items-center gap-2 border-l-2 border-cyan-500 pl-3">
                <FolderOpen className="w-3.5 h-3.5 text-cyan-500" />
                01 // Model Acquisition
              </span>
              <span className="text-[9px] bg-[#1a1d24] border border-[#23262d] px-2 py-0.5 rounded-none text-slate-400 font-mono uppercase tracking-wider">
                OBJ FORMAT
              </span>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <button
                onClick={() => handleSelectPreset('cube')}
                className={`py-2 px-2 text-[10px] font-mono uppercase tracking-wider border text-center transition-all cursor-pointer rounded-none ${
                  activePreset === 'cube'
                    ? 'bg-cyan-950/20 border-cyan-500 text-cyan-400 font-bold shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    : 'bg-[#101218] border-[#23262d] hover:border-slate-700 hover:text-white text-slate-400'
                }`}
              >
                Calibration Cube
              </button>
              <button
                onClick={() => handleSelectPreset('vase')}
                className={`py-2 px-2 text-[10px] font-mono uppercase tracking-wider border text-center transition-all cursor-pointer rounded-none ${
                  activePreset === 'vase'
                    ? 'bg-cyan-950/20 border-cyan-500 text-cyan-400 font-bold shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    : 'bg-[#101218] border-[#23262d] hover:border-slate-700 hover:text-white text-slate-400'
                }`}
              >
                Twisted Vase
              </button>
              <button
                onClick={() => handleSelectPreset('gear')}
                className={`py-2 px-2 text-[10px] font-mono uppercase tracking-wider border text-center transition-all cursor-pointer rounded-none ${
                  activePreset === 'gear'
                    ? 'bg-cyan-950/20 border-cyan-500 text-cyan-400 font-bold shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    : 'bg-[#101218] border-[#23262d] hover:border-slate-700 hover:text-white text-slate-400'
                }`}
              >
                Mechanical Gear
              </button>
              <button
                onClick={() => handleSelectPreset('sphere')}
                className={`py-2 px-2 text-[10px] font-mono uppercase tracking-wider border text-center transition-all cursor-pointer rounded-none ${
                  activePreset === 'sphere'
                    ? 'bg-cyan-950/20 border-cyan-500 text-cyan-400 font-bold shadow-[0_0_12px_rgba(6,182,212,0.15)]'
                    : 'bg-[#101218] border-[#23262d] hover:border-slate-700 hover:text-white text-slate-400'
                }`}
              >
                Hollow Shell
              </button>
            </div>

            {/* Standalone Open File Button */}
            <button
              id="btn_open_file"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 px-4 mb-3 bg-cyan-600 hover:bg-cyan-500 text-[#0a0b0e] font-bold text-[11px] uppercase tracking-widest rounded-none transition-all duration-200 shadow-[0_0_20px_rgba(6,182,212,0.2)] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              Open OBJ File…
            </button>

            {/* Hidden file input */}
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept=".obj"
              className="hidden"
            />

            {/* High-Fidelity Drag & Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border border-dashed rounded-none p-5 text-center transition flex flex-col items-center justify-center gap-2 ${
                dragOver 
                  ? 'border-cyan-500 bg-cyan-950/10' 
                  : 'border-[#23262d] bg-black/20'
              }`}
            >
              <Upload className={`w-6 h-6 ${dragOver ? 'text-cyan-500 animate-bounce' : 'text-slate-600'}`} />
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  or drag &amp; drop <span className="text-cyan-400">.obj</span> here
                </p>
              </div>
            </div>

            {/* Slicing Orientation Optimizer */}
            <button
              id="btn_auto_rotate_flat_bottom"
              onClick={handleAutoOrient}
              className="mt-4 w-full py-2.5 px-4 bg-cyan-950/25 hover:bg-cyan-950/55 text-accent hover:text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 text-[10px] uppercase tracking-wider font-mono transition-all duration-150 rounded-none flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.05)] hover:shadow-[0_0_15px_rgba(6,182,212,0.2)]"
              title="Mathematically analyzes all face normals to orient the largest flat area exactly parallel with the print bed."
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-500" />
              Auto-Orient for Build Plate (Flatten Base)
            </button>
          </div>

          {/* Section 2: Scale Modifiers */}
          <div className="bg-[#0d0f14] rounded-none p-5 border border-[#23262d] shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-medium text-slate-200 text-xs uppercase tracking-widest flex items-center gap-2 border-l-2 border-cyan-500 pl-3">
                <Sliders className="w-3.5 h-3.5 text-cyan-500" />
                02 // Dimensional Modifiers
              </span>
              <button 
                onClick={handleResetModifiers}
                className="text-[10px] uppercase font-mono tracking-wider flex items-center gap-1 text-slate-400 hover:text-cyan-400 bg-[#101218] border border-[#23262d] py-1 px-2.5 rounded-none hover:bg-[#1a1d24] transition cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Reset
              </button>
            </div>

            <div className="space-y-4">
              {/* Uniform Scale Slider */}
              <div className="bg-[#101218] p-3 rounded-none border border-[#23262d]">
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-mono uppercase tracking-widest text-slate-400">Uniform Aspect Ratio</label>
                  <span className="text-xs font-mono font-bold text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.1)]">{uniformScale.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="4.0"
                  step="0.05"
                  value={uniformScale}
                  onChange={(e) => setUniformScale(parseFloat(e.target.value))}
                  className="w-full h-1 bg-[#1e222b] rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex justify-between text-[9px] text-slate-600 font-mono mt-1 uppercase tracking-wider">
                  <span>0.1x (Teeny)</span>
                  <span>1.0x (Original)</span>
                  <span>4.0x (Giant)</span>
                </div>
              </div>

              {/* Axis-specific sliders */}
              <div id="axes_scaling_grid" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                
                {/* Scale X Axis */}
                <div className="bg-[#101218] p-2.5 rounded-none border border-[#23262d]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-red-500">X (Width)</span>
                    <span className="text-xs font-mono font-bold text-red-400">{scaleX.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="3.0"
                    step="0.05"
                    value={scaleX}
                    onChange={(e) => setScaleX(parseFloat(e.target.value))}
                    className="w-full h-1 bg-[#1e222b] rounded appearance-none cursor-pointer accent-red-500"
                  />
                </div>

                {/* Scale Y Axis */}
                <div className="bg-[#101218] p-2.5 rounded-none border border-[#23262d]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-cyan-400">Y (Height)</span>
                    <span className="text-xs font-mono font-bold text-cyan-400">{scaleY.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="3.0"
                    step="0.05"
                    value={scaleY}
                    onChange={(e) => setScaleY(parseFloat(e.target.value))}
                    className="w-full h-1 bg-[#1e222b] rounded appearance-none cursor-pointer accent-[#3b82f6]"
                  />
                </div>

                {/* Scale Z Axis */}
                <div className="bg-[#101218] p-2.5 rounded-none border border-[#23262d]">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-emerald-500">Z (Depth)</span>
                    <span className="text-xs font-mono font-bold text-emerald-400">{scaleZ.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="3.0"
                    step="0.05"
                    value={scaleZ}
                    onChange={(e) => setScaleZ(parseFloat(e.target.value))}
                    className="w-full h-1 bg-[#1e222b] rounded appearance-none cursor-pointer accent-[#10b981]"
                  />
                </div>

              </div>
            </div>
          </div>

          {/* Section 3: Wall Thickness Compensation (Voxel / Face Normal Displace) */}
          <div className="bg-[#0d0f14] rounded-none p-5 border border-[#23262d] shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <div>
                <span className="font-display font-medium text-slate-200 text-xs uppercase tracking-widest flex items-center gap-2 border-l-2 border-cyan-500 pl-3">
                  <Flame className="w-3.5 h-3.5 text-cyan-500 animate-pulse" />
                  03 // Volumetric Thickness
                </span>
                <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 mt-1">
                  Extrudes shell/walls along vertex normals to strengthen models.
                </p>
              </div>
              <button
                onClick={() => setWallThickness(0.0)}
                className="text-[10px] uppercase font-mono tracking-wider flex items-center gap-1 text-slate-400 hover:text-cyan-400 bg-[#101218] border border-[#23262d] py-1 px-2.5 rounded-none hover:bg-[#1a1d24] transition cursor-pointer shrink-0"
                title="Reset thickness offset to 0mm"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Reset
              </button>
            </div>

            <div className="space-y-4">
              {/* Thickness slider */}
              <div className="bg-[#101218] p-3 rounded-none border border-[#23262d]">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono uppercase tracking-widest text-accent">Thickness Offset</span>
                    <div className="group relative">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-600 hover:text-slate-300 cursor-pointer" />
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-48 p-2.5 bg-black/95 text-[9px] uppercase tracking-wider leading-relaxed text-slate-400 border border-[#23262d] shadow-2xl invisible group-hover:visible transition pointer-events-none z-50">
                        Displaces solid nodes outwards or inwards dynamically along geometric surface normal vectors.
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs font-mono font-bold ${wallThickness > 0 ? 'text-accent' : wallThickness < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                    {wallThickness > 0 ? `+${wallThickness.toFixed(1)}` : wallThickness.toFixed(1)} mm
                  </span>
                </div>
                
                <input
                  type="range"
                  min="-4.0"
                  max="4.0"
                  step="0.1"
                  value={wallThickness}
                  onChange={(e) => setWallThickness(parseFloat(e.target.value))}
                  className="w-full h-1 bg-[#1e222b] rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                
                <div className="flex justify-between text-[9px] text-[#474c5a] font-mono mt-1 uppercase tracking-wider">
                  <span>-4.0mm (Thinner)</span>
                  <span>0.0mm (Neutral)</span>
                  <span>+4.0mm (Thicker)</span>
                </div>
              </div>

              {/* Quick surface thickening button */}
              <button
                id="btn_thicken_entire_surfaces"
                onClick={() => {
                  setWallThickness(prev => Math.min(4.0, Number((prev + 1.0).toFixed(1))));
                  setNotification({
                    type: 'success',
                    text: 'Incremented model shell thickness by +1.0mm'
                  });
                }}
                disabled={wallThickness >= 4.0}
                className="w-full py-2.5 px-4 bg-cyan-950/25 hover:bg-cyan-950/55 text-accent hover:text-cyan-300 border border-cyan-500/30 hover:border-cyan-400 text-[10px] uppercase tracking-wider font-mono transition-all duration-150 rounded-none flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Quickly expand entire wall/mesh body outward along vertex normals by 1mm"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Thicken Entire Surfaces (+1.0mm)
              </button>

              {/* Advanced Offset Vector constraints */}
              <div className="bg-[#101218]/50 p-2 rounded-none border border-[#23262d] flex items-center gap-2">
                <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider shrink-0 pl-1">Vector Domain:</span>
                <div className="flex gap-1.5 w-full">
                  <button
                    onClick={() => setThickenMode('uniform')}
                    className={`flex-1 py-1 text-[9px] font-mono border rounded-none text-center transition cursor-pointer uppercase tracking-wider ${
                      thickenMode === 'uniform'
                        ? 'bg-cyan-950/20 border-cyan-500 text-cyan-400 font-bold'
                        : 'bg-transparent border-[#23262d] hover:border-slate-700 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    3D Uniform
                  </button>
                  <button
                    onClick={() => setThickenMode('xy-only')}
                    className={`flex-1 py-1 text-[9px] font-mono border rounded-none text-center transition cursor-pointer uppercase tracking-wider ${
                      thickenMode === 'xy-only'
                        ? 'bg-cyan-950/20 border-cyan-500 text-cyan-400 font-bold'
                        : 'bg-transparent border-[#23262d] hover:border-slate-700 text-slate-500 hover:text-slate-300'
                    }`}
                    title="XY Planar directions only"
                  >
                    XY Planar
                  </button>
                  <button
                    onClick={() => setThickenMode('z-only')}
                    className={`flex-1 py-1 text-[9px] font-mono border rounded-none text-center transition cursor-pointer uppercase tracking-wider ${
                      thickenMode === 'z-only'
                        ? 'bg-cyan-950/20 border-cyan-500 text-cyan-400 font-bold'
                        : 'bg-transparent border-[#23262d] hover:border-slate-700 text-slate-500 hover:text-slate-300'
                    }`}
                    title="Z Vertical direction only"
                  >
                    Z Height
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Material Swatches & Surface Finish */}
          <div className="bg-[#0d0f14] rounded-none p-5 border border-[#23262d] shadow-sm">
            <span className="font-display font-medium text-slate-200 text-xs uppercase tracking-widest flex items-center gap-2 border-l-2 border-cyan-500 pl-3 mb-4">
              <Settings className="w-3.5 h-3.5 text-cyan-500" />
              04 // Filament & Texture Emulation
            </span>

            {/* Colors Swatches Grid */}
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-mono uppercase tracking-widest text-slate-500 block mb-1.5">Color Material presets:</label>
                <div id="swatch_grid" className="grid grid-cols-4 gap-2">
                  {colors.map((c) => (
                    <button
                      key={c.hex}
                      onClick={() => setMaterialColor(c.hex)}
                      className={`h-9 rounded-none flex items-center justify-center border transitionrelative cursor-pointer group ${
                        materialColor === c.hex 
                          ? 'border-cyan-500 ring-1 ring-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.3)]' 
                          : 'border-[#23262d] hover:border-slate-700'
                      }`}
                      style={{ backgroundColor: c.hex }}
                      title={c.name}
                    >
                      {/* Check dot for contrast selection */}
                      {materialColor === c.hex && (
                        <span className={`w-1.5 h-1.5 rounded-full ${c.hex === '#f1f5f9' ? 'bg-slate-950' : 'bg-white'}`}></span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Surface Finish choices */}
              <div>
                <label className="text-[9px] font-mono uppercase tracking-widest text-slate-500 block mb-1.5">SURFACE FINISH SIMULATION:</label>
                <div className="grid grid-cols-4 gap-1 bg-[#101218] p-1 rounded-none border border-[#23262d]">
                  {(['matte', 'metal', 'shiny', 'translucent'] as const).map((finish) => (
                    <button
                      key={finish}
                      onClick={() => setMaterialFinish(finish)}
                      className={`py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-none text-center transition cursor-pointer ${
                        materialFinish === finish
                          ? 'bg-[#1a1d24] text-cyan-400 font-bold border border-cyan-500/25 shadow-[0_0_8px_rgba(6,182,212,0.1)]'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {finish}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Real-time Slicing Telemetry / Analysis */}
          {printReport && (
            <div className="bg-[#0d0f14] rounded-none p-5 border border-[#23262d] shadow-sm">
              <span className="font-display font-medium text-slate-200 text-xs uppercase tracking-widest flex items-center gap-2 mb-4 border-l-2 border-cyan-500 pl-3">
                <Layers className="w-3.5 h-3.5 text-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)] shrink-0" />
                05 // Slicer Telemetry Core
              </span>

              <div className="space-y-2.5 font-mono text-[11px] text-slate-300">
                
                {/* Border references for absolute look */}
                <div className="space-y-2 border border-[#23262d] bg-black/40 p-4 font-mono text-[11px] leading-relaxed relative">
                  
                  {/* Boundary Envelope */}
                  <div className="flex justify-between py-1 border-b border-[#23262d]/50">
                    <span className="text-slate-500 uppercase tracking-wider">Printed Envelope (XYZ):</span>
                    <span className="text-slate-200">
                      {printReport.width.toFixed(1)} x {printReport.depth.toFixed(1)} x {printReport.height.toFixed(1)} mm
                    </span>
                  </div>

                  {/* Print Chamber Volume */}
                  <div className="flex justify-between py-1 border-b border-[#23262d]/50">
                    <span className="text-slate-500 uppercase tracking-wider">Absolute Solid Volume:</span>
                    <span className="text-slate-200">{printReport.volumeEst.toFixed(2)} cm³ (mL)</span>
                  </div>

                  {/* Shell Mass */}
                  <div className="flex justify-between py-1 border-b border-[#23262d]/50">
                    <span className="text-slate-500 uppercase tracking-wider">Estimated PLA Filament Mass:</span>
                    <span className="text-accent font-bold">{printReport.weightEst.toFixed(1)} grams</span>
                  </div>

                  {/* Tri count */}
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500 uppercase tracking-wider">Triangles (Facets Count):</span>
                    <span className="text-slate-200">{printReport.triangleCount.toLocaleString()}</span>
                  </div>
                </div>

                {/* Printers suitability flags */}
                <div className="bg-[#101218]/50 p-3 rounded-none border border-[#23262d] mt-3 space-y-2.5">
                  <span className="text-[9px] text-slate-500 uppercase font-bold tracking-widest block">SUITABILITY TELEMETRY STATUS:</span>
                  
                  {/* Water tightness indicator */}
                  <div className="flex items-center gap-2">
                    {printReport.watertight ? (
                      <CheckCircle className="w-4 h-4 text-cyan-500 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                    )}
                    <span className="text-[10px] uppercase tracking-wider">
                      {printReport.watertight 
                        ? 'Watertight shell geometry detected' 
                        : 'Face Normals optimized for solid slicing'
                      }
                    </span>
                  </div>

                  {/* Bed Envelope fitting test */}
                  {printReport.width > buildPlateSize || printReport.depth > buildPlateSize ? (
                    <div className="flex items-center gap-2 text-rose-400 p-2 border border-rose-950 bg-rose-950/20 font-mono text-[10px] uppercase tracking-wider">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                      <span className="leading-relaxed">
                        CRITICAL: Model exceeds bed boundary ({buildPlateSize}mm).
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-cyan-400">
                      <CheckCircle className="w-4 h-4 text-cyan-500 shrink-0" />
                      <span className="text-[10px] uppercase tracking-wider">
                        Fits bounds ({buildPlateSize}mm Plate)
                      </span>
                    </div>
                  )}

                  {/* 3D printer tips */}
                  <div className="flex gap-1.5 text-[9px] text-slate-500 leading-relaxed pt-1.5 border-t border-[#23262d] uppercase font-mono tracking-wider">
                    <Info className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />
                    <span>
                      Tip: Offset compensates SLA resin/FDM plastic shrinkages.
                    </span>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* Section 6: Standard export tool trigger with visual indicators */}
          <div className="mt-2 mb-6">
            <button
              onClick={handleExportSTL}
              disabled={!adjustedGeom}
              className="w-full py-4 px-6 bg-cyan-600 hover:bg-cyan-500 text-[#0a0b0e] font-bold text-xs uppercase tracking-widest rounded-none transition-all duration-300 shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:shadow-[0_0_35px_rgba(6,182,212,0.6)] border border-cyan-400/40 text-center flex items-center justify-center gap-3 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-5 h-5 shrink-0" />
              BUILD & EXPORT WATERTIGHT STL
            </button>
            <p className="text-[9px] text-center text-slate-600 font-mono mt-2.5 uppercase tracking-widest">
              Bi-planar vertex displacement model • {uniformScale.toFixed(2)}x factor • {wallThickness.toFixed(1)}mm expansion
            </p>
          </div>

        </div>

        {/* RIGHT COLUMN: Interactive WebGL 3D Preview (7 Columns) */}
        <div id="preview_column" className="lg:col-span-7 flex flex-col gap-4 min-h-0">
          
          {/* Main 3D Canvas Screen card container */}
          <div className="relative flex-1 min-h-[400px] bg-[#0a0b0e] rounded-none flex flex-col border border-[#23262d] overflow-hidden shadow-2xl">
            
            {/* Embedded Control Ribbon over the model preview */}
            <div id="canvas_options_row" className="absolute top-4 left-4 z-10 flex gap-1 p-1 bg-[#101218]/95 rounded-none border border-[#23262d] shadow-2xl backdrop-blur-md">
              
              {/* Show Heated plate grid toggle */}
              <button
                onClick={() => setShowGrid(!showGrid)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-none transition duration-150 cursor-pointer ${
                  showGrid 
                    ? 'bg-cyan-950/35 border border-cyan-500/60 text-accent font-bold shadow-[0_0_10px_rgba(6,182,212,0.15)]' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Toggle printed plate grid helper lines"
              >
                <Layers className="w-3.5 h-3.5" />
                Grid
              </button>

              {/* Wireframe view toggle */}
              <button
                onClick={() => setWireframe(!wireframe)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-none transition duration-150 cursor-pointer ${
                  wireframe 
                    ? 'bg-cyan-950/35 border border-cyan-500/60 text-accent font-bold shadow-[0_0_10px_rgba(6,182,212,0.15)]' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Overlay wireframe polygons structure"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                Wireframe
              </button>

              {/* Show normals helper lines */}
              <button
                onClick={() => setShowNormals(!showNormals)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-none transition duration-150 cursor-pointer ${
                  showNormals 
                    ? 'bg-cyan-950/35 border border-cyan-500/60 text-accent font-bold shadow-[0_0_10px_rgba(6,182,212,0.15)]' 
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                title="Draw outer vertex normals vectors paths"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Normals
              </button>
            </div>

            {/* Embedded Printer Configuration overlay (sliders inside viewport!) */}
            <div id="canvas_settings_overlay" className="absolute top-16 left-4 z-10 p-3.5 bg-[#101218]/95 rounded-none border border-[#23262d] shadow-2xl backdrop-blur-md max-w-[210px] hidden sm:block font-mono">
              <span className="text-[9px] uppercase tracking-widest font-bold text-slate-500 block mb-2">
                BUILD PLATFORM SCALE:
              </span>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between items-center text-[10px] font-mono mb-1">
                    <span className="text-slate-500 uppercase">BED SIZE:</span>
                    <span className="text-cyan-400 font-bold">{buildPlateSize} mm</span>
                  </div>
                  <input
                    type="range"
                    min="120"
                    max="350"
                    step="10"
                    value={buildPlateSize}
                    onChange={(e) => setBuildPlateSize(parseInt(e.target.value))}
                    className="w-full h-1 bg-[#1e222b] rounded accent-cyan-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Render 3D Canvas Box or empty state placeholder */}
            {adjustedGeom ? (
              <ThreeViewer
                geometry={adjustedGeom}
                materialColor={materialColor}
                wireframe={wireframe}
                showGrid={showGrid}
                showNormals={showNormals}
                materialFinish={materialFinish}
                buildPlateSize={buildPlateSize}
                cameraKey={cameraKey}
              />
            ) : (
              <div className="flex-1 w-full flex flex-col items-center justify-center bg-[#0a0b0e] text-slate-500">
                <Layers className="animate-pulse w-12 h-12 text-cyan-500 mb-4" />
                <span className="font-mono text-xs uppercase tracking-widest text-accent">Preparing 3D geometry engine...</span>
              </div>
            )}

            {/* Embedded Drag Guidance indicator footer */}
            <div className="absolute bottom-4 right-4 z-10 px-3.5 py-2 bg-[#101218]/90 border border-[#23262d] shadow-2xl backdrop-blur-md pointer-events-none rounded-none">
              <span className="font-mono text-[9px] text-slate-500 uppercase tracking-widest">
                LEFT CLICK + MOVE: <strong className="text-slate-300">ROTATE VIEW</strong> • RIGHT CLICK: <strong className="text-slate-300">PAN BED</strong> • ZOOM SCROLL: <strong className="text-slate-300">MAGNIFY</strong>
              </span>
            </div>

          </div>

        </div>

      </main>

      {/* Aesthetic Footer Branding */}
      <footer id="app_footer" className="border-t border-[#23262d] bg-black/40 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-[9px] text-slate-600 font-mono mt-auto shrink-0 uppercase tracking-widest">
        <div>
          <span>Local 3D mesh engine compiled dynamically in browser sandbox</span>
        </div>
        <div className="flex items-center gap-4 pr-36">
          <span>Direct-Slicing Compliant binary export • WebGL core 2.0</span>
        </div>
      </footer>

      {/* About Dialog */}
      {showAbout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm"
          onClick={() => setShowAbout(false)}
        >
          <div
            className="bg-[#0d0f14] border border-[#23262d] rounded-none max-w-lg w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dialog header */}
            <div className="flex items-center justify-between p-5 border-b border-[#23262d]">
              <div className="flex items-center gap-3">
                <div className="bg-gradient-to-tr from-cyan-600 to-indigo-500 p-2 text-white">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-display font-medium text-slate-200 text-sm uppercase tracking-widest">
                    3D Print Optimizer &amp; STL Editor
                  </h2>
                  <p className="text-[10px] font-mono text-cyan-400 mt-0.5">v1.0.0</p>
                </div>
              </div>
              <button
                onClick={() => setShowAbout(false)}
                className="text-slate-500 hover:text-slate-300 transition cursor-pointer p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Dialog body */}
            <div className="p-5 space-y-4 font-mono text-[11px] text-slate-400 max-h-[70vh] overflow-y-auto">
              <p className="text-slate-300 leading-relaxed">
                A browser-based 3D model viewer and print optimizer for FDM/SLA 3D printing preparation.
                Runs entirely in the browser — no installation or server required.
              </p>

              <div>
                <p className="text-cyan-400 uppercase tracking-widest text-[10px] font-bold mb-2">Features</p>
                <ul className="space-y-1 leading-relaxed">
                  <li>• Load and preview Wavefront OBJ models in real-time WebGL</li>
                  <li>• Scale models uniformly or per-axis (X / Y / Z)</li>
                  <li>• Adjust wall thickness via surface normal displacement</li>
                  <li>• Built-in presets: Calibration Cube, Twisted Vase, Mechanical Gear, Hollow Sphere</li>
                  <li>• Slicer telemetry: volume, weight estimate, triangle count, bed fit check</li>
                  <li>• Multiple UI themes and filament color presets</li>
                  <li>• Export optimized watertight binary STL files</li>
                </ul>
              </div>

              <div>
                <p className="text-cyan-400 uppercase tracking-widest text-[10px] font-bold mb-2">How to Use</p>
                <ol className="space-y-1 leading-relaxed">
                  <li>1. Select a preset model or load your own OBJ file via drag &amp; drop or the file browser</li>
                  <li>2. Use the dimensional sliders to scale and adjust the model</li>
                  <li>3. Optionally adjust wall thickness to compensate for material shrinkage</li>
                  <li>4. Choose a filament color and surface finish for the 3D preview</li>
                  <li>5. Review the slicer telemetry panel, then export to STL when ready</li>
                </ol>
              </div>

              <div className="border-t border-[#23262d] pt-4">
                <p className="text-cyan-400 uppercase tracking-widest text-[10px] font-bold mb-2">Credits</p>
                <p className="text-slate-300 mb-2">
                  Made by <span className="text-cyan-400 font-bold">Erico Mendonça</span>
                </p>
                <a
                  href="https://github.com/doccaz/meshprep"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-slate-500 hover:text-cyan-400 transition"
                >
                  <Github className="w-3.5 h-3.5" />
                  github.com/doccaz/meshprep
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
