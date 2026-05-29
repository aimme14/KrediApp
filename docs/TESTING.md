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
└── tu-caja-del-dia.test.ts           ← Caja efectivo del empleado
```

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
