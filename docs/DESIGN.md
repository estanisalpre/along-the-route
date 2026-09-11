# Por la Ruta — Diseño del proyecto

> Documento de diseño (GDD + TDD) previo a cualquier implementación. Cubre los 25 puntos solicitados. Todo lo que sigue es una propuesta de partida: ajustable a medida que el prototipo lo confirme o lo contradiga.

---

## 1. Género

**Management / logistics tycoon con progresión idle y mapa geográfico real.** No es un simulador de conducción, no hay control manual del vehículo, no hay mundo 3D. El jugador es el dueño/gerente de la empresa: acepta cargas, compra vehículos, define rutas y observa la operación desde un mapa. El "juego" ocurre en las decisiones de gestión; el mapa es la ventana de feedback visual, no una superficie de control.

Referencia de género más cercana: **Airline Manager / TransportTycoon-lite**, con el idle-progression de juegos como *Idle Miner Tycoon* (avance mientras el juego está cerrado, recompensa satisfactoria al volver).

## 2. Nombre propuesto

El repositorio ya se llama **"Por la Ruta"** — lo tomo como título de trabajo, porque además comunica bien el concepto (rutas argentinas reales) y funciona en español neutro.

Alternativas por si se quiere explorar variantes: *Ruta Nacional*, *Transportes del Sur*, *La Empresa de la Ruta*, *Camino Real*, *Che Logística*. Ninguna mejora claramente a "Por la Ruta", así que mi recomendación es quedarse con el nombre actual salvo que haya una razón (trademark, SEO) para cambiarlo.

## 3. Core loop

```
Ver mercado de cargas
        ↓
Elegir carga (origen → destino, pago, requisitos)
        ↓
Elegir vehículo disponible
        ↓
Aceptar y enviar (departure_timestamp se fija)
        ↓
El vehículo avanza (con juego abierto: animado en tiempo real
                     con juego cerrado: reconstruido al volver)
        ↓
Llegada → resumen de viaje (ingresos - gastos)
        ↓
Cobrar
        ↓
Reinvertir (nuevo vehículo, mejora, contratar conductor)
        ↓
(repetir)
```

Sesión típica: 3–7 minutos. Entrar, revisar qué llegó, cobrar, mandar los vehículos libres a nuevas cargas, cerrar.

## 4. Meta loop (progresión)

| Etapa | Hito | Desbloquea |
|---|---|---|
| 1 | Camioneta, 1 vehículo, viajes cortos | Ciudades cercanas (ej. Buenos Aires ↔ Rosario ↔ La Plata) |
| 2 | Varias camionetas | Contratar conductores (el vehículo ya no requiere al "jugador" como conductor implícito, sino que tiene un costo de salario) |
| 3 | Primer camión | Viajes de larga distancia, cargas más pesadas |
| 4 | Semirremolques | Cargas especializadas (refrigerada, frágil, peligrosa) |
| 5 | Depósitos propios | Múltiples bases, reduce tiempos muertos, permite mantenimiento in-situ |
| 6 | Red logística nacional | Decenas de vehículos, contratos empresariales recurrentes, reputación regional |

La progresión se gatilla por **hitos económicos** (dinero acumulado, cantidad de viajes completados, reputación) más que por tiempo jugado, para no penalizar ritmos de juego distintos.

## 5. Diseño del mapa

Cuatro niveles de zoom conceptuales, resueltos por el propio motor de tiles vectoriales (no hay que programar "niveles" a mano, son zoom levels continuos de MapLibre):

```
País        (zoom ~4-5)   → 🇦🇷 Argentina completa, íconos de ciudad
Provincia   (zoom ~6-8)   → agrupamiento de ciudades cercanas
Ciudad      (zoom ~9-12)  → nombre de rutas nacionales/provinciales visibles
Calle       (zoom ~13+)   → geometría real de calles/autopistas/accesos
```

Elementos visuales sobre el mapa:
- Marcadores de ciudad (clickeables → mercado de cargas local, depósito, etc.)
- Polylines de ruta activa (la geometría real devuelta por el motor de routing)
- Íconos de vehículo 🚚 animados sobre la polyline, rotados según *bearing*
- Al seleccionar un vehículo: panel lateral con su info (carga, progreso, ETA, ganancia estimada)

Estilo visual recomendado: **basemap propio, estilizado** (no el estilo por defecto de Google/OSM) generado a partir de datos OSM — esto además evita problemas de licencia de "no modificar el look oficial de Google Maps" y le da identidad propia al juego (paleta cálida, ciudades destacadas, rutas nacionales resaltadas como si fuera un mapa de juego de mesa/logística).

