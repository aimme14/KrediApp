import type { HelpPageContent } from "../types";

export type AdminHelpPageKey =
  | "inicio"
  | "ruta-del-dia"
  | "prestamo"
  | "solicitudes-prestamo"
  | "reportes-dia"
  | "cliente"
  | "empleado"
  | "rutas"
  | "gastos"
  | "gestion-financiera"
  | "resumen"
  | "cliente-moroso"
  | "permisos"
  | "cobrar"
  | "pagos-diarios";

export const ADMIN_HELP_PAGES: Record<AdminHelpPageKey, HelpPageContent> = {
  inicio: {
    title: "Inicio",
    summary:
      "Vista general de la operación del día: rutas, clientes, préstamos activos, morosos y capital. Úsala como punto de partida cada mañana.",
    steps: [
      "Revisa rigurosamente la informacion del estado de cada ruta (capital, base, inversiones, ganancias, perdidas, clientes, prestamos, morosos, etc).",
      "Accede rápido a las secciones clave desde el menú lateral o la barra inferior en móvil.",
    ],
    cautions: [
      "No asumas que las cifras de las cajas del inicio del dia encajrán con las del cierre en Reportes.",
    ],
    relatedLinks: [
      { label: "Ruta del día", href: "/dashboard/admin/ruta-del-dia" },
      { label: "Reportes", href: "/dashboard/admin/reportes-dia" },
    ],
  },
  "ruta-del-dia": {
    title: "Ruta del día",
    summary:
      "Seccion dedicada para repartir efectivo desde la caja de cada ruta hacia la caja del trabajador. Se recomienda hacerlo al inicio del día, antes de que salgan a cobrar.",
    steps: [
      "Selecciona y verifica la ruta y el trabajador al que vas a entregar base.",
      "Ingresa el monto a asignar y confirma la operación.",
      "Verifica que el trabajador vea el saldo actualizado en su Caja del día.",
    ],
    cautions: [
      "No asignes más efectivo del disponible en la caja de la ruta.",
      "Evita asignaciones duplicadas al mismo trabajador en el mismo día sin verificar su saldo actual.",
    ],
    relatedLinks: [
      { label: "Inversiones", href: "/dashboard/admin/gestion-financiera" },
      { label: "Reportes", href: "/dashboard/admin/reportes-dia" },
    ],
  },
  prestamo: {
    title: "Préstamos",
    summary:
      "Crea préstamos, cobra cuotas directamente o consulta los activos por ruta. Aquí ves saldos pendientes, cuotas y el historial por cliente.",
    steps: [
      "Asegurate que el periodo esté abierto antes de crear un préstamo.",
      "Filtra por ruta si necesitas enfocarte en una zona.",
      "Para un préstamo nuevo: elige ruta y cliente, define monto, cuotas, interés y modalidad.",
      "Verifica y confirma los valores de los datos antes de crear. El préstamo queda activo de inmediato.",
    ],
    cautions: [
      "Asegurate que el periodo esté abierto antes de crear un préstamo.",
      "Verifica que el cliente no esté en morosos antes de prestar.",
      "Revisa el monto y las cuotas: un error al crear afecta todo el ciclo de cobro.",
      "Las correcciones de los datos mal creados solo la puede realizar el proveedor del sistema y tiene un costo adicional.",
      
    ],
    relatedLinks: [
      { label: "Solicitudes préstamo", href: "/dashboard/admin/solicitudes-prestamo" },
      { label: "Clientes", href: "/dashboard/admin/cliente" },
    ],
  },
  "solicitudes-prestamo": {
    title: "Solicitudes de préstamo",
    summary:
      "Cada que un trabajador desee crear un nuevo prestamo o renovar uno por un valor mas alto, se debe aprobar o rechazar. Al aprobar, el préstamo se crea automáticamente con los datos de la solicitud.",
    steps: [
      "Revisa cada solicitud: cliente, monto, cuotas e interés propuesto.",
      "Aprueba si los datos son correctos y el cliente está habilitado para crédito.",
      "Rechaza si hay inconsistencias y comunica al trabajador el motivo.",
    ],
    cautions: [
      "No apruebes solicitudes de clientes marcados como morosos.",
      "Cada correccion de los datos mal creados solo la puede realizar el proveedor del sistema y tiene un costo adicional.",
    ],
  },
  "reportes-dia": {
    title: "Reportes",
    summary:
      "Los trabajadores entregan su cierre diario aquí. Revisa cobros, gastos y cuadre antes de aprobar o rechazar cada entrega.",
    steps: [
      "Atiende primero las solicitudes pendientes de confirmación.",
      "Abre el detalle o PDF para verificar cobros en efectivo y transferencia.",
      "Aprueba si cuadra; rechaza si faltan cobros, hay montos incorrectos o gastos sin justificar.",
    ],
    cautions: [
      "No apruebes un reporte sin revisar el desglose de cobros del día.",
      "Un reporte aprobado queda registrado; usa rechazo si el trabajador debe corregir antes del cierre.",
      "Si aceptas un reporte mal hecho no se podrá corregir despues de aceptarlo.",
    ],
    relatedLinks: [
      { label: "Ruta del día", href: "/dashboard/admin/ruta-del-dia" },
      { label: "Gastos operativos", href: "/dashboard/admin/gastos" },
    ],
  },
  cliente: {
    title: "Clientes",
    summary:
      "Registra y administra clientes por ruta: datos de contacto, ubicación y asignación. Un cliente bien creado facilita préstamos y cobros.",
    steps: [
      "Crea el cliente con ruta asignada y datos completos.",
      "Usa el filtro por ruta para ubicar clientes rápidamente.",
      "Edita datos si cambia teléfono, dirección o ruta de atención.",
    ],
    cautions: [
      "No dupliques clientes con la misma cédula o nombre en la misma ruta.",
    ],
    relatedLinks: [{ label: "Préstamos", href: "/dashboard/admin/prestamo" }],
  },
  empleado: {
    title: "Empleados",
    summary:
      "Crea trabajadores con credenciales de ingreso y asígnalos a una ruta.",
    steps: [
      "Completa nombre, cédula, contacto y ruta antes de crear.",
      "Entrega al trabajador su correo y contraseña de acceso.",
    ],
    cautions: [
      "Un trabajador sin ruta no podrá ver su lista de clientes ni registrar cobros.",
    ],
    relatedLinks: [
      { label: "Rutas", href: "/dashboard/admin/rutas" },
      { label: "Ruta del día", href: "/dashboard/admin/ruta-del-dia" },
    ],
  },
  rutas: {
    title: "Rutas",
    summary:
      "Define las zonas de cobro de tu operación. Cada ruta agrupa clientes, empleado y caja propia.",
    steps: [
      "Crea rutas con nombre y ubicación claros.",
      "Asigna un empleado responsable por ruta.",
      "Si una ruta deja de estar activa, avisale al proveedor del sistema para organizar la desvinculación de la misma.",
    ],
    cautions: [],
  },
  gastos: {
    title: "Gastos operativos",
    summary:
      "Registra gastos de la operación por periodo. Los gastos del admin y de rutas impactan el resumen económico.",
    steps: [
      "Selecciona cuidadosamente la ruta y el tipo de gasto, será de donde saldrá el dinero.",
      "Registra motivo y monto de cada gasto con detalle.",
      "Revisa totales antes de aceptar el gasto.",
    ],
    cautions: [
      "Gastos sin motivo dificultan la auditoría en el resumen económico.",
    ],
    relatedLinks: [{ label: "Resumen económico", href: "/dashboard/admin/resumen" }],
  },
  "gestion-financiera": {
    title: "Inversiones",
    summary:
      "Mueve capital entre tu base de administrador y las cajas de las rutas. Úsalo para reforzar rutas con baja liquidez o retirar excedentes.",
    steps: [
      "Consulta tu base total y el saldo de cada ruta.",
      "Inversión a ruta: transfiere desde tu base hacia la caja de una ruta.",
      "Inversión a admin: devuelve capital desde la caja de una ruta a tu base.",
      "Confirma monto y ruta antes de ejecutar cada movimiento.",
    ],
    cautions: ["Verifica el saldo disponible antes de invertir o retirar."],
    relatedLinks: [
      { label: "Ruta del día", href: "/dashboard/admin/ruta-del-dia" },
      { label: "Resumen económico", href: "/dashboard/admin/resumen" },
    ],
  },
  resumen: {
    title: "Resumen económico",
    summary:
      "Consulta periodos contables con apertura y cierre por ruta: caja, capital, inversiones y gastos. Cierra periodos para congelar el histórico.",
    steps: [
      "Abre un periodo nuevo cuando inicies un corte contable.",
      "Durante el periodo, opera con normalidad (cobros, préstamos, gastos).",
      "Al finalizar, cierra el periodo para guardar datos de cierre.",
      "Compara apertura vs cierre por ruta para detectar desviaciones.",
    ],
    cautions: [
      "Ejecuta los cierres siempre en la noche o mañana cuando en elpmeado no esté laborando",
      "No cierres un periodo si aún hay reportes pendientes de aprobar.",
      "Un periodo cerrado no se reabre; verifica totales antes de confirmar el cierre.",
    ],
    relatedLinks: [
      { label: "Inversiones", href: "/dashboard/admin/gestion-financiera" },
      { label: "Gastos operativos", href: "/dashboard/admin/gastos" },
    ],
  },
  "cliente-moroso": {
    title: "Clientes morosos",
    summary:
      "Excluye clientes de la ruta normal cuando están en mora grave. No podrán recibir nuevos préstamos hasta que los quites de esta lista.",
    steps: [
      "Busca al cliente por nombre, código o cédula.",
      "Márcalo como moroso cuando así lo consideres mejor.",
      "Retíralo de morosos solo cuando regularice o acuerdes reintegro.",
    ],
    cautions: [
      "Marcar moroso a un cliente hace que el empleado visualmente lo pueda identificar mejor.",
    
    ],
  },
  permisos: {
    title: "Permisos",
    summary:
      "Configura en que horario el empleado puede tener acceso de ingresar al sistema.",
    steps: [
      "Revisa los permisos actuales.",
      "Gestiona los permisos de los empleados según la necesidad.",
    
    ],
    cautions: [
      "Es cerrar el horario laboral del empleado al terminar su jornada, dejala abierta puede incurrir en errores.",
      "Cada correccion de los datos mal creados acausa de no cerrar el horario laboral solo la puede realizar el proveedor del sistema y tiene un costo adicional.",
    ],
  },
  cobrar: {
    title: "Cobrar",
    summary:
      "Vista de apoyo para registrar o revisar cobros desde el panel de administrador cuando necesitas intervenir directamente.",
    steps: [
      "Selecciona cliente y préstamo activo.",
      "Registra el monto cobrado y el método de pago.",
      "Verifica que el saldo del préstamo se actualice correctamente.",
    ],
    cautions: [
      "Los cobros en campo los registra normalmente el trabajador; usa esta vista solo cuando sea necesario.",
    ],
    relatedLinks: [{ label: "Préstamos", href: "/dashboard/admin/prestamo" }],
  },
  "pagos-diarios": {
    title: "Pagos diarios",
    summary:
      "Vista en tiempo real de todos los cobros registrados en el día, por empleados y por ti. Desde aquí puedes anular un cobro erróneo o duplicado antes de que el reporte del empleado sea aprobado.",
    steps: [
      "Selecciona la fecha para ver los movimientos de ese día.",
      "Todos los cobros del día aparecen en la lista con cliente, ruta, método de pago y quién lo registró (trabajador o administrador).",
      "Si detectas un cobro erróneo o duplicado, usa el botón Anular en la fila correspondiente.",
      "Marca la casilla de confirmación y, si quieres, escribe un motivo opcional. Luego confirma la anulación.",
      "El saldo del préstamo, la caja del empleado y las tarjetas de ruta se corrigen automáticamente.",
    ],
    cautions: [
      "Solo se pueden anular cobros del día actual.",
      "Solo se puede anular el cobro más reciente del préstamo. Si hay dos errores, anula primero el más reciente.",
      "Si el reporte del empleado ya fue aprobado, el cobro en efectivo no se puede anular. Revisa antes de aprobar reportes.",
      "Los cobros por transferencia se pueden anular aunque el reporte esté aprobado, ya que no pasan por la caja del empleado.",
    ],
    relatedLinks: [
      { label: "Reportes", href: "/dashboard/admin/reportes-dia" },
      { label: "Préstamos", href: "/dashboard/admin/prestamo" },
    ],
  },
};
