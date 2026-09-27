/**
 * La fecha y la hora que lee el paciente, EN LA ZONA DE LA CLINICA.
 *
 * ===================== POR QUE ESTO ES UN ARCHIVO =====================
 *
 * Una cita guardada como `2026-09-22T08:00:00Z` son las 10:00 en Madrid. El
 * trabajo programado corre en Vercel, que corre en UTC, asi que el camino
 * natural —`new Date(cita.inicio).toLocaleTimeString()`— le manda al paciente
 * «08:00» y el paciente se presenta dos horas antes.
 *
 * No es una hipotesis: es lo que pasa siempre que la hora se formatea con el
 * reloj de quien la formatea en vez de con el de quien la lee. En el panel
 * (F5) el mismo problema existe por el lado del navegador y esta resuelto en
 * `src/lib/panel/formato.ts`.
 *
 * ================ Y POR QUE NO SE IMPORTA EL DEL PANEL ================
 *
 * Porque no son el mismo publico. `formato.ts` dice en su cabecera que por ahi
 * pasa «todo lo que se ensena en el panel», y el panel es una herramienta de
 * mostrador: el dia que a alguien le venga bien ensenar «hoy 10:00» o «mar 22»
 * para que quepa en una columna, lo cambiara ahi con toda la razon, y sin
 * saberlo habra cambiado lo que se le manda por WhatsApp a un paciente.
 *
 * Son dos decisiones distintas que hoy coinciden. Comparten libreria y locale,
 * no archivo.
 *
 * ESTE ARCHIVO ES PURO. Ni red, ni base, ni `new Date()` por dentro: el
 * instante entra por argumento. Asi se puede comprobar el cambio de hora de
 * marzo sin esperar a marzo.
 */
import { formatInTimeZone } from 'date-fns-tz'
import { es } from 'date-fns/locale'

/**
 * «martes 22 de septiembre».
 *
 * Sin el ano a proposito: un recordatorio se manda como mucho unos dias antes
 * de la cita, y «martes 22 de septiembre de 2026» suena a carta del banco. Si
 * algun dia se mandaran recordatorios con meses de antelacion, habria que
 * volver aqui.
 */
export function fechaParaElPaciente(instante: string | Date, zonaHoraria: string): string {
  return formatInTimeZone(new Date(instante), zonaHoraria, "EEEE d 'de' MMMM", { locale: es })
}

/** «10:00». Veinticuatro horas, que es como se dice una hora en Espana. */
export function horaParaElPaciente(instante: string | Date, zonaHoraria: string): string {
  return formatInTimeZone(new Date(instante), zonaHoraria, 'HH:mm')
}

/**
 * La ventana de citas a las que les toca recordatorio.
 *
 * Se mira hacia delante desde `ahora`, y NO se mira hacia atras: una cita que
 * ya empezo no necesita que le recuerden nada.
 *
 * El limite de abajo es `ahora` y no «ahora + 23 h» a proposito. Lo que impide
 * mandar dos veces es el `unique (clinica_id, cita_id)` de la base, no la
 * puntualidad del cron; asi que la ventana puede ser generosa y solaparse
 * entre invocaciones sin que pase nada. Al reves —una ventana estrecha y bien
 * centrada— un cron que se salta una hora deja a esos pacientes sin aviso y
 * nadie se entera.
 */
export function ventanaDeRecordatorios(
  ahora: Date,
  horasAntes: number,
): { readonly desde: string; readonly hasta: string } {
  return {
    desde: ahora.toISOString(),
    hasta: new Date(ahora.getTime() + horasAntes * 3600_000).toISOString(),
  }
}
