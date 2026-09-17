/*
 * `toggleValidarComercio` vivía acá y se borró el 17/9/2026.
 *
 * Escribía SOLO `comercios.validado` y no tocaba `estado`. Como las colas de
 * pendientes filtran por `estado` y las listas por `validado`, un comercio
 * "validado" desde acá quedaba aprobado en una pantalla y pendiente en la otra
 * —y sin cobrar, porque no acreditaba nada. En prod dejó cuatro comercios así.
 *
 * Peor que no tener el botón: el tablero mandaba justo a esa lista, así que era
 * el camino que la app ofrecía para validar comercios y era el que no validaba.
 *
 * La única validación es ahora `/admin/comercios/pendientes`, sobre
 * `lib/validacion-comercio.ts`.
 */
export {}
