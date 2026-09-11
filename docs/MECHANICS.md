<div align="center">

# ⚙️ Mecánicas de juego — Por la Ruta

*Sistemas de gameplay en detalle. Complementa [GAME_DESIGN.md](./GAME_DESIGN.md) (visión) y [DESIGN.md](./DESIGN.md) (arquitectura técnica).*

</div>

---

## Cómo leer este documento

Cada mecánica está etiquetada según en qué momento entra al juego, para no perder de vista el alcance del MVP que ya definimos:

| Etiqueta | Significado |
|---|---|
| 🟢 **MVP** | Entra en la primera versión jugable |
| 🟡 **Fase 2** | Entra apenas el MVP funciona (economía/flota más rica) |
| 🔵 **Futuro** | Profundidad para después del lanzamiento en Steam |

---

## 🚚 1. Vehículos

| Atributo | Descripción | Alcance |
|---|---|---|
| Capacidad de carga (kg / m³) | Cuánto peso y volumen puede llevar | 🟢 MVP |
| Velocidad promedio | Base para calcular duración de viaje | 🟢 MVP |
| Consumo de combustible | Litros/100km en vacío | 🟢 MVP |
| **Autonomía / rango** | Litros de tanque ÷ consumo = km máximos sin recargar | 🟡 Fase 2 |
| Confiabilidad | Probabilidad de rotura, baja con el uso | 🟡 Fase 2 |
| Valor de compra / reventa | Con depreciación por uso y antigüedad | 🟢 MVP (compra) / 🟡 (reventa) |
| Tipo de carga habilitada | Refrigerada, frágil, peligrosa, etc. requieren vehículo específico | 🟡 Fase 2 |
| Antigüedad / kilometraje acumulado | Afecta confiabilidad y valor de reventa | 🟡 Fase 2 |
| Mercado de usados | Comprar vehículos de segunda mano más baratos pero menos confiables | 🔵 Futuro |

**Trade-off central:** un vehículo más grande cuesta más, consume más y es más lento, pero mueve más carga por viaje. No hay un vehículo "mejor" en abstracto — depende de la carga disponible.

---

## ⛽ 2. Combustible y autonomía

Esto es un sistema propio (no viene gratis de OSRM/routing), hay que diseñarlo:

- **Consumo base** por tipo de vehículo (L/100km), ya definido en DESIGN.md §9 vía `average_speed_kmh` — el consumo de combustible es un segundo atributo paralelo a la velocidad, no depende de ella en el MVP.
- **🟡 Carga afecta consumo**: a mayor peso transportado, mayor consumo real. Fórmula simple para empezar:
  ```
  consumo_real = consumo_base * (1 + factor_carga * (peso_actual / capacidad_maxima))
  ```
  Esto es justo lo que pediste: llevar la carga máxima es más rentable por viaje, pero cuesta más combustible — otra decisión, no un número gratis.
- **🟡 Autonomía**: el vehículo tiene un tanque; si la ruta es más larga que la autonomía, necesita parar a cargar combustible en el camino (afecta tiempo y costo — no es un fail state, es una parada más).
- **🔵 Precio regional de combustible**: el combustible no cuesta lo mismo en todas las provincias (esto es realista en Argentina); agrega una capa de planificación de rutas más allá de "la más corta".
- **🔵 Quedarse sin combustible**: evento negativo si se ignora la autonomía (viaje se detiene, hay que mandar auxilio) — divertido como riesgo tardío, no debería poder pasar "por accidente" en el MVP (ahí el sistema directamente fuerza una parada de carga, sin drama).

---

## 📦 3. Carga

| Atributo | Descripción | Alcance |
|---|---|---|
| Peso / volumen | Determina qué vehículo puede llevarla | 🟢 MVP |
| Tipo | Paquetería, repuestos, alimentos, granos, carga refrigerada, frágil... | 🟢 MVP |
| Pago | Ingreso al completar el viaje | 🟢 MVP |
| Plazo de entrega | Cargas urgentes pagan más pero castigan la demora | 🟡 Fase 2 |
| **Sobrecarga** | Aceptar más peso del que el vehículo admite: más ganancia por viaje, pero más consumo, más desgaste y más riesgo de rotura/multa | 🔵 Futuro |
| Fragilidad / valor asegurado | Carga que se puede dañar en un evento (accidente, mal camino) y generar pérdida en vez de ganancia | 🔵 Futuro |

