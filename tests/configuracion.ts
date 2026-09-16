/**
 * setupFiles de Vitest. Corre antes de cada archivo de test.
 * Solo carga el entorno y avisa, una vez, si falta.
 */
import { avisarSiNoHayBaseDeDatos } from './ayuda/entorno'

avisarSiNoHayBaseDeDatos()