## 6. Arquitectura del sistema de mapas (`MapSystem`)

```
MapSystem
 ├─ MapRenderer        (wrapper sobre MapLibre GL JS; no conoce de vehículos ni rutas de negocio)
 ├─ LayerManager        (capas: ciudades, rutas activas, vehículos, overlays de selección)
 ├─ CameraController     (fly-to ciudad, fly-to vehículo, zoom in/out)
 └─ MapEventBus          (emite: onCityClick, onVehicleClick, onRouteClick → consumidos por UI/Company)
```

`MapSystem` **no sabe nada de economía ni de simulación de viajes**. Solo sabe dibujar: puntos, líneas y marcadores con una posición `{lat, lon, bearing}` que le llega ya calculada. Esto es clave para que el sistema de mapas sea reemplazable (ver riesgos) sin tocar la lógica de negocio.

## 7. Arquitectura del routing (`RoutingSystem`)

```
RoutingSystem
 ├─ RouteProvider (interfaz)         → getRoute(origin, destination, profile): RouteData
 │    ├─ OsrmProvider (implementación primaria, self-hosted)
 │    └─ OrsProvider (implementación alternativa/fallback)
 ├─ RouteCache                        → cachea RouteData por (origin, destination, profile) en disco/DB local
 └─ RouteData { geometry[], segments[], distance_total_km, duration_estimate_s, bearing_at[] }
```

Punto de diseño central: **el vehículo nunca llama a una API de routing directamente**. Recibe un `RouteData` ya resuelto. Esto desacopla completamente el motor de routing de la simulación (se puede cambiar OSRM por GraphHopper sin tocar `VehicleSystem`), y permite cachear rutas entre ciudades: como el mapa tiene un número finito de ciudades (5–10 en el MVP, después decenas), **la mayoría de las rutas se calculan una sola vez y se reutilizan para siempre** (salvo que se quiera variedad de origen/destino exacto dentro de una ciudad).

## 8. Sistema de movimiento (`RouteSimulation`)

El movimiento es **puramente funcional y determinista**: dado un `Trip` (ruta + timestamps + velocidad) y un instante `t`, se calcula la posición. No hay un "loop de física" corriendo — hay una función pura:

```ts
function computeTripState(trip: Trip, now: number): TripState {
  const elapsedSeconds = (now - trip.departureTimestamp) / 1000;
  const distanceTravelled = Math.min(
    trip.averageSpeedKmh * (elapsedSeconds / 3600),
    trip.route.distanceTotalKm
  );
  if (distanceTravelled >= trip.route.distanceTotalKm) {
    return { status: 'arrived', distanceTravelled: trip.route.distanceTotalKm, position: trip.route.destination };
  }
  const { position, bearing } = interpolateAlongRoute(trip.route, distanceTravelled);
  return { status: 'in_transit', distanceTravelled, position, bearing,
           progress: distanceTravelled / trip.route.distanceTotalKm };
}
```

Esta misma función se usa para:
- Renderizar el vehículo mientras el juego está abierto (se llama cada frame o cada segundo)
- Reconstruir el estado al volver a abrir el juego (se llama una vez con `now = timestamp actual`)
- Calcular si el viaje ya terminó y generar el resumen de llegada

## 9. Sistema de velocidad

MVP: **velocidad promedio constante por tipo de vehículo** (`average_speed_kmh`), sin variabilidad. Se guarda como atributo del vehículo, no de la ruta.

| Vehículo | Velocidad promedio |
|---|---|
| Utilitario | 90 km/h |
| Camioneta | 90 km/h |
| Camión | 80 km/h |
| Camión pesado | 75 km/h |
| Semirremolque | 70 km/h |

Diseño para el futuro (no MVP): cada `RouteSegment` puede tener un `roadType` (autopista, ruta nacional, ruta provincial, calle urbana) con un multiplicador de velocidad, y el sistema puede sumar modificadores por clima/tráfico/evento. La fórmula base `distance / speed` se mantiene; lo que cambia es que `speed` deja de ser una constante y pasa a ser una función de segmento + evento activo. Diseñar `computeTripState` desde el día 1 para aceptar un `speedProfile` en lugar de un número fijo evita un refactor grande después.

## 10. Sistema de interpolación

Pipeline de preprocesamiento (se hace **una vez** cuando llega un `RouteData` nuevo del motor de routing, no en cada frame):

