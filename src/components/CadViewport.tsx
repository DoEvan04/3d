import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildDimensionGuidesGroup, buildFitCheckOverlayGroup } from '../cad/fitCheckOverlay';
import { computeObjectStats } from '../cad/manifoldHelpers';
import { buildPartBAssembly } from '../cad/partBGeometry';
import {
  AssemblyStats,
  CadParameters,
  CameraPresetId,
  MATERIAL_FINISHES,
  MaterialFinishId,
  ViewLayoutMode,
} from '../cad/specs';
import { exportPartToBinarySTL, StlExportTarget, triggerStlDownload } from '../cad/stlExporter';
import { createPartAClampScrewGeometry } from '../cad/threadGeometry';

export interface CadViewportHandle {
  exportStl: (target: StlExportTarget) => void;
  resetCamera: () => void;
}

interface CadViewportProps {
  params: CadParameters;
  layoutMode: ViewLayoutMode;
  finishId: MaterialFinishId;
  cameraPreset: CameraPresetId;
  cameraTrigger: number;
  showDimensions: boolean;
  showFitCheck: boolean;
  showCadEdges: boolean;
  onStatsComputed: (stats: AssemblyStats) => void;
}

// Reusable module-scope math objects (zero GC in render loop)
const _targetPos = new THREE.Vector3();
const _targetLook = new THREE.Vector3();

function createDraftingGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Soft studio drafting floor base
  ctx.fillStyle = '#e5e9ee';
  ctx.fillRect(0, 0, size, size);

  // Tile covers 100mm x 100mm (10 subdivisions of 10mm each)
  const cells = 10;
  const step = size / cells;

  ctx.strokeStyle = 'rgba(100, 116, 139, 0.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= cells; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  // Stronger 50mm & 100mm major drafting lines
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.36)';
  ctx.lineWidth = 3.5;
  for (const idx of [0, 5, 10]) {
    const p = idx * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16); // 1600mm x 1600mm floor
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    8,
    size / 2,
    size / 2,
    size / 2
  );
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.32)');
  grad.addColorStop(0.5, 'rgba(15, 23, 42, 0.12)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function disposeObjectResources(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {
      child.geometry?.dispose();
    } else if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
    }
  });
}

function addCadEdgeLines(
  targetGroup: THREE.Group,
  edgeMaterial: THREE.LineBasicMaterial
) {
  const meshes: THREE.Mesh[] = [];
  targetGroup.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  for (const mesh of meshes) {
    const edges = new THREE.EdgesGeometry(mesh.geometry, 26);
    const line = new THREE.LineSegments(edges, edgeMaterial);
    line.name = 'CadEdgeOverlay';
    line.renderOrder = 2;
    mesh.add(line);
  }
}

