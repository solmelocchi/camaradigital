/**
 * ============================================================
 *  CONFIGURACIÓN DE UNA BODA — copiar este archivo para cada boda
 *  con un nombre corto sin espacios (ej. bodas/macaymarcos.js).
 *  El link de la cámara queda: https://…/camaradigital/?b=macaymarcos
 * ============================================================
 */
window.BODA = {
  pareja: {
    nombre1: "Emilia",
    nombre2: "Tomás"
  },
  fecha: "2027-03-14T18:30:00",

  // URL /exec del Apps Script de esta boda (ver GUIA.md).
  // Vacía = modo demostración: todo queda en el celular, sirve para mostrarla.
  webAppUrl: "",

  // Colores (los mismos de la invitación)
  colores: {
    fondo: "#FAF3EA",
    tinta: "#2B2320",
    principal: "#5C6B4F",
    acento: "#B98B4E"
  },

  // Solo para el modo demostración: a los cuántos minutos de registrarse
  // se "revelan" las fotos, para poder mostrar el revelado sin esperar.
  demo: { revelarEnMinutos: 3 },

  // Texto de la tarjeta para las mesas (tarjeta.html?b=…)
  textoTarjeta: "Escaneá el código, sacá fotos durante la fiesta y compartí con nosotros los momentos que vivas."
};
