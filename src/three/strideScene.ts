import type * as THREEType from 'three';
import { BH, FLAVORS, SHEET_URL, clamp, seededRand } from '../data/stride';

const DEG2RAD = Math.PI / 180;

export interface BarState {
  x: number;
  y: number;
  h: number;
  rz: number;
  ry: number;
  rx: number;
  z: number;
  op: number;
  sx: number;
  sy: number;
  shadow: number;
}

export interface HeroSlotMetrics {
  cx: number;
  cy: number;
  u: number;
  spreadX: number;
  slotPx: number;
}

const ARC_SLOTS = [
  { dx: 0, dy: 0, h: 430, rz: 0, ry: 0 },
  { dx: 245, dy: 24, h: 330, rz: 4, ry: 16 },
  { dx: 452, dy: 44, h: 312, rz: 8, ry: 26 },
  { dx: 660, dy: 80, h: 296, rz: 12, ry: 34 },
  { dx: 860, dy: 118, h: 280, rz: 15, ry: 40 },
];

export function getHeroMetrics(vw: number, vh: number, heroH: number): HeroSlotMetrics {
  const isPhone = vw < 820;
  if (isPhone) {
    const u = Math.min(vw / 560, heroH / 980);
    const spreadX = 1.02;
    return {
      cx: vw / 2,
      cy: heroH * 0.4,
      u,
      spreadX,
      slotPx: 245 * u * spreadX,
    };
  }
  const u = Math.min(vw / 1440, vh / 900);
  return {
    cx: vw / 2,
    cy: heroH / 2 - 78 * u,
    u,
    spreadX: 1,
    slotPx: 245 * u,
  };
}

export function getArcBarState(
  k: number,
  j: number,
  metrics: HeroSlotMetrics,
  now: number,
  reducedMotion: boolean
): BarState {
  const ak = Math.min(4, Math.abs(k));
  const sgn = k === 0 ? 0 : k < 0 ? -1 : 1;
  const i0 = Math.floor(ak);
  const i1 = Math.min(4, i0 + 1);
  const f = ak - i0;
  const a0 = ARC_SLOTS[i0];
  const a1 = ARC_SLOTS[i1];

  const dx = a0.dx + (a1.dx - a0.dx) * f;
  const dy = a0.dy + (a1.dy - a0.dy) * f;
  const h = a0.h + (a1.h - a0.h) * f;
  const rz = a0.rz + (a1.rz - a0.rz) * f;
  const ry = a0.ry + (a1.ry - a0.ry) * f;

  let y = metrics.cy + dy * metrics.u;
  let rzOut = sgn * rz;

  if (!reducedMotion) {
    const b = Math.sin((now / 4600) * Math.PI * 2 + 1.37 * j);
    y -= (0.5 * b + 0.5) * 9 * metrics.u;
    rzOut += 0.4 * b;
  }

  const op = ak <= 3.3 ? 1 : ak >= 3.9 ? 0 : 1 - (ak - 3.3) / 0.6;

  return {
    x: metrics.cx + sgn * dx * metrics.u * metrics.spreadX,
    y,
    h: h * metrics.u,
    rz: rzOut,
    ry: sgn * ry,
    rx: 0,
    z: -ak * 34 * metrics.u,
    op,
    sx: 1,
    sy: 1,
    shadow: 1,
  };
}

