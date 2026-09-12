<div align="center">

# ⛽ Mecánica de combustible — Por la Ruta

*Complementa [MECHANICS.md](./MECHANICS.md) §2 (que ya anticipaba este sistema) con el detalle real de implementación: fórmulas, algoritmo de planificación de paradas y dónde vive cada pieza en el código.*

</div>

---

## 1. Gasolineras

**Archivo:** `src/core/gasStation.ts`

Tres marcas, con un color fijo para el mapa:

| Marca | Color |
|---|---|
| Jhell | verde `#22c55e` |
| PFY | azul `#3b82f6` |
| Carbon Gas | naranja `#f97316` |

**Generación** (`generateGasStations`): determinista, a partir de `CITIES` (se recalcula solo cuando se carga un país nuevo, en `loadCountryCities`). Por cada ciudad:

- Una gasolinera "de ciudad", corrida entre 0.4 y 2 km del punto exacto de la ciudad (dirección y distancia al azar pero deterministas, con el mismo hash-seed que ya usa `fuelPrice.ts`) — así nunca queda pegada al punto de la ciudad.
- Una de cada 6 ciudades **también** recibe una gasolinera "de ruta", ubicada a mitad de camino (punto medio simple, no geodésico) hacia la siguiente ciudad de la lista. No es literalmente "la ciudad más cercana" — comparar todas las ciudades entre sí sería caro con miles de filas — pero alcanza para que también aparezcan gasolineras sobre el camino entre ciudades, no solo pegadas a ellas.

**Precio** (`getGasStationPrice`): siempre `precio de mercado × 1.10`, redondeado. El precio de mercado (`getCurrentFuelPrice`, en `fuelPrice.ts`) ya se actualiza solo, hora a hora — no hay que hacer nada aparte para que las gasolineras "actualicen cada hora", viene gratis de ahí. Por diseño, cargar en una gasolinera **siempre** sale más caro que cargar en el garage: nunca conviene si se puede evitar.

**Capa en el mapa** (`src/map/gasStationLayer.ts`): un círculo de color por marca — **a propósito no es un ícono/símbolo**. MapLibre siempre dibuja las capas de tipo `symbol` (íconos y texto) por encima de todo lo demás, sin importar el orden en que se agreguen — es el mismo motivo por el que las etiquetas de nombre de ciudad del estilo base tapaban a los vehículos 3D (ver commits anteriores). Con un círculo sí se puede controlar el orden: se agrega antes que las capas 3D de los vehículos y nunca se mueve por encima de ellas, así los vehículos siempre quedan por encima de las gasolineras si se superponen.

---

## 2. Consumo de combustible según velocidad

**Archivo:** `src/core/fuel.ts`

Cada vehículo tiene una velocidad de fábrica (`averageSpeedKmh`) y un consumo de fábrica (`fuelConsumptionPer100Km`, L/100km) — ese consumo es el que tiene **circulando a su velocidad de fábrica**. El jugador puede pedirle que circule más lento (slider "Velocidad de crucero", 40km/h de piso, `averageSpeedKmh` de techo) para gastar menos y ganar autonomía, a costa de tardar más.

```
ratio = velocidad_crucero / velocidad_fábrica
consumo_efectivo = consumo_fábrica × (1 − MAX_SPEED_SAVINGS_FRACTION × (1 − ratio²))
```

`MAX_SPEED_SAVINGS_FRACTION = 0.3` — el ahorro por ir más lento tiene un techo del 30%, aunque se vaya al piso del slider (40km/h). Antes la caída era puramente cuadrática (`consumo_fábrica × ratio²`, sin techo), y aunque suena a aproximación física razonable (la resistencia del aire por km escala con el cuadrado de la velocidad), en la práctica un camión con tanque lleno pasaba de ~550km de rango a ~1900km solo por bajar la velocidad de crucero — ningún vehículo real gana 3-4x de autonomía por ir más despacio. Con el techo del 30%, ese mismo camión pasa de ~550km a ~695km: se nota la decisión, pero de forma creíble.

```
autonomía_km = litros_disponibles / consumo_efectivo × 100
```

El panel del vehículo (`VehicleDetailPanel.tsx`) muestra DOS autonomías con la velocidad de crucero elegida, para no confundirlas: la real, con el combustible que tiene en ese momento (`autonomyKm(currentFuelLiters, ...)` — baja a medida que lo va gastando, es "¿hasta dónde llego ya mismo?"), y la de tanque lleno (`autonomyKm(tankCapacityLiters, ...)` — hipotética, fija mientras no cambie la velocidad, es "¿cuánto rendiría si lo llenara del todo?", para comparar el trade-off al mover el slider sin depender de cuánto combustible tenga ahora).

