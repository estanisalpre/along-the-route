import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import { MercatorCoordinate } from 'maplibre-gl'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Capa custom de MapLibre que renderiza un modelo 3D (glTF/GLB) en una
 * posición fija del mapa, usando Three.js compartiendo el mismo contexto
 * WebGL. Es la prueba de concepto antes de conectarlo a que siga la ruta de
 * un vehículo real — por ahora solo prueba que el modelo carga, se ubica y
 * se orienta bien sobre el mapa (globo + día/noche incluidos).
 *
 * Basado en el patrón oficial de MapLibre/Mapbox para agregar modelos 3D:
 * https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-with-threejs/
 */
export class ThreeVehicleLayer implements CustomLayerInterface {
  id: string
  type = 'custom' as const
  renderingMode = '3d' as const

  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera()
  private renderer: THREE.WebGLRenderer | null = null
  private map: MapLibreMap | null = null

  private modelUrl: string
  private lngLat: [number, number]
  /** Rumbo actual del vehículo (grados, eje Y — 0 = orientación "de fábrica" del modelo). */
  private headingDeg = 0
  private modelRoot: THREE.Object3D | null = null
  /** En metros reales — el modelo se escala para que se vea a ese tamaño en el mundo. */
  private modelLengthMeters: number
  /**
   * Tamaño en pantalla (px) al zoom más alejado permitido del mapa (`minZoom`).
   * Cuanto más grande, más "prominente" se ve el vehículo alejado del todo —
   * nunca debería desaparecer.
   */
  private sizeAtMinZoomPx: number
  /**
   * Tamaño en pantalla (px) al zoom más cercano permitido del mapa (`maxZoom`).
   * Entre este piso y el de arriba, el tamaño se interpola según qué tan
   * alejado/cercano esté el zoom actual — así el vehículo se ve cada vez más
   * grande a medida que te alejás, en vez de quedarse en un tamaño fijo. Una
   * vez que la escala real (según {@link modelLengthMeters}) supera este piso
   * interpolado, se usa la escala real y sigue creciendo con el zoom.
   */
  private sizeAtMaxZoomPx: number
  /** Rotación fija para corregir hacia dónde "mira" el modelo importado (grados, eje Y — rumbo/heading). */
  private headingOffsetDeg: number
  /**
   * Rotación fija para corregir el eje "arriba" del modelo (grados, eje X). Muchos assets se
   * exportan desde herramientas con convención Z-up (ej. Blender) sin convertir a Y-up, que es
   * lo que espera glTF/Three.js — sin esto el vehículo aparece parado de punta en vez de acostado
   * sobre la calle.
   */
  private uprightCorrectionDeg: number

  constructor(
    id: string,
    modelUrl: string,
    lngLat: [number, number],
    options: {
      modelLengthMeters?: number
      headingOffsetDeg?: number
      uprightCorrectionDeg?: number
      sizeAtMinZoomPx?: number
      sizeAtMaxZoomPx?: number
    } = {},
  ) {
    this.id = id
    this.modelUrl = modelUrl
    this.lngLat = lngLat
    this.modelLengthMeters = options.modelLengthMeters ?? 5
    this.headingOffsetDeg = options.headingOffsetDeg ?? 0
    this.uprightCorrectionDeg = options.uprightCorrectionDeg ?? 0
    this.sizeAtMinZoomPx = options.sizeAtMinZoomPx ?? 40
    this.sizeAtMaxZoomPx = options.sizeAtMaxZoomPx ?? 10
  }

