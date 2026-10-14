# Cámara descartable · Koba Digital

App web para bodas: cada invitado tiene una cámara descartable con 24 fotos.
Las fotos se revelan al día siguiente (a la hora que elija la pareja) y quedan
en el Google Drive de la pareja, para siempre.

- Se abre desde un link o desde el QR de la tarjeta de las mesas.
- Se instala en la pantalla de inicio como una app.
- HTML, CSS y JavaScript puro, sin frameworks ni compilación.
- El servidor de cada boda es un Google Apps Script en la cuenta de la pareja.

## Cómo se arma una boda nueva

1. **Servidor:** seguí [GUIA.md](GUIA.md) con la cuenta de Google de la pareja.
   Al final tenés una URL que termina en `/exec`.
2. **Configuración:** copiá `bodas/demo.js` como `bodas/<nombre-corto>.js`
   (por ejemplo `bodas/macaymarcos.js`, sin espacios ni acentos) y completá
   nombres, fecha, colores y la URL `/exec`.
3. **Links:**
   - Cámara: `https://solmelocchi.github.io/camaradigital/?b=macaymarcos`
   - Tarjeta para imprimir con el QR: `https://solmelocchi.github.io/camaradigital/tarjeta.html?b=macaymarcos`

Sin URL `/exec`, la cámara funciona en **modo demostración**: todo queda en el
celular y las fotos se revelan a los 3 minutos. Sirve para mostrársela a una
pareja antes de que contrate. Demo: `?b=demo`.

## Estructura

```
index.html            la app (registro, cámara, rollo, álbum, perfil)
tarjeta.html          tarjeta A6 para las mesas, con el QR de la boda
manifest.webmanifest  datos para instalarla como app
sw.js                 guarda la app para que abra rápido aunque haya poca señal
bodas/                una configuración por boda
css/base.css          colores, tipografías, botones y campos
css/app.css           diseño de la app
js/boda.js            carga bodas/<boda>.js según el ?b= del link
js/app.js             controlador de la app
js/descartable.js     la cámara dibujada (SVG) y su contador
js/visor.js           visor de la cámara dentro de la app
js/sonidos.js         obturador y rueda de avance (Web Audio)
js/imagenes.js        achica las fotos y borra su ubicación GPS antes de subirlas
js/api.js             comunicación con el Apps Script
js/api-demo.js        servidor simulado del modo demostración
backend/Codigo.gs     servidor (Google Apps Script)
backend/pruebas/      pruebas del servidor y servidor local de prueba
```

## Probar

```bash
node backend/pruebas/pruebas.js
```

Pruebas del servidor con Google simulado: cupo de 24, subidas simultáneas,
revelado, privacidad entre invitados, álbum y panel.

```bash
node backend/pruebas/servidor-local.js
```

Abre la app en `http://127.0.0.1:8790` conectada al servidor simulado. Con
`HOST=0.0.0.0` se puede abrir desde el celular en el mismo wifi;
`REVELAR_MIN=2` revela a los 2 minutos y `COMPARTIDO=1` comparte el álbum.

Más detalle técnico y de seguridad en [DISENO.md](DISENO.md).