**El slider (y el de "Repostar hasta", §5) se puede tocar en cualquier momento — viaje en curso o no.** Si el vehículo ya está en ruta, tocarlo dispara un **replanteo en vivo** (`replanTripFuel` en `core/fuelPlan.ts`, ver §4.1): llegada estimada, autonomía y próximas paradas se recalculan al toque, reactivamente. La única excepción es mientras está parado repostando en una gasolinera — ahí el slider queda deshabilitado (cambiarlo justo en ese momento no tendría efecto hasta que termine esa parada de todos modos).

---

## 3. Cargar en el garage al salir

**Dónde:** `Dashboard.tsx`, función `acceptCargo`.

Reglas, tal como se pidieron:

- El vehículo **solo** recibe combustible gratis del garage si el viaje **arranca** en una ciudad donde la empresa tiene un garage. Si arranca desde donde quedó varado tras el viaje anterior (sin garage ahí), sale con lo que ya tenía en el tanque, sin más.
- Se rellena hasta el objetivo del jugador (`refuelTargetLiters`, ver §5), limitado por lo que realmente haya en el stock del garage (`garage.fuelLiters`, el mismo stock que se compra en Mercado → Combustible).
- Ese combustible es "gratis" en el momento de salir porque ya se pagó antes, al comprarlo en el Mercado — no hay un cargo aparte acá.

```ts
const wantedFromGarage = Math.max(0, Math.min(refuelTargetLiters, tankCapacityLiters) - fuelBeforeGarage)
const takenFromGarage = Math.min(wantedFromGarage, garage.fuelLiters)
const startingFuelLiters = fuelBeforeGarage + takenFromGarage
```

---

## 4. Planificar las paradas de combustible

**Archivo:** `src/core/fuelPlan.ts`, función `planFuelStops` (+ `scheduleFuelStops` para convertir distancias en horarios).

Esto es la implementación de "el chofer va solo a la gasolinera más cercana antes de quedarse sin combustible" — literal: **siempre la geográficamente más cercana a donde está parado**, esté o no de paso en el camino, así tenga que desviarse en serio. Se decide todo de una vez, al aceptar el viaje, no en vivo turno a turno — así el vehículo *nunca* se queda varado por sorpresa con los ajustes de siempre, y coincide con lo que ya decía `MECHANICS.md` §2: *"el sistema fuerza una parada de carga, sin drama"*.

Algoritmo:

1. Desde la posición actual, calcular la autonomía con el combustible disponible.
2. Si con esa autonomía se llega al destino, listo — no hace falta parar.
3. Si no, buscar con `findNearestGasStation` la gasolinera **geográficamente más cercana** a la posición actual (línea recta, sobre TODO el país — no se descarta ninguna por estar lejos de la ruta ni se prefiere una más lejana solo por estar "de paso").
4. Si ni la más cercana está dentro del rango que alcanza el tanque, se deja de planificar — el vehículo asume el riesgo de quedarse sin combustible (ver §7).
5. Repostar ahí hasta `refuelTargetLiters` (o el tanque lleno si el objetivo lo supera) — pero el tanque con el que se sigue viaje descuenta TAMBIÉN el combustible que cuesta volver desde la gasolinera hasta la ruta (la vuelta gasta combustible igual que la ida).
6. Repetir desde el punto de la ruta donde se volvió, con el nuevo tanque, hasta llegar al destino (tope de 6 paradas por viaje, salvavidas contra casos raros).

El desvío es siempre **ida y vuelta al mismo punto** de la ruta original (`atDistanceKm`) — nunca reemplaza ni recorta la ruta ya calculada al destino, solo se le suma un rodeo en el medio.

**Precio de cada parada**: se congela al precio de la gasolinera **en el momento de aceptar el viaje**, no al precio real del momento en que el vehículo efectivamente llega (sería más realista simularlo hacia adelante, pero la caminata de precios es una serie determinista que solo se conoce extendiéndola hora por hora desde que arrancó la empresa — simplificación consciente, ver §7).

### 4.1 Replanteo en vivo (cambiar velocidad/objetivo de recarga a mitad de viaje)

**Función:** `replanTripFuel` en `core/fuelPlan.ts`, llamada desde `Dashboard.tsx` cada vez que el jugador mueve alguno de los dos sliders del panel del vehículo.

Cambiar la velocidad de crucero o el objetivo de recarga mientras el vehículo ya está en ruta **no reinicia el viaje** — lo replanifica desde donde está parado en ese instante, como si fuera un viaje nuevo que arranca ahí:

