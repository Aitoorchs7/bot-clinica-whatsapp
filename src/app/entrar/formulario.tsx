'use client'

import { useActionState } from 'react'

import { entrar, type EstadoEntrada } from '@/lib/panel/entrada'

const INICIAL: EstadoEntrada = { error: null }

/**
 * El formulario de entrada.
 *
 * `useActionState` en vez de un `onSubmit` con fetch: asi el formulario
 * funciona aunque el JavaScript no haya cargado todavia, que en el ordenador de
 * un mostrador con cuatro pestanas abiertas pasa mas de lo que parece.
 */
export function Formulario({ desde }: { desde: string }) {
  const [estado, accion, enviando] = useActionState(entrar, INICIAL)

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="desde" value={desde} />

      <label className="block">
        <span className="text-etiqueta uppercase text-apagado">Correo</span>
        <input
          name="correo"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full rounded border border-linea bg-papel px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-etiqueta uppercase text-apagado">Contraseña</span>
        <input
          name="contrasena"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded border border-linea bg-papel px-3 py-2 text-sm"
        />
      </label>

      {estado.error ? (
        <p data-prueba="error-entrada" role="alert" className="text-sm text-rojo-letra">
          {estado.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded bg-tinta px-3 py-2 text-sm text-papel transition-transform active:scale-[0.99] disabled:opacity-50"
      >
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