1. El motor de routing devuelve una polyline de N puntos `[[lat, lon], ...]`.
2. Se calcula la **distancia acumulada** en cada punto (haversine punto a punto), generando un array paralelo `cumulativeDistanceKm[i]`.
3. Se calcula el **bearing** entre cada punto consecutivo (`atan2` sobre delta de lat/lon proyectado), generando `bearingAt[i]`.

En tiempo real, dado un `distanceTravelled`:

1. Búsqueda binaria en `cumulativeDistanceKm` para encontrar el segmento `[i, i+1]` que lo contiene.
2. `t = (distanceTravelled - cumulativeDistanceKm[i]) / (cumulativeDistanceKm[i+1] - cumulativeDistanceKm[i])`
3. `position = lerp(point[i], point[i+1], t)` (interpolación lineal simple; a la escala de un segmento entre dos puntos de polyline, el error de no usar great-circle es despreciable)
4. `bearing = lerp_angular(bearingAt[i], bearingAt[i+1], t)` para que la rotación del ícono también sea suave y no salte en cada punto.

Esto da **velocidad visual constante respecto a distancia real**, no respecto a "porcentaje de puntos" (que sería incorrecto: un polyline urbano tiene puntos muy juntos y uno de autopista puntos muy separados).

## 11. Sistema offline (determinismo)

Principio rector: **nunca simular "en background"**. El juego cerrado no ejecuta nada. Todo se reconstruye la próxima vez que se abre, a partir de:

```
posición(t) = f(departure_timestamp, route_data, average_speed, ahora)
```

Al abrir el juego:
1. Cargar todos los `Trip` con `status = 'in_transit'`.
2. Para cada uno, `computeTripState(trip, Date.now())`.
3. Si `status === 'arrived'`: generar el resumen de llegada (ingresos, gastos, ganancia), pasar el trip a `status = 'completed_pending_collect'`, mostrar la pantalla "🚚 VIAJE FINALIZADO".
4. Si sigue `in_transit`: pintar el vehículo en la posición interpolada correspondiente y mostrar el panel "VEHÍCULOS EN RUTA".

No existe un estado intermedio ambiguo: todo trip tiene una función de estado computable en O(log n) sobre su geometría, para cualquier `t`.

## 12. Sistema de timestamps

Cada `Trip` guarda:

```ts
interface Trip {
  id: string;
  vehicleId: string;
  routeId: string;
  departureTimestamp: number;   // epoch ms, UTC
  estimatedArrivalTimestamp: number; // derivado, cacheado para UI (no autoritativo)
  distanceTotalKm: number;
  averageSpeedKmh: number;
  status: 'in_transit' | 'arrived_uncollected' | 'completed';
  cargoId: string;
}
```

`estimatedArrivalTimestamp` es solo para mostrar en UI ("llegada estimada: 22:35"); el cálculo autoritativo siempre parte de `departureTimestamp` + distancia/velocidad, nunca de comparar contra el estimado guardado (evita arrastrar errores de redondeo).

**Sobre manipulación del reloj del sistema:** en un juego single-player, offline, sin servidor, no hay forma de impedir 100% que alguien adelante el reloj de su PC para "hacer llegar" un viaje antes. Es un riesgo aceptado y estándar en el género (todos los idle games tienen este vector). Mitigaciones razonables sin servidor:
- Guardar también `lastSeenTimestamp` (el mayor `now` observado hasta el momento) y **clampear**: si `now < lastSeenTimestamp`, tratar `now = lastSeenTimestamp` para todos los cálculos (esto anula el beneficio de atrasar el reloj para "pausar" un viaje, aunque no impide adelantarlo).
- Adelantar el reloj sí beneficia al jugador (cobra antes) — es el mismo trade-off que aceptan Cookie Clicker, Idle Miner Tycoon, etc. No vale la pena construir server-authoritative time solo para esto en el MVP; si más adelante hay multiplayer o leaderboards, ahí sí se necesita un timestamp de servidor.

## 13. Sistema económico (`EconomySystem`)

```ts
interface Transaction {
  id: string;
  timestamp: number;
  type: 'cargo_income' | 'fuel' | 'toll' | 'maintenance' | 'salary' | 'purchase' | 'insurance';
  amount: number; // positivo o negativo
  relatedTripId?: string;
  relatedVehicleId?: string;
}
```

Ingresos: pago de carga al completar el viaje (definido al aceptar el contrato, no cambia salvo eventos futuros).

Gastos calculados al completar el viaje: `combustible = distancia_km * consumo_vehiculo * precio_combustible`, `peajes = suma de peajes de la ruta (estimado fijo por corredor en MVP)`, `mantenimiento = función de km recorridos acumulados / confiabilidad del vehículo`.

