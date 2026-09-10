# Guía de Testing — KrediApp

## ¿Por qué hacemos tests?

KrediApp maneja dinero real. Un error en una función financiera puede descuadrar
el capital de una ruta sin que nadie se dé cuenta inmediatamente.

Los tests verifican automáticamente que las fórmulas financieras críticas
producen los resultados correctos **antes de que el código llegue a producción**.

---

## Antes de subir cualquier cambio

### 1. Corre los tests

```bash
npm test
```

Si todos pasan ✅ → puedes hacer deploy con confianza.
Si alguno falla ❌ → revisa tu cambio antes de continuar.

> Los tests de **reglas Firestore** y los de **integración financiera** no se
> ejecutan con `npm test` / `test:coverage` (necesitan el emulador).
> Para ellos: `npm run test:rules` y `npm run test:integration`.

### 2. Si modificaste una función financiera

Corre los tests con cobertura para ver qué líneas no están cubiertas:

```bash
npm run test:coverage
```

### 3. Modo watch (mientras desarrollas)

```bash
npm run test:watch
```

Los tests se re-ejecutan automáticamente cada vez que guardas un archivo.

> Usa `--watchAll` (no `--watch`) para que funcione aunque el proyecto no tenga Git inicializado.

---

## Estructura de tests

```
src/lib/__tests__/
├── capital-formulas.test.ts          ← Fórmulas de capital (ruta, admin)
├── ruta-financiera-compute.test.ts   ← Cobros, pérdidas, distribución capital/ganancia
├── tu-caja-del-dia.test.ts           ← Caja efectivo del empleado
└── integration/                      ← Contra emulador (npm run test:integration)
```

---

## Tests de integración financiera

```bash
npm run test:integration
```

Los tests unitarios verifican fórmulas; estos verifican **comportamiento bajo
concurrencia**, que es donde se pierde dinero de verdad. Corren con
`firebase-admin` apuntado al emulador de Firestore, así que ejercitan
transacciones, reintentos y contención reales.

| Archivo | Qué demuestra |
|---|---|
| `cajas.concurrency.test.ts` | Débitos simultáneos sobre la misma caja no se pisan ni dejan saldo negativo |
| `aprobar-solicitud.concurrency.test.ts` | Cinco aprobaciones a la vez generan un solo préstamo y un solo descuento |
| `gastos.atomico.test.ts` | El débito de caja y el documento del gasto se confirman o se descartan juntos |
| `crear-ruta.atomic.test.ts` | Contador, ruta y débito de `cajaAdmin` son una sola operación |
| `entrega-reporte.concurrency.test.ts` | Doble aprobación hace un solo traspaso; los descuadres se registran |
| `idempotencia.test.ts` | Replay de éxitos, expiración del lock huérfano, liberación tras fallo |
| `idempotencia-capital.test.ts` | Reintentar un movimiento de capital con la misma clave no lo duplica; con claves distintas sí se ejecutan los dos |
| `admin-empresa.test.ts` | Ingreso de liquidez del `adminEmpresa`: atomicidad con su historial y rollback ante fallo |
| `invariantes.test.ts` | Con secuencias aleatorias, `capitalTotal == cajaRuta + cajasEmpleados + inversiones − perdidas` |

Requiere JDK 21+ (igual que `test:rules`). Tarda ~2,5 minutos: la contención
real no se puede acelerar.

**Al tocar un flujo de dinero, el test tiene que fallar sin tu fix.** Si pasa
con y sin el cambio, no está probando lo que crees.

---

## Cobertura actual

| Archivo | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| capital-formulas.ts | 100% | 100% | 100% | 100% |
| ruta-financiera-compute.ts | 95.31% | 83.67% | 100% | 95.23% |
| tu-caja-del-dia.ts | 100% | 25% | 100% | 100% |
| **Total** | **96.42%** | **80%** | **100%** | **96.34%** |

> Las líneas sin cubrir son guardias defensivas (errores imposibles en uso normal).
> No es necesario forzar tests para ellas.

---

## Funciones críticas cubiertas

| Función | Archivo | Por qué es crítica |
|---|---|---|
| `splitMontoPagoEnCapitalYGanancia` | `ruta-financiera-compute.ts` | Divide cada cobro en capital e interés |
| `computeRutaCamposTrasCobroPrestamoCobroEnEmpleado` | `ruta-financiera-compute.ts` | Actualiza inversiones/ganancias/caja tras cobro |
| `computeRutaCamposTrasPerdidaPrestamo` | `ruta-financiera-compute.ts` | Descuenta pérdidas de inversiones |
| `computeCapitalTotalRutaDesdeSaldos` | `capital-formulas.ts` | Fórmula base del patrimonio de ruta |
| `computeCapitalAdmin` | `capital-formulas.ts` | Patrimonio total del admin |
| `tuCajaEfectivoFormula` | `tu-caja-del-dia.ts` | Caja efectivo del empleado |

---

## Cómo agregar un nuevo test

Si agregas o modificas una función financiera, agrega su test:

```typescript
// src/lib/__tests__/mi-funcion.test.ts

import { miFuncion } from "@/lib/mi-funcion";

describe("miFuncion", () => {
  it("caso normal", () => {
    const resultado = miFuncion(entrada);
    expect(resultado).toBe(esperado);
  });

  it("caso borde — valores en cero", () => {
    expect(miFuncion(0)).toBe(0);
  });

  it("caso borde — valores extremos", () => {
    // Verifica que no explota con valores grandes o negativos
  });
});
```

### Reglas para buenos tests:

1. **Un test = una cosa** — no mezcles varios casos en un `it()`
2. **Nombres descriptivos** — el nombre debe explicar qué verifica
3. **Casos borde** — siempre prueba con cero, negativos y valores extremos
4. **Sin efectos secundarios** — los tests no deben tocar Firestore ni APIs

---

## Regla de oro

> Si modificas cualquier archivo en `src/lib/` que tenga
> cálculos financieros, **debes** correr `npm test` antes del deploy.

Si los tests fallan y no sabes por qué, consulta con el equipo
antes de hacer merge o deploy.
