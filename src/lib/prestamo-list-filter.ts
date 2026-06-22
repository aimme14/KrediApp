import type { PrestamoItem, ClienteItem, PeriodoAdminListaItem } from "@/lib/empresa-api";
import { esPrestamoMorosoPendiente, formatClienteCodigoRutaYNumero } from "@/lib/empresa-api";
import type { PrestamoFiltroEstado, PrestamoFiltroContable } from "@/lib/prestamo-periodo-filter";
import { filtrarPrestamosPorFiltroContable } from "@/lib/prestamo-periodo-filter";

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