Diseño de balance: la ganancia neta debe depender de **elegir bien** (vehículo adecuado al peso/distancia, no siempre el que más paga tiene mejor margen), no solo de aceptar todo. Esto ya lo pide el brief explícitamente.

## 14. Sistema de vehículos (`VehicleSystem`)

```ts
interface Vehicle {
  id: string;
  type: 'utilitario' | 'camioneta' | 'camion' | 'camion_pesado' | 'semirremolque';
  capacityKg: number;
  averageSpeedKmh: number;
  fuelConsumptionPerKm: number;
  reliability: number;       // 0-1, afecta probabilidad/costo de mantenimiento
  purchaseCost: number;
  currentValue: number;      // deprecia con uso
  currentCityId: string;     // ubicación cuando está disponible
  status: 'available' | 'in_transit' | 'maintenance';
  driverId?: string;
}
```

## 15. Sistema de cargas (`CargoSystem`)

```ts
interface Cargo {
  id: string;
  category: 'paqueteria' | 'repuestos' | 'alimentos' | 'granos' | 'carne'
          | 'materiales_construccion' | 'maquinaria' | 'electronica'
          | 'carga_refrigerada' | 'carga_fragil';
  weightKg: number;
  volumeM3: number;
  originCityId: string;
  destinationCityId: string;
  payout: number;
  deadlineTimestamp?: number;
  requiredVehicleTypes: Vehicle['type'][];
}
```

Mercado de cargas: generación periódica (ej. cada X minutos reales o al abrir el juego) de un pool de cargas disponibles por ciudad, con variedad de rentabilidad para forzar decisiones (carga que paga mucho pero requiere vehículo caro / carga de bajo peso pero alto margen).

## 16. Sistema de rutas (`Route` / `RouteSegment`)

```ts
interface Route {
  id: string;                 // ej. "buenos-aires__rosario"
  originCityId: string;
  destinationCityId: string;
  distanceTotalKm: number;
  geometry: [number, number][];      // [lat, lon][]
  cumulativeDistanceKm: number[];
  bearingAt: number[];
  segments: RouteSegment[];
  roadNamesEncountered: string[];    // ej. ["Av. 9 de Julio", "RN 9", "RN A012"]
}

interface RouteSegment {
  roadName?: string;    // "Ruta Nacional 9", si el motor de routing lo expone
  roadType: 'urbana' | 'acceso' | 'autopista' | 'ruta_nacional' | 'ruta_provincial';
  distanceKm: number;
}
```

Los nombres de ruta (RN 9, RN 7, etc.) vienen directamente de los tags OSM (`ref`/`name`) que devuelve el motor de routing en el `step`/`leg` de cada instrucción — no hay que mantenerlos a mano, solo mapearlos al modelo de datos propio.

## 17. Sistema de guardado (`SaveSystem`)

```ts
interface SaveGame {
  version: number;               // para migraciones
  company: Company;
  vehicles: Vehicle[];
  drivers: Driver[];
  activeTrips: Trip[];
  cargoMarket: Cargo[];
  transactions: Transaction[];   // historial, posiblemente paginado/truncado
  routeCache: Record<string, Route>;
  lastSeenTimestamp: number;
}
```

Requisitos: escritura atómica (escribir a archivo temporal + rename, nunca sobreescribir directo, para sobrevivir un corte de luz/crash a mitad de guardado), autosave periódico + al cerrar, versionado con función de migración explícita por versión (no "ignorar campos que falten").

## 18. Diseño del MVP

Alcance exacto ya está bien definido por el brief; lo confirmo tal cual:

- 5 ciudades (Buenos Aires, Rosario, Córdoba, La Plata, Santa Fe — todas cercanas entre sí y bien cubiertas en OSM, para minimizar tiempo de cálculo de rutas y maximizar densidad de decisiones tempranas)
- 10–15 rutas posibles entre esas ciudades
- 3 vehículos (utilitario, camioneta, camión)
- 5 tipos de carga
- Mapa + routing + polyline + ícono animado + bearing
- Sistema de viajes con timestamps + reconstrucción offline
- Dashboard mínimo + mercado de cargas + historial + compra de vehículos

**Criterio de éxito del MVP** (el mismo que da el brief, textual): mandar una camioneta de Buenos Aires a Rosario, verla moverse por calles→autopista→ruta, cerrar el juego, reabrirlo y encontrarla en el punto correcto o ya llegada, cobrar, comprar otro vehículo.

## 19. Arquitectura del proyecto (comparación tecnológica)

