/**
 * Constantes y helpers para la estructura Firestore bajo /empresas
 */

export const EMPRESAS_COLLECTION = "empresas";
export const USUARIOS_SUBCOLLECTION = "usuarios";
export const RUTAS_SUBCOLLECTION = "rutas";
export const CLIENTES_SUBCOLLECTION = "clientes";
export const PRESTAMOS_SUBCOLLECTION = "prestamos";
export const PAGOS_SUBCOLLECTION = "pagos";
export const GASTOS_SUBCOLLECTION = "gastos";
/** Capital de empresa: monto disponible; solo el jefe lo ve y gestiona. */
export const CAPITAL_SUBCOLLECTION = "capital";

/** Id del documento que guarda el capital actual de la empresa (empresas/{jefeUid}/capital/actual). */
export const CAPITAL_DOC_ID = "actual";

export const USERS_COLLECTION = "users"; // Índice de auth
