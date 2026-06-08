import {
  HREF_ADMIN_SOLICITUDES_PRESTAMO,
  mapGastoEmpleadoNotif,
  mapPrestamoEmpleadoNotif,
  mapSolicitudPrestamoNotif,
  mergeAdminOperativoNotifs,
} from "@/lib/admin-notificaciones-operativas";
import { inicioDiaColombiaUtc } from "@/lib/colombia-day-bounds";

const HOY = "2026-06-08";

function tsAtColombiaHour(hour: number, minute = 0): number {
  const start = inicioDiaColombiaUtc(HOY)!.getTime();
  return start + hour * 60 * 60 * 1000 + minute * 60 * 1000;
}

describe("mapGastoEmpleadoNotif", () => {
  it("incluye gasto legado (medianoche UTC) del día de hoy", () => {
    const item = mapGastoEmpleadoNotif("g-legacy", {
      fecha: "2026-06-08T00:00:00.000Z",
      monto: 1000,
      descripcion: "Alimentación",
      creadoPorNombre: "Josué",
    });
    expect(item).not.toBeNull();
    expect(item!.title).toBe("Nuevo gasto de un trabajador");
  });

  it("usa creadoEn para ordenar, no la fecha de calendario (inicio de día)", () => {
    const creadoEn = tsAtColombiaHour(8, 30);
    const item = mapGastoEmpleadoNotif("g1", {
      fecha: inicioDiaColombiaUtc(HOY),
      creadoEn: { toMillis: () => creadoEn },
      monto: 4000,
      descripcion: "Gasolina",
      creadoPorNombre: "Josué",
    });
    expect(item).not.toBeNull();
    expect(item!.at).toBe(creadoEn);
  });
});

describe("mapSolicitudPrestamoNotif", () => {
  it("incluye solicitudes pendientes de días anteriores con enlace", () => {
    const ayer = inicioDiaColombiaUtc("2026-06-07")!.getTime();
    const item = mapSolicitudPrestamoNotif(
      "sol-1",
      {
        creadaEn: { toMillis: () => ayer },
        clienteNombre: "María",
        monto: 50_000,
      },
      "Josué"
    );
    expect(item).not.toBeNull();
    expect(item!.href).toBe(HREF_ADMIN_SOLICITUDES_PRESTAMO);
    expect(item!.title).toBe("Solicitud de préstamo");
  });
});

describe("mergeAdminOperativoNotifs", () => {
  it("ordena gastos y préstamos por hora real (más reciente arriba)", () => {
    const gasto = mapGastoEmpleadoNotif("g1", {
      fecha: inicioDiaColombiaUtc(HOY),
      creadoEn: { toMillis: () => tsAtColombiaHour(8, 30) },
      monto: 4000,
      descripcion: "Gasolina",
      creadoPorNombre: "Josué",
    })!;
    const prestamoTarde = mapPrestamoEmpleadoNotif(
      "p1",
      {
        creadoEn: { toMillis: () => tsAtColombiaHour(8, 25) },
        clienteNombre: "gabilan",
        monto: 100_000,
      },
      "Josué"
    )!;
    const prestamoTemprano = mapPrestamoEmpleadoNotif(
      "p2",
      {
        creadoEn: { toMillis: () => tsAtColombiaHour(8, 23) },
        clienteNombre: "felipe",
        monto: 250_000,
      },
      "Josué"
    )!;

    const merged = mergeAdminOperativoNotifs([
      [gasto],
      [prestamoTarde, prestamoTemprano],
    ]);

    expect(merged.map((n) => n.id)).toEqual([
      "gasto-g1",
      "prestamo-p1",
      "prestamo-p2",
    ]);
  });
});