1. Se toma una foto del estado actual con `computeTripState(trip, now)`: distancia recorrida y combustible en ese momento exacto.
2. Se vuelve a correr `planFuelStops` + `scheduleFuelStops` (los mismos de §4), pero arrancando desde esa distancia/combustible en vez de 0 — con la velocidad y el objetivo de recarga **nuevos**.
3. El viaje actualiza `departureTimestamp` (pasa a ser "ahora"), `startingDistanceKm` (dónde estaba parado) y `startingFuelLiters` (cuánto tenía), además de `averageSpeedKmh`, `fuelConsumptionPer100Km`, `fuelStops` y `estimatedArrivalTimestamp` — todos recién calculados para el tramo que falta.

Esto es lo que le permite a `computeTripState` seguir siendo una función pura de `(trip, now)` (el pilar de todo el juego, ver DESIGN.md) aunque el viaje haya cambiado de plan a mitad de camino: en vez de acumular un historial de "qué velocidad tenía en cada tramo", el viaje simplemente "se re-ancla" al presente cada vez que cambian los parámetros.

Las paradas que ya habían pasado (con `paid: true`) no se pierden de la cuenta: su costo se suma a `trip.totalFuelCostPaid` (que sobrevive a cualquier cantidad de replanteos) antes de reemplazar la lista de paradas — el resumen final al cobrar el viaje sale de `totalFuelCostPaid + suma de fuelStops[].cost` del régimen actual, no solo de este último.

**No hace nada** (devuelve el viaje sin tocar) si el vehículo ya llegó, o si está parado repostando en ese instante — cambiar la velocidad justo ahí no tiene sentido, se aplica recién la próxima vez que se toque el slider (o al terminar esa parada, si el jugador vuelve a tocarlo después).

### 4.2 Cancelar una parada a mitad de camino

**Función:** `cancelFuelStop` en `core/fuelPlan.ts`, botón "✕ Cancelar parada y seguir viaje" en `VehicleDetailPanel.tsx` (visible mientras `refuelPhase === 'waiting_for_route'` o `'to_station'`). Anima el regreso vía `ReturnToRouteLeg` y `returnToRouteLegState` en `core/trip.ts`.

**Solo se puede cancelar mientras todavía NO empezó a cargar de verdad** — ya sea esperando la respuesta del servicio de ruteo (`'waiting_for_route'`, §5.1) o ya en camino hacia la gasolinera (`'to_station'`). Una vez que ya empezó a cargar de verdad (`'pumping'`), no hay vuelta atrás — hay que esperar a que termine sí o sí, como pasaría con una parada real; el botón directamente desaparece del panel y se lo reemplaza por un aviso ("Ya empezó a cargar — hay que esperar a que termine"). Tampoco se puede cancelar durante el desvío de vuelta (`'returning'`) — ahí ya no hay nada que cancelar, ya cargó y está retomando la ruta sola. `cancelFuelStop` refleja esta misma regla a nivel de datos (no solo en la UI): si se lo llama fuera de esas dos fases, no hace nada y devuelve el viaje sin tocar.

Al cancelar mientras va camino a la gasolinera, **el vehículo NO se teletransporta de vuelta a la ruta**: arranca a manejar desde su posición REAL en ese instante hacia `atDistanceKm` (el punto de la ruta original), con el combustible que tenga en ese momento.

`Trip.returnToRouteLeg` guarda ese tramo de "recuperación" (`fromPosition`, `atDistanceKm`, `oneWayKm`, `startedAt`). `computeTripState` lo consume al principio de todo: mientras dure, anima la posición en línea recta a lo largo de ese tramo (`returnToRouteLegState`, reusando `activeFuelStop` con un `FuelStop` sintético para que la UI y la línea verde del mapa no necesiten ningún caso especial) y expone `refuelPhase: 'returning'`; una vez que termina, el resto de la función sigue el flujo normal desde `atDistanceKm` como si nada — es un campo de un solo uso, no hace falta "limpiarlo" después.

**Este tramo de vuelta SIEMPRE es línea recta — a propósito no se le pide una ruta real al servicio de ruteo acá**, a diferencia del desvío normal hacia una gasolinera (§5.1). La razón: `fromPosition` es un punto interpolado a mitad de un desvío anterior, casi siempre fuera de cualquier calle real (la línea recta entre la ruta y la gasolinera no sigue caminos). Pedirle a OSRM una ruta desde un punto así puede devolver un camino bastante más largo que la línea recta (el camino real más cercano puede estar lejos) — y como el tiempo de este tramo ya queda fijado con la distancia recta al cancelar, el vehículo terminaría teniendo que recorrer ese camino más largo en el mismo tiempo corto, viéndose "yendo rapidísimo" (este fue justamente un bug real detectado y corregido). La línea recta evita ese descalce de raíz.