| Opción | A favor | En contra |
|---|---|---|
| **Godot** | Motor liviano, bueno para 2D/UI de juego, gratis | No tiene binding maduro de MapLibre/mapas vectoriales reales; habría que reimplementar carga de tiles, proyección, zoom continuo y renderizado de vector tiles a mano, o embeber un WebView (complejidad extra sin beneficio real) |
| **Unity** | Ecosistema grande, asset store | Mismo problema que Godot con mapas reales; el SDK de Mapbox para Unity está deprecado/discontinuado en la práctica; también añade licenciamiento y peso de motor que no se necesita para una UI de gestión |
| **Web app (TS + MapLibre GL JS)** | MapLibre GL JS **es** una librería web nativa — cero fricción de integración, WebGL ya optimizado para tiles vectoriales, ecosistema OSM pensado para esto | Requiere empaquetar para distribución de escritorio si se quiere vender fuera del navegador |
| **Electron** | Empaquetado de la web app para escritorio, maduro | Binarios pesados (~150MB+), mayor consumo de RAM |
| **Tauri** | Empaquetado liviano (usa el WebView del sistema, binarios de ~10-20MB), Rust en el shell nativo, buen candidato para Steam | Ecosistema algo más joven que Electron, pero ya estable para este caso de uso |

**Recomendación: Web app en TypeScript con MapLibre GL JS para el mapa, lógica de negocio en un núcleo independiente del framework de UI (frontend-agnostic, testeable sin DOM), empaquetada con Tauri para distribución de escritorio (Steam/itch.io) y publicable también como PWA.**

Razón principal: el requisito central del juego — mapa real con routing y vehículos moviéndose por geometría real — **es exactamente lo que MapLibre GL JS hace nativamente**. Forzarlo dentro de Godot/Unity significa reconstruir con mucho esfuerzo algo que ya existe, gratis y probado, en el ecosistema web. La capa de UI de gestión (paneles, dashboard, mercado de cargas) es además un caso de uso natural para HTML/CSS, más rápido de iterar que UI de motor de juego tradicional.

## 20. Estructuras de datos

Ya definidas en las secciones 8, 12–17 (`Trip`, `Vehicle`, `Cargo`, `Route`, `RouteSegment`, `Transaction`, `SaveGame`). Faltan `City`, `Company`, `Driver`:

```ts
interface City {
  id: string;
  name: string;
  province: string;
  lat: number;
  lon: number;
  hasDepot: boolean;
}

interface Company {
  id: string;
  name: string;
  cash: number;
  reputation: number;
  homeCityId: string;
}

interface Driver {
  id: string;
  name: string;
  salaryPerTrip: number;
  skillLevel: number;   // afecta futuro: velocidad, riesgo de eventos
  assignedVehicleId?: string;
}
```

## 21. Riesgos técnicos

- **Cambiar de proveedor de tiles/routing más adelante**: mitigado por el desacoplamiento de `MapSystem`/`RoutingSystem` descrito en 6 y 7 — son interfaces, no implementaciones concretas incrustadas en la lógica de negocio.
- **Recalcular una ruta cambia la geometría de un viaje ya guardado**: una vez que un `Trip` arranca, debe congelar su propio `RouteData` completo (no una referencia al `Route` "vivo" que podría re-cachearse distinto). Si no, un viaje en curso podría "saltar" si el motor de routing cambia de versión.
- **Rendimiento con muchos vehículos y geometrías largas**: la interpolación es O(log n) por vehículo por frame gracias a la búsqueda binaria sobre distancia acumulada; a la escala de "decenas de vehículos" (etapa 6) esto es trivial incluso en dispositivos modestos.
- **Cobertura y calidad de datos OSM en Argentina**: en general buena en corredores principales (RN 9, RN 7, etc.) pero puede tener huecos en zonas rurales; mitigable empezando el MVP con ciudades bien mapeadas (todas las del MVP lo están).
- **Licenciamiento de mapas/routing a futuro** (ver punto 24): resuelto adoptando desde el día 1 una arquitectura basada en datos propios (extracto OSM de Argentina + motor self-hosted), evitando quedar atado a un proveedor que cambie precios o ToS.

## 22. Riesgos de diseño

- **Balance del progreso offline**: si el offline rinde demasiado, no hay razón para jugar activamente; si rinde muy poco, se siente un "timer molesto". Mitigación: el offline debe ser *exactamente* lo que hubiera pasado si el juego seguía abierto (determinismo, sección 11), nunca un multiplicador especial — la recompensa por volver es la satisfacción de ver el resultado, no un bonus artificial.
- **Evitar dark patterns de espera monetizada**: no diseñar timers que solo se salten pagando; el ritmo del juego debe salir de la duración real de los viajes (horas, no días), consistente con el pilar "sesiones de 5 minutos, varias veces al día".
- **Mercado de cargas plano**: si todas las cargas tienen ganancia similar, no hay decisión real. Necesita curva de riesgo/recompensa desde el MVP (aunque sea simple) para que "aceptar todo" no sea la estrategia óptima.

