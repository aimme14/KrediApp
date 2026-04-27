/**
 * Fórmulas de capital (nivel empresa, admin, ruta).
 * Los valores persistidos son insumos; los capitales resultantes se calculan aquí.
 */

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Patrimonio de ruta: base ruta + bases empleados + capital colocado en préstamos − pérdidas reconocidas.
 * La ganancia por intereses queda en la caja del trabajador (cajasEmpleados), no se suma aparte.
 */
export function computeCapitalTotalRutaDesdeSaldos(r: {
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  perdidas: number;
}): number {
  return roundMoney(
    r.cajaRuta + r.cajasEmpleados + r.inversiones - r.perdidas
  );
}

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
 * capitalAdmin = cajaAdmin + suma(capitalRuta).
 * Los gastos operativos del admin se pagan desde caja al registrarse (`descontarCajaAdmin`);
 * no se restan los montos de gastos otra vez aquí (evita doble descuento).
 * La suma de capitalRuta usa `capitalTotal` de cada ruta (ya neto de pérdidas registradas en la ruta).
 */
export function computeCapitalAdmin(params: {
  cajaAdmin: number;
  sumaCapitalRutas: number;
}): number {
  const { cajaAdmin, sumaCapitalRutas } = params;
  return cajaAdmin + sumaCapitalRutas;
}

/**
 * Patrimonio de ruta: cajaRuta + cajasEmpleados + inversiones − perdidas.
 * `ganancias` y `capitalTotal` opcional no alteran el resultado (compatibilidad de llamadas).
 */
export function computeCapitalRutaFromRutaFields(r: {
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  ganancias: number;
  perdidas: number;
  capitalTotal?: number;
}): number {
  return computeCapitalTotalRutaDesdeSaldos({
    cajaRuta: r.cajaRuta,
    cajasEmpleados: r.cajasEmpleados,
    inversiones: r.inversiones,
    perdidas: r.perdidas,
  });
}