**Si al cancelar la posición ya está prácticamente sobre la ruta** (`ALREADY_ON_ROUTE_KM = 0.1` km o menos — típicamente porque canceló apenas arrancó el desvío de ida, o ya casi había vuelto), directamente NO se arma ningún `ReturnToRouteLeg`: ya está sobre la ruta, así que sigue viaje de una, sin línea verde ni ningún tramo que animar.

**Cancelar significa "olvidate de esta gasolinera": el viaje queda con `fuelStops: []`, sin agendar ninguna parada nueva** — el único objetivo pasa a ser retomar la ruta principal y seguir viaje. A propósito NO se vuelve a correr `planFuelStops` acá (llegó a hacerlo en una versión anterior, y era un bug real): ese algoritmo agenda una parada en cuanto la autonomía no alcanza para TERMINAR el viaje completo — un umbral mucho más exigente que "quedarse sin combustible ya" — así que, salvo que el tanque hubiera quedado prácticamente lleno, siempre encontraba "necesito otra parada" apenas terminaba el tramo de vuelta, reagendando la MISMA gasolinera (o una casi idéntica) una y otra vez: cancelar → volver → volver a necesitarla → cancelar..., un loop infinito.

Por la misma razón tampoco alcanza con dejar `fuelStops: []` a secas: la vigilancia de combustible bajo (§4.3) corre sola en cada tick, así que sin nada más encontraba la misma gasolinera recién cancelada un instante después (mismo tanque bajo, mismas paradas vacías) y la reagendaba — el mismo loop, un paso más atrás, disparado por §4.3 en vez de por `cancelFuelStop`. Por eso cancelar también prende `trip.fuelSearchSuppressed`: mientras esté prendido, §4.3 se queda quieta con este viaje aunque el tanque siga bajo — el jugador asume el riesgo de quedarse sin combustible de verdad (y terminar `'stranded'`, §4.4) hasta que haga algo explícito que toque el combustible o el plan del viaje (el botón ▲/▼ de debug, los sliders de velocidad/objetivo de recarga, o la grúa), que es lo único que lo vuelve a apagar (ver `rebaseTripFrom` en `core/fuelPlan.ts`).

Es el mismo patrón de "re-anclar el viaje al presente" que el replanteo de §4.1 (`departureTimestamp` pasa a ser "ahora", `startingDistanceKm`/`startingFuelLiters` quedan en lo que había en ese instante) — y, a diferencia de `replanTripFuel`, funciona precisamente PORQUE el vehículo está en `'refueling'` (si no hay ninguna parada activa, no hace nada). El dinero ya pagado de esa parada (si `paid` ya se había marcado, ver §6) no se pierde: se suma a `totalFuelCostPaid` igual que en cualquier replanteo, aunque el vehículo se haya ido antes de terminar de cargar todo lo que esa plata pagaba.

**El botón desaparece mientras `refuelPhase === 'returning'`** (`VehicleDetailPanel.tsx`): una vez que ya se canceló y el vehículo está volviendo a la ruta, no hay nada más que cancelar — mostrarlo ahí solo invitaría a un segundo clic redundante. Apenas termina ese tramo de vuelta, el viaje sigue en `'in_transit'` normal (sin ningún estado intermedio que "limpiar").

### 4.3 Vigilancia de combustible bajo

**Dónde:** `Dashboard.tsx`, un `useEffect` sobre `now` (mismo tick de 1 segundo que paga las paradas, §6).

Un viaje puede quedar sin ningún plan de paradas por varias razones (ninguna gasolinera alcanzable al aceptarlo, un replanteo con el objetivo de recarga muy bajo) — si más adelante el consumo natural vuelve a bajar el tanque por debajo de `LOW_FUEL_LITERS`, esta vigilancia es la que lo detecta (nada más corre `planFuelStops` de forma reactiva). En cada tick, para cualquier viaje `'in_transit'` que no tenga ninguna parada agendada (`trip.fuelStops.length === 0`), que **no** tenga `fuelSearchSuppressed` prendido (ver §4.2 — el jugador canceló a propósito y no quiere que se le busque otra sola) y cuyo combustible actual ya esté en o por debajo de `LOW_FUEL_LITERS`, llama a `adjustTripFuel(trip, now, 0, ...)` — el mismo mecanismo del botón ▲/▼ de debug (§7), pero con `deltaLiters = 0` (no cambia nada del combustible, solo dispara el replanteo) — que busca de nuevo la gasolinera más cercana **tal como lo hace al principio** (§4) y la agenda si hace falta.