function mixHexToInk(hex: string, amountToInk: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const ir = 0x1c;
  const ig = 0x1a;
  const ib = 0x1f;
  const mr = Math.round(r * (1 - amountToInk) + ir * amountToInk);
  const mg = Math.round(g * (1 - amountToInk) + ig * amountToInk);
  const mb = Math.round(b * (1 - amountToInk) + ib * amountToInk);
  return `rgb(${mr}, ${mg}, ${mb})`;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

interface BarInstance {
  group: THREEType.Group;
  frontMesh: THREEType.Mesh;
  backMesh: THREEType.Mesh;
  frontMat: THREEType.MeshPhysicalMaterial;
  backMat: THREEType.MeshPhysicalMaterial;
  shadowMesh: THREEType.Mesh;
  shadowMat: THREEType.MeshBasicMaterial;
  flavorIdx: number;
  heroSlotOffset: number;
}

export interface StrideGLController {
  isSoftwareGl: boolean;
  resize: (vw: number, vh: number) => void;
  updatePoolBar: (poolIdx: number, flavorIdx: number, slotOffsetK: number, state: BarState) => void;
  updateTravellerBar: (flavorIdx: number, slotOffsetK: number, state: BarState) => void;
  hidePoolBar: (poolIdx: number) => void;
  renderFrame: () => void;
  afterDraw: (cb: () => void) => void;
  raycastHeroBars: (clientX: number, clientY: number, vw: number, vh: number) => number | null;
  dispose: () => void;
}

function detectSoftwareGl(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export async function createStrideGL(
  canvas: HTMLCanvasElement,
  onReady?: () => void
): Promise<StrideGLController | null> {
  const threeSpec: string = 'three';
  const roomEnvSpec: string = 'three/addons/environments/RoomEnvironment.js';
  const [THREE, { RoomEnvironment }] = await Promise.all([
    import(/* @vite-ignore */ threeSpec) as Promise<typeof THREEType>,
    import(/* @vite-ignore */ roomEnvSpec) as Promise<{
      RoomEnvironment: new () => THREEType.Scene;
    }>,
  ]);

  const isSoftwareGl = detectSoftwareGl();

  let renderer: THREEType.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch {
    return null;
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envRT = pmremGenerator.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  pmremGenerator.dispose();

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(-0.6, 0.9, 1.4);
  scene.add(keyLight);

  const camera = new THREE.PerspectiveCamera(35, 1, 10, 8000);

  const applyCameraAndSize = (vw: number, vh: number) => {
    const safeW = Math.max(1, vw);
    const safeH = Math.max(1, vh);
    const prLimit = safeW < 820 ? 1.75 : 2;
    const dpr = isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, prLimit);
    renderer.setPixelRatio(dpr);
    renderer.setSize(safeW, safeH, false);
    canvas.style.width = '100vw';
    canvas.style.height = `${safeH}px`;

    const D = clamp(1500 * Math.min(safeW / 1440, safeH / 900), 1000, 2200);
    camera.position.set(0, 0, D);
    camera.fov = (2 * Math.atan(safeH / 2 / D)) / DEG2RAD;
    camera.aspect = safeW / safeH;
    camera.near = 10;
    camera.far = 4 * D;
    camera.updateProjectionMatrix();
  };

  applyCameraAndSize(window.innerWidth, window.innerHeight);

  // Build shared front and back pillow geometries
  const frontGeo = new THREE.PlaneGeometry(1, BH, 30, 64);
  const backGeo = new THREE.PlaneGeometry(1, BH, 30, 64);

  const CR = 0.062;
  const computePillowZ = (u: number, v: number) => {
    const ex = Math.abs(2 * u - 1);
    const ev = Math.min(v, 1 - v);
    if (ev < CR) {
      return 0.006 + 0.006 * Math.abs(Math.sin(u * Math.PI * 34));
    }
    const across = Math.pow(Math.max(0, 1 - Math.pow(ex, 2.6)), 0.62);
    const along = Math.pow(clamp((ev - CR) / 0.11, 0, 1), 0.7);
    return (
      0.012 +
      0.118 * across * along +
      0.004 * Math.sin(23 * u + 31 * v) * across
    );
  };

  const fPos = frontGeo.attributes.position;
  const fUv = frontGeo.attributes.uv;
  for (let i = 0; i < fPos.count; i++) {
    const u = fUv.getX(i);
    const v = fUv.getY(i);
    fPos.setZ(i, computePillowZ(u, v));
  }
  fPos.needsUpdate = true;
  frontGeo.computeVertexNormals();

  const bPos = backGeo.attributes.position;
  const bUv = backGeo.attributes.uv;
  for (let i = 0; i < bPos.count; i++) {
    const u = bUv.getX(i);
    const v = bUv.getY(i);
    bPos.setZ(i, -computePillowZ(u, v));
    bUv.setX(i, 1 - u);
  }
  bPos.needsUpdate = true;
  bUv.needsUpdate = true;

  if (backGeo.index) {
    const arr = backGeo.index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const tmp = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = tmp;
    }
    backGeo.index.needsUpdate = true;
  }
  backGeo.computeVertexNormals();

  // Contact shadow geometry & texture
  const shadowGeo = new THREE.PlaneGeometry(1.25, 1.04 * BH);
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 512;
  const sCtx = shadowCanvas.getContext('2d')!;
  sCtx.save();
  sCtx.translate(128, 256);
  sCtx.scale(1, 2);
  const grad = sCtx.createRadialGradient(0, 0, 0, 0, 0, 120);
  grad.addColorStop(0, 'rgba(30, 18, 40, 0.55)');
  grad.addColorStop(0.55, 'rgba(30, 18, 40, 0.22)');
  grad.addColorStop(1, 'rgba(30, 18, 40, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(-128, -128, 256, 256);
  sCtx.restore();

  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  shadowTex.colorSpace = THREE.SRGBColorSpace;

  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);

  // Create CanvasTextures per flavor upfront
  const frontTextures: THREEType.CanvasTexture[] = [];
  const backTextures: THREEType.CanvasTexture[] = [];

  for (let i = 0; i < FLAVORS.length; i++) {
    const fl = FLAVORS[i];
    const W = Math.round((fl.box[2] + 8) * 1.5 * 0.75);
    const H = Math.round(W * BH);

    const fCanvas = document.createElement('canvas');
    fCanvas.width = W;
    fCanvas.height = H;
    const fTex = new THREE.CanvasTexture(fCanvas);
    fTex.colorSpace = THREE.SRGBColorSpace;
    fTex.anisotropy = maxAniso;
    frontTextures.push(fTex);

    const bCanvas = document.createElement('canvas');
    bCanvas.width = W;
    bCanvas.height = H;
    const bTex = new THREE.CanvasTexture(bCanvas);
    bTex.colorSpace = THREE.SRGBColorSpace;
    bTex.anisotropy = maxAniso;
    backTextures.push(bTex);
  }

  const createBarInstance = (): BarInstance => {
    const group = new THREE.Group();
    group.visible = false;

    const frontMat = new THREE.MeshPhysicalMaterial({
      map: frontTextures[1],
      transparent: true,
      alphaTest: 0.5,
      roughness: 0.45,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.32,
      envMapIntensity: 0.42,
    });

    const backMat = new THREE.MeshPhysicalMaterial({
      map: backTextures[1],
      transparent: true,
      alphaTest: 0.5,
      roughness: 0.45,
      metalness: 0,
      clearcoat: 0.5,
      clearcoatRoughness: 0.32,
      envMapIntensity: 0.42,
    });

    const frontMesh = new THREE.Mesh(frontGeo, frontMat);
    const backMesh = new THREE.Mesh(backGeo, backMat);
    group.add(frontMesh, backMesh);
    scene.add(group);

    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.renderOrder = -1;
    shadowMesh.visible = false;
    scene.add(shadowMesh);

    const inst: BarInstance = {
      group,
      frontMesh,
      backMesh,
      frontMat,
      backMat,
      shadowMesh,
      shadowMat,
      flavorIdx: 1,
      heroSlotOffset: 0,
    };

    frontMesh.userData.bar = inst;
    backMesh.userData.bar = inst;
    return inst;
  };

  const poolBars: BarInstance[] = Array.from({ length: 11 }, createBarInstance);
  const travellerBar: BarInstance = createBarInstance();

  const applyBarState = (
    bar: BarInstance,
    flavorIdx: number,
    slotOffsetK: number,
    state: BarState,
    vw: number,
    vh: number
  ) => {
    if (bar.flavorIdx !== flavorIdx) {
      bar.flavorIdx = flavorIdx;
      bar.frontMat.map = frontTextures[flavorIdx];
      bar.backMat.map = backTextures[flavorIdx];
    }
    bar.heroSlotOffset = slotOffsetK;

    if (state.op <= 0.01 || state.h <= 0.5) {
      bar.group.visible = false;
      bar.shadowMesh.visible = false;
      return;
    }

    bar.group.visible = true;
    bar.group.position.set(state.x - vw / 2, vh / 2 - state.y, state.z);
    const s = state.h / BH;
    bar.group.scale.set(s * state.sx, s * state.sy, s);
    bar.group.rotation.order = 'ZYX';
    bar.group.rotation.set(
      state.rx * DEG2RAD,
      state.ry * DEG2RAD,
      -state.rz * DEG2RAD
    );

    bar.frontMat.opacity = state.op;
    bar.backMat.opacity = state.op;

    if (state.shadow > 0.01) {
      bar.shadowMesh.visible = true;
      bar.shadowMesh.position.set(
        state.x - vw / 2,
        vh / 2 - (state.y + 0.05 * state.h),
        state.z - 0.32 * state.h
      );
      bar.shadowMesh.rotation.set(0, 0, -state.rz * DEG2RAD);
      const wFactor = Math.max(0.3, Math.abs(Math.cos(state.ry * DEG2RAD)));
      bar.shadowMesh.scale.set(s * state.sx * wFactor, s * state.sy, 1);
      bar.shadowMat.opacity = 0.5 * state.op * state.shadow;
    } else {
      bar.shadowMesh.visible = false;
    }
  };

  // Load sheet image & fonts, then paint all 5 front & back textures
  let disposed = false;
  const loadFonts = Promise.all([
    document.fonts.load('400 40px "Archivo Black"'),
    document.fonts.load('400 20px "DM Mono"'),
    document.fonts.load('500 20px "DM Mono"'),
    document.fonts.load('700 20px "Inter"'),
  ]).catch(() => undefined);

  const loadSheet = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = SHEET_URL;
  });

  Promise.all([loadSheet, loadFonts])
    .then(([img]) => {
      if (disposed) return;
      const scale = img.naturalWidth / 2688;

      for (let i = 0; i < FLAVORS.length; i++) {
        const fl = FLAVORS[i];
        const sx = (fl.box[0] - 4) * scale;
        const sy = (fl.box[1] - 4) * scale;
        const sw = (fl.box[2] + 8) * scale;
        const sh = (fl.box[3] + 8) * scale;

        // Front canvas
        const fTex = frontTextures[i];
        const fCanvas = fTex.image as HTMLCanvasElement;
        const fCtx = fCanvas.getContext('2d')!;
        fCtx.clearRect(0, 0, fCanvas.width, fCanvas.height);
        fCtx.drawImage(img, sx, sy, sw, sh, 0, 0, fCanvas.width, fCanvas.height);
        fTex.needsUpdate = true;

        // Back canvas
        const bTex = backTextures[i];
        const bCanvas = bTex.image as HTMLCanvasElement;
        const W = bCanvas.width;
        const H = bCanvas.height;
        const bCtx = bCanvas.getContext('2d')!;
        bCtx.clearRect(0, 0, W, H);

        // 1. Mirrored crop for silhouette + crimp shading
        bCtx.save();
        bCtx.translate(W, 0);
        bCtx.scale(-1, 1);
        bCtx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
        bCtx.restore();

        // 2. Source-atop color fill
        bCtx.save();
        bCtx.globalCompositeOperation = 'source-atop';
        const sealH = 0.075 * H;
        bCtx.fillStyle = fl.color;
        bCtx.globalAlpha = 0.9;
        bCtx.fillRect(0, sealH, W, H - 2 * sealH);

        bCtx.globalAlpha = 0.35;
        bCtx.fillRect(0, 0, W, sealH);
        bCtx.fillRect(0, H - sealH, W, sealH);

        // 3. Horizontal sheen gradient over body
        bCtx.globalAlpha = 1;
        const sheen = bCtx.createLinearGradient(0, 0, W, 0);
        sheen.addColorStop(0, 'rgba(0,0,0,0.10)');
        sheen.addColorStop(0.28, 'rgba(255,255,255,0.14)');
        sheen.addColorStop(0.5, 'rgba(0,0,0,0)');
        sheen.addColorStop(0.8, 'rgba(0,0,0,0.04)');
        sheen.addColorStop(1, 'rgba(0,0,0,0.14)');
        bCtx.fillStyle = sheen;
        bCtx.fillRect(0, sealH, W, H - 2 * sealH);
        bCtx.restore();

        // 4. Text & nutrition panel clipped inside silhouette
        const ink = mixHexToInk(fl.color, 0.78);
        bCtx.save();
        bCtx.globalCompositeOperation = 'source-atop';
        bCtx.fillStyle = ink;
        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'middle';

        bCtx.font = `400 ${0.085 * W}px "Archivo Black", sans-serif`;
        bCtx.fillText('STRIDE', W * 0.5, H * 0.15);

        bCtx.font = `500 ${0.042 * W}px "DM Mono", monospace`;
        bCtx.fillText(`${fl.name.toUpperCase()} · 50 G`, W * 0.5, H * 0.185);

        // Nutrition panel
        const px = 0.15 * W;
        const py = 0.215 * H;
        const pw = 0.7 * W;
        const ph = 0.36 * H;
        roundRectPath(bCtx, px, py, pw, ph, 0.03 * W);
        bCtx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        bCtx.fill();

        const padX = 0.045 * W;
        const leftX = px + padX;
        const rightX = px + pw - padX;

        bCtx.fillStyle = ink;
        bCtx.textAlign = 'left';
        bCtx.textBaseline = 'alphabetic';
        bCtx.font = `400 ${0.058 * W}px "Archivo Black", sans-serif`;
        bCtx.fillText('NUTRITION', leftX, py + 0.044 * H);

        bCtx.font = `400 ${0.032 * W}px "DM Mono", monospace`;
        bCtx.fillText('Serving size 1 bar (50 g)', leftX, py + 0.072 * H);

        bCtx.fillRect(leftX, py + 0.085 * H, pw - 2 * padX, Math.max(2, 0.004 * W));

        const rows: [string, string, boolean][] = [
          ['Calories', '210', true],
          ['Protein', '12 g', true],
          ['Total fat', '9 g', false],
          ['Carbohydrate', '22 g', false],
          ['Fibre', '6 g', false],
          ['Sugars', '8 g', false],
          ['Salt', '0.2 g', false],
        ];

        rows.forEach(([label, val, bold], idx) => {
          const rowY = py + (0.125 + idx * 0.034) * H;
          bCtx.font = `${bold ? 500 : 400} ${0.032 * W}px "DM Mono", monospace`;
          bCtx.fillStyle = ink;
          bCtx.textAlign = 'left';
          bCtx.fillText(label, leftX, rowY);
          bCtx.textAlign = 'right';
          bCtx.fillText(val, rightX, rowY);

          bCtx.fillStyle = 'rgba(28, 26, 31, 0.16)';
          bCtx.fillRect(leftX, rowY + 0.011 * H, pw - 2 * padX, 1);
        });

        // Ingredients
        bCtx.fillStyle = ink;
        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'middle';
        bCtx.font = `500 ${0.036 * W}px "DM Mono", monospace`;
        bCtx.fillText('INGREDIENTS', W * 0.5, H * 0.62);

        bCtx.font = `400 ${0.034 * W}px "DM Mono", monospace`;
        const ingLines = wrapTextLines(bCtx, fl.ingredients, 0.7 * W);
        ingLines.forEach((ln, idx) => {
          bCtx.fillText(ln, W * 0.5, H * (0.652 + idx * 0.022));
        });

        // Barcode on white rounded card
        const bx = 0.24 * W;
        const by = 0.735 * H;
        const bw = 0.52 * W;
        const bh = 0.095 * H;
        roundRectPath(bCtx, bx, by, bw, bh, 0.024 * W);
        bCtx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        bCtx.fill();

        const rand = seededRand(9013 + i * 173);
        let curX = bx + 0.05 * W;
        const endX = bx + bw - 0.05 * W;
        const barTop = by + 0.014 * H;
        const barH = 0.05 * H;
        bCtx.fillStyle = ink;
        while (curX < endX - 4) {
          const wBar = (1.5 + Math.floor(rand() * 3.5)) * (W / 460);
          const gap = (1.5 + Math.floor(rand() * 3)) * (W / 460);
          if (curX + wBar <= endX) {
            bCtx.fillRect(curX, barTop, wBar, barH);
          }
          curX += wBar + gap;
        }
        bCtx.font = `400 ${0.025 * W}px "DM Mono", monospace`;
        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'alphabetic';
        bCtx.fillText(`5 060812 3405${i}2`, W * 0.5, by + bh - 0.011 * H);

        // Bottom line
        bCtx.textBaseline = 'middle';
        bCtx.font = `500 ${0.036 * W}px "DM Mono", monospace`;
        bCtx.fillText('PRESSED, NOT BAKED', W * 0.5, H * 0.885);

        bCtx.restore();
        bTex.needsUpdate = true;
      }

      onReady?.();
    })
    .catch(() => {
      onReady?.();
    });

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  let currentVw = window.innerWidth;
  let currentVh = window.innerHeight;

  let syncTimeoutId = 0;

  return {
    isSoftwareGl,
    resize(vw: number, vh: number) {
      currentVw = vw;
      currentVh = vh;
      applyCameraAndSize(vw, vh);
    },
    updatePoolBar(poolIdx: number, flavorIdx: number, slotOffsetK: number, state: BarState) {
      const bar = poolBars[poolIdx];
      if (!bar) return;
      applyBarState(bar, flavorIdx, slotOffsetK, state, currentVw, currentVh);
    },
    hidePoolBar(poolIdx: number) {
      const bar = poolBars[poolIdx];
      if (!bar) return;
      bar.group.visible = false;
      bar.shadowMesh.visible = false;
    },
    updateTravellerBar(flavorIdx: number, slotOffsetK: number, state: BarState) {
      applyBarState(travellerBar, flavorIdx, slotOffsetK, state, currentVw, currentVh);
    },
    renderFrame() {
      renderer.render(scene, camera);
    },
    afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (typeof gl.fenceSync !== 'function') {
        syncTimeoutId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          syncTimeoutId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          syncTimeoutId = window.setTimeout(cb, 80);
        }
      };
      syncTimeoutId = window.setTimeout(poll, 5);
    },
    raycastHeroBars(clientX: number, clientY: number, vw: number, vh: number): number | null {
      pointerNdc.x = (clientX / vw) * 2 - 1;
      pointerNdc.y = -(clientY / vh) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const targets: THREEType.Object3D[] = [];
      for (const bar of poolBars) {
        if (bar.group.visible) targets.push(bar.frontMesh, bar.backMesh);
      }
      if (travellerBar.group.visible) {
        targets.push(travellerBar.frontMesh, travellerBar.backMesh);
      }
      if (!targets.length) return null;
      const hits = raycaster.intersectObjects(targets, false);
      if (!hits.length) return null;
      const inst = hits[0].object.userData.bar as BarInstance | undefined;
      return inst ? inst.heroSlotOffset : null;
    },
    dispose() {
      disposed = true;
      window.clearTimeout(syncTimeoutId);
      frontGeo.dispose();
      backGeo.dispose();
      shadowGeo.dispose();
      shadowTex.dispose();
      frontTextures.forEach((t) => t.dispose());
      backTextures.forEach((t) => t.dispose());
      for (const bar of [...poolBars, travellerBar]) {
        bar.frontMat.dispose();
        bar.backMat.dispose();
        bar.shadowMat.dispose();
      }
      envRT.dispose();
      renderer.dispose();
    },
  };
}
