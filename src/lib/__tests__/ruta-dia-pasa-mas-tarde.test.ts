import {
  buildClientesRuta,
  filtrarClientesRuta,
  compareClienteRutaPrioridad,
} from "@/lib/ruta-dia-build";
import type { ClienteItem, PrestamoItem } from "@/lib/empresa-api";
import type { ClienteRuta } from "@/types/finanzas";

const cliente: ClienteItem = {
  id: "c1",
  nombre: "Ana",
  ubicacion: "Centro",
  direccion: "",
  telefono: "",
  cedula: "",
  rutaId: "r1",
  adminId: "admin1",
  prestamo_activo: true,
  moroso: false,
  fechaCreacion: null,
};

const prestamo: PrestamoItem = {
  id: "p1",
  clienteId: "c1",
  rutaId: "r1",
  adminId: "admin1",
  empleadoId: "",
  monto: 100_000,
  interes: 0,
  modalidad: "diario",
  numeroCuotas: 10,
  totalAPagar: 100_000,
  saldoPendiente: 50_000,
  estado: "activo",
  fechaInicio: null,
  fechaFinal: null,
  fechaVencimiento: null,
  creadoEn: null,
  adelantoCuota: 0,
  ultimoPagoFecha: null,
  intentosFallidos: 0,
};

describe("pasa más tarde en ruta del día", () => {
  it("marca pasaMasTardeHoy sin afectar noPagoHoy", () => {
    const rows = buildClientesRuta([cliente], [prestamo], {
      noPagosHoy: [],
      pasaMasTardeHoy: [{ prestamoId: "p1" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pasaMasTardeHoy).toBe(true);
    expect(rows[0]?.noPagoHoy).toBe(false);
  });

  it("incluye pasa más tarde en el filtro pendientes", () => {
    const rows = buildClientesRuta([cliente], [prestamo], {
      noPagosHoy: [],
      pasaMasTardeHoy: [{ prestamoId: "p1" }],
    });
    const pendientes = filtrarClientesRuta(rows, "pendientes", "");
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]?.pasaMasTardeHoy).toBe(true);
    const postergados = filtrarClientesRuta(rows, "pasa_mas_tarde", "");
    expect(postergados).toHaveLength(1);
  });

  it("prioriza pasa más tarde en el orden", () => {
    const a: ClienteRuta = {
      cuotaId: "p1",
      prestamoId: "p1",
      clienteId: "c1",
      clienteNombre: "A",
      clienteDireccion: "",
      zona: "",
      monto: 1,
      fechaVencimiento: null,
      estado: "activo",
      frecuencia: "diario",
      numeroCuota: 1,
      totalCuotas: 1,
      diasVencidos: 0,
      intentosFallidos: 0,
      prioridad: 5,
      visitado: false,
      cuotaPagadaHoy: false,
      noPagoHoy: false,
      pasaMasTardeHoy: true,
      moroso: false,
    };
    const b: ClienteRuta = { ...a, prestamoId: "p2", cuotaId: "p2", prioridad: 1, pasaMasTardeHoy: false };
    expect(compareClienteRutaPrioridad(a, b)).toBeLessThan(0);
  });
});
