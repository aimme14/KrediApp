import type { PrestamoItem, ClienteItem, PeriodoAdminListaItem } from "@/lib/empresa-api";
import { esPrestamoMorosoPendiente, formatClienteCodigoRutaYNumero } from "@/lib/empresa-api";
import type { PrestamoFiltroEstado, PrestamoFiltroContable } from "@/lib/prestamo-periodo-filter";
import { filtrarPrestamosPorFiltroContable } from "@/lib/prestamo-periodo-filter";

// ─── Tipos compartidos ────────────────────────────────────────────────────────

export type ConteoPorEstado = {
  todos: number;
  activo: number;
  pagado: number;
  castigado: number;
  moroso: number;
};

/**
 * Resultado de filtrarPrestamosConConteos.
 * `listaEstado` ya tiene filtroContable + filtroRutaId + filtroEstado aplicados,
 * pero NO filtroNombre — aplicar con aplicarFiltroNombrePrestamos en un memo
 * separado para que el tipeo en el buscador no relance el pase completo.
 */
export type FiltrarPrestamosConConteosResult = {
  listaEstado: PrestamoItem[];
  conteos: ConteoPorEstado;
};

export type FiltrarPrestamosParams = {
  prestamos: PrestamoItem[];
  prestamosPagados: PrestamoItem[];
  prestamosCastigados: PrestamoItem[];
  filtroContable: PrestamoFiltroContable;
  filtroEstado: PrestamoFiltroEstado;
  filtroRutaId: string;
  filtroNombre?: string;
  clientePorId: Record<string, ClienteItem>;
  periodos: PeriodoAdminListaItem[];
};

export function prestamoCoincideRuta(
  p: PrestamoItem,
  rutaId: string,
  clientePorId: Record<string, ClienteItem>
): boolean {
  if (!rutaId) return true;
  const rid = p.rutaId || clientePorId[p.clienteId]?.rutaId;
  return (rid ?? "") === rutaId;
}

