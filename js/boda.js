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
  // La demo no se recuerda: un link sin ?b= abre la última boda real usada
  if (slug !== "demo") {
    try { localStorage.setItem("koba-camara:boda", slug); } catch (e) { /* modo privado */ }
  }

  window.BODA_SLUG = slug;

  // iPhone usa el start_url del manifiesto ("./", sin la boda) al agregar el
  // ícono a la pantalla de inicio. Sin manifiesto guarda la dirección actual
  // (con ?b= y la sesión), así la app instalada abre la cámara correcta.
  // Por eso el manifiesto se agrega solo fuera de iPhone/iPad.
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (!esIOS) {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = "manifest.webmanifest";
    document.head.appendChild(link);
  }

  // App instalada que no sabe de qué boda es: mejor avisar que abrir la demo
  const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  window.BODA_PERDIDA = instalada && slug === "demo" && !params.get("b");
  // Dirección pública de la app: el QR de la tarjeta siempre lleva acá,
  // aunque la tarjeta se abra desde un archivo de la compu
  window.URL_PUBLICA = "https://solmelocchi.github.io/camaradigital/";
  // Tipografías de la boda (opcional): { titulos, textos, google, cursiva }
  function aplicarFuentes(f) {
    if (!f) return;
    if (f.google) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?" + f.google + "&display=swap";
      document.head.appendChild(link);
    }
    const root = document.documentElement;
    if (f.titulos) root.style.setProperty("--font-display", `"${f.titulos}", Georgia, serif`);
    if (f.textos) root.style.setProperty("--font-body", `"${f.textos}", system-ui, sans-serif`);
    if (f.cursiva === false) root.classList.add("sin-cursiva");
  }

  window.cargarBoda = new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = "bodas/" + slug + ".js";
    s.onload = () => {
      if (!window.BODA) return mal(new Error("boda"));
      aplicarFuentes(window.BODA.fuentes);
      ok(window.BODA);
    };
    s.onerror = () => mal(new Error("boda"));
    document.head.appendChild(s);
  });
})();