export const CadViewport = React.forwardRef<CadViewportHandle, CadViewportProps>(
  function CadViewport(
    {
      params,
      layoutMode,
      finishId,
      cameraPreset,
      cameraTrigger,
      showDimensions,
      showFitCheck,
      showCadEdges,
      onStatsComputed,
    },
    ref
  ) {
    const mountRef = useRef<HTMLDivElement>(null);
    const [contextLost, setContextLost] = useState(false);

    // Imperative scene refs so React updates never tear down the WebGL context
    const sceneRef = useRef<{
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      renderer: THREE.WebGLRenderer;
      controls: OrbitControls;
      partAGroup: THREE.Group;
      partBGroup: THREE.Group;
      partAPivot: THREE.Group;
      partBPivot: THREE.Group;
      dimsPivot: THREE.Group;
      fitCheckPivot: THREE.Group;
      floorMesh: THREE.Mesh;
      shadowPlane: THREE.Mesh;
      matA: THREE.MeshPhysicalMaterial;
      matB: THREE.MeshPhysicalMaterial;
      edgeMat: THREE.LineBasicMaterial;
      maxAnisotropy: number;
      requestRender: () => void;
      animTargets: {
        partAPos: THREE.Vector3;
        partARot: THREE.Euler;
        partBPos: THREE.Vector3;
        partBRot: THREE.Euler;
        floorY: number;
        camActive: boolean;
        camPos: THREE.Vector3;
        camTarget: THREE.Vector3;
      };
      partABounds: { minZ: number };
      partBBounds: { minZ: number; minY: number };
      boreCenterX: number;
      screwBaseYAssembled: number;
    } | null>(null);

    const onStatsRef = useRef(onStatsComputed);
    onStatsRef.current = onStatsComputed;

    useImperativeHandle(ref, () => ({
      exportStl: (target: StlExportTarget) => {
        const ctx = sceneRef.current;
        if (!ctx) return;
        const { blob, filename } = exportPartToBinarySTL(
          target,
          ctx.partAGroup,
          ctx.partBGroup,
          true
        );
        triggerStlDownload(blob, filename);
      },
      resetCamera: () => {
        const ctx = sceneRef.current;
        if (!ctx) return;
        ctx.animTargets.camPos.set(220, 210, 290);
        ctx.animTargets.camTarget.set(28, 120, 0);
        ctx.animTargets.camActive = true;
        ctx.requestRender();
      },
    }));

    // -------------------------------------------------------------------------
    // 1. One-time WebGL Scene, Renderer, RoomEnvironment & Studio Rig Setup
    // -------------------------------------------------------------------------
    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = (() => {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      })();

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';

      container.appendChild(renderer.domElement);

      const onContextLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const onContextRestored = () => {
        setContextLost(false);
      };
      renderer.domElement.addEventListener('webglcontextlost', onContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

      const scene = new THREE.Scene();
      const bgColor = 0xe9edf1;
      scene.background = new THREE.Color(bgColor);
      scene.fog = new THREE.Fog(bgColor, 550, 1450);

      // Mandatory Studio Environment Reflection via RoomEnvironment
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      pmrem.dispose();

      const camera = new THREE.PerspectiveCamera(
        38,
        container.clientWidth / Math.max(1, container.clientHeight),
        1.0,
        2500
      );
      camera.position.set(220, 210, 290);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.07;
      controls.minDistance = 60;
      controls.maxDistance = 850;
      controls.maxPolarAngle = Math.PI * 0.56;
      controls.target.set(28, 120, 0);
      controls.update();

      // 3-Point Warm/Cool Studio Lighting
      const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.85);
      keyLight.position.set(220, 360, 240);
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.camera.near = 60;
      keyLight.shadow.camera.far = 900;
      const d = 220;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
      scene.add(keyLight);

      const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0xcbd5e1, 0.85);
      scene.add(hemiLight);

      const rimLight = new THREE.DirectionalLight(0xf1f5f9, 0.9);
      rimLight.position.set(-220, 220, -240);
      scene.add(rimLight);

      // 10mm Drafting Floor Grid
      const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
      const gridTex = createDraftingGridTexture(maxAnisotropy);
      const floorMat = new THREE.MeshStandardMaterial({
        map: gridTex,
        roughness: 0.92,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.y = -40;
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);

      const shadowTex = createContactShadowTexture();
      const shadowMat = new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      });
      const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(240, 200), shadowMat);
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.set(24, -39.8, 0);
      scene.add(shadowPlane);

      // Materials for Part A & Part B
      const initialFinish = MATERIAL_FINISHES['chalk-pla'];
      const matB = new THREE.MeshPhysicalMaterial({
        color: initialFinish.partBColor,
        roughness: initialFinish.roughness,
        metalness: initialFinish.metalness,
        clearcoat: initialFinish.clearcoat,
        clearcoatRoughness: 0.25,
      });
      const matA = new THREE.MeshPhysicalMaterial({
        color: initialFinish.partAColor,
        roughness: initialFinish.roughness,
        metalness: initialFinish.metalness,
        clearcoat: initialFinish.clearcoat,
        clearcoatRoughness: 0.25,
      });
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x334155,
        transparent: true,
        opacity: 0.34,
      });

      const partBPivot = new THREE.Group();
      const partAPivot = new THREE.Group();
      const partBGroup = new THREE.Group();
      const partAGroup = new THREE.Group();
      const dimsPivot = new THREE.Group();
      const fitCheckPivot = new THREE.Group();

      partBPivot.add(partBGroup);
      partAPivot.add(partAGroup);
      partBPivot.add(dimsPivot);
      partBPivot.add(fitCheckPivot);

      scene.add(partBPivot);
      scene.add(partAPivot);

      // On-demand coalesced rendering loop with software-WebGL pacing & smooth damping
      let frameId = 0;
      let renderBusy = false;
      let renderDirty = false;
      let lastTime = performance.now();

      const animTargets = {
        partAPos: new THREE.Vector3(12, -32, 0),
        partARot: new THREE.Euler(0, 0, 0),
        partBPos: new THREE.Vector3(0, 0, 0),
        partBRot: new THREE.Euler(0, 0, 0),
        floorY: -40,
        camActive: false,
        camPos: new THREE.Vector3(220, 210, 290),
        camTarget: new THREE.Vector3(28, 120, 0),
      };

      const afterDraw = (cb: () => void) => {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      };

      const requestRender = () => {
        if (renderBusy) {
          renderDirty = true;
          return;
        }
        renderBusy = true;
        frameId = requestAnimationFrame(() => {
          renderDirty = false;
          const now = performance.now();
          const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
          lastTime = now;

          let needsMore = false;
          const dampLambda = 9.0;

          // Damped Part A & Part B transforms
          const dampVec = (cur: THREE.Vector3, tgt: THREE.Vector3) => {
            cur.x = THREE.MathUtils.damp(cur.x, tgt.x, dampLambda, dt);
            cur.y = THREE.MathUtils.damp(cur.y, tgt.y, dampLambda, dt);
            cur.z = THREE.MathUtils.damp(cur.z, tgt.z, dampLambda, dt);
            if (cur.distanceToSquared(tgt) > 0.02) needsMore = true;
          };

          dampVec(partAPivot.position, animTargets.partAPos);
          dampVec(partBPivot.position, animTargets.partBPos);

          const dampRot = (cur: THREE.Euler, tgt: THREE.Euler) => {
            cur.x = THREE.MathUtils.damp(cur.x, tgt.x, dampLambda, dt);
            cur.y = THREE.MathUtils.damp(cur.y, tgt.y, dampLambda, dt);
            cur.z = THREE.MathUtils.damp(cur.z, tgt.z, dampLambda, dt);
            if (
              Math.abs(cur.x - tgt.x) +
                Math.abs(cur.y - tgt.y) +
                Math.abs(cur.z - tgt.z) >
              0.002
            ) {
              needsMore = true;
            }
          };

          dampRot(partAPivot.rotation, animTargets.partARot);
          dampRot(partBPivot.rotation, animTargets.partBRot);

          floorMesh.position.y = THREE.MathUtils.damp(
            floorMesh.position.y,
            animTargets.floorY,
            dampLambda,
            dt
          );
          shadowPlane.position.y = floorMesh.position.y + 0.2;
          if (Math.abs(floorMesh.position.y - animTargets.floorY) > 0.05) {
            needsMore = true;
          }

          if (animTargets.camActive) {
            camera.position.x = THREE.MathUtils.damp(
              camera.position.x,
              animTargets.camPos.x,
              7.5,
              dt
            );
            camera.position.y = THREE.MathUtils.damp(
              camera.position.y,
              animTargets.camPos.y,
              7.5,
              dt
            );
            camera.position.z = THREE.MathUtils.damp(
              camera.position.z,
              animTargets.camPos.z,
              7.5,
              dt
            );
            controls.target.x = THREE.MathUtils.damp(
              controls.target.x,
              animTargets.camTarget.x,
              7.5,
              dt
            );
            controls.target.y = THREE.MathUtils.damp(
              controls.target.y,
              animTargets.camTarget.y,
              7.5,
              dt
            );
            controls.target.z = THREE.MathUtils.damp(
              controls.target.z,
              animTargets.camTarget.z,
              7.5,
              dt
            );
            if (
              camera.position.distanceToSquared(animTargets.camPos) < 0.2 &&
              controls.target.distanceToSquared(animTargets.camTarget) < 0.2
            ) {
              camera.position.copy(animTargets.camPos);
              controls.target.copy(animTargets.camTarget);
              animTargets.camActive = false;
            } else {
              needsMore = true;
            }
          }

          const controlsChanged = controls.update();
          if (controlsChanged) needsMore = true;

          renderer.render(scene, camera);

          const done = () => {
            renderBusy = false;
            if (renderDirty || needsMore) requestRender();
          };
          if (isSoftwareGl) afterDraw(done);
          else done();
        });
      };

      // Cancel automated camera flights if user begins orbiting/panning manually
      const onControlStart = () => {
        animTargets.camActive = false;
      };
      const onControlChange = () => {
        requestRender();
      };
      controls.addEventListener('start', onControlStart);
      controls.addEventListener('change', onControlChange);

      const handleResize = () => {
        if (!container) return;
        const w = container.clientWidth;
        const h = Math.max(1, container.clientHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      };
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      sceneRef.current = {
        scene,
        camera,
        renderer,
        controls,
        partAGroup,
        partBGroup,
        partAPivot,
        partBPivot,
        dimsPivot,
        fitCheckPivot,
        floorMesh,
        shadowPlane,
        matA,
        matB,
        edgeMat,
        maxAnisotropy,
        requestRender,
        animTargets,
        partABounds: { minZ: -18 },
        partBBounds: { minZ: -19, minY: 0 },
        boreCenterX: 12,
        screwBaseYAssembled: -38,
      };

      requestRender();

      return () => {
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        resizeObserver.disconnect();
        controls.removeEventListener('start', onControlStart);
        controls.removeEventListener('change', onControlChange);
        controls.dispose();
        renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

        disposeObjectResources(partAGroup);
        disposeObjectResources(partBGroup);
        disposeObjectResources(dimsPivot);
        disposeObjectResources(fitCheckPivot);

        floorMesh.geometry.dispose();
        floorMat.dispose();
        gridTex.dispose();
        shadowPlane.geometry.dispose();
        shadowMat.dispose();
        shadowTex.dispose();
        matA.dispose();
        matB.dispose();
        edgeMat.dispose();
        envTex.dispose();
        renderer.dispose();

        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
        sceneRef.current = null;
      };
    }, []);

    // -------------------------------------------------------------------------
    // 2. Rebuild Parametric CAD Geometry whenever engineering dimensions change
    // -------------------------------------------------------------------------
    useEffect(() => {
      const ctx = sceneRef.current;
      if (!ctx) return;

      // Clear & dispose previous Part A / Part B / Overlays
      disposeObjectResources(ctx.partAGroup);
      ctx.partAGroup.clear();
      disposeObjectResources(ctx.partBGroup);
      ctx.partBGroup.clear();
      disposeObjectResources(ctx.dimsPivot);
      ctx.dimsPivot.clear();
      disposeObjectResources(ctx.fitCheckPivot);
      ctx.fitCheckPivot.clear();

      // Build Part B (Clamp Base + 240mm Tower + 115mm R60mm Cradle + DualSense Mount)
      const builtB = buildPartBAssembly(params, ctx.matB);
      for (const child of [...builtB.group.children]) {
        ctx.partBGroup.add(child);
      }

      // Build Part A (Separate M10 x 1.5 Helical Screw + 5-Lobe Knob)
      const screwShaftLen = Math.max(50, params.jawOpening + 14);
      const builtA = createPartAClampScrewGeometry({
        majorDiameter: params.threadMajorDiameter,
        pitch: params.threadPitch,
        clearanceGap: params.clearanceGap,
        shaftLength: screwShaftLen,
      });
      const screwMesh = new THREE.Mesh(builtA.geometry, ctx.matA);
      screwMesh.name = 'PartA_M10ClampScrew';
      screwMesh.castShadow = true;
      screwMesh.receiveShadow = true;
      ctx.partAGroup.add(screwMesh);

      if (showCadEdges) {
        addCadEdgeLines(ctx.partAGroup, ctx.edgeMat);
        addCadEdgeLines(ctx.partBGroup, ctx.edgeMat);
      }

      // Build 3D Dimension Guides & Fit-Check Overlays
      const dimsGroup = buildDimensionGuidesGroup(params, ctx.maxAnisotropy);
      ctx.dimsPivot.add(dimsGroup);

      const fitGroup = buildFitCheckOverlayGroup(params);
      ctx.fitCheckPivot.add(fitGroup);

      // Compute exact triangle counts, volume & bounding box on the real CAD parts
      const statsA = computeObjectStats(ctx.partAGroup);
      const statsB = computeObjectStats(ctx.partBGroup);
      onStatsRef.current({ partA: statsA, partB: statsB });

      const bBox = new THREE.Box3().setFromObject(ctx.partBGroup);
      ctx.partBBounds = {
        minZ: bBox.isEmpty() ? -19 : bBox.min.z,
        minY: bBox.isEmpty() ? 0 : bBox.min.y,
      };
      ctx.boreCenterX = builtB.boreCenterX;

      // In assembled state, Part A tip at travel=1.0 reaches underside of upper jaw (12 + jawOpening)
      // At travel=0.0, tip sits just above lower jaw
      const padHeightFromKnobBottom = builtA.padTopY;
      const topPadMinY = builtB.lowerJawThickness + 3.0;
      const topPadMaxY = builtB.lowerJawThickness + params.jawOpening - 0.5;
      const targetPadTopY = THREE.MathUtils.lerp(
        topPadMinY,
        topPadMaxY,
        params.screwTravel
      );
      ctx.screwBaseYAssembled = targetPadTopY - padHeightFromKnobBottom;

      ctx.requestRender();
    }, [
      params.jawOpening,
      params.overallHeight,
      params.cradleWidth,
      params.cradleRadius,
      params.threadMajorDiameter,
      params.threadPitch,
      params.clearanceGap,
      params.armReach,
      params.screwTravel,
      showCadEdges,
    ]);

    // -------------------------------------------------------------------------
    // 3. Update Layout Mode (Assembled vs Exploded vs Print Bed), Overlays & Material
    // -------------------------------------------------------------------------
    useEffect(() => {
      const ctx = sceneRef.current;
      if (!ctx) return;

      const finish = MATERIAL_FINISHES[finishId];
      ctx.matB.color.setHex(finish.partBColor);
      ctx.matB.roughness = finish.roughness;
      ctx.matB.metalness = finish.metalness;
      ctx.matB.clearcoat = finish.clearcoat;

      ctx.matA.color.setHex(finish.partAColor);
      ctx.matA.roughness = finish.roughness;
      ctx.matA.metalness = finish.metalness;
      ctx.matA.clearcoat = finish.clearcoat;

      ctx.dimsPivot.visible = showDimensions && layoutMode !== 'print-bed';
      ctx.fitCheckPivot.visible = showFitCheck && layoutMode === 'assembled';

      if (layoutMode === 'assembled') {
        ctx.animTargets.partBPos.set(0, 0, 0);
        ctx.animTargets.partBRot.set(0, 0, 0);
        ctx.animTargets.partAPos.set(
          ctx.boreCenterX,
          ctx.screwBaseYAssembled,
          0
        );
        // Rotate screw proportionally to travel so helical threads visibly turn!
        const turns = (params.screwTravel * params.jawOpening) / params.threadPitch;
        ctx.animTargets.partARot.set(0, turns * Math.PI * 2, 0);
        ctx.animTargets.floorY = Math.min(-42, ctx.screwBaseYAssembled - 6);
      } else if (layoutMode === 'exploded') {
        ctx.animTargets.partBPos.set(0, 0, 0);
        ctx.animTargets.partBRot.set(0, 0, 0);
        // Separate Part A downward & slightly forward so both internal M10 bore & external M10 screw are clearly visible
        ctx.animTargets.partAPos.set(ctx.boreCenterX + 55, -18, 42);
        ctx.animTargets.partARot.set(0, 0, 0);
        ctx.animTargets.floorY = -22;
      } else {
        // Print Bed Layout: Part B laid flat on its side at y = 0, Part A upright on knob at y = 0
        ctx.animTargets.partBRot.set(-Math.PI / 2, 0, 0);
        // When rotated -PI/2 around X, local +Z maps to +Y and local -Z maps to -Y.
        // Wait: rotating -PI/2 around X maps (x, y, z) -> (x, z, -y), so minY = minZ!
        ctx.animTargets.partBPos.set(-15, -ctx.partBBounds.minZ, 95);
        ctx.animTargets.partAPos.set(-68, 0, 48);
        ctx.animTargets.partARot.set(0, 0, 0);
        ctx.animTargets.floorY = 0;
      }

      ctx.requestRender();
    }, [
      layoutMode,
      finishId,
      showDimensions,
      showFitCheck,
      params.screwTravel,
      params.jawOpening,
      params.threadPitch,
    ]);

    // -------------------------------------------------------------------------
    // 4. Smooth Camera Preset Transitions
    // -------------------------------------------------------------------------
    useEffect(() => {
      const ctx = sceneRef.current;
      if (!ctx) return;

      if (layoutMode === 'print-bed' && cameraTrigger === 0) return;

      const setCam = (
        px: number,
        py: number,
        pz: number,
        tx: number,
        ty: number,
        tz: number
      ) => {
        ctx.animTargets.camPos.set(px, py, pz);
        ctx.animTargets.camTarget.set(tx, ty, tz);
        ctx.animTargets.camActive = true;
        ctx.requestRender();
      };

      if (layoutMode === 'print-bed') {
        setCam(60, 290, 210, -10, 0, -10);
        return;
      }

      switch (cameraPreset) {
        case 'isometric':
          setCam(220, 210, 290, 28, 120, 0);
          break;
        case 'front':
          setCam(25, 130, 360, 25, 120, 0);
          break;
        case 'clamp':
          setCam(130, 48, 145, 14, 24, 0);
          break;
        case 'cradle':
          setCam(135, 255, 165, 22, 222, 0);
          break;
        case 'controller':
          setCam(210, 145, 175, 86, 98, 0);
          break;
      }
    }, [cameraPreset, cameraTrigger, layoutMode]);

    return (
      <div className="relative w-full h-full">
        <div
          ref={mountRef}
          className="w-full h-full cursor-grab active:cursor-grabbing"
          aria-label="Interactive 3D CAD Viewport"
        />
        {contextLost && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#eaeef2] text-slate-800 p-6 text-center">
            <p className="font-display text-lg font-semibold">
              3D WebGL Context Interrupted
            </p>
            <p className="text-sm text-slate-600 mt-1 max-w-md">
              Hardware graphics resources were reclaimed by the browser. Reload or
              restore the window to resume the interactive viewport.
            </p>
          </div>
        )}
      </div>
    );
  }
);