---

## 👤 4. Choferes

Este es uno de los sistemas más ricos en decisiones, tal como lo planteaste:

| Mecánica | Descripción | Alcance |
|---|---|---|
| Chofer genérico | Cada vehículo activo necesita un chofer asignado (al principio, implícito) | 🟢 MVP (implícito) |
| **Capacitados vs no capacitados** | Un chofer sin capacitar es más barato pero más lento, más propenso a roturas/multas y peor con cargas especiales; capacitar cuesta dinero y/o tiempo | 🟡 Fase 2 |
| Salario | Costo fijo por chofer contratado (no por viaje), lo que empuja a no tener flota ociosa | 🟡 Fase 2 |
| **Especialización** | Chofer con experiencia en carga refrigerada / peligrosa reduce riesgo de eventos negativos en esas cargas específicas | 🔵 Futuro |
| Fatiga / horas de descanso | Regulación realista: después de X horas manejando, el chofer necesita descanso obligatorio (afecta viajes muy largos) | 🔵 Futuro |
| Antigüedad / experiencia acumulada | El chofer mejora con viajes completados (sube de nivel: más rápido, menos accidentes) | 🔵 Futuro |
| Renuncia / rotación | Un chofer mal pago o sobrecargado puede renunciar | 🔵 Futuro |

---

## 🔧 5. Mantenimiento y averías

| Mecánica | Descripción | Alcance |
|---|---|---|
| Costo de mantenimiento | Gasto fijo por viaje o por km recorrido, ya contemplado en la economía base | 🟢 MVP |
| **Roturas** | Probabilidad de rotura en ruta, creciente con antigüedad/km acumulado y decreciente con confiabilidad del vehículo | 🟡 Fase 2 |
| Mantenimiento preventivo vs correctivo | Pagar mantenimiento antes reduce probabilidad de rotura; no pagarlo es más barato a corto plazo pero más caro si rompe a mitad de un viaje largo | 🟡 Fase 2 |
| Tiempo fuera de servicio | Un vehículo roto no genera ingresos hasta que se repare — el costo real de una rotura es el lucro cesante, no solo la reparación | 🟡 Fase 2 |
| Desgaste de piezas específicas (neumáticos, frenos) | Mayor granularidad de mantenimiento | 🔵 Futuro |

---

## 🏎️ 6. Velocidad vs. consumo (perfil de viaje)

Tal como lo planteaste — la velocidad no debería ser un solo número fijo, sino una **decisión del jugador por viaje**:

| Perfil | Efecto |
|---|---|
| 🐢 Económico | Menor velocidad promedio → viaje más lento, pero menor consumo de combustible y menor desgaste/probabilidad de rotura |
| ⚖️ Normal | Balance por defecto (lo que hoy es `average_speed_kmh` fijo en el MVP) |
| 🐇 Rápido | Mayor velocidad → llega antes (bueno para cargas urgentes), pero consume más combustible, desgasta más el vehículo y **aumenta el riesgo de multa** |

Alcance: 🟢 MVP con un solo perfil fijo (Normal) para no complicar el primer prototipo → 🟡 Fase 2 para exponer la elección al jugador, que es donde realmente se vuelve una mecánica interesante.

---

## 🚔 7. Multas e infracciones

| Mecánica | Descripción | Alcance |
|---|---|---|
| Exceso de velocidad | Si se elige perfil "rápido", probabilidad de multa que resta al ganancia del viaje | 🟡 Fase 2 |
| Exceso de carga (sobrepeso) | Si se permite sobrecarga (ver §3), probabilidad de multa en controles de ruta | 🔵 Futuro |
| **Documentación vencida (VTV / seguro)** | Si no se renueva la verificación técnica o el seguro del vehículo, riesgo de multa o directamente inmovilización | 🔵 Futuro |
| Permisos especiales no vigentes | Cargas peligrosas/sobredimensionadas requieren habilitación específica | 🔵 Futuro |

