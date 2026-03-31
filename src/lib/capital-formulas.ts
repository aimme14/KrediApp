/**
 * Fórmulas de capital (nivel empresa, admin, ruta).
 * Los valores persistidos son insumos; los capitales resultantes se calculan aquí.
 */

/**
 * capitalEmpresa = cajaEmpresa + suma(capitalAdmin de cada admin).
 * Los gastos de empresa descuentan la caja al registrarse; el total acumulado es informativo (subcolección gastosEmpresa).
 */
export function computeCapitalEmpresa(
  cajaEmpresa: number,
  sumaCapitalAdmins: number
): number {
  return cajaEmpresa + sumaCapitalAdmins;
}

/**
 * capitalAdmin = cajaAdmin + suma(capitalRuta) − gastosAdmin − gastosRuta
 * La suma de capitalRuta usa `capitalTotal` de cada ruta (ya neto de pérdidas registradas en la ruta).
 */
export function computeCapitalAdmin(params: {
  cajaAdmin: number;
  sumaCapitalRutas: number;
  gastosAdmin: number;
  gastosRuta: number;
}): number {
  const { cajaAdmin, sumaCapitalRutas, gastosAdmin, gastosRuta } = params;
  return cajaAdmin + sumaCapitalRutas - gastosAdmin - gastosRuta;
}

/**
 * capitalRuta alineado al modelo de negocio: base en ruta + cajas empleados + inversiones + ganancias − pérdidas.
 * En datos persistidos, `capitalTotal` de la ruta es la fuente de verdad operativa.
 */
export function computeCapitalRutaFromRutaFields(r: {
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  ganancias: number;
  perdidas: number;
  capitalTotal?: number;
}): number {
  if (typeof r.capitalTotal === "number") {
    return r.capitalTotal;
  }
  return (
    r.cajaRuta +
    r.cajasEmpleados +
    r.inversiones +
    r.ganancias -
    r.perdidas
  );
}
