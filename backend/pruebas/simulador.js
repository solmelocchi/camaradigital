/**
 * Simulación de los servicios de Apps Script (Planilla, Drive, bloqueo,
 * propiedades) que carga Codigo.gs tal cual. La usan las pruebas y el
 * servidor local.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

function crearEntorno(respuestas) {
  const estado = { hojas: {}, carpetas: {}, archivos: {}, props: {}, lockTomado: false, alertas: [], respuestasPrompt: ["Emilia & Tomás", "", ""], alCrearArchivo: null };

  // Sheets guarda "'=texto" como el texto "=texto" (el apóstrofo no queda)
  const guardarValor = (v) => {
    estado.escrituras.push(v);
    return typeof v === "string" && v.startsWith("'") ? v.slice(1) : v;
  };
  estado.escrituras = [];

  function crearHoja(nombre) {
    const filas = [];
    const hoja = {
      filas,
      getName: () => nombre,
      appendRow: (fila) => { filas.push(fila.map(guardarValor)); },
      getLastRow: () => filas.length,
      setFrozenRows: () => {},
      getDataRange: () => ({ getValues: () => filas.map((f) => f.slice()) }),
      getRange: (r, c, nr, nc) => ({
        setFontWeight: () => {},
        getValue: () => (filas[r - 1] || [])[c - 1] || "",
        setValue: (v) => { filas[r - 1] = filas[r - 1] || []; filas[r - 1][c - 1] = guardarValor(v); },
        setValues: (vals) => {
          vals.forEach((fila, i) => {
            filas[r - 1 + i] = filas[r - 1 + i] || [];
            fila.forEach((v, j) => { filas[r - 1 + i][c - 1 + j] = guardarValor(v); });
          });
        }
      })
    };
    estado.hojas[nombre] = hoja;
    return hoja;
  }

  const libro = {
    getSheetByName: (n) => estado.hojas[n] || null,
    insertSheet: (n) => crearHoja(n)
  };

  const ui = {
    ButtonSet: { OK: "OK", OK_CANCEL: "OK_CANCEL", YES_NO: "YES_NO" },
    Button: { OK: "OK", YES: "YES" },
    alert: (...args) => { estado.alertas.push(args.filter((a) => typeof a === "string" && !a.startsWith("YES") && a !== "OK").join("\n")); return "YES"; },
    prompt: () => { const r = estado.respuestasPrompt.shift() || ""; return { getSelectedButton: () => "OK", getResponseText: () => r }; },
    createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} })
  };

  function crearArchivo(blob) {
    if (estado.alCrearArchivo) estado.alCrearArchivo(blob);
    const id = "file_" + crypto.randomUUID().slice(0, 8);
    const archivo = {
      id, nombre: blob.name, bytes: blob.bytes, papelera: false,
      getId: () => id,
      getBlob: () => ({ getBytes: () => blob.bytes }),
      setTrashed: (v) => { archivo.papelera = v; }
    };
    estado.archivos[id] = archivo;
    return archivo;
  }
  function crearCarpeta(nombre) {
    const id = "folder_" + crypto.randomUUID().slice(0, 8);
    const carpeta = {
      getId: () => id,
      getName: () => nombre,
      createFolder: (n) => crearCarpeta(n),
      createFile: (blob) => crearArchivo(blob)
    };
    estado.carpetas[id] = carpeta;
    return carpeta;
  }

  // Internet de Google (UrlFetchApp): se registra cada pedido y se responde
  // con estado.respuestaFcm(pedido) → { codigo, texto }
  estado.pedidos = [];
  estado.cache = {};
  estado.disparadores = [];
  estado.respuestaFcm = () => ({ codigo: 200, texto: "{}" });
  const respuesta = (r) => ({ getResponseCode: () => r.codigo, getContentText: () => r.texto });
  const pedir = (url, op) => {
    const pedido = Object.assign({ url }, op);
    estado.pedidos.push(pedido);
    if (url.includes("oauth2.googleapis.com")) return respuesta({ codigo: 200, texto: JSON.stringify({ access_token: "acceso-123" }) });
    return respuesta(estado.respuestaFcm(pedido));
  };

  const firmados = (buf) => Array.from(buf).map((b) => (b > 127 ? b - 256 : b));

  const contexto = {
    console: { log: () => {}, error: () => {} },
    JSON, Date, Math, Object, Array, String, Number, RegExp, Error,
    SpreadsheetApp: { getActiveSpreadsheet: () => libro, flush: () => {}, getUi: () => ui },
    DriveApp: {
      createFolder: crearCarpeta,
      getFolderById: (id) => { if (!estado.carpetas[id]) throw new Error("No existe la carpeta " + id); return estado.carpetas[id]; },
      getFileById: (id) => { if (!estado.archivos[id]) throw new Error("no existe " + id); return estado.archivos[id]; }
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: "sha256" },
      Charset: { UTF_8: "utf8" },
      computeDigest: (alg, texto) => firmados(crypto.createHash(alg).update(texto, "utf8").digest()),
      base64Decode: (s) => { if (/[^A-Za-z0-9+/=]/.test(s)) throw new Error("base64 inválido"); return firmados(Buffer.from(s, "base64")); },
      base64Encode: (bytes) => Buffer.from(bytes.map((b) => b & 0xff)).toString("base64"),
      newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
      formatDate: (d) => d.toISOString().slice(0, 19).replace(/[:T]/g, "-"),
      base64EncodeWebSafe: (t) => Buffer.from(typeof t === "string" ? t : t.map((b) => b & 0xff)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
      computeRsaSha256Signature: (texto, clave) => { if (!String(clave).includes("PRIVATE KEY")) throw new Error("clave inválida"); return [1, 2, 3, 4]; }
    },
    UrlFetchApp: { fetch: pedir, fetchAll: (lista) => lista.map((p) => pedir(p.url, p)) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => estado.cache[k] || null,
        put: (k, v) => { estado.cache[k] = v; },
        remove: (k) => { delete estado.cache[k]; }
      })
    },
    ScriptApp: {
      getProjectTriggers: () => estado.disparadores.slice(),
      deleteTrigger: (t) => { estado.disparadores = estado.disparadores.filter((x) => x !== t); },
      newTrigger: (fn) => ({ timeBased: () => ({ at: (fecha) => ({ create: () => { const t = { fn, fecha, getHandlerFunction: () => fn }; estado.disparadores.push(t); return t; } }) }) })
    },
    Session: { getScriptTimeZone: () => "America/Argentina/Mendoza" },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => { if (estado.lockTomado) return false; estado.lockTomado = true; return true; },
        releaseLock: () => { estado.lockTomado = false; }
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in estado.props ? estado.props[k] : null),
        setProperty: (k, v) => { estado.props[k] = v; },
        setProperties: (o) => Object.assign(estado.props, o)
      })
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (s) => ({ contenido: s, setMimeType() { return this; } })
    }
  };
  estado.crearCarpeta = crearCarpeta;
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "Codigo.gs"), "utf8"), contexto, { filename: "Codigo.gs" });

  const api = (datos) => JSON.parse(contexto.doPost({ postData: { contents: JSON.stringify(datos) } }).contenido);

  // Configuración inicial como la haría la pareja desde el menú
  if (respuestas) estado.respuestasPrompt = respuestas.slice();
  estado.crearCarpeta = crearCarpeta;
  contexto.configurar();
  const clave = (estado.alertas.join("\n").match(/[0-9a-f]{64}/) || [])[0];

  return { contexto, estado, api, clave };
}

module.exports = { crearEntorno };
