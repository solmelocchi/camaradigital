/**
 * Servidor local para probar la cámara de punta a punta sin publicar
 * nada en Google: sirve la invitación y responde en /exec como lo haría
 * la aplicación web de Apps Script (con Codigo.gs real y Google simulado).
 *
 *   node camara/backend/pruebas/servidor-local.js
 *   → abrir http://127.0.0.1:8790 (lleva a la cámara conectada a este servidor)
 *   HOST=0.0.0.0 para probar desde el celular en el mismo wifi
 *
 * Los datos viven en memoria: se pierden al cerrar el servidor.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { crearEntorno } = require("./simulador");

const PUERTO = Number(process.env.PUERTO) || 8790;
// HOST=0.0.0.0 deja entrar a otros equipos de la misma red wifi (para probar desde el celular)
const HOST = process.env.HOST || "127.0.0.1";
const DEMORA_MS = Number(process.env.DEMORA_MS) || 700; // imita la latencia de Apps Script
const RAIZ = path.resolve(__dirname, "..", "..");
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".png": "image/png", ".jpg": "image/jpeg", ".webmanifest": "application/manifest+json" };

const { contexto, clave, estado } = crearEntorno();
// Para probar el revelado sin esperar: REVELAR_MIN=2 revela a los 2 minutos;
// COMPARTIDO=1 deja el álbum compartido con los invitados.
if (process.env.REVELAR_MIN) estado.props.REVELADO_EN = new Date(Date.now() + Number(process.env.REVELAR_MIN) * 60000).toISOString();
if (process.env.COMPARTIDO) estado.props.ESTADO_ALBUM = "compartido";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/exec") {
    cors(res);
    res.setHeader("Content-Type", "application/json");
    if (req.method === "GET") return res.end(contexto.doGet().contenido);
    let cuerpo = "";
    req.on("data", (c) => { cuerpo += c; });
    req.on("end", () => setTimeout(() => {
      res.end(contexto.doPost({ postData: { contents: cuerpo } }).contenido);
    }, DEMORA_MS));
    return;
  }

  // La dirección corta (http://IP:8790) lleva directo a la cámara conectada a este servidor
  if (url.pathname === "/" && !url.search) {
    res.writeHead(302, { Location: `/?b=demo&api=http://${req.headers.host}/exec` });
    return res.end();
  }

  let archivo = path.join(RAIZ, decodeURIComponent(url.pathname));
  if (!archivo.startsWith(RAIZ)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(archivo) && fs.statSync(archivo).isDirectory()) archivo = path.join(archivo, "index.html");
  fs.readFile(archivo, (err, datos) => {
    if (err) { res.statusCode = 404; return res.end("No encontrado"); }
    res.setHeader("Content-Type", TIPOS[path.extname(archivo)] || "application/octet-stream");
    res.end(datos);
  });
}).listen(PUERTO, HOST, () => {
  const ips = HOST === "0.0.0.0"
    ? Object.values(require("os").networkInterfaces()).flat().filter((i) => i.family === "IPv4" && !i.internal).map((i) => i.address)
    : [HOST];
  ips.forEach((ip) => console.log(`Cámara en http://${ip}:${PUERTO}`));
  console.log(`Clave del panel: ${clave}`);
});
