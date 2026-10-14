/**
 * Avisos al celular con Firebase Cloud Messaging.
 * En iPhone solo funcionan con la app instalada en la pantalla de inicio
 * (iOS 16.4 o más nuevo) y el permiso se pide dentro de un toque.
 */
(function () {
  "use strict";
  const VERSION = "10.14.1";
  let mensajeria = null;

  const configurado = () => !!(self.FIREBASE_CONFIG && self.FIREBASE_VAPID);
  const soportado = () => configurado() && window.isSecureContext &&
    "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;

  const cargar = (src) => new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = ok;
    s.onerror = () => mal(new Error("No se pudo cargar Firebase."));
    document.head.appendChild(s);
  });

  function sdk() {
    if (!mensajeria) {
      mensajeria = cargar(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-app-compat.js`)
        .then(() => cargar(`https://www.gstatic.com/firebasejs/${VERSION}/firebase-messaging-compat.js`))
        .then(() => {
          if (!firebase.apps.length) firebase.initializeApp(self.FIREBASE_CONFIG);
          return firebase.messaging();
        });
      mensajeria.catch(() => { mensajeria = null; });
    }
    return mensajeria;
  }

  // Dirección de avisos de este celular (usa el service worker de la app)
  async function token() {
    const m = await sdk();
    const registro = await navigator.serviceWorker.ready;
    return m.getToken({ vapidKey: self.FIREBASE_VAPID, serviceWorkerRegistration: registro });
  }

  // Hay que llamarlo directo desde un toque: lo primero es pedir el permiso
  async function activar() {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") {
      const e = new Error(permiso === "denied" ? "bloqueados" : "sin_permiso");
      e.codigo = e.message;
      throw e;
    }
    return token();
  }

  // Avisos que llegan con la app abierta (con la app cerrada los muestra el sistema)
  async function alRecibir(fn) {
    const m = await sdk();
    m.onMessage(fn);
  }

  window.Avisos = {
    configurado,
    soportado,
    activar,
    token,
    alRecibir,
    get permiso() { return "Notification" in window ? Notification.permission : "no"; }
  };
})();
