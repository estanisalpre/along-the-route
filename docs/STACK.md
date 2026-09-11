# Stack técnico — Por la Ruta

> Complementa [DESIGN.md](./DESIGN.md). Acá se detalla *con qué* se construye cada pieza, pensando en que el objetivo final es vender el juego empaquetado en **Steam**.

## Resumen en una línea

**TypeScript + MapLibre GL JS + React (Vite) para el juego, empaquetado con Tauri (Rust) para Steam, con datos de mapa/routing propios (no dependencia runtime de una API paga de terceros).**

---

## Lenguaje y build

| Pieza | Elección | Por qué |
|---|---|---|
| Lenguaje | **TypeScript** | Tipado fuerte para modelar `Vehicle`, `Trip`, `Route`, etc. sin errores de forma silenciosos; ecosistema web = encaja directo con MapLibre |
| Bundler/dev server | **Vite** | Arranque instantáneo, HMR, config mínima; estándar de facto para apps TS modernas |
| Gestor de paquetes | **pnpm** | Más rápido y liviano en disco que npm/yarn para un proyecto que va a acumular dependencias (mapa, UI, empaquetado) |
| Testing | **Vitest** | Corre en el mismo entorno que Vite, sin config extra; se usa sobre todo para el núcleo de simulación (`computeTripState`, interpolación, economía) que debe ser 100% testeable sin DOM |

## Mapa y renderizado

| Pieza | Elección | Por qué |
|---|---|---|
| Motor de mapa | **MapLibre GL JS** | BSD, sin costo, sin límites de uso — ver comparativa completa en DESIGN.md §24 |
| Formato de tiles | **PMTiles** (vector tiles empaquetados en un solo archivo) | Se puede servir localmente (incluso desde el propio bundle del juego) sin necesidad de un servidor de tiles corriendo; ideal para distribución offline en Steam |
| Generación de tiles (una sola vez, en desarrollo) | **Planetiler** sobre un extracto OSM de Argentina (`argentina-latest.osm.pbf` de Geofabrik) | Genera el `.pmtiles` que se empaqueta con el juego; no es una dependencia runtime, corre una vez como paso de build/pipeline de datos |
| Estilo visual del mapa | Estilo propio en formato MapLibre Style Spec (JSON), diseñado a mano o con **Maputnik** (editor visual de estilos, open source) | Da identidad propia al mapa en vez de usar el look genérico de OSM/Google |

## Routing (cálculo de rutas)

| Pieza | Elección | Por qué |
|---|---|---|
| MVP / prototipo (semanas 1-2) | **OpenRouteService** (API pública hosted, gratis) | Cero infraestructura para arrancar a dibujar rutas reales de inmediato |
| Arquitectura objetivo (antes de vender) | Rutas **pre-calculadas en tiempo de desarrollo** con OSRM/ORS para cada par de ciudades del juego, guardadas como JSON estático dentro del propio juego | Con un mapa de ciudades curado (5-10 al inicio, decenas después), el número de pares origen-destino es finito y chico — no hace falta un motor de routing corriendo en el juego del jugador. Elimina un proceso sidecar entero y su mantenimiento. |
| Si más adelante se necesita routing dinámico (ciudades/puntos de carga generados, no solo pares fijos) | **OSRM self-hosted**, compilado sobre el extracto de Argentina, embebido como binario **sidecar** que Tauri lanza y detiene junto con la app | BSD, sin costo, y Tauri tiene soporte de primera clase para empaquetar y ejecutar binarios sidecar multiplataforma |

## Frontend / UI de gestión

| Pieza | Elección | Por qué |
|---|---|---|
| Framework de UI | **React 18 + TypeScript** | Ecosistema más grande para paneles de dashboard, listas, modales (mercado de cargas, ficha de vehículo, ranking); fácil de encontrar ejemplos/soporte al ser el más usado |
| Estado global | **Zustand** | Mucho más liviano que Redux, encaja bien con un "núcleo de simulación" que vive fuera de React y que la UI solo *lee*; evita acoplar la lógica de negocio a hooks de React |
| Estilos | **Tailwind CSS** | Iteración rápida de UI de dashboard sin mantener archivos CSS separados por componente |
| Iconografía | **Lucide icons** (o similar, SVG libres) para UI; el 🚚 del vehículo puede ser un ícono SVG propio rotable, no un emoji real en producción (el emoji es solo para las maquetas de este documento) |

