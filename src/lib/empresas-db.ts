/**
 * Constantes y helpers para la estructura Firestore bajo /empresas
 */

export const EMPRESAS_COLLECTION = "empresas";
export const USUARIOS_SUBCOLLECTION = "usuarios";
export const RUTAS_SUBCOLLECTION = "rutas";
export const CLIENTES_SUBCOLLECTION = "clientes";
export const PRESTAMOS_SUBCOLLECTION = "prestamos";
export const PAGOS_SUBCOLLECTION = "pagos";
/** @deprecated Preferir subcolecciones tipadas abajo; se mantiene para lectura de datos históricos. */
export const GASTOS_SUBCOLLECTION = "gastos";

/** Gastos del jefe (descuentan caja empresa). empresas/{empresaId}/gastosEmpresa/{gastoId} */
export const GASTOS_EMPRESA_SUBCOLLECTION = "gastosEmpresa";

/** Gastos del administrador (ruta o admin). empresas/{empresaId}/gastosAdministrador/{gastoId} */
export const GASTOS_ADMIN_SUBCOLLECTION = "gastosAdministrador";

/** Gastos del empleado/trabajador. empresas/{empresaId}/gastosEmpleado/{gastoId} */
export const GASTOS_EMPLEADO_SUBCOLLECTION = "gastosEmpleado";

/** Traspaso admin: base ruta → caja empleado. empresas/{empresaId}/usuarios/{uid}/asignacionesBase/{id} */
export const ASIGNACIONES_BASE_EMPLEADO_SUBCOLLECTION = "asignacionesBase";

/** Entregas de reporte del día (trabajador → base ruta). empresas/{empresaId}/reportesDia/{id} */
export const REPORTES_DIA_SUBCOLLECTION = "reportesDia";

/** Solicitud de entrega de reporte (pendiente → admin aprueba/rechaza). empresas/{empresaId}/solicitudesEntregaReporte/{id} */
export const SOLICITUDES_ENTREGA_REPORTE_SUBCOLLECTION = "solicitudesEntregaReporte";

/** Colección empresas/{jefeUid}/capital — documentos por capa (cajaEmpresa, cajaAdmin, cajaEmpleado) y rama para rutas. */
export const CAPITAL_SUBCOLLECTION = "capital";

/** Documento caja empresa (liquidez en caja); el capital total se calcula al leer: cajaEmpresa + suma(capitalAdmin). */
export const CAPITAL_CAJA_EMPRESA_DOC = "cajaEmpresa";

/** Movimientos de capital/base empresa (un documento por evento). empresas/{jefeUid}/capital/cajaEmpresa/flujo/{id} */
export const CAPITAL_CAJA_EMPRESA_FLUJO_SUBCOLLECTION = "flujo";

/** Snapshot agregado de capital de administradores (suma de capitalAdmin por admin). */
export const CAPITAL_CAJA_ADMIN_DOC = "cajaAdmin";

/** Snapshot agregado de cajas de empleados en rutas (suma de cajasEmpleados). */
export const CAPITAL_CAJA_EMPLEADO_DOC = "cajaEmpleado";

/**
 * Documento padre para subcolección de snapshots por ruta.
 * Ruta: empresas/{jefeUid}/capital/{CAPITAL_BRANCH_DOC_ID}/rutas/{rutaId}
 */
export const CAPITAL_BRANCH_DOC_ID = "root";

/** Subcolección de snapshots de capital por ruta (bajo capital/root). */
export const CAPITAL_RUTAS_SUBCOLLECTION = "rutas";

/** Subcolección de cierres mensuales: empresas/{empresaId}/cierresMensuales/{periodo} */
export const CIERRES_MENSUALES_SUBCOLLECTION = "cierresMensuales";

/**
 * Historial de traspasos caja admin → caja ruta.
 * empresas/{empresaId}/usuarios/{adminUid}/inversionesCajaRuta/{id}
 */
export const INVERSIONES_CAJA_RUTA_SUBCOLLECTION = "inversionesCajaRuta";

export const USERS_COLLECTION = "users"; // Índice de auth

/** Ledger financiero append-only por empresa. */
export const FINANCIAL_MOVEMENTS_SUBCOLLECTION = "financialMovements";

/** Saldos proyectados por wallet dentro de la empresa. */
export const WALLET_BALANCES_SUBCOLLECTION = "walletBalances";

/** Registro de operaciones idempotentes por empresa. */
export const FINANCIAL_OPERATIONS_SUBCOLLECTION = "financialOperations";