El chequeo en sí es barato (unas pocas comparaciones por viaje) y se hace siempre; el replanteo real — con su pedido a OSRM para el desvío, ver §5.1 — solo corre para los pocos vehículos que en ese momento realmente lo necesitan. En cuanto se agenda una parada nueva, `trip.fuelStops.length > 0` hace que el propio chequeo dejé de tocar ese viaje hasta que la resuelva.

### 4.4 Varado sin combustible y la grúa de asistencia

**Dónde:** `core/trip.ts` (`drivingState`, `TripState.status: 'stranded'`), `resolveTowTruck` en `core/fuelPlan.ts`, botón "🚚 Llamar a la grúa" en `VehicleDetailPanel.tsx`. Costo fijo: `TOW_TRUCK_COST` en `core/fuel.ts`.

El vehículo **no puede seguir moviéndose sin combustible** — antes, si se quedaba sin nafta, la simulación lo dejaba "avanzar" igual (una simplificación vieja, ya no vigente). Ahora `drivingState` calcula, para cualquier tramo manejado (yendo al destino, a una parada, o a atrás), cuánta distancia alcanza a cubrir el combustible disponible (`autonomyKm`) — si el tiempo transcurrido implicaría manejar MÁS que eso, se congela exactamente en el límite de la autonomía y el estado pasa a `'stranded'`. Como `computeTripState` es una función pura, una vez varado se queda ahí para siempre (en cualquier `now` posterior, por más que pase mucho tiempo) hasta que algo cambie el combustible del viaje — no hay manera de que se "reactive" solo.

**En la práctica esto debería pasar casi nunca**: `planFuelStops` (§4) siempre agenda una parada ANTES de que la autonomía deje de alcanzar, así que un viaje con ajustes razonables nunca debería llegar a varado real por las suyas — solo si genuinamente no hay ninguna gasolinera alcanzable en todo el país desde donde está (una zona sin datos, por ejemplo), o si el jugador fuerza el escenario con los botones ▲/▼ de debug (§7).

**Resolución — llamar a la grúa:** un botón en el panel del vehículo, visible solo mientras `status === 'stranded'`. Al tocarlo (`resolveTowTruck`):

1. Se descuenta `TOW_TRUCK_COST` (costo fijo, no depende del vehículo ni de la distancia) de la caja de la empresa.
2. El tanque se llena al **tope** — instantáneo, sin ningún tiempo de espera (a diferencia de una parada normal, acá "la grúa ya vino y lo asistió").
3. El viaje se replanifica desde ahí mismo (mismo mecanismo que `adjustTripFuel`/`replanTripFuel`, §4.1) — si más adelante hiciera falta OTRA parada, ya queda agendada de una, no vuelve a arriesgarse a quedar varado en el mismo viaje.

No tiene animación de "va y viene" como las paradas normales — es una asistencia de emergencia, no un desvío planificado, y ya se decidió que sea así (sin física, sin drama) para no complicar una situación que además debería ser rarísima.

---

## 5. El viaje con paradas: cómo se simula

**Archivo:** `src/core/trip.ts` — `Trip.fuelStops`, `computeTripState`.

Cada parada (`FuelStop`) ya trae, calculados una sola vez al aceptar el viaje (o al replanificar, ver §4.1):

```ts
{ gasStationId, atDistanceKm, stationLat, stationLon, detourOneWayKm, detourRouteGeometry?, detourResolvedAt?, litersAdded, cost, arrivalTimestamp, departureTimestamp, paid }
```

`arrivalTimestamp` marca cuando el vehículo llega a `atDistanceKm` (el punto de la ruta ORIGINAL donde se desvía). A partir de ahí, `computeTripState` distingue dos momentos:

1. **Mientras `detourResolvedAt` sigue `undefined`** (el servicio de ruteo todavía no contestó, ver §5.1): el vehículo se queda QUIETO en `atDistanceKm` — `refuelPhase: 'waiting_for_route'`. No arranca a manejar por ninguna línea (ni la recta ni ninguna otra) hasta no tener, al menos, una respuesta (buena o mala) de OSRM — no tiene sentido animarlo por un camino que a lo mejor ni sigue calles reales. No gasta combustible en este estado (está parado, no manejando).
2. **Una vez que `detourResolvedAt` se setea** (`Dashboard.tsx`, en cuanto llega la respuesta): recién ahí `computeTripState` (función interna `fuelStopState`) anima las **tres fases del episodio**, ancladas a `detourResolvedAt` (no a `arrivalTimestamp`) usando `detourOneWayKm` y la velocidad de crucero:
   1. **Desvío de ida**: maneja desde el punto de la ruta hasta la gasolinera real (`stationLat/stationLon`) — gasta combustible como cualquier tramo manejado.
   2. **Carga**: parado de verdad en la gasolinera, exactamente `REFUEL_STOP_DURATION_MS` (5 minutos fijos, sin importar cuánto cargue) — acá sube el combustible en vivo.
   3. **Desvío de vuelta**: maneja de vuelta desde la gasolinera hasta el mismo punto de la ruta — vuelve a gastar combustible.

