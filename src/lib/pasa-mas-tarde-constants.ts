/** Tipo de documento en subcolección `pagos` (no es método de pago). */
export const TIPO_PAGO_PASA_MAS_TARDE = "pasa_mas_tarde" as const;

export type TipoPagoPasaMasTarde = typeof TIPO_PAGO_PASA_MAS_TARDE;
