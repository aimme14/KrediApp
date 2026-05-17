/**
 * Fórmulas de capital (nivel empresa, admin, ruta).
 * Los valores persistidos son insumos; los capitales resultantes se calculan aquí.
 */

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Patrimonio de ruta: cajaRuta + cajasEmpleados + inversiones.
 * Las pérdidas reconocidas reducen `inversiones` al registrarse; no se restan aparte del capital.
 * La ganancia por intereses queda en la caja del trabajador (cajasEmpleados), no se suma aparte.
 */
export function computeCapitalTotalRutaDesdeSaldos(r: {
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  perdidas?: number;
}): number {
  return roundMoney(r.cajaRuta + r.cajasEmpleados + r.inversiones);
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
 * La suma de capitalRuta usa `capitalTotal` de cada ruta (cajaRuta + cajasEmpleados + inversiones).
 */
export function computeCapitalAdmin(params: {
  cajaAdmin: number;
  sumaCapitalRutas: number;
}): number {
  const { cajaAdmin, sumaCapitalRutas } = params;
  return cajaAdmin + sumaCapitalRutas;
}

/**
 * Contribución de una ruta a `sumaCapitalRutas` del admin en GET /api/empresa/resumen:
 * `capitalTotal` persistido si existe; si no, cajaRuta + cajasEmpleados + inversiones.
 */
export function computeCapitalRutaParaSumaAdmin(r: {
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  capitalTotal?: number;
}): number {
  if (typeof r.capitalTotal === "number") return roundMoney(r.capitalTotal);
  return roundMoney(r.cajaRuta + r.cajasEmpleados + r.inversiones);
}

/**
 * Patrimonio de ruta: cajaRuta + cajasEmpleados + inversiones.
 * `ganancias` y `perdidas` son informativos (p. ej. utilidad); no alteran el capital.
 * `capitalTotal` opcional en el tipo se ignora aquí (usar valor persistido en el llamador si aplica).
 */
export function computeCapitalRutaFromRutaFields(r: {
  cajaRuta: number;
  cajasEmpleados: number;
  inversiones: number;
  ganancias: number;
  perdidas?: number;
  capitalTotal?: number;
}): number {
  return computeCapitalTotalRutaDesdeSaldos({
    cajaRuta: r.cajaRuta,
    cajasEmpleados: r.cajasEmpleados,
    inversiones: r.inversiones,
  });
}