> Nota: el **núcleo de simulación** (`RouteSimulation`, `EconomySystem`, `RoutingSystem`, `SaveSystem`) se escribe como paquete TypeScript puro, sin importar React en ningún archivo de esa carpeta. React solo consume su output. Esto es lo que permite testearlo con Vitest sin DOM y, el día de mañana, reusarlo en un backend Node si hiciera falta para el modo online.

## Persistencia (guardado local)

| Pieza | Elección | Por qué |
|---|---|---|
| MVP | Archivo **JSON versionado**, escritura atómica (archivo temporal + rename) | Simple, fácil de inspeccionar/debuggear a mano durante desarrollo |
| Si el historial de transacciones/viajes crece mucho | Migrar a **SQLite** vía `tauri-plugin-sql` (usa `rusqlite` del lado Rust) | Consultas eficientes sobre historial largo sin cargar todo el save a memoria; migración se hace detrás de la interfaz `SaveRepository` (DESIGN.md §26) sin tocar el resto del código |

## Empaquetado y distribución (Steam)

| Pieza | Elección | Por qué |
|---|---|---|
| Shell de escritorio | **Tauri 2.x** | Usa el WebView del sistema operativo en vez de empaquetar un Chromium completo (como Electron) → binarios de ~10-20MB en vez de ~150MB+, menor RAM, y tiene soporte nativo de sidecars y de multiplataforma (Windows/macOS/Linux) relevante para publicar en Steam en más de una plataforma |
| Integración con Steam | **`steamworks-rs`** (binding Rust del Steamworks SDK) invocado desde comandos Tauri (logros, stats, cloud saves de Steam si se quiere más adelante) | Tauri ya usa Rust en el shell nativo, así que el binding de Steamworks encaja sin agregar un runtime extra (a diferencia de Electron, donde requeriría un paquete Node nativo de Steamworks) |
| Cuenta de desarrollador | Steamworks (fee de Steam Direct, ~US$100 por título) | Requisito administrativo de Valve, no técnico — mencionado para no olvidarlo en la planificación |
| CI/CD de build | **GitHub Actions** con jobs por plataforma, subiendo el build final vía `steamcmd` | Automatiza generar los 3 instaladores (Win/Mac/Linux) y subir el *depot* a Steam sin pasos manuales repetidos en cada release |

## Control de versiones y organización del repo

- **Git** (ya en uso) + GitHub.
- Estructura de monorepo simple (sin necesidad de herramientas de monorepo tipo Nx/Turborepo en esta escala):
  ```
  /src
    /core        (simulación pura: Trip, Route, Economy, Save — sin React)
    /map         (wrapper de MapLibre, capas, cámara)
    /ui          (componentes React, dashboard, paneles)
  /src-tauri     (shell nativo Rust, config de Tauri, sidecars)
  /data-pipeline (scripts de generación de tiles/rutas a partir del extracto OSM — no corre en el juego del jugador)
  /docs          (este documento, DESIGN.md)
  ```

## Explícitamente fuera de alcance por ahora

- **Backend/servidor propio**: no se necesita para el single player. Se aborda recién en la fase de ranking/online (DESIGN.md §26-27), y en ese momento el candidato natural es algo liviano (ej. **Fastify o Axum** + **Postgres**) expuesto como API REST de solo consulta/publicación de `Trip`s y `CompanyStatsSnapshot` — sin tick rate ni WebSocket, por las razones ya explicadas en DESIGN.md §27.
- **Analítica/telemetría** (ej. Sentry, PostHog): revisar si hace falta recién cerca del lanzamiento, no bloquea el desarrollo del MVP.
- **Localización a otros idiomas**: el juego arranca en español (Argentina); internacionalización se evalúa después de validar el juego base.
