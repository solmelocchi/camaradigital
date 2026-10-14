/**
 * CÁMARA — comunicación con el servidor (Apps Script).
 * Se manda texto plano para que el navegador no haga una consulta previa
 * CORS; Apps Script responde JSON legible desde GitHub Pages.
 */
(function () {
  "use strict";

  class ErrorCamara extends Error {
    constructor(codigo, mensaje) {
      super(mensaje || codigo);
      this.codigo = codigo;
    }
  }

  // Errores pasajeros: vale la pena reintentar solos
  const REINTENTABLES = ["red", "ocupado", "error_interno"];
  const SIN_RED = "No pudimos conectarnos. Revisá tu conexión.";
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  function crear(url) {
    async function unaVez(accion, datos) {
      let respuesta;
      try {
        respuesta = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(Object.assign({ accion }, datos)),
          redirect: "follow"
        });
      } catch (e) {
        throw new ErrorCamara("red", SIN_RED);
      }
      let json;
      try { json = await respuesta.json(); }
      catch (e) { throw new ErrorCamara("red", SIN_RED); }
      if (!json.ok) throw new ErrorCamara(json.error, json.mensaje);
      return json;
    }

    return {
      demo: false,
      // intentos > 1: reintenta con espera creciente (1 s, 2 s, 4 s...)
      async llamar(accion, datos, intentos) {
        const total = intentos || 1;
        for (let i = 0; ; i++) {
          try { return await unaVez(accion, datos || {}); }
          catch (e) {
            if (i >= total - 1 || !REINTENTABLES.includes(e.codigo)) throw e;
            await espera(1000 * Math.pow(2, i) + Math.random() * 400);
          }
        }
      },
      async info() {
        try {
          const r = await fetch(url, { redirect: "follow" });
          return await r.json();
        } catch (e) {
          throw new ErrorCamara("red", SIN_RED);
        }
      }
    };
  }

  window.CamaraAPI = { crear, ErrorCamara };
})();
