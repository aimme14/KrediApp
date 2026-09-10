/**
 * Utilidades compartidas por la suite de integración.
 *
 * Estos tests corren contra el emulador de Firestore con `firebase-admin`, que
 * es la única forma de ejercitar transacciones y concurrencia de verdad: los
 * tests unitarios con mocks no pueden demostrar que dos requests simultáneos
 * no descuadran una caja.
 */

import { randomUUID } from "crypto";
import * as admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST no está definido. Ejecuta `npm run test:integration`."
  );
}

const app =
  admin.apps.length > 0 && admin.apps[0]
    ? admin.apps[0]
    : admin.initializeApp({ projectId: "demo-kredi-integration" });

export const db: Firestore = admin.firestore(app);

export const EMPRESAS = "empresas";
export const USUARIOS = "usuarios";
export const RUTAS = "rutas";
export const CLIENTES = "clientes";
export const PRESTAMOS = "prestamos";
export const SOLICITUDES_PRESTAMO = "solicitudesPrestamo";
export const SOLICITUDES_ENTREGA = "solicitudesEntregaReporte";
export const GASTOS_ADMIN = "gastosAdministrador";
export const GASTOS_EMPRESA = "gastosEmpresa";
export const GASTOS_EMPLEADO = "gastosEmpleado";
export const CAPITAL = "capital";
export const FINANCIAL_OPERATIONS = "financialOperations";

export function nuevaEmpresaId(prefijo = "emp"): string {
  return `${prefijo}-${randomUUID().slice(0, 8)}`;
}

export function empresaRef(empresaId: string) {
  return db.collection(EMPRESAS).doc(empresaId);
}

export type SeedAdmin = {
  empresaId: string;
  adminUid: string;
  cajaAdmin?: number;
};

export async function seedAdmin(params: SeedAdmin): Promise<void> {
  await empresaRef(params.empresaId)
    .collection(USUARIOS)
    .doc(params.adminUid)
    .set({
      rol: "admin",
      role: "admin",
      nombre: "Admin de prueba",
      email: `${params.adminUid}@test.local`,
      cajaAdmin: params.cajaAdmin ?? 0,
    });
}

export async function seedEmpleado(params: {
  empresaId: string;
  empleadoUid: string;
  rutaId: string;
  adminId: string;
  cajaEmpleado?: number;
}): Promise<void> {
  await empresaRef(params.empresaId)
    .collection(USUARIOS)
    .doc(params.empleadoUid)
    .set({
      rol: "empleado",
      role: "empleado",
      nombre: "Trabajador de prueba",
      rutaId: params.rutaId,
      adminId: params.adminId,
      cajaEmpleado: params.cajaEmpleado ?? 0,
    });
}

export async function seedRuta(params: {
  empresaId: string;
  rutaId: string;
  adminId: string;
  cajaRuta?: number;
  cajasEmpleados?: number;
  inversiones?: number;
  perdidas?: number;
}): Promise<void> {
  const cajaRuta = params.cajaRuta ?? 0;
  const cajasEmpleados = params.cajasEmpleados ?? 0;
  const inversiones = params.inversiones ?? 0;
  const perdidas = params.perdidas ?? 0;

  await empresaRef(params.empresaId)
    .collection(RUTAS)
    .doc(params.rutaId)
    .set({
      nombre: "Ruta de prueba",
      adminId: params.adminId,
      cajaRuta,
      cajasEmpleados,
      inversiones,
      perdidas,
      ganancias: 0,
      gastos: 0,
      capitalTotal: round2(cajaRuta + cajasEmpleados + inversiones - perdidas),
      empleadosIds: [],
    });
}

export async function seedCajaEmpresa(
  jefeUid: string,
  cajaEmpresa: number
): Promise<void> {
  await empresaRef(jefeUid)
    .collection(CAPITAL)
    .doc("cajaEmpresa")
    .set({ cajaEmpresa, jefeUid, updatedAt: new Date() });
}

export async function seedCliente(params: {
  empresaId: string;
  clienteId: string;
  rutaId?: string;
  moroso?: boolean;
  prestamoActivo?: boolean;
}): Promise<void> {
  await empresaRef(params.empresaId)
    .collection(CLIENTES)
    .doc(params.clienteId)
    .set({
      nombre: "Cliente de prueba",
      rutaId: params.rutaId ?? "",
      moroso: params.moroso ?? false,
      prestamo_activo: params.prestamoActivo ?? false,
    });
}

export async function leerRuta(empresaId: string, rutaId: string) {
  const snap = await empresaRef(empresaId).collection(RUTAS).doc(rutaId).get();
  return snap.data() ?? {};
}

export async function leerUsuario(empresaId: string, uid: string) {
  const snap = await empresaRef(empresaId).collection(USUARIOS).doc(uid).get();
  return snap.data() ?? {};
}

export async function leerCajaEmpresa(jefeUid: string): Promise<number> {
  const snap = await empresaRef(jefeUid).collection(CAPITAL).doc("cajaEmpresa").get();
  const v = snap.data()?.cajaEmpresa;
  return typeof v === "number" ? v : 0;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Invariante central del modelo: el patrimonio de la ruta es la suma de sus
 * saldos. Si esto se rompe, hay dinero creado o destruido.
 */
export async function assertInvarianteRuta(
  empresaId: string,
  rutaId: string
): Promise<void> {
  const r = await leerRuta(empresaId, rutaId);
  const cajaRuta = num(r.cajaRuta);
  const cajasEmpleados = num(r.cajasEmpleados);
  const inversiones = num(r.inversiones);
  const perdidas = num(r.perdidas);
  const capitalTotal = num(r.capitalTotal);
  const esperado = round2(cajaRuta + cajasEmpleados + inversiones - perdidas);

  expect(Math.abs(capitalTotal - esperado)).toBeLessThanOrEqual(0.02);
  expect(cajaRuta).toBeGreaterThanOrEqual(-0.02);
  expect(cajasEmpleados).toBeGreaterThanOrEqual(-0.02);
}

export function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Cuenta cuántas promesas resolvieron y cuántas fallaron. */
export function contarResultados(resultados: PromiseSettledResult<unknown>[]): {
  exitos: number;
  fallos: number;
} {
  return {
    exitos: resultados.filter((r) => r.status === "fulfilled").length,
    fallos: resultados.filter((r) => r.status === "rejected").length,
  };
}

/** Borra una empresa completa (documentos y subcolecciones conocidas). */
export async function limpiarEmpresa(empresaId: string): Promise<void> {
  const ref = empresaRef(empresaId);
  const subcolecciones = [
    USUARIOS,
    RUTAS,
    CLIENTES,
    PRESTAMOS,
    SOLICITUDES_PRESTAMO,
    SOLICITUDES_ENTREGA,
    GASTOS_ADMIN,
    GASTOS_EMPRESA,
    GASTOS_EMPLEADO,
    CAPITAL,
    FINANCIAL_OPERATIONS,
    "financialLedgerOutbox",
    "financialMovements",
    "walletBalances",
    "reportesDia",
  ];

  for (const sub of subcolecciones) {
    const snap = await ref.collection(sub).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await ref.delete().catch(() => undefined);
}