---

## 🛡️ 8. Seguros

| Mecánica | Descripción | Alcance |
|---|---|---|
| Seguro básico del vehículo | Costo periódico fijo; sin él, cualquier rotura/accidente cuesta el 100% de la reparación | 🟡 Fase 2 |
| Seguro de carga | Cubre pérdida de la carga en caso de accidente/robo; opcional y con costo, trade-off clásico de tycoon | 🔵 Futuro |

---

## 💰 9. Economía (costos fijos vs. variables)

Ya cubierto en DESIGN.md §13, pero vale remarcar la distinción para el diseño de mecánicas:

- **Variables** (por viaje): combustible, peajes, multas eventuales.
- **Fijos** (existen aunque no viaje nadie): salarios de choferes contratados, seguros, alquiler de depósito. 🟡 Fase 2.
- Esto es lo que le da tensión real a tener flota ociosa: cada vehículo/chofer sin uso **cuesta plata igual**, no es gratis "tenerlos guardados".
- **🔵 Futuro**: precios de combustible fluctuantes por evento económico, contratos a largo plazo con pago fijo periódico vs. mercado spot de cargas sueltas.

---

## ⭐ 10. Reputación y clientes

| Mecánica | Descripción | Alcance |
|---|---|---|
| Reputación general | Sube con viajes puntuales y sin incidentes, baja con demoras/daños | 🟡 Fase 2 |
| Puntualidad | Llegar tarde a una carga con plazo reduce el pago y/o la reputación | 🟡 Fase 2 |
| Clientes recurrentes / contratos empresariales | Reputación alta desbloquea contratos de mejor pago y más estables | 🔵 Futuro |
| Ranking global entre compañías | Ver DESIGN.md §26 — reputación es uno de los tres ejes del ranking (junto a flota y viajes completados) | 🔵 Futuro |

---

## 🎲 11. Eventos y riesgos en ruta

Todo esto es **opcional y modular** — el sistema de simulación (DESIGN.md §11) ya está diseñado para aceptar modificadores sin romper el determinismo (los eventos se resuelven como parte del cálculo de `computeTripState`, no como un proceso en vivo separado):

| Evento | Efecto | Alcance |
|---|---|---|
| Rotura mecánica | Ver §5 | 🟡 Fase 2 |
| Multa | Ver §7 | 🟡 Fase 2 |
| Clima (lluvia, nieve en el sur) | Reduce velocidad efectiva en ciertos tramos/estaciones | 🔵 Futuro |
| Corte de ruta / desvío | Aumenta distancia o tiempo del viaje en curso | 🔵 Futuro |
| Robo/asalto de carga | Pérdida total o parcial de la carga (riesgo mayor en ciertas rutas/cargas de alto valor) | 🔵 Futuro |
| Congestión por otros jugadores | Ver DESIGN.md §27 — exclusivo del modo online | 🔵 Futuro (post-online) |

---

## 📋 Resumen: qué entra en el MVP

Para que esto no compita con el alcance ya acordado en DESIGN.md §18, el MVP se queda **deliberadamente simple** en mecánicas:

- ✅ Capacidad de carga fija por vehículo, velocidad fija, consumo de combustible fijo (sin autonomía todavía, sin roturas, sin multas).
- ✅ Compra de vehículos nuevos (sin usados, sin reventa todavía).
- ✅ Costos de combustible + mantenimiento simple + peaje estimado, ya definidos en DESIGN.md §13.

Todo lo etiquetado 🟡 Fase 2 es el siguiente objetivo natural apenas el MVP esté validado; 🔵 Futuro es la profundidad que hace que el juego aguante meses de juego sin volverse repetitivo, pero no bloquea nada de lo que hay que construir ahora.
