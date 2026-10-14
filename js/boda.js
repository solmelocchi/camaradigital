/**
 * Carga la configuración de la boda: ?b=emiliaytomas → bodas/emiliaytomas.js
 * Si el link no trae ?b= (por ejemplo al abrir la app instalada en Android),
 * se usa la última boda abierta en este celular.
 */
(function () {
  "use strict";
  const valido = (s) => /^[a-z0-9-]{1,40}$/.test(s || "");
  const params = new URLSearchParams(location.search);
  let slug = (params.get("b") || "").toLowerCase();
  if (!valido(slug)) {
    try { slug = localStorage.getItem("koba-camara:boda") || ""; } catch (e) { slug = ""; }
  }
  if (!valido(slug)) slug = "demo";
  try { localStorage.setItem("koba-camara:boda", slug); } catch (e) { /* modo privado */ }

  window.BODA_SLUG = slug;
  // Dirección pública de la app: el QR de la tarjeta siempre lleva acá,
  // aunque la tarjeta se abra desde un archivo de la compu
  window.URL_PUBLICA = "https://solmelocchi.github.io/camaradigital/";
  window.cargarBoda = new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = "bodas/" + slug + ".js";
    s.onload = () => (window.BODA ? ok(window.BODA) : mal(new Error("boda")));
    s.onerror = () => mal(new Error("boda"));
    document.head.appendChild(s);
  });
})();
