import { redirect } from 'next/navigation'

/**
 * La raiz no ensena nada.
 *
 * Este despliegue tiene dos cosas dentro: el webhook de WhatsApp, al que llama
 * Meta, y el panel, al que entra la clinica. No hay pagina publica, asi que la
 * raiz manda al panel y de ahi `proxy.ts` decide: con sesion, entra; sin
 * sesion, a /entrar.
 */
export default function Raiz() {
  redirect('/panel')
}
