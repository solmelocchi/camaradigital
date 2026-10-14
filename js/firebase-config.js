/**
 * Proyecto de Firebase de Koba Digital para los avisos al celular.
 * Estos datos son públicos (los usa el navegador); la llave secreta de
 * la cuenta de servicio va solo en el Apps Script de cada boda.
 * Lo usan la app y el service worker, por eso se cuelga de `self`.
 */
self.FIREBASE_CONFIG = null; // { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId }
self.FIREBASE_VAPID = "";    // Configuración del proyecto → Cloud Messaging → Certificados push web