  /** Actualiza posición y rumbo en vivo (ej. cuadro a cuadro mientras el vehículo viaja una ruta). */
  setState(lngLat: [number, number], headingDeg: number) {
    this.lngLat = lngLat
    this.headingDeg = headingDeg
  }

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(0, -70, 100).normalize()
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 1.2)
    fill.position.set(0, 70, 100).normalize()
    this.scene.add(fill)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7))

    new GLTFLoader().load(
      this.modelUrl,
      (gltf) => {
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const size = new THREE.Vector3()
        box.getSize(size)
        const longestSide = Math.max(size.x, size.y, size.z) || 1
        const scale = this.modelLengthMeters / longestSide
        gltf.scene.scale.setScalar(scale)
        gltf.scene.rotation.x = (this.uprightCorrectionDeg * Math.PI) / 180
        // La matriz de cámara que armamos cambia de magnitud drásticamente
        // entre zooms (para ubicar el modelo en el mundo real) — el cálculo
        // automático de frustum culling de Three.js no siempre da abasto con
        // eso y en algunos zooms decide (mal) que el modelo está fuera de
        // vista y lo deja de dibujar. Se desactiva: el modelo es chico y
        // ya sabemos exactamente dónde ponerlo, no hace falta ese cálculo.
        gltf.scene.traverse((child) => {
          child.frustumCulled = false
        })
        this.scene.add(gltf.scene)
        this.modelRoot = gltf.scene
      },
      undefined,
      (error) => console.error(`[ThreeVehicleLayer:${this.id}] no se pudo cargar el modelo`, error),
    )

    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl,
      antialias: true,
    })
    this.renderer.autoClear = false
  }

  render(_gl: WebGL2RenderingContext, options: { modelViewProjectionMatrix: ArrayLike<number> }) {
    if (!this.renderer || !this.map) return

    if (this.modelRoot) {
      // El rumbo se resta (no se suma): el mundo mercator espeja el eje Y
      // (ver el .scale(scale, -scale, scaleZ) más abajo), y eso invierte el
      // sentido en que una rotación local en Y se ve desde afuera.
      this.modelRoot.rotation.y = ((this.headingOffsetDeg - this.headingDeg) * Math.PI) / 180
    }

    // La matriz que entrega MapLibre en esta versión espera coordenadas en
    // "world size" (píxeles de mundo a este zoom = 512 * 2^zoom), no en el
    // espacio normalizado [0,1] que devuelve MercatorCoordinate directamente
    // — hay que reescalar por ese factor o el modelo termina a millones de
    // unidades fuera de la pantalla en cuanto se hace zoom.
    const worldSize = 512 * 2 ** this.map.getZoom()

    const merc = MercatorCoordinate.fromLngLat(this.lngLat, 0)
    // "worldSize" son básicamente píxeles de pantalla a este zoom, así que esto
    // es aproximadamente píxeles-por-metro. A zoom bajo un vehículo de tamaño
    // real terminaría en un puñado de píxeles (invisible) — se lo mantiene en
    // un piso de tamaño en pantalla que crece a medida que te alejás (interpolado
    // entre sizeAtMaxZoomPx y sizeAtMinZoomPx), y una vez que el tamaño real lo
    // supera (zoom alto), se usa la escala real y sigue creciendo con el zoom.
    const trueScale = merc.meterInMercatorCoordinateUnits() * worldSize
    const minZoom = this.map.getMinZoom()
    const maxZoom = this.map.getMaxZoom()
    const zoomFraction =
      maxZoom > minZoom ? Math.min(1, Math.max(0, (this.map.getZoom() - minZoom) / (maxZoom - minZoom))) : 0
    const floorSizePx = this.sizeAtMinZoomPx + (this.sizeAtMaxZoomPx - this.sizeAtMinZoomPx) * zoomFraction
    const minScale = floorSizePx / this.modelLengthMeters
    const scale = Math.max(trueScale, minScale)

    const m = new THREE.Matrix4().fromArray(options.modelViewProjectionMatrix as unknown as number[])

    // El eje "vertical" (altura/Z) de esta matriz no es conforme con X/Y: un metro de
    // altura no mueve la pantalla lo mismo que un metro de distancia en el plano del
    // suelo — la proporción depende del pitch/bearing de la cámara en ese momento. Se
    // corrige comparando cuánto mueve la pantalla la columna Y (ya sabemos que es
    // correcta) contra cuánto mueve la columna Z, y reescalando Z para igualarlas.
    // Cerca de pitch 0 (mirando casi derecho hacia abajo) esta relación se vuelve
    // inestable (divide por un número casi cero y explota) — pero a esa vista la
    // altura del modelo casi no se ve de todos modos, así que directamente se
    // acota a 1 (mismo trato que X/Y) para evitar el estiramiento espurio.
    const e = m.elements
    const groundScreenEffect = Math.hypot(e[4], e[5])
    const verticalScreenEffect = Math.hypot(e[8], e[9])
    const verticalCorrection =
      verticalScreenEffect > 1e-6 ? Math.min(1, groundScreenEffect / verticalScreenEffect) : 1
    const scaleZ = scale * verticalCorrection

    const l = new THREE.Matrix4()
      .makeTranslation(merc.x * worldSize, merc.y * worldSize, merc.z * worldSize * verticalCorrection)
      .scale(new THREE.Vector3(scale, -scale, scaleZ))

    this.camera.projectionMatrix = m.multiply(l)

    // A ciertos zoom/pitch (sobre todo con el mapa bien alejado) la profundidad
    // que le toca al vehículo cae justo por fuera del plano de recorte lejano
    // de esta matriz — la GPU lo descarta enterito aunque su posición en X/Y
    // sea perfectamente visible. Comprimir la fila Z de la matriz (solo afecta
    // profundidad/recorte, no la posición en pantalla) le da margen de sobra.
    const DEPTH_SAFETY_FACTOR = 0.5
    const p = this.camera.projectionMatrix.elements
    p[2] *= DEPTH_SAFETY_FACTOR
    p[6] *= DEPTH_SAFETY_FACTOR
    p[10] *= DEPTH_SAFETY_FACTOR
    p[14] *= DEPTH_SAFETY_FACTOR

    this.renderer.resetState()
    this.renderer.render(this.scene, this.camera)
  }
}
