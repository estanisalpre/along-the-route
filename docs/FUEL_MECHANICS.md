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
consumo_efectivo = consumo_fábrica × (velocidad_crucero / velocidad_fábrica)²
```

Caída cuadrática: no es un simulador físico real, pero es la aproximación habitual (la energía para vencer la resistencia del aire por km recorrido escala aproximadamente con el cuadrado de la velocidad) y da un resultado creíble — a la mitad de la velocidad, un cuarto del consumo; a velocidad de fábrica, exactamente el consumo de fábrica.

```
autonomía_km = litros_disponibles / consumo_efectivo × 100
```

El panel del vehículo (`VehicleDetailPanel.tsx`) muestra la autonomía a tanque lleno con la velocidad de crucero elegida, para que el jugador vea el trade-off al mover el slider *antes* de aceptar el próximo viaje.

**El slider solo se puede tocar cuando el vehículo NO está en un viaje** — uno ya en curso salió con su velocidad y su plan de paradas ya fijos (ver §4). Cambiarlo solo afecta al próximo viaje que acepte ese vehículo.

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

Esto es la implementación de "el chofer va solo a la gasolinera más cercana antes de quedarse sin combustible": **se decide todo de una vez, al aceptar el viaje**, no en vivo turno a turno. Es a propósito — así el vehículo *nunca* se queda varado por sorpresa con los ajustes de siempre, y coincide con lo que ya decía `MECHANICS.md` §2: *"el sistema fuerza una parada de carga, sin drama"*.

Algoritmo (goloso, sin vuelta atrás):

1. Desde la posición actual, calcular la autonomía con el combustible disponible.
2. Si con esa autonomía se llega al destino, listo — no hace falta parar.
3. Si no, buscar entre las gasolineras "proyectadas sobre la ruta" (ver abajo) la que esté **más lejos posible sin pasarse del rango alcanzable** — maximizar la distancia minimiza cuántas paradas hacen falta en total.
4. Repostar ahí hasta `refuelTargetLiters` (o el tanque lleno si el objetivo lo supera).
5. Repetir desde esa nueva posición hasta llegar al destino (tope de 6 paradas por viaje, salvavidas contra casos raros).
6. Si en algún punto no hay ninguna gasolinera alcanzable dentro del rango, se deja de planificar — el vehículo asume el riesgo de quedarse sin combustible (ver §7).

**Proyectar una gasolinera sobre la ruta**: a qué distancia acumulada de la ruta cae, usando el vértice de la geometría más cercano (no una proyección geométrica exacta punto-segmento — con la cantidad de puntos que trae una ruta real ya alcanza) y descartando las que quedan a más de 15km del camino (no son "de paso"). Con esto se decide **cuál** gasolinera, no dónde exactamente para el dibujo — el marker en el mapa usa la posición real de la gasolinera, esto solo la ubica *a lo largo* de la ruta para el cálculo.

**Precio de cada parada**: se congela al precio de la gasolinera **en el momento de aceptar el viaje**, no al precio real del momento en que el vehículo efectivamente llega (sería más realista simularlo hacia adelante, pero la caminata de precios es una serie determinista que solo se conoce extendiéndola hora por hora desde que arrancó la empresa — simplificación consciente, ver §7).

---

## 5. El viaje con paradas: cómo se simula

**Archivo:** `src/core/trip.ts` — `Trip.fuelStops`, `computeTripState`.

Cada parada (`FuelStop`) ya trae, calculados una sola vez al aceptar el viaje:

```ts
{ gasStationId, atDistanceKm, litersAdded, cost, arrivalTimestamp, departureTimestamp, paid }
```

`computeTripState(trip, now)` (la misma función pura de siempre — position/bearing a partir de `now`, sin depender de que el juego haya estado abierto) ahora también:

- **Congela la distancia recorrida** durante la ventana `[arrivalTimestamp, departureTimestamp)` de cada parada — el vehículo no avanza mientras repostando.
- Devuelve `status: 'refueling'` en esa ventana, con `refuelProgress` (0→1) y `fuelLiters` **subiendo en vivo**: `fuel_en_la_parada + litros_a_cargar × refuelProgress`. Como es una función pura evaluada en cualquier `now`, la animación de carga sale gratis — no hace falta un timer aparte, ni guardar "cuánto ya cargó": se recalcula solo con la hora actual.
- Combustible nunca queda negativo (`Math.max(0, ...)`) aunque el plan se haya vuelto inconsistente después (ej. el jugador bajó `refuelTargetLiters` a mitad de viaje — no afecta al viaje en curso, pero es una protección barata).
- La llegada estimada (`estimateArrivalWithStops`) sencillamente suma los 5 minutos fijos de cada parada a la duración de manejo pura.

Todo el peso de "N paradas, en cualquier punto del viaje" lo maneja un solo loop que arrastra un cursor de distancia/tiempo/combustible parada por parada — no hay casos especiales para "0 paradas" vs "3 paradas".

---

## 6. Pago

**Dónde:** `Dashboard.tsx`, el `useEffect` que corre sobre `now` (el mismo tick de 1 segundo del resto del juego).

Cada parada se paga sola, **una sola vez**, apenas `now` cruza su `arrivalTimestamp` — se descuenta `stop.cost` de la caja de la empresa y se marca `paid: true` (así no se cobra de nuevo en el siguiente tick). No hace falta que el jugador esté mirando el mapa en ese instante para que se cobre.

Al cobrar el viaje (`collectTrip` / tarjeta "Cobrar"), el resumen de gastos ya **no** resta una tarifa plana de combustible estimada — `settleTrip` ahora recibe el costo real (`suma de trip.fuelStops[].cost`) solo para mostrarlo, no para restarlo de nuevo (ya se restó, en vivo, en cada parada). Si el viaje no necesitó ninguna parada, ese costo es simplemente 0 — el combustible ya estaba pago de antes (al comprarlo en el Mercado o al salir gratis del garage).

---

## 7. Combustible bajo y decisiones del jugador

- **Umbral**: `LOW_FUEL_LITERS = 10` litros (`core/fuel.ts`). Por debajo de eso: aro rojo parpadeante alrededor del vehículo en el mapa (alterna cada 400ms, calculado con el mismo reloj del loop de animación — no hace falta una animación CSS aparte), tarjeta roja en "Viajes", y el combustible se muestra en rojo en el panel del vehículo.
- **`refuelTargetLiters`** (slider "Repostar hasta", 0 a la capacidad del tanque): cuánto carga el chofer en cada parada. En 0, no carga nada — el jugador asume el riesgo de quedarse sin combustible a propósito (el panel avisa explícitamente en ese caso). En el tanque lleno, siempre llena.
- **No hay un modo "el chofer busca gasolinera en pánico"** separado: como el plan de paradas ya se arma completo al aceptar el viaje (§4), un vehículo con ajustes razonables *nunca debería* llegar a quedarse sin combustible de sorpresa — el "aviso de combustible bajo" es, la mayoría de las veces, simplemente la señal de que se está acercando a una parada ya agendada. Solo se queda realmente varado (autonomía que no alcanza y sin agendar nada) si el jugador fijó `refuelTargetLiters` demasiado bajo para la distancia entre paradas, o si no hay ninguna gasolinera dentro de los 15km de la ruta en un tramo particular — casos que el jugador causa o que el mapa de gasolineras generado puede dejar sin cubrir en zonas muy vacías.

---

## Simplificaciones a propósito (no son bugs)

- El precio de cada parada se congela al aceptar el viaje, no al precio real del momento en que se llega — evitar simular la caminata de precios hacia el futuro.
- La proyección de gasolineras sobre la ruta usa el vértice de geometría más cercano, no una proyección geométrica exacta sobre el segmento.
- La estación "de ruta" (una de cada 6 ciudades) usa el punto medio simple hacia la siguiente ciudad de la lista, no la ciudad geográficamente más cercana.
- Cambiar velocidad de crucero o objetivo de recarga nunca afecta a un viaje ya en curso, solo al próximo que acepte ese vehículo.
- Si no hay ninguna gasolinera alcanzable, el vehículo sencillamente se queda sin combustible — no hay una mecánica de rescate/auxilio (queda para `MECHANICS.md` 🔵 Futuro, si hace falta).
