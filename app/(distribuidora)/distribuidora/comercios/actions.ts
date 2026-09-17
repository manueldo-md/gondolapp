/*
 * `validarComercio` vivía acá y se borró el 17/9/2026.
 *
 * Gemela de `toggleValidarComercio` del panel de admin: escribía SOLO
 * `comercios.validado`, dejaba `estado` en 'pendiente_validacion' y no acreditaba
 * nada. El comercio quedaba aprobado en la lista y pendiente en la cola, y el
 * gondolero no cobraba el alta.
 *
 * La única validación de la distribuidora es ahora
 * `/distribuidora/comercios/pendientes`, sobre `lib/validacion-comercio.ts`.
 */
export {}
