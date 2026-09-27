/**
 * La etiqueta de estado. Cuatro tonos y ninguno mas.
 *
 * El color aqui es semantico, no decorativo: rojo es «alguien tiene que hacer
 * algo», amarillo es «a medias», verde es «cerrado» y neutro es «ya no importa».
 * Cuatro pasteles muy lavados, porque una fila de la agenda con cinco colores
 * saturados deja de leerse como una lista y pasa a leerse como una alarma.
 *
 * Y el color nunca va solo: la palabra esta escrita dentro. Una agenda que solo
 * se distingue por el color no la puede leer todo el mundo.
 */
export type Tono = 'verde' | 'amarillo' | 'rojo' | 'azul' | 'neutro'

const TONOS: Readonly<Record<Tono, string>> = {
  verde: 'bg-verde-fondo text-verde-letra',
  amarillo: 'bg-amarillo-fondo text-amarillo-letra',
  rojo: 'bg-rojo-fondo text-rojo-letra',
  azul: 'bg-azul-fondo text-azul-letra',
  neutro: 'bg-hueso text-apagado',
}

export function Etiqueta({ tono = 'neutro', children }: { tono?: Tono; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-etiqueta font-medium uppercase ${TONOS[tono]}`}
    >
      {children}
    </span>
  )
}
