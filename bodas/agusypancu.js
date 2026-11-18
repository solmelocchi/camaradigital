/**
 * Cámara de María Agustina & Ignacio (10/04/2027, Córdoba)
 * Paleta y tipografías de su manual: marfil, chocolate, borgoña y champagne;
 * Yeseva One (alternativa a Recoleta) + Inter.
 */
window.BODA = {
  pareja: {
    nombre1: "Agustina",
    nombre2: "Ignacio",
    etiqueta: "Agus & Igna" // lo que va impreso en la cámara dibujada
  },
  fecha: "2027-04-10T15:30:00",

  // URL /exec del Apps Script de esta boda (ver GUIA.md).
  // Vacía = modo demostración (todo queda en el celular).
  webAppUrl: "",

  colores: {
    fondo: "#F6F2EC",     // marfil
    tinta: "#3B2A22",     // chocolate
    principal: "#3B2A22", // chocolate: cuerpo de la cámara y botones
    acento: "#6B1E2B"     // borgoña: detalles
  },

  fuentes: {
    titulos: "Yeseva One",
    textos: "Inter",
    google: "family=Yeseva+One&family=Inter:wght@300;400;500",
    cursiva: false
  },

  // Íconos marrones de la pestaña y de la pantalla de inicio
  iconos: "assets/bodas/agusypancu/",

  demo: { revelarEnMinutos: 3 },

  textoTarjeta: "Escaneá el código, sacá fotos durante la fiesta y compartí con nosotros los momentos que vivas."
};
