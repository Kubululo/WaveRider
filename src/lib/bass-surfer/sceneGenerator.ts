// Shaders in this file use internal three.js GLSL hook points
// (#include <begin_vertex>, #include <opaque_fragment>) that may be renamed or
// removed in future releases. Last verified against three.js r184 (0.184.0).
// When upgrading three.js, test all three quality presets visually — misaligned
// displacement, broken bloom, or missing grid lines indicate a hook point change.
import {
  Box3,
  BufferGeometry,
  BufferAttribute,
  CircleGeometry,
  ClampToEdgeWrapping,
  Color,
  ConeGeometry,
  CubeTextureLoader,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  ExtrudeGeometry,
  FloatType,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  ReinhardToneMapping,
  RGBAFormat,
  Scene,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  Timer,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'

// Post-Processing & Loaders
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass.js'

import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import Stats from 'three/examples/jsm/libs/stats.module.js'
import type { TrackSegment } from './types'

// --- Constants ---
export const LANE_WIDTH = 3

// Upper bound on the render supersampling scale (see the constructor's
// setPixelRatio call). Guards against a stray preset/override allocating a
// runaway framebuffer (cost grows with the square of the scale).
const MAX_RENDER_SCALE = 4

// Sliding height-texture window. Rather than fit the whole track into one texture
// (capped at the GPU's maxTextureSize, which forces lossy downsampling and makes
// long tracks' road jitter), the height map is a fixed-size window that scrolls
// with the player and is refilled at full resolution. The width must cover the
// deepest thing that samples the height map — the farthest pyramids, ~950 world
// units ahead — with margin. At ~0.5 world units/texel, 4096 texels ≈ 2000 units.
const HEIGHT_WINDOW_TEXELS = 4096
// Texels kept behind the player (the road extends only ~35 units back, so this is
// generous); the rest of the window is the lookahead.
const HEIGHT_WINDOW_BEHIND = 512

// --- Types & Interfaces ---

type SvgFileConfig = [string, number, number, number, number, string]

interface PositionHistoryItem {
  size: number
  positionX: number
  positionZ: number
}

interface ThreeShader {
  uniforms: { [uniform: string]: { value: unknown } }
  vertexShader: string
  fragmentShader: string
  // Repeat period (seconds) of this shader's scroll in the `time` uniform. The
  // grid/instance scroll wraps with this period, so feeding `time % period`
  // keeps the value tiny and precision-safe without any visible jump. Without
  // it, `time * speed` grows with song length and overflows mediump fragment
  // precision on long tracks → the grid visibly judders. See renderFrame().
  scrollTimePeriod?: number
}

export interface SceneSettings {
  renderDistance: number
  pixelRatio: number
  planeSize: number
  palmCount: number
  palmSpacing: number
  pyramidCount: number
  pyramidInstances: number
  bloomEnabled: boolean
  scanlineEnabled: boolean
  scanlineOpacity: number
}

export class RetrowaveScene {
  public static readonly defaultSettings: SceneSettings = {
    renderDistance: 2000,
    // Supersampling factor: the scene renders at this multiple of the CSS
    // resolution and downscales (SSAA). This is what tames the scrolling neon
    // grid's moiré — the grid is a fragment-shader pattern, so resolution is the
    // only lever that smooths its interior (edge-based SMAA can't). Heaviest
    // preset; tuned for crisp visuals and video capture on a 1× display. Cost
    // scales with the square of this value and it's clamped to MAX_RENDER_SCALE.
    pixelRatio: 1,
    planeSize: 300,
    palmCount: 40,
    palmSpacing: 15,
    pyramidCount: 120,
    pyramidInstances: 15,
    bloomEnabled: true,
    scanlineEnabled: true,
    scanlineOpacity: 0.01,
  }

  public static readonly qualityPresets: Record<string, SceneSettings> = {
    low: {
      renderDistance: 800,
      pixelRatio: 0.65,
      planeSize: 300,
      palmCount: 5,
      palmSpacing: 40,
      pyramidCount: 8,
      pyramidInstances: 4,
      bloomEnabled: false,
      scanlineEnabled: false,
      scanlineOpacity: 0,
    },
    medium: {
      renderDistance: 1200,
      pixelRatio: 1,
      planeSize: 300,
      palmCount: 25,
      palmSpacing: 40,
      pyramidCount: 14,
      pyramidInstances: 6,
      bloomEnabled: true,
      scanlineEnabled: true,
      scanlineOpacity: 0.05,
    },
    high: {
      ...RetrowaveScene.defaultSettings,
    },
  }
  // Properties
  public animationSpeed: number = 30
  // FIX: Added latency correction (Lookahead in seconds).
  // Positive = Visuals look further ahead (arrives sooner).
  public latency: number = 0

  public settings: SceneSettings
  public scenePath: string
  public textureResolution: number = 4096
  public svgFiles: SvgFileConfig[]
  public skybox: string[]
  public positionHistory: PositionHistoryItem[] = []
  public materialShaders: ThreeShader[] = []
  public fpsCounterIsActive: boolean = false
  public time: number = 0

  // Track displacement
  public playerGroup: Group | null = null
  private heightTexture: DataTexture | null = null
  // Full-resolution track data (player physics + the height window read from these).
  private trackHeights: Float32Array = new Float32Array(1)
  private trackCenterX: Float32Array = new Float32Array(1)
  private trackRoll: Float32Array = new Float32Array(1)
  private trackDuration: number = 0

  // Sliding height-texture window state (see setTrackData / updateHeightWindow).
  private windowData: Float32Array | null = null
  private windowTexels = 0
  private windowStartSeg = -1
  private windowProgress = 0
  private windowWorldDist = 1
  private trackProgress: number = 0
  private readonly HEIGHT_SCALE: number = 0.35

  // Three Core
  public renderer: WebGLRenderer
  public scene: Scene
  public camera: PerspectiveCamera
  // Timer replaces the deprecated THREE.Clock. Call update() once per frame
  // before reading getDelta() (see animate()).
  public clock: Timer = new Timer()
  public mouse: Vector2 = new Vector2()
  public target: Vector2 = new Vector2()
  public composer!: EffectComposer

  // Internal State
  private glitchPass!: GlitchPass
  private smaaPass: SMAAPass | null = null

  private stats: Stats | null = null
  private glitchTimeout: ReturnType<typeof setTimeout> | null = null
  private sunGroup: Group | null = null
  private sunBaseScale: number = 1
  private scanlineOverlay: HTMLDivElement | null = null

  constructor(scenePath: string = '', container?: HTMLElement, settings?: Partial<SceneSettings>) {
    this.settings = { ...RetrowaveScene.defaultSettings, ...settings }
    this.scenePath = scenePath

    this.svgFiles = [
      [`${this.scenePath}scenery/sun.svg`, 0, 40, -500, 0.11, 'sun'],
      [`${this.scenePath}scenery/city_far.svg`, 0, 15, -450, 0.4, 'cityFar'],
      [`${this.scenePath}scenery/city_close.svg`, 0, 28, -300, 0.2, 'cityClose'],
    ]

    this.skybox = [
      `${this.scenePath}skybox/${this.textureResolution}/px.png`,
      `${this.scenePath}skybox/${this.textureResolution}/nx.png`,
      `${this.scenePath}skybox/${this.textureResolution}/py.png`,
      `${this.scenePath}skybox/${this.textureResolution}/invisible.png`,
      `${this.scenePath}skybox/${this.textureResolution}/invisible.png`,
      `${this.scenePath}skybox/${this.textureResolution}/nz.png`,
    ]

    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    // pixelRatio is an ABSOLUTE supersampling scale (CSS px → render px), not a
    // cap on the display's devicePixelRatio. Treating it as a cap meant the high
    // preset rendered at 1× CSS resolution on a standard 1× monitor — no
    // oversampling — which is what let the neon grid shimmer/moiré through. As an
    // absolute scale, high renders the scene above 1× and downscales (SSAA),
    // smoothing the grid even where the display has no extra pixels to spare.
    // Clamped to MAX_RENDER_SCALE so an extreme value can't blow up the framebuffer.
    this.renderer.setPixelRatio(Math.min(this.settings.pixelRatio, MAX_RENDER_SCALE))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.domElement.id = 'retrowaveScene'

    const parent = container || document.getElementById('retrowaveSceneContainer') || document.body
    parent.appendChild(this.renderer.domElement)

    // CSS overlay instead of a fragment shader: shader-based scanlines at 1px pitch
    // produce moiré with the 3D grid lines. The div layer is fully decoupled from
    // the 3D pipeline and never interferes with it.
    if (this.settings.scanlineEnabled) {
      const overlay = document.createElement('div')
      overlay.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;background:repeating-linear-gradient(to bottom,transparent 0px,transparent 3px,rgba(0,0,0,${this.settings.scanlineOpacity}) 3px,rgba(0,0,0,${this.settings.scanlineOpacity}) 4px)`
      parent.style.position = parent.style.position || 'relative'
      parent.appendChild(overlay)
      this.scanlineOverlay = overlay
    }

    this.scene = new Scene()
    this.scene.background = new Color(0x000009)

    this.camera = new PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      this.settings.renderDistance
    )
    this.camera.position.set(0, 3, 10.5)
    this.scene.add(this.camera)
  }

  /**
   * Builds the scene. `onProgress` (0..1) is reported across the build steps so
   * callers can fold scene loading into a loading bar; a paint yield is inserted
   * around the heavy steps so the bar actually advances on screen and the first
   * frame is ready before gameplay is revealed.
   */
  public async prepareScene(wantAnimation = false, onProgress?: (p: number) => void) {
    const report = (p: number) => onProgress?.(p)
    const yieldFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

    this.ensureDefaultHeightTexture()
    this.autoAdjustOnResize()
    this.addControls()
    this.setPostProcessing()
    this.addSkybox()
    report(0.15)
    await yieldFrame()

    await this.addSvgGraphics() // heaviest: fetches + parses the SVG assets
    report(0.55)
    await yieldFrame()

    this.addFloor()
    this.addSidewalk()
    this.addRoad()
    this.addRoadLines()
    report(0.78)
    await yieldFrame()

    this.addPalmtrees()
    this.addGroupedPyramids()
    this.addPlayer()
    report(1)

    if (wantAnimation) this.animate()
  }

  // --- Core Methods ---

  public setPostProcessing() {
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    // EffectComposer renders into its own FBO, bypassing WebGL's native MSAA.
    // SMAA is a post-process edge-detection pass that restores antialiasing.
    this.smaaPass = new SMAAPass()
    this.composer.addPass(this.smaaPass)

    this.renderer.toneMapping = ReinhardToneMapping
    this.renderer.toneMappingExposure = 1.0

    if (this.settings.bloomEnabled) {
      // softBloom lifts the whole scene subtly.
      const softBloom = new UnrealBloomPass(
        new Vector2(window.innerWidth, window.innerHeight),
        0.2,
        0.1,
        0.3
      )
      this.composer.addPass(softBloom)

      // sunBloom (disabled): a second, high-threshold (1.5) pass that only
      // catches untonemapped HDR values — the sun color is boosted 4× in
      // loadSvgGraphics specifically to clear it while nothing else does. Left
      // off to keep the captured footage clean; re-enable for the fuller look:
      //   const sunBloom = new UnrealBloomPass(
      //     new Vector2(window.innerWidth, window.innerHeight), 0.6, 0.5, 1.5)
      //   this.composer.addPass(sunBloom)
    }

    this.glitchPass = new GlitchPass()
    this.glitchPass.enabled = false
    this.composer.addPass(this.glitchPass)

    // OutputPass converts linear HDR → sRGB for display. Must be last: any pass
    // after it operates on already-tonemapped values and produces wrong results.
    this.composer.addPass(new OutputPass())

    // addPass() doesn't size a pass — bloom/SMAA were built at CSS resolution.
    // setSize multiplies by the composer's pixelRatio (= the renderer's
    // supersampling scale), so every pass runs at the full supersampled
    // resolution too, not just the scene render target.
    this.composer.setSize(window.innerWidth, window.innerHeight)
  }

  public addFloor() {
    const ps = this.settings.planeSize
    const geo = new PlaneGeometry(ps, ps)
    geo.translate(0, 110, 0)
    geo.rotateX(-Math.PI * 0.5)
    const mat = new MeshBasicMaterial({ color: 0xff1e99 })
    this.createGridMaterial(mat)
    this.scene.add(new Mesh(geo, mat))
  }

  public addRoad() {
    const ps = this.settings.planeSize
    // 800 length segments for smooth bumps. Width segments matter too: the
    // crest-rotation shader samples height per-vertex with a lateral skew, so
    // with only edge vertices the GPU interpolates straight across and a
    // rotated bump renders as two edge peaks with a diagonal saddle between.
    // 16 divisions (~0.75 units) let the rotated crest curve across the road.
    const geo = new PlaneGeometry(12, ps, 16, 800)
    geo.translate(0, 110, 0.1)
    geo.rotateX(-Math.PI * 0.5)

    const mat = new MeshBasicMaterial({
      color: 0x00f2ff,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    })
    this.applyHeightShader(mat, 'road')
    this.scene.add(new Mesh(geo, mat))
  }

  public addRoadLines() {
    const ps = this.settings.planeSize
    const lines = [
      new PlaneGeometry(0.15, ps, 1, 800).translate(-5.2, 110, 0.2).rotateX(-Math.PI * 0.5),
      new PlaneGeometry(0.15, ps, 1, 800).translate(5.2, 110, 0.2).rotateX(-Math.PI * 0.5),
      new PlaneGeometry(0.05, ps, 1, 800).translate(-1.8, 110, 0.2).rotateX(-Math.PI * 0.5),
      new PlaneGeometry(0.05, ps, 1, 800).translate(1.8, 110, 0.2).rotateX(-Math.PI * 0.5),
    ]
    const merged = BufferGeometryUtils.mergeGeometries(lines)
    const mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
    this.applyHeightShader(mat, 'roadLines')
    this.scene.add(new Mesh(merged, mat))
  }

  public addSidewalk() {
    const ps = this.settings.planeSize
    const tops = [
      new PlaneGeometry(8, ps, 1, 800).translate(-10, 110, 0.5).rotateX(-Math.PI * 0.5),
      new PlaneGeometry(8, ps, 1, 800).translate(10, 110, 0.5).rotateX(-Math.PI * 0.5),
    ]
    const mergedTops = BufferGeometryUtils.mergeGeometries(tops)
    const topMat = new MeshBasicMaterial({
      color: 0x1be9ff,
      side: DoubleSide,
    })
    this.createGridMaterial(topMat, 'vec3(0.0)', true)
    this.scene.add(new Mesh(mergedTops, topMat))

    const curbs = [
      new PlaneGeometry(0.5, ps, 1, 800)
        .translate(0.06, 110, 6)
        .rotateX(-Math.PI * 0.5)
        .rotateZ(Math.PI * 0.49),
      new PlaneGeometry(0.5, ps, 1, 800)
        .translate(0.44, 110, -6)
        .rotateX(-Math.PI * 0.5)
        .rotateZ(Math.PI * 0.49),
    ]
    const mergedCurbs = BufferGeometryUtils.mergeGeometries(curbs)
    const curbMat = new MeshBasicMaterial({
      color: 0x1be9ff,
      side: DoubleSide,
    })
    curbMat.customProgramCacheKey = () => 'curb'
    curbMat.onBeforeCompile = (s) => {
      const shader = s as ThreeShader
      shader.uniforms.speed = { value: this.animationSpeed }
      shader.uniforms.time = { value: 0 }
      // Grid lines repeat every 1.0 in coord = every 2/speed in time.
      shader.scrollTimePeriod = 2 / this.animationSpeed
      this.addTrackUniforms(shader)
      shader.vertexShader = `
        uniform float speed;
        uniform float time;
        varying vec3 vPos;
        ${this.TRACK_VERTEX_HEADER}
        ${shader.vertexShader}
      `
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPos = transformed;
        ${this.trackVertexChunk(false)}`
      )
      shader.fragmentShader = `
        uniform float speed;
        uniform float time;
        varying vec3 vPos;
        ${shader.fragmentShader}
      `
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        #include <opaque_fragment>
        float coord = vPos.z / 2.0 - time * speed * 0.5;
        float fw = max(fwidth(coord), 0.01);
        float grid = abs(fract(coord - 0.5) - 0.5) / fw;
        float l = min(grid, 1.0);
        float distFade = smoothstep(5.0, 15.0, fw);
        l = mix(l, 1.0, distFade);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0), l);
        `
      )
      this.materialShaders.push(shader)
    }
    this.scene.add(new Mesh(mergedCurbs, curbMat))
  }

  public addPalmtrees() {
    const trunk = new CylinderGeometry(0.25, 0.125, 10, 5, 4, true).translate(0, 5, 0)
    const geos: BufferGeometry[] = [trunk]

    for (let i = 0; i < 35; i++) {
      const leaf = new CircleGeometry(1.25, 4)
      leaf.translate(0, 1.25, 0)
      leaf.rotateX(-Math.PI * 0.5)
      leaf.scale(0.25, 1, MathUtils.randFloat(1, 1.5))
      ;(leaf.attributes.position as BufferAttribute).setY(0, 0.25)
      leaf.rotateX(MathUtils.randFloatSpread(Math.PI * 0.5))
      leaf.rotateY(MathUtils.randFloat(0, Math.PI * 2))
      leaf.translate(0, 10, 0)
      geos.push(leaf)
    }

    const merged = BufferGeometryUtils.mergeGeometries(geos)
    merged.rotateZ(MathUtils.degToRad(-1.5))

    // All palms share one draw call. The vertex shader scrolls instances by
    // wrapping Z via mod(), so only palmCount instances exist regardless of track length.
    const instGeo = new InstancedBufferGeometry()
    instGeo.index = merged.index
    instGeo.attributes = merged.attributes

    const pos: number[] = []
    for (let i = 0; i < this.settings.palmCount; i++) {
      const x = i % 2 === 0 ? -10 : 10
      pos.push(x, 0, i * this.settings.palmSpacing - 60)
    }
    instGeo.setAttribute('instPosition', new InstancedBufferAttribute(new Float32Array(pos), 3))
    instGeo.instanceCount = this.settings.palmCount

    const mat = new MeshBasicMaterial({
      color: 0x01872d,
      side: DoubleSide,
      wireframe: true,
      transparent: true,
      opacity: 0.2,
    })
    mat.onBeforeCompile = (s) =>
      this.prepareShader(s as ThreeShader, 600, 500, '1.0', '0.8', true, true)
    this.scene.add(new Mesh(instGeo, mat))
  }

  public addGroupedPyramids() {
    const geos: BufferGeometry[] = []
    const pc = this.settings.pyramidCount
    for (let i = 0; i < pc; i++) {
      const threshold = Math.floor(pc * 0.67)
      const size = this.randomize(i < threshold ? 5 : 3, i < threshold ? 25 : 8, 'int')
      const x = this.randomize(i % 2 === 0 ? -70 : 15, i % 2 === 0 ? -15 : 70, 'float')
      const z = this.randomize(0, 80, 'float')
      const rot = this.randomize(0, 2, 'float')

      if (!this.checkPositionHistory(size, x, z)) {
        geos.push(new ConeGeometry(size, size, 4, 1, true, rot).translate(x, 0, z))
        this.positionHistory.push({ size, positionX: x, positionZ: z })
      }
    }

    const merged = BufferGeometryUtils.mergeGeometries(geos)
    const instGeo = new InstancedBufferGeometry()
    instGeo.index = merged.index
    instGeo.attributes = merged.attributes

    const instPosArr: number[] = []
    for (let i = 0; i < this.settings.pyramidInstances; i++) {
      instPosArr.push(0, 0, i * 260)
    }
    instGeo.setAttribute(
      'instPosition',
      new InstancedBufferAttribute(new Float32Array(instPosArr), 3)
    )
    instGeo.instanceCount = this.settings.pyramidInstances

    const mat = new MeshBasicMaterial({ color: 0x000000 })
    mat.onBeforeCompile = (s) =>
      this.prepareShader(s as ThreeShader, 950, 945, '1.0', '3.0', false, true)
    const wire = new MeshBasicMaterial({
      color: 0x1be9ff,
      wireframe: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
    })
    wire.onBeforeCompile = (s) =>
      this.prepareShader(s as ThreeShader, 950, 945, '1.01', '3.0', false, true)

    const g = new Group()
    g.add(new Mesh(instGeo, mat), new Mesh(instGeo, wire))
    this.scene.add(g)
  }

  // --- Shader Toolbox ---

  private createGridMaterial(
    m: MeshBasicMaterial,
    fillColor = 'mix(vec3(0.0, 0.75, 0.0), vec3(0.0), smoothstep(0.0, 0.0, abs(vPos.x)))',
    followTrack = false
  ) {
    m.customProgramCacheKey = () => `${fillColor}_${followTrack}`
    m.onBeforeCompile = (s) => {
      const shader = s as ThreeShader

      shader.uniforms.speed = { value: this.animationSpeed }
      shader.uniforms.time = { value: 0 }
      // Grid lines repeat every 1.0 in coord = every 2/speed in time.
      shader.scrollTimePeriod = 2 / this.animationSpeed
      if (followTrack) this.addTrackUniforms(shader)

      shader.vertexShader = `
      uniform float speed;
      uniform float time;
      varying vec3 vPos;
      ${followTrack ? this.TRACK_VERTEX_HEADER : ''}
      ${shader.vertexShader}
    `
      // vPos is captured before the lateral displacement so the grid pattern
      // stays world-anchored (aligned with the floor) while the geometry snakes
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
       vPos = transformed;
       ${followTrack ? this.trackVertexChunk(false) : ''}`
      )

      shader.fragmentShader = `
      uniform float speed;
      uniform float time;
      varying vec3 vPos;

      float line(vec3 p, float w, vec3 s){
          vec2 coord = p.xz / s.xz;
          coord.y -= time * speed * 0.5;
          vec2 fw = max(fwidth(coord * w), vec2(0.01));
          vec2 grid = abs(fract(coord - 0.5) - 0.5) / fw;
          float lineVal = min(grid.x, grid.y);
          float distFade = smoothstep(5.0, 15.0, max(fw.x, fw.y));
          return mix(min(lineVal, 1.0), 1.0, distFade);
      }
      ${shader.fragmentShader}
    `
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
      #include <opaque_fragment>
      float l = line(vPos, 1.0, vec3(2.0));
      vec3 fillCol = ${fillColor};
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fillCol, l);
      vec2 fwCheck = fwidth(vPos.xz / vec2(2.0));
      float fwMag = max(fwCheck.x, fwCheck.y);
      gl_FragColor.rgb *= 1.0 / (1.0 + max(0.0, fwMag - 1.0));
      gl_FragColor.rgb = clamp(gl_FragColor.rgb, 0.0, 1.0);
      `
      )

      this.materialShaders.push(shader)
    }
  }

  private prepareShader(
    shader: ThreeShader,
    v1: number,
    v2: number,
    y = '1.0',
    sc = '3.0',
    flip = false,
    followTrack = false
  ) {
    shader.uniforms.speed = { value: this.animationSpeed }
    shader.uniforms.time = { value: 0 }
    // Instances wrap their z every v1 world units = every v1/speed in time.
    shader.scrollTimePeriod = v1 / this.animationSpeed
    if (followTrack) this.addTrackUniforms(shader)

    const val1 = v1.toFixed(1)
    const val2 = v2.toFixed(1)
    const scale = sc
    const scaleY = y

    // Scenery follows the road's lateral offset, evaluated per-vertex at the
    // FINAL world z (after instance placement). Per-vertex matters for merged
    // clusters like the pyramids, which span ~240 world units of z within one
    // instance: a single per-instance shift would leave the cluster's far end
    // misaligned with the road by the full curve swing.
    const followChunk = `
      float distToTime = totalWorldDist / ${this.animationSpeed.toFixed(1)};
      float sampleU = trackProgress + (latency / distToTime) + (5.0 - transformed.z) / totalWorldDist;
      sampleU = clamp(sampleU, 0.0, 1.0);
      transformed.x += texture2D(heightMap, vec2(sampleU, 0.5)).g;
    `

    shader.vertexShader = `
        uniform float speed;
        uniform float time;
        attribute vec3 instPosition;
        varying vec3 vInstPos;
        ${followTrack ? this.TRACK_VERTEX_HEADER : ''}
        ${shader.vertexShader}
    `
    shader.vertexShader = shader.vertexShader.replace(
      `#include <begin_vertex>`,
      `
      #include <begin_vertex>
      ${flip ? 'transformed.x *= sign(instPosition.x);' : ''}
      vec3 ip = instPosition;
      ip.z = mod(ip.z + time * speed, ${val1}) - ${val2};
      transformed *= ${scale};
      transformed.y *= ${scaleY};
      transformed += ip;
      ${followTrack ? followChunk : ''}
      `
    )
    this.materialShaders.push(shader)
  }

  // --- Track Data & Height Displacement ---

  public setTrackData(heights: number[], centerXs: number[], rolls: number[], duration: number) {
    this.trackDuration = duration

    const segCount = heights.length
    // Keep the full-resolution track on the CPU. Player physics samples these
    // directly, and the height-texture window is refilled from them — so nothing
    // is ever downsampled regardless of song length.
    this.trackHeights = Float32Array.from(heights)
    this.trackCenterX = Float32Array.from(centerXs)
    this.trackRoll = Float32Array.from(rolls)

    // R = height, G = lateral road center offset, B = bank slope (tan), A unused.
    // The texture is a sliding WINDOW over the track (HEIGHT_WINDOW_TEXELS wide),
    // not the whole track — so it never hits maxTextureSize and never aliases.
    const maxSize = this.renderer.capabilities.maxTextureSize
    const w = Math.max(1, Math.min(HEIGHT_WINDOW_TEXELS, segCount, maxSize))
    this.windowTexels = w
    this.windowStartSeg = -1 // force the first refill
    this.windowData = new Float32Array(w * 4)
    this.heightTexture = new DataTexture(this.windowData, w, 1, RGBAFormat, FloatType)
    this.heightTexture.minFilter = LinearFilter
    this.heightTexture.magFilter = LinearFilter
    this.heightTexture.wrapS = ClampToEdgeWrapping
    this.heightTexture.wrapT = ClampToEdgeWrapping
    this.heightTexture.needsUpdate = true

    this.trackProgress = 0
    this.updateHeightWindow() // fill the initial window at the track start
  }

  /**
   * Refills the sliding height-texture window around the current trackProgress and
   * recomputes the window-relative progress / world-distance the displacement
   * shader consumes. Because the texture only spans the window, the existing
   * shader formula `sampleU = trackProgress + (5 - z) / totalWorldDist` produces
   * window-local UVs verbatim once it's fed `windowProgress` and `windowWorldDist`
   * — no GLSL change. The window holds full-resolution data, so the road no longer
   * aliases on long tracks. Called once per frame from updateTime().
   */
  private updateHeightWindow() {
    const data = this.windowData
    const w = this.windowTexels
    const segCount = this.trackHeights.length
    if (!data || w <= 1 || segCount <= 1) {
      this.windowProgress = 0
      this.windowWorldDist = 1
      return
    }

    const totalWorldDist = this.trackDuration * this.animationSpeed
    const worldPerSeg = totalWorldDist / (segCount - 1)

    const playerSegF = this.trackProgress * (segCount - 1)
    const maxStart = Math.max(0, segCount - w)
    const start = Math.min(maxStart, Math.max(0, Math.round(playerSegF) - HEIGHT_WINDOW_BEHIND))

    // Only re-upload when the window actually slides (integer texel). Refill 1:1
    // from the full-res arrays — no decimation, no aliasing.
    if (start !== this.windowStartSeg) {
      this.windowStartSeg = start
      for (let j = 0; j < w; j++) {
        const src = start + j
        const o = j * 4
        data[o] = this.trackHeights[src]
        data[o + 1] = this.trackCenterX[src]
        data[o + 2] = this.trackRoll[src]
      }
      if (this.heightTexture) this.heightTexture.needsUpdate = true
    }

    // localProgress: where the player sits inside the window, in [0,1] texel space.
    // Derivation: global seg of a vertex = start + localU·(w-1), and we need that
    // to equal playerSegF + (5-z)/worldPerSeg, which holds when
    // windowProgress = (playerSegF - start)/(w-1) and windowWorldDist = (w-1)·worldPerSeg.
    this.windowProgress = (playerSegF - start) / (w - 1)
    this.windowWorldDist = (w - 1) * worldPerSeg
  }

  public updateTime(progress: number) {
    this.trackProgress = progress
    // FIX: Apply latency lookahead to the shader time only
    if (this.trackDuration > 0) {
      this.time = progress * this.trackDuration
    }
    this.updateHeightWindow()
  }

  /** Latency-corrected, linearly interpolated lookup into a per-segment track array */
  private sampleTrackArray(arr: Float32Array, progress: number): number {
    // Apply latency to physical sampling too, so the player moves early/late
    // consistently with the displaced geometry
    const latencyProgress = this.trackDuration > 0 ? this.latency / this.trackDuration : 0
    const sampleP = Math.max(0, Math.min(1, progress + latencyProgress))

    const n = arr.length
    if (n <= 1) return 0

    const idx = sampleP * (n - 1)
    const lo = Math.floor(idx)
    const hi = Math.min(lo + 1, n - 1)
    const t = idx - lo
    return arr[lo] * (1 - t) + arr[hi] * t
  }

  public getTrackHeightAt(progress: number): number {
    return this.sampleTrackArray(this.trackHeights, progress) * this.HEIGHT_SCALE
  }

  /** Lateral offset of the road center (world units) at the given progress */
  public getTrackCenterXAt(progress: number): number {
    return this.sampleTrackArray(this.trackCenterX, progress)
  }

  /** Bank slope (tan of the roll angle) at the given progress, positive = right side down */
  public getTrackRollAt(progress: number): number {
    return this.sampleTrackArray(this.trackRoll, progress)
  }

  /**
   * Pitch angle (radians) of the terrain under the player: positive on rising
   * track, negative on falling. Central difference a couple of world units
   * fore/aft, using the same latency-corrected sampling as the height.
   */
  public getTrackPitchAt(progress: number): number {
    const totalDist = this.trackDuration * this.animationSpeed
    if (totalDist <= 0) return 0

    const sampleDist = 2.0 // World units fore and aft
    const dp = sampleDist / totalDist
    const hAhead = this.getTrackHeightAt(Math.min(1, progress + dp))
    const hBehind = this.getTrackHeightAt(Math.max(0, progress - dp))
    return Math.atan2(hAhead - hBehind, sampleDist * 2)
  }

  /**
   * Heading angle (radians) of the track at the given progress: positive when
   * curving toward +X. Central difference, same sampling as the height.
   */
  public getTrackYawAt(progress: number): number {
    const totalDist = this.trackDuration * this.animationSpeed
    if (totalDist <= 0) return 0

    const sampleDist = 2.0
    const dp = sampleDist / totalDist
    const xAhead = this.getTrackCenterXAt(Math.min(1, progress + dp))
    const xBehind = this.getTrackCenterXAt(Math.max(0, progress - dp))
    return Math.atan2(xAhead - xBehind, sampleDist * 2)
  }

  private ensureDefaultHeightTexture() {
    if (this.heightTexture) return
    const data = new Float32Array([0, 0, 0, 0])
    this.heightTexture = new DataTexture(data, 1, 1, RGBAFormat, FloatType)
    this.heightTexture.minFilter = LinearFilter
    this.heightTexture.magFilter = LinearFilter
    this.heightTexture.wrapS = ClampToEdgeWrapping
    this.heightTexture.wrapT = ClampToEdgeWrapping
    this.heightTexture.needsUpdate = true
  }

  /** Uniforms shared by every material that follows the track displacement */
  private addTrackUniforms(shader: ThreeShader) {
    shader.uniforms.heightMap = { value: this.heightTexture }
    shader.uniforms.trackProgress = { value: 0 }
    shader.uniforms.heightScale = { value: this.HEIGHT_SCALE }
    shader.uniforms.totalWorldDist = { value: 1.0 }
    shader.uniforms.latency = { value: this.latency }
  }

  private readonly TRACK_VERTEX_HEADER = `
    uniform sampler2D heightMap;
    uniform float trackProgress;
    uniform float heightScale;
    uniform float totalWorldDist;
    uniform float latency; // Latency in seconds
  `

  /**
   * GLSL displacing `transformed` by the track texture at the vertex's Z.
   * R channel = bump height (optional), G channel = lateral road center offset.
   *
   * Offset logic:
   * 1. sampleU represents the track time at the vertex Z
   * 2. Base time is trackProgress
   * 3. Physical offset: (PlayerZ - VertexZ) / TotalDist
   * 4. Latency offset: latency / Duration (TotalDist/Speed)
   */
  private trackVertexChunk(withHeight: boolean) {
    // Rotate bumps to stay perpendicular to the local road direction (like a
    // speed bump on a curved street). Height is sampled by Z only, so a bump
    // crest would otherwise run straight along world X even mid-curve. Skewing
    // the height lookup by the vertex's lateral offset times the local road
    // heading (slope of centerX, central difference over ±2 world units)
    // turns the crest with the curve. transformed.x is still the geometry's
    // local x here — the lateral displacement is added afterwards.
    const heightChunk = `
        // Wide (+-8 unit) slope baseline: at a curve inflection the local
        // slope flips sign quickly, and sampling it tightly made bumps on
        // either side of the flip rotate opposite ways (or twist mid-bump).
        // The wide baseline averages through the inflection so nearby bumps
        // transition gradually through zero rotation instead.
        float duSlope = 8.0 / totalWorldDist;
        float cxAhead = texture2D(heightMap, vec2(clamp(sampleU + duSlope, 0.0, 1.0), 0.5)).g;
        float cxBehind = texture2D(heightMap, vec2(clamp(sampleU - duSlope, 0.0, 1.0), 0.5)).g;
        float roadSlope = (cxAhead - cxBehind) / 16.0;
        float uHeight = clamp(sampleU + (transformed.x * roadSlope) / totalWorldDist, 0.0, 1.0);
        transformed.y += texture2D(heightMap, vec2(uHeight, 0.5)).r * heightScale;
        // Superelevation: B channel holds tan(bank), positive = right turn.
        // Pivot on the INNER (low) edge — half road width is 6.0 — so the low
        // side stays at ground level and only the outer side raises; nothing
        // ever dips below the flat underlayer.
        transformed.y += 6.0 * abs(trackTexel.b) - transformed.x * trackTexel.b;`

    return `
        float distToTime = totalWorldDist / ${this.animationSpeed.toFixed(1)};
        float latencyOffset = latency / distToTime;

        float sampleU = trackProgress + latencyOffset + (5.0 - transformed.z) / totalWorldDist;
        sampleU = clamp(sampleU, 0.0, 1.0);

        vec4 trackTexel = texture2D(heightMap, vec2(sampleU, 0.5));
        ${withHeight ? heightChunk : ''}
        transformed.x += trackTexel.g;`
  }

  private applyHeightShader(
    mat: MeshBasicMaterial,
    cacheKey: string,
    opts: { grid?: boolean; height?: boolean } = {}
  ) {
    const { grid = false, height = true } = opts
    mat.customProgramCacheKey = () => `height_${cacheKey}_${grid}_${height}`
    mat.onBeforeCompile = (s) => {
      const shader = s as ThreeShader
      shader.uniforms.speed = { value: this.animationSpeed }
      shader.uniforms.time = { value: 0 }
      // Grid scroll (when grid) repeats every 1.0 in coord = every 2/speed in time.
      shader.scrollTimePeriod = 2 / this.animationSpeed
      this.addTrackUniforms(shader)

      shader.vertexShader = `
        ${this.TRACK_VERTEX_HEADER}
        ${grid ? 'varying vec3 vPos;' : ''}
        ${shader.vertexShader}
      `

      // For the grid variant, vPos is captured AFTER displacement so the
      // pattern bends together with the geometry
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        ${this.trackVertexChunk(height)}
        ${grid ? 'vPos = transformed;' : ''}`
      )

      if (grid) {
        shader.fragmentShader = `
        uniform float speed;
        uniform float time;
        varying vec3 vPos;

        float line(vec3 p, float w, vec3 s){
            vec2 coord = p.xz / s.xz;
            coord.y -= time * speed * 0.5;
            vec2 fw = max(fwidth(coord * w), vec2(0.01));
            vec2 grid = abs(fract(coord - 0.5) - 0.5) / fw;
            float lineVal = min(grid.x, grid.y);
            float distFade = smoothstep(5.0, 15.0, max(fw.x, fw.y));
            return mix(min(lineVal, 1.0), 1.0, distFade);
        }
        ${shader.fragmentShader}
      `
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `
        #include <opaque_fragment>
        float l = line(vPos, 1.0, vec3(2.0));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.0), l);
        vec2 fwCheck = fwidth(vPos.xz / vec2(2.0));
        float fwMag = max(fwCheck.x, fwCheck.y);
        gl_FragColor.rgb *= 1.0 / (1.0 + max(0.0, fwMag - 1.0));
        gl_FragColor.rgb = clamp(gl_FragColor.rgb, 0.0, 1.0);
        `
        )
      }
      this.materialShaders.push(shader)
    }
  }

  private addPlayer() {
    const shape = new Shape()
    shape.moveTo(0, 1.0)
    shape.lineTo(-0.6, -0.5)
    shape.lineTo(-0.2, -0.3)
    shape.lineTo(0, -0.5)
    shape.lineTo(0.2, -0.3)
    shape.lineTo(0.6, -0.5)
    shape.closePath()

    const geo = new ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false })
    geo.rotateX(-Math.PI / 2)

    const mat = new MeshBasicMaterial({
      color: 0xff00ff,
      wireframe: true,
    })
    const mesh = new Mesh(geo, mat)
    this.playerGroup = new Group()
    this.playerGroup.add(mesh)
    this.playerGroup.position.set(0, 0.5, 5)
    this.scene.add(this.playerGroup)
  }

  // --- Collectibles ---

  private collectibleMeshes: {
    mesh: Mesh
    lane: number
    segIndex: number
    alive: boolean
    baseZ: number
  }[] = []
  private collectibleTotalWorldDist: number = 0

  public spawnCollectibles(segments: TrackSegment[], duration: number) {
    this.collectibleMeshes.forEach((c) => {
      if (c.mesh.parent) c.mesh.parent.remove(c.mesh)
    })
    this.collectibleMeshes = []

    const totalWorldDist = duration * this.animationSpeed
    this.collectibleTotalWorldDist = totalWorldDist
    const geo = new IcosahedronGeometry(0.4, 1)
    const mat = new MeshBasicMaterial({
      color: 0x00ffff,
      wireframe: true,
    })

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      if (seg.collectible === null) continue

      const segProgress = i / (segments.length - 1)
      const baseZ = 5 - segProgress * totalWorldDist
      // The road under a collectible always shows this segment's centerX
      // (both scroll consistently), so a spawn-time offset stays correct
      const x = seg.collectibleLane * LANE_WIDTH + (seg.centerX || 0)
      // Seat on the banked surface (pivot on the inner edge, matching the shader)
      const roll = seg.roll || 0
      const y =
        seg.y * this.HEIGHT_SCALE +
        1.2 +
        6 * Math.abs(roll) -
        seg.collectibleLane * LANE_WIDTH * roll

      const mesh = new Mesh(geo, mat.clone())
      mesh.position.set(x, y, baseZ)
      this.scene.add(mesh)
      this.collectibleMeshes.push({
        mesh,
        lane: seg.collectibleLane,
        segIndex: i,
        alive: true,
        baseZ,
      })
    }
  }

  public getCollectibles() {
    return this.collectibleMeshes
  }

  public updateCollectibles(time: number) {
    const scrollOffset = this.trackProgress * this.collectibleTotalWorldDist
    for (const c of this.collectibleMeshes) {
      if (!c.alive) continue
      c.mesh.position.z = c.baseZ + scrollOffset
      c.mesh.rotation.y = time * 2
      c.mesh.rotation.x = Math.sin(time * 3 + c.segIndex) * 0.3
    }
  }

  public removeCollectible(index: number) {
    const c = this.collectibleMeshes[index]
    if (c && c.alive) {
      c.alive = false
      c.mesh.visible = false
    }
  }

  // --- Animation & Control ---

  public renderFrame() {
    if (!this.renderer) return

    if (this.fpsCounterIsActive && this.stats) this.stats.update()

    this.materialShaders.forEach((s) => {
      // Feed the scroll a time wrapped to the shader's repeat period. `this.time`
      // grows to the song's full duration; left unwrapped, `time * speed` blows
      // past mediump fragment precision on long tracks and the grid judders.
      // Wrapping by an exact multiple of the scroll period is visually seamless.
      if (s.uniforms.time) {
        s.uniforms.time.value = s.scrollTimePeriod ? this.time % s.scrollTimePeriod : this.time
      }
      // Displacement reads the sliding height window: window-relative progress and
      // world-distance make the unchanged shader formula sample window-local UVs.
      if (s.uniforms.trackProgress) s.uniforms.trackProgress.value = this.windowProgress
      if (s.uniforms.totalWorldDist) s.uniforms.totalWorldDist.value = this.windowWorldDist
      if (s.uniforms.latency) s.uniforms.latency.value = this.latency
      if (s.uniforms.heightMap) s.uniforms.heightMap.value = this.heightTexture
    })

    if (this.sunGroup) {
      const pulse = 1 + Math.sin(this.time * 1.5) * 0.03
      const s = this.sunBaseScale * pulse
      this.sunGroup.scale.set(s, -s, 1)
    }

    this.target.x = (1 - this.mouse.x) * 0.00065
    this.target.y = (1 - this.mouse.y) * 0.0003
    this.camera.rotation.x += 0.05 * (this.target.y - this.camera.rotation.x)
    this.camera.rotation.y += 0.05 * (this.target.x - this.camera.rotation.y)

    this.composer.render()
  }

  public animate = () => {
    if (!this.renderer) return
    requestAnimationFrame(this.animate)
    this.clock.update()
    this.time += this.clock.getDelta()
    this.renderFrame()
  }

  public randomize(min: number, max: number, type: 'int' | 'float' | 1 | 2): number {
    return type === 'float'
      ? Math.random() * (max - min) + min
      : Math.floor(Math.random() * (max - min + 1)) + min
  }

  private checkPositionHistory(size: number, x: number, z: number): boolean {
    return this.positionHistory.some(
      (i) =>
        x + size > i.positionX - i.size &&
        z + size > i.positionZ - i.size &&
        x - size < i.positionX + i.size &&
        z - size < i.positionZ + i.size
    )
  }

  private autoAdjustOnResize() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(window.innerWidth, window.innerHeight)
      this.composer.setSize(window.innerWidth, window.innerHeight)
      this.smaaPass?.setSize(window.innerWidth, window.innerHeight)
    })
  }

  public addControls() {
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX - window.innerWidth / 2
      this.mouse.y = e.clientY - window.innerHeight / 2
    })
  }

  public addSkybox() {
    const loader = new CubeTextureLoader()
    const tex = loader.load(this.skybox)
    tex.colorSpace = SRGBColorSpace
    this.scene.background = tex
  }

  public async addSvgGraphics() {
    for (const f of this.svgFiles) {
      await this.loadSvgGraphics(f[0], f[1], f[2], f[3], f[4], f[5])
    }
  }

  private async loadSvgGraphics(
    url: string,
    px: number,
    py: number,
    pz: number,
    sc: number,
    name: string
  ) {
    const loader = new SVGLoader()
    const data = await loader.loadAsync(url)
    const group = new Group()

    data.paths.forEach((p) => {
      const col = p.userData?.style.fill
      if (col && col !== 'none') {
        const mat = new MeshBasicMaterial({
          color: new Color().setStyle(col),
          side: DoubleSide,
          depthWrite: false,
          transparent: (p.userData?.style.fillOpacity ?? 1) < 1,
          opacity: p.userData?.style.fillOpacity ?? 1,
        })
        SVGLoader.createShapes(p).forEach((s) => group.add(new Mesh(new ShapeGeometry(s), mat)))
      }
    })

    group.scale.set(sc, -sc, 1)
    group.position.set(px, py, pz)
    const box = new Box3().setFromObject(group)
    const size = new Vector3()
    box.getSize(size)
    group.position.x -= size.x / 2
    group.position.y += size.y / 2
    group.name = name

    if (name === 'sun') {
      this.sunGroup = group
      this.sunBaseScale = sc
      // sunBloom's threshold is 1.5. SVG colors land at ≤1.0 in linear (pre-tone-mapped)
      // space, which falls below it. The 4× boost pushes the sun to ~4.0 so it
      // blooms selectively without affecting any other element in the scene.
      group.traverse((child) => {
        if (child instanceof Mesh && child.material instanceof MeshBasicMaterial) {
          child.material.color.multiplyScalar(4.0)
        }
      })
    }

    this.scene.add(group)
  }

  public destroy() {
    if (this.glitchTimeout) clearTimeout(this.glitchTimeout)
    this.renderer.dispose()
    this.renderer.domElement.remove()
    if (this.scanlineOverlay) this.scanlineOverlay.remove()
    this.scene.clear()
  }
}