Como es una función pura evaluada en cualquier `now`, todo esto (la espera, las tres fases, la animación de carga) sale gratis — no hace falta un timer aparte: se recalcula solo con la hora actual. Si `detourResolvedAt` nunca llega a setearse (por ejemplo, en un test que arma un `FuelStop` a mano sin ese campo), el vehículo se queda esperando ahí PARA SIEMPRE, sin importar cuánto `now` avance — es la contracara correcta de "no manejar por un camino que no se conoce todavía". `distanceTravelledKm` queda congelado en `atDistanceKm` durante TODO el episodio (esperando + las tres fases) — el desvío no cuenta como avance en la ruta original, aunque haya manejo de por medio. Combustible nunca queda negativo (`Math.max(0, ...)`) aunque el plan se haya vuelto inconsistente después.

`TripState.refuelPhase` (`'waiting_for_route' | 'to_station' | 'pumping' | 'returning'`) dice en cuál de las cuatro fases está — importante para la UI: **"Repostando" y los litros cargados solo tienen sentido durante `'pumping'`**, no durante las demás. `refuelProgress` acompaña esto: es el progreso de la CARGA en sí (0 mientras espera o viaja hacia la gasolinera, sube de 0 a 1 mientras carga, se queda en 1 mientras vuelve), y `litersAddedSoFar` expone el número de litros ya cargados en vivo (no solo el porcentaje) para que el panel pueda mostrar algo como "+14.3 / 40 L".

`estimateArrivalWithStops` suma, por cada parada, el desvío de ida+vuelta (`2 × detourOneWayKm / velocidad`) además de los 5 minutos fijos de carga — es una ESTIMACIÓN calculada al planificar (con la distancia en línea recta, antes de saber si el desvío real terminará siendo más largo), no se recalcula cuando el desvío resuelve; sigue siendo el mismo "compromiso" fijo que el resto del viaje.

### 5.1 El desvío real: se espera a la ruta real antes de mover un pixel

**Archivos:** `core/fuelPlan.ts` (`findNearestGasStation`), `core/trip.ts` (`waitingForRouteState`, `fuelStopState`, `positionAlongPath`), `map/routing/osrmProvider.ts` + `routeCache.ts` (`fetchRouteBetweenPoints`, `getCachedDetourRoute`), `Dashboard.tsx` (`resolveDetourRoutes`), `ui/dashboard/DashboardMap.tsx` (`applyFuelDetourLine`).

Como la gasolinera elegida puede estar bien lejos de la ruta (§4: siempre gana la más cercana, sea o no "de paso"), el desvío necesita seguir una ruta de verdad — **no una línea que corte camino por cualquier lado sin importarle qué hay en el medio**:

1. Al planificar una parada, `detourOneWayKm` se calcula en línea recta (rápido, síncrono) — alcanza para decidir SI el desvío es viable (§4) y para una primera estimación de tiempo/combustible/plata, pero todavía no es el camino que se va a animar.
2. En cuanto el vehículo llega a `atDistanceKm`, si `Dashboard.tsx` todavía no le pidió (o no le contestó) el servicio de ruteo, el vehículo se queda ESPERANDO ahí (`refuelPhase: 'waiting_for_route'`, §5) — ni un pixel de movimiento hasta tener una ruta real.
3. `Dashboard.tsx` le pide a OSRM (el mismo servicio que calcula la ruta principal — ver DESIGN.md §7) la ruta real desde el punto de la ruta hasta la gasolinera (`getCachedDetourRoute`). Cuando contesta, `resolveDetourRoutes` guarda la geometría real (`detourRouteGeometry`), **reemplaza `detourOneWayKm` por la distancia real** (ya no la estimación en línea recta) y setea `detourResolvedAt = Date.now()` — recién ahí `computeTripState` arranca a animar el desvío de ida, siguiendo esa geometría real.
4. **Si el pedido a OSRM falla** (el demo gratuito puede estar caído o dar error): no se puede dejar al vehículo esperando para siempre — `resolveDetourRoutes` igual setea `detourResolvedAt` (sin geometría), y el desvío se anima con la línea recta que ya tenía como estimación. Es el único caso en que se usa una línea recta para animar el desvío.
5. La vuelta reusa la MISMA geometría real, invertida — se asume que el camino de vuelta es el mismo que el de ida (no se le pide una segunda ruta a OSRM).

