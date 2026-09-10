# Despliegue — integridad financiera y ledger

Runbook para desplegar los fixes de atomicidad y encender el ledger contable
sobre una base con clientes reales.

Todos los scripts requieren `serviceAccountKey.json` en la raíz del proyecto.

---

## Antes de empezar

Elige una ventana de bajo tráfico, después del cierre de rutas del día. Ningún
paso es destructivo, pero conviene que no haya cobros en curso.

---

## 1. Foto del estado actual (obligatorio)

```bash
npm run audit:financiero -- --out=audit-pre-deploy.json
```

Solo lectura. Guarda el JSON: es la línea base contra la que se compara al
final. Si ya reporta hallazgos críticos, anótalos — son preexistentes y no los
causó este despliegue, pero hay que resolverlos aparte.

Qué revisa:

- `capitalTotal == cajaRuta + cajasEmpleados + inversiones − perdidas` por ruta
- `cajasEmpleados` de la ruta contra la suma real de `cajaEmpleado`
- Cajas negativas en cualquier nivel
- Solicitudes de préstamo `pendiente` que ya tienen `prestamoId` (síntoma del bug de aprobación)
- Préstamos duplicados por `solicitudId`
- Operaciones idempotentes colgadas en `processing`

---

## 2. Desplegar el código

Merge y deploy normales. Los fixes son compatibles hacia atrás: mismos
endpoints, mismos mensajes de error, mismos campos de Firestore. Solo se
agregan campos (`descuadreCajasEmpleados` en rutas, `reporteDiaId` en
solicitudes de entrega).

El ledger sigue apagado en este punto.

---

## 3. Sembrar los saldos del ledger

Encender el ledger sin esto dejaría `walletBalances` en cero y todo
descuadrado. El bootstrap es aditivo (colección nueva) y nunca pisa un saldo
que ya exista.

```bash
npm run ledger:bootstrap                 # dry-run: lista lo que sembraría
npm run ledger:bootstrap -- --apply      # en firme
```

---

## 4. Encender el ledger

Define en el entorno de producción:

```
FINANCIAL_LEDGER_ENABLED=1
```

Redespliega para que la variable tome efecto. A partir de aquí cada movimiento
de dinero deja su asiento contable.

---

## 5. Verificar

```bash
npm run audit:financiero -- --out=audit-post-deploy.json
npm run ledger:reconcile
```

Los saldos de `audit-post-deploy.json` deben ser **idénticos** a los de la
línea base (salvo la operación normal ocurrida entre ambas fotos). La
reconciliación debe reportar el ledger cuadrado.

---

## Operación continua

| Comando | Cuándo |
|---|---|
| `npm run ledger:reconcile` | Semanal. Read-only; detecta divergencias entre ledger y saldos operativos |
| `npm run ledger:flush` | Cuando la reconciliación reporte movimientos `pending` en el outbox |
| `npm run audit:financiero` | Ante cualquier sospecha de descuadre |

Si la auditoría reporta `descuadreCajasEmpleados` en una ruta, significa que un
trabajador entregó más efectivo del que la ruta tenía contabilizado. Antes se
truncaba en silencio; ahora queda registrado con el faltante para investigarlo.

---

## Rollback

Cada fix es un commit atómico, así que cualquier pieza puede revertirse sola.
Para desactivar solo el ledger, quita `FINANCIAL_LEDGER_ENABLED`: los flujos de
dinero siguen funcionando igual, únicamente se dejan de escribir los asientos.