export function dedupePrestamos(list: PrestamoItem[]): PrestamoItem[] {
  const seen = new Set<string>();
  return list.filter((p) => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

// ─── Helper: filtro de nombre ─────────────────────────────────────────────────

/**
 * Aplica el filtro de texto (nombre / cédula / código) sobre una lista ya
 * filtrada por estado. Diseñado para usarse en un useMemo separado al de
 * filtrarPrestamosConConteos para que cada tecla en el buscador no relance
 * el pase completo sobre la colección.
 */
export function aplicarFiltroNombrePrestamos(
  lista: PrestamoItem[],
  filtroNombre: string | undefined,
  clientePorId: Record<string, ClienteItem>
): PrestamoItem[] {
  if (!filtroNombre?.trim()) return lista;
  const lower = filtroNombre.trim().toLowerCase();
  return lista.filter((p) => {
    const cl = clientePorId[p.clienteId];
    if (!cl) return false;
    const nombre = (cl.nombre ?? "").toLowerCase();
    const cedula = (cl.cedula ?? "").toLowerCase();
    const codigo = cl.codigo ? formatClienteCodigoRutaYNumero(cl.codigo).toLowerCase() : "";
    return nombre.includes(lower) || cedula.includes(lower) || codigo.includes(lower);
  });
}

// ─── Pase único: conteos + lista ─────────────────────────────────────────────

/**
 * Reemplaza las 6 llamadas separadas a filtrarPrestamosParaListado.
 * En un solo pase:
 *   1. Deduplica y fusiona los tres arrays de origen.
 *   2. Aplica filtroContable (evaluación de fechas / periodos).
 *   3. Aplica filtroRutaId.
 *   4. Clasifica cada ítem en buckets de estado → conteos.
 *   5. Filtra el bucket de filtroEstado → listaEstado.
 *
 * Separar el filtro de nombre permite que el buscador use un memo propio
 * con dependencia solo en [listaEstado, filtroNombre, clientePorId].
 */
export function filtrarPrestamosConConteos(
  params: Omit<FiltrarPrestamosParams, "filtroNombre">
): FiltrarPrestamosConConteosResult {
  const {
    prestamos,
    prestamosPagados,
    prestamosCastigados,
    filtroContable,
    filtroEstado,
    filtroRutaId,
    clientePorId,
    periodos,
  } = params;

  // 1. Universo deduplicado (mismo criterio que filtroEstado "todos")
  const universo = dedupePrestamos([...prestamos, ...prestamosPagados, ...prestamosCastigados]);

  // 2. Filtro de periodo contable (la operación más cara: compara fechas)
  const porPeriodo = filtrarPrestamosPorFiltroContable(universo, filtroContable, periodos);

  // 3. Filtro de ruta
  const porRuta = filtroRutaId
    ? porPeriodo.filter((p) => prestamoCoincideRuta(p, filtroRutaId, clientePorId))
    : porPeriodo;

  // 4. Clasificación en un solo bucle → conteos
  let cTodos = 0, cActivo = 0, cPagado = 0, cCastigado = 0, cMoroso = 0;
  for (const p of porRuta) {
    cTodos++;
    if (p.estado === "activo") cActivo++;
    else if (p.estado === "pagado") cPagado++;
    else if (p.estado === "castigado") cCastigado++;
    if (esPrestamoMorosoPendiente(p, clientePorId[p.clienteId]?.moroso)) cMoroso++;
  }

  // 5. Lista filtrada por estado (sin filtroNombre — ver aplicarFiltroNombrePrestamos)
  let listaEstado: PrestamoItem[];
  switch (filtroEstado) {
    case "activo":
      listaEstado = porRuta.filter((p) => p.estado === "activo");
      break;
    case "pagado":
      listaEstado = porRuta.filter((p) => p.estado === "pagado");
      break;
    case "castigado":
      listaEstado = porRuta.filter((p) => p.estado === "castigado");
      break;
    case "moroso":
      listaEstado = porRuta.filter((p) =>
        esPrestamoMorosoPendiente(p, clientePorId[p.clienteId]?.moroso)
      );
      break;
    default:
      listaEstado = porRuta;
  }

  return {
    listaEstado,
    conteos: {
      todos: cTodos,
      activo: cActivo,
      pagado: cPagado,
      castigado: cCastigado,
      moroso: cMoroso,
    },
  };
}

// ─── Función original (conservada para retrocompatibilidad con tests) ─────────

export function filtrarPrestamosParaListado(params: FiltrarPrestamosParams): PrestamoItem[] {
  const {
    prestamos,
    prestamosPagados,
    prestamosCastigados,
    filtroContable,
    filtroEstado,
    filtroRutaId,
    filtroNombre,
    clientePorId,
    periodos,
  } = params;

  let base: PrestamoItem[];
  if (filtroEstado === "pagado") {
    base = dedupePrestamos(prestamosPagados);
  } else if (filtroEstado === "castigado") {
    base = prestamosCastigados;
  } else if (filtroEstado === "activo") {
    base = prestamos.filter((p) => p.estado === "activo");
  } else if (filtroEstado === "moroso") {
    base = prestamos.filter((p) =>
      esPrestamoMorosoPendiente(p, clientePorId[p.clienteId]?.moroso)
    );
  } else {
    base = dedupePrestamos([...prestamos, ...prestamosPagados, ...prestamosCastigados]);
  }

  const porPeriodo = filtrarPrestamosPorFiltroContable(base, filtroContable, periodos);

  const porRuta = filtroRutaId
    ? porPeriodo.filter((p) => prestamoCoincideRuta(p, filtroRutaId, clientePorId))
    : porPeriodo;

  if (!filtroNombre?.trim()) return porRuta;
  const lower = filtroNombre.trim().toLowerCase();
  return porRuta.filter((p) => {
    const cl = clientePorId[p.clienteId];
    if (!cl) return false;
    const nombre = (cl.nombre ?? "").toLowerCase();
    const cedula = (cl.cedula ?? "").toLowerCase();
    const codigo = cl.codigo ? formatClienteCodigoRutaYNumero(cl.codigo).toLowerCase() : "";
    return nombre.includes(lower) || cedula.includes(lower) || codigo.includes(lower);
  });
}