En la práctica, pedir la ruta a OSRM tarda bien menos de un segundo — así que esta espera casi nunca se nota mientras el vehículo viene manejando normalmente hacia `atDistanceKm` (la respuesta llega de sobra antes de que el vehículo llegue ahí). Donde SÍ se nota (y es exactamente el caso que había que arreglar) es en el escenario de debug: al forzar una parada de emergencia con los botones ▲/▼ (§7), `atDistanceKm` es la posición actual del vehículo — o sea que llega ahí ya mismo, sin ningún margen para que la respuesta de OSRM llegue antes. Con `waiting_for_route` el jugador ve un cartel claro ("🔎 Buscando ruta a la gasolinera...") en vez de al vehículo cortando camino por cualquier lado durante esa fracción de segundo.

**El giro solo pasa en la esquina, no antes** (`positionAtDistance` en `core/route.ts`, `TURN_SMOOTHING_KM = 0.05`): al interpolar posición/rumbo a lo largo de cualquier camino (la ruta principal o el desvío), el vehículo mantiene el rumbo del tramo actual y recién empieza a girar hacia el rumbo del PRÓXIMO tramo en los últimos ~50 metros antes de la esquina — no una mezcla progresiva a lo largo de todo el tramo. Con la ruta real (miles de puntos, tramos cortos) esto es indistinguible de antes; en el desvío (pocos puntos, tramos largos) es lo que evita que el vehículo se vea "doblando" mucho antes de llegar a la gasolinera.

La ruta azul (`selected-route`, el camino completo al destino) **nunca se toca ni se recalcula** — el desvío es un rodeo aparte que se le suma en el medio, no un reemplazo. `DashboardMap.tsx` dibuja la línea verde (`fuel-detour-line`) desde la posición ACTUAL del vehículo hasta la gasolinera (la geometría real una vez resuelta), mientras `state.activeFuelStop` o `state.upcomingFuelStop` exista — es decir, desde que se agenda la parada (§5, `upcomingFuelStop`, seguro haya o no desvío hacia atrás) y durante todo el episodio de la parada (`activeFuelStop`, esperando incluido). Se agrega/actualiza en cada cuadro del loop de animación, no en el mismo efecto que la línea azul, porque necesita el `status` de *ahora*.

**Cómo probarlo:** con el vehículo seleccionado, los botones ▲/▼ de combustible del panel (`VehicleDetailPanel.tsx`) bajan el tanque en vivo — al forzarlo por debajo de lo que necesita para seguir viaje, se agenda una parada hacia la gasolinera más cercana de VERDAD (por más lejos de la ruta que quede); el panel muestra brevemente "🔎 Buscando ruta..." y recién cuando OSRM contesta arranca el desvío verde, siguiendo la calle real de punta a punta.

---

## 6. Pago

**Dónde:** `Dashboard.tsx`, el `useEffect` que corre sobre `now` (el mismo tick de 1 segundo del resto del juego).

Cada parada se paga sola, **una sola vez**, apenas `now` cruza su `arrivalTimestamp` — se descuenta `stop.cost` de la caja de la empresa y se marca `paid: true` (así no se cobra de nuevo en el siguiente tick). No hace falta que el jugador esté mirando el mapa en ese instante para que se cobre.

Al cobrar el viaje (`collectTrip` / tarjeta "Cobrar"), el resumen de gastos ya **no** resta una tarifa plana de combustible estimada — `settleTrip` ahora recibe el costo real (`suma de trip.fuelStops[].cost`) solo para mostrarlo, no para restarlo de nuevo (ya se restó, en vivo, en cada parada). Si el viaje no necesitó ninguna parada, ese costo es simplemente 0 — el combustible ya estaba pago de antes (al comprarlo en el Mercado o al salir gratis del garage).

---

## 7. Combustible bajo y decisiones del jugador

