/**
 * Proyecto de Firebase de Koba Digital para los avisos al celular.
 * Estos datos son públicos (los usa el navegador); la llave secreta de
 * la cuenta de servicio va solo en el Apps Script de cada boda.
 * Lo usan la app y el service worker, por eso se cuelga de `self`.
 */
self.FIREBASE_CONFIG = {
  apiKey: "AIzaSyA5MyxZeoZbYqChgTE5PGczs7tnq8me83M",
  authDomain: "camara-boda.firebaseapp.com",
  projectId: "camara-boda",
  storageBucket: "camara-boda.firebasestorage.app",
  messagingSenderId: "569435707780",
  appId: "1:569435707780:web:8c202e03d165f7e2d2e5d1"
};
// Configuración del proyecto → Cloud Messaging → Certificados push web
self.FIREBASE_VAPID = "BDsfh6MatyCD2-ipZ26bPECTiEqNDqZa1yyUA1bj59rHnRn1HbsmvfM9Bp419o8L2rTf5a2raLyO5Z5W_G3otoU";
