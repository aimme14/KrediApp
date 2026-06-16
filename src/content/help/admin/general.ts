import type { HelpRoleGeneral } from "../types";

export const ADMIN_HELP_GENERAL: HelpRoleGeneral = {
  title: "Guía del administrador",
  intro:
    "Como administrador coordinas rutas, empleados, préstamos y el cierre diario. Tu trabajo conecta la operación en campo con el control financiero de la empresa.",
  dailyFlow: [
    "Al iniciar el día, revisa que los saldos estén correctos: caja, inversiones, total invertido. Las que sean necesarias.",
    "Coordínate con el empleado: comunícate con él y confirma que va a iniciar su jornada laboral.",
    "En Ruta del día, asigna el efectivo que recibirá antes de salir a trabajar.",
    "En Permisos (al final del panel lateral), habilíta al empleado para que pueda ingresar al sistema.",
    "Durante el día, gestiona clientes e inversiones; también puedes seguir el avance del empleado desde las notificaciones.",
    "Al cierre, el empleado te entrega un reporte del día. Revisa que todo cuadre —cajas, efectivo a entregar, cobros y demás— antes de aceptarlo.",
    "Confirma que las transacciones y las cajas quedaron cuadradas despues de aceptar el reporte del día del empleado.",
    "Cierra la jornada laboral del trabajador desde Permisos, la misma sección del paso 4.",
  ],
  faqs: [
    {
      q: "¿Cuál es mi primera acción al iniciar el día?",
      a: "Abre Inicio para ver el estado general y luego Ruta del día para repartir efectivo a los trabajadores antes de que salgan a cobrar.",
    },
    {
      q: "¿Dónde apruebo un préstamo que pidió un trabajador?",
      a: "En Solicitudes préstamo. Si lo apruebas, el préstamo se crea automáticamente. También puedes crear préstamos directamente en Préstamos.",
    },
    {
      q: "¿Qué hago si un trabajador no cuadra su caja?",
      a: "Revisa el detalle en Reportes del día antes de aprobar. Puedes rechazar la entrega y pedirle que corrija los cobros o gastos.",
    },
    {
      q: "¿Cuándo marco un cliente como moroso?",
      a: "En Clientes morosos, cuando deba dejar de aparecer en la ruta normal hasta regularizar su situación.",
    },
  ],
};