- **Umbral**: `LOW_FUEL_LITERS = 10` litros (`core/fuel.ts`). Por debajo de eso: aro rojo parpadeante alrededor del vehículo en el mapa (alterna cada 400ms, calculado con el mismo reloj del loop de animación — no hace falta una animación CSS aparte), tarjeta roja en "Viajes", y el combustible se muestra en rojo en el panel del vehículo.
- **`refuelTargetLiters`** (slider "Repostar hasta", 0 a la capacidad del tanque): cuánto carga el chofer en cada parada. En 0, no carga nada — el jugador asume el riesgo de quedarse sin combustible a propósito (el panel avisa explícitamente en ese caso). En el tanque lleno, siempre llena.
- **No hay un modo "el chofer busca gasolinera en pánico"** separado: como el plan de paradas ya se arma completo al aceptar el viaje (§4) — y se vuelve a armar completo al cancelar una parada (§4.2) o al asistir a un vehículo varado (§4.4) —, un vehículo con ajustes razonables *nunca debería* llegar a quedarse sin combustible de sorpresa — el "aviso de combustible bajo" es, la mayoría de las veces, simplemente la señal de que se está acercando a una parada ya agendada.
- **"⚠️ No hay gasolinera cerca"** (`VehicleDetailPanel.tsx`/`FleetPanel.tsx`): se muestra cuando `state.status === 'in_transit'`, el combustible ya está en o por debajo de `LOW_FUEL_LITERS`, Y `trip.fuelStops.length === 0` — es decir, `planFuelStops` (§4) ya miró la situación y no encontró NINGUNA gasolinera dentro del rango que da la autonomía actual (ni la más cercana le alcanza). No es un campo nuevo guardado en ningún lado: se DERIVA en cada render de datos que ya existen, así que se actualiza solo apenas cambian (por ejemplo, si el jugador sube combustible con el debug y ahora sí alcanza para llegar a alguna). En este caso el vehículo sigue viaje igual y, si de verdad se queda sin combustible, termina `'stranded'` (§4.4) — es el riesgo que describe también la nota de arriba.
- **Botones ▲/▼ de debug** (`VehicleDetailPanel.tsx`, junto al número de litros): suman/restan `1L` al tanque de un toque. Con un viaje en curso llaman a `adjustTripFuel` (`core/fuelPlan.ts`) — el mismo mecanismo de "replanteo en vivo" de §4.1, pero solo cambiando el combustible (mantiene la velocidad y el objetivo de recarga que ya tenía el viaje) — así se puede forzar el escenario de combustible bajo sin esperar a que el consumo real lo baje solo, para probar el desvío a la gasolinera (§5.1) y el cobro (§6) a demanda.
  - **Solo busca gasolinera si el resultado queda en `LOW_FUEL_LITERS` o menos.** Por encima de ese umbral, el click únicamente actualiza el número (re-anclando el viaje al presente, `fuelStops: []`) SIN correr `planFuelStops` — si lo hiciera siempre, cualquier click (subir o bajar) en un viaje largo para el tanque encontraba "necesito parar" de la nada, aunque el tanque estuviera cómodo (30L, 50L...): `planFuelStops` agenda en cuanto la autonomía no cubre TODO el viaje, un umbral bastante más exigente que "estar bajo de combustible" — era un bug real, ya corregido.
  - **No hacen nada mientras el vehículo está en medio de una parada** (`status: 'refueling'`, cualquiera de sus cuatro fases — el botón queda deshabilitado en el panel): la posición queda congelada durante toda la parada, así que "la gasolinera más cercana" siempre vuelve a ser la misma — si el click reemplazara la parada activa por una nueva agendada ahí mismo, el ciclo ida→carga→vuelta se reiniciaría en loop sin dejarlo terminar nunca (mismo tipo de bug que el de arriba, ya corregido). SÍ funcionan con el vehículo varado (`status: 'stranded'`, §4.4) — ahí no hay ninguna parada en curso que interrumpir. Solo dejan de hacer algo si el viaje ya llegó a destino.

---

## Simplificaciones a propósito (no son bugs)

- El precio de cada parada se congela al aceptar el viaje, no al precio real del momento en que se llega — evitar simular la caminata de precios hacia el futuro.
- La estación "de ruta" (una de cada 6 ciudades) usa el punto medio simple hacia la siguiente ciudad de la lista, no la ciudad geográficamente más cercana — pero esto ya no importa demasiado para la mecánica de paradas, que ahora busca la más cercana de VERDAD sobre TODAS las gasolineras del país (§4), no solo las "de ruta".
- El desvío de vuelta reusa la misma geometría del desvío de ida, invertida — no se le pide a OSRM una segunda ruta asumiendo que el camino de vuelta es el mismo que el de ida.
- El tiempo/combustible del desvío se calculan con la distancia en línea recta (`detourOneWayKm`), fijada al planificar la parada — la geometría real que llega después de OSRM es puramente visual y no la recalcula (ver §5.1); si la calle real es bastante más larga que la línea recta, la velocidad visual del tramo puede no ser matemáticamente exacta.
- La grúa (§4.4) llena el tanque al toque, sin ningún tiempo de espera ni animación de desvío — es una asistencia de emergencia, no una parada planificada; tampoco varía su costo con la distancia ni el tamaño del tanque, siempre `TOW_TRUCK_COST` fijo.
