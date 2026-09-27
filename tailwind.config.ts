import type { Config } from "tailwindcss";

/**
 * La paleta del panel, en un solo sitio.
 *
 * Monocromo calido, un solo trazo de 1px para todas las lineas y cuatro
 * pasteles muy lavados para los estados. Los nombres estan en castellano a
 * proposito: `border-linea` y `text-apagado` se leen de un vistazo en el
 * marcado, y `bg-hueso` dice mas que `bg-stone-50`.
 *
 * Que los colores vivan aqui y no sueltos por las pantallas es lo que impide
 * que la septima tabla estrene su propio gris.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/componentes/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        hueso: "#F7F6F3",
        papel: "#FFFFFF",
        linea: "#EAEAEA",
        tinta: "#111111",
        apagado: "#787774",
        verde: { fondo: "#EDF3EC", letra: "#346538" },
        rojo: { fondo: "#FDEBEC", letra: "#9F2F2D" },
        azul: { fondo: "#E1F3FE", letra: "#1F6C9F" },
        amarillo: { fondo: "#FBF3DB", letra: "#956400" },
      },
      fontFamily: {
        sans: ["var(--tipo-sans)", "system-ui", "sans-serif"],
        serif: ["var(--tipo-serif)", "Georgia", "serif"],
        mono: ["var(--tipo-mono)", "monospace"],
      },
      borderRadius: {
        DEFAULT: "6px",
        caja: "8px",
      },
      fontSize: {
        etiqueta: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.06em" }],
      },
    },
  },
  plugins: [],
};

export default config;