## 23. Recomendación tecnológica (resumen)

**Web app en TypeScript, MapLibre GL JS para el mapa, núcleo de simulación (`RouteSimulation`, `EconomySystem`, etc.) como módulo puro sin dependencias de UI/DOM (testeable con Vitest/Jest sin browser), persistencia en SQLite local o archivo JSON versionado, empaquetado con Tauri para distribución de escritorio.**

## 24. Recomendación de APIs de mapas y routing

### Comparación

| Proveedor | Precio/límites (2026) | Licencia GL JS | Uso en juego comercial | Cobertura Argentina | Dependencia de internet |
|---|---|---|---|---|---|
| **Google Maps Platform** | Free tier limitado, luego pago por request; [ToS](https://cloud.google.com/maps-platform/terms/maps-service-terms) prohíbe cachear/pre-fetch/rehost de tiles, geocodes y direcciones | Propietario | Formalmente permitido pero **incompatible con guardar geometría de ruta offline** (la prohibición de cachear contenido de Maps choca directo con el pilar "el viaje sigue si cierro el juego") | Buena | Total (no funciona offline, contradice un pilar del juego) |
| **Mapbox** | 50.000 map loads gratis/mes en GL JS, luego pago por load; requiere licencia comercial separada para ciertos usos de datos | **Mapbox GL JS v2+ es propietario** (solo hasta v1.13 era BSD, de ahí nació el fork MapLibre) | Usable, pero atado a facturación recurrente por siempre y a un fork cerrado del renderer | Buena | Alta (tiles y estilo se sirven desde su CDN salvo que se pague self-hosting) |
| **HERE** | Free tier acotado (transacciones/mes), luego pago | Propietario | Usable, buen routing para camiones (perfiles de peso/altura), pero mismo problema de dependencia recurrente | Aceptable, menos foco en LatAm que Google/OSM | Alta |
| **MapLibre GL JS** | Gratis, sin límites | **BSD-3 (libre, sin restricciones comerciales)** | Sin restricciones — es solo el renderer, no un proveedor de datos | N/A (no aplica, es la librería, no los datos) | N/A (depende de dónde se sirvan los tiles) |
| **OpenStreetMap (datos)** | Gratis, licencia ODbL (atribución + compartir derivados de los *datos*, no del juego en sí) | — | Perfectamente usable en juego comercial con atribución visible ("© OpenStreetMap contributors") | Excelente en corredores principales | Ninguna si se descarga el extracto y se procesa localmente |
| **OSRM** (self-hosted) | Gratis | **BSD-2 (libre, comercial sin restricciones)** | Sin restricciones | Se genera del extracto OSM de Argentina, tan buena como el dato fuente | **Ninguna** si se embebe el binario en el propio juego |
| **GraphHopper** | Cloud desde ~US$59/mes; licencia on-premise/self-host separada (a cotizar) | Núcleo open-source (Apache 2.0) con producto cloud cerrado encima | Usable self-hosted sin costo recurrente | Buena, incluye perfiles de camión | Ninguna si se self-hostea |
| **OpenRouteService** | API pública gratis con límites de fair-use (throttling, no bloqueo comercial explícito), o self-hosted **sin límites** | Motor open-source, self-host sin fee | Excelente para self-host comercial | Buena (basado en OSM) | Ninguna si se self-hostea |

### Recomendación concreta

**Para el prototipo (semanas 1-2, máxima velocidad):**
- Mapa: MapLibre GL JS + tiles de un proveedor hosted gratuito/barato para no perder tiempo montando infraestructura (ej. MapTiler free tier o Stadia Maps free tier — ambos sirven vector tiles OSM listos para MapLibre).
- Routing: API pública hosted de **OpenRouteService** (gratis, límites de fair-use suficientes para desarrollo).

**Para el juego comercial (arquitectura objetivo):**
- Mapa: **MapLibre GL JS** (BSD, sin restricciones) + **tiles vectoriales generados una sola vez a partir de un extracto OSM de Argentina** (con Planetiler u OpenMapTiles) y **empaquetados directamente con el juego** como archivo `PMTiles` estático servido localmente. No hay CDN, no hay factura mensual, no hay ToS de terceros que puedan cambiar.
- Routing: **OSRM self-hosted**, compilado sobre el mismo extracto OSM de Argentina, corriendo como proceso local (sidecar) embebido en la propia app — Argentina es un país chico en términos de grafo vial comparado con USA/Europa, así que el binario y el dataset son perfectamente manejables para distribuir con el juego. Alternativa equivalente: OpenRouteService self-hosted si se necesitan perfiles de ruteo más configurables (peso/altura de camión) desde antes.

**Por qué esta combinación y no Google/Mapbox/HERE:** el pilar de diseño más fuerte del juego es "el viaje sigue existiendo aunque cierre el juego", lo cual ya empuja hacia una arquitectura **local-first**. Un juego que además funciona 100% offline (sin depender de ninguna API en runtime) es estrictamente mejor para el jugador, elimina cualquier riesgo de que un proveedor cambie precios/ToS años después de lanzado (el escenario que explícitamente se quiere evitar), y no tiene costo marginal por jugador. La única razón para no hacerlo así sería querer datos de tráfico en tiempo real — que el diseño actual no pide (los eventos de tráfico, si se agregan, serán simulados, no datos reales).

Atribución obligatoria en ambos casos: crédito visible a "© OpenStreetMap contributors" (y a MapLibre si se quiere) en algún panel de créditos/about — es el único requisito real de la licencia ODbL para este uso.

## 25. Roadmap de desarrollo

**Fase 1 — Núcleo mapa/movimiento** *(el corazón del juego, sin esto no hay MVP)*
1. Setup del proyecto (Vite + TS + MapLibre GL JS)
2. Mapa mostrando Argentina con 2 ciudades (Buenos Aires, Rosario) como marcadores
3. Integración con motor de routing (empezar con ORS hosted para no bloquear en infraestructura) → obtener y dibujar la polyline real BA→Rosario
4. Preprocesar la polyline: distancia acumulada + bearing por punto
5. Crear un `Vehicle` con velocidad fija, un `Trip` con `departureTimestamp = now`
6. Loop de render: cada tick, `computeTripState` y mover el ícono 🚚 interpolado + rotado
7. Guardar el `Trip` en localStorage/archivo; al recargar la página/app, reconstruir el estado desde el timestamp
8. **Criterio de cierre de fase**: cerrar y reabrir el juego con un viaje en curso, verlo aparecer en el punto correcto.

**Fase 2 — Economía y flota**
9. `Cargo` + mercado de cargas simple (lista fija o generada) por ciudad
10. Aceptar carga → elegir vehículo → enviar (conecta con lo de fase 1)
11. Resumen de viaje al llegar (ingresos - gastos) + botón cobrar
12. `Company` (dinero), compra de un segundo vehículo
13. Dashboard mínimo (dinero, flota, en ruta, ganancia hoy)
14. Expandir a 5 ciudades / 10-15 rutas / 3 tipos de vehículo / 5 tipos de carga (alcance MVP completo)

**Fases siguientes (post-MVP, no detallar aún):** conductores y salarios, depósitos y múltiples bases, eventos (tráfico/clima/cortes) simulados, contratos empresariales recurrentes, migración de routing/tiles a la arquitectura self-hosted embebida, empaquetado con Tauri para distribución.

**Fase final, después del lanzamiento single player en Steam:** ranking global y modo online/mundo compartido (secciones 26 y 27) — requiere backend propio, se aborda como proyecto separado una vez el juego base esté vendido y validado.

---

### 26. Ranking global y perfiles de transportadoras (diseño para más adelante, no MVP)

El juego arranca **single player**, pero el diseño de datos debe estar preparado desde ya para que, cuando exista sincronización online, cualquier `Company` pueda compararse contra otras sin refactor.

**Qué se rankea:** tamaño de flota (cantidad de vehículos), viajes completados (histórico total), reputación. Explícitamente **no** el dinero en caja — es común en el género no exponer el cash exacto de un jugador (evita que el ranking se convierta en "quién no gastó nada" en vez de "quién construyó la mejor operación"), y reduce la tentación de que el ranking premie acumular en vez de operar.

```ts
interface CompanyStatsSnapshot {
  companyId: string;
  companyName: string;
  fleetSize: number;
  tripsCompleted: number;
  reputation: number;
  homeCityId: string;
  updatedAt: number;
}
```

**Vista de "otras transportadoras"**: un panel donde se puede seleccionar cualquier `Company` del ranking y ver un perfil de solo lectura — nombre, flota (tipos y cantidad de vehículos, no su ubicación exacta en tiempo real todavía), reputación, ciudad base. Es información pública/vanidad, no da ventaja competitiva directa (no se ve, por ejemplo, qué carga está transportando cada vehículo ajeno).

**Implicación de arquitectura ya, aunque hoy sea single player:**
- Todo `Vehicle`, `Trip` y `Transaction` ya lleva (o debe llevar) `companyId`, aunque en el MVP solo exista una `Company` local. No modelar el juego como si "la empresa" fuera un singleton implícito.
- Los IDs (`Company.id`, `Vehicle.id`, etc.) deben generarse como UUID desde el día 1, no como contadores incrementales locales — un contador local (`vehicle_1`, `vehicle_2`) colisiona apenas exista una segunda instancia del juego en el mundo (otro jugador). Generarlos ya como UUID no cuesta nada ahora y evita una migración de datos dolorosa después.
- `SaveSystem` (sección 17) se diseña detrás de una interfaz `SaveRepository` (`load()`, `save()`, `getLeaderboard()` hoy no implementado). La implementación MVP es 100% local; el día que haya backend, se cambia la implementación de la interfaz, no los consumidores.

## 27. Visión a futuro: modo online / mundo compartido (no MVP, no bloquea el desarrollo actual)

Pilar a futuro explícito del juego: **el mapa se va "llenando" a medida que más jugadores mandan camiones**, y en algún momento se puede ver cómo los propios vehículos se cruzan con los de otras transportadoras en las mismas rutas, e incluso sufrir **congestión** cuando muchos camiones comparten el mismo tramo al mismo tiempo.

Esto es deliberadamente **la última fase del roadmap**, después de tener el juego single player completo y vendido en Steam. Lo que hay que hacer *ahora* no es construirlo, sino no diseñarse en una esquina que lo haga imposible después. Dos decisiones ya tomadas en este documento lo dejan bien encaminado:

**1. El movimiento ya es una función pura del tiempo (sección 8), no una simulación con estado mutable en cada frame.** Esto es la clave que hace viable un backend liviano: para que un jugador vea el camión de otro moviéndose, el servidor **no necesita simular nada en tiempo real** — solo necesita guardar y distribuir el mismo `Trip` inmutable (ruta + timestamp de salida + velocidad) que ya se guarda localmente hoy. Cualquier cliente, propio o ajeno, puede llamar a `computeTripState(trip, now)` para dibujar ese vehículo en su posición correcta en cualquier momento. Es decir: el "servidor de juego" de este género, a diferencia de un shooter o un MMO tradicional, puede ser básicamente **una base de datos + una API de consulta**, no un servidor de simulación con tick rate.

**2. La congestión, cuando se implemente, puede modelarse igual de determinista:** en vez de simular tráfico real, contar cuántos `Trip` activos de distintas compañías comparten un mismo `RouteSegment` en una ventana de tiempo dada, y aplicar un multiplicador de velocidad derivado de esa cuenta (ej. `speedMultiplier = clamp(1 - 0.03 * tripsCompartiendoSegmento, 0.5, 1)`). Sigue siendo una función pura calculable en el cliente a partir de datos ya existentes (los `Trip` de otras compañías que el servidor expone), no requiere un motor de tráfico real.

**Lo que sí implica tener un backend eventual (no ahora):**
- Servicio de autenticación/cuenta de jugador (mínimo: identificar una `Company` de forma única online).
- Endpoint para publicar `Trip`s nuevos y consultar `Trip`s activos "cerca" (por ciudad/corredor) de otras compañías, y el `CompanyStatsSnapshot` para el ranking (sección 26).
- Sincronización por **polling periódico**, no WebSocket/tiempo real — dado que la posición se deriva matemáticamente del timestamp, no hace falta streaming continuo; alcanza con refrescar cada cierto intervalo (ej. cada 30-60s) los `Trip`s de otras compañías visibles en el viewport actual del mapa.

**Qué NO se decide todavía:** modelo de negocio de la parte online (¿F2P con el online, pago único con single player?), moderación de nombres de compañía, anti-cheat de servidor (una vez hay ranking público comparado entre jugadores, el "reloj adelantado" de la sección 12 deja de ser inofensivo y sí necesitaría validación server-side de timestamps — anotado como riesgo a resolver en el diseño de esa fase, no ahora).

## Próximo paso concreto

Arrancar la **Fase 1, paso 1-3**: scaffolding del proyecto + mapa con MapLibre + primera llamada real a un motor de routing dibujando Buenos Aires → Rosario. Todo lo demás de este documento queda como referencia para las fases siguientes, no para implementar ahora.
