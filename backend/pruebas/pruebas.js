/**
 * Pruebas del backend de la cámara (Codigo.gs) sin publicarlo.
 * Simula los servicios de Apps Script (Planilla, Drive, bloqueo,
 * propiedades) y ejecuta el archivo .gs tal cual.
 *
 *   node camara/backend/pruebas/pruebas.js
 */
"use strict";
const vm = require("vm");
const crypto = require("crypto");
const assert = require("assert");
const { crearEntorno } = require("./simulador");

const jpeg = (tam = 400) => {
  const b = Buffer.alloc(tam, 7);
  b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0;
  return b.toString("base64");
};
const png = () => { const b = Buffer.alloc(400, 1); b[0] = 0x89; b[1] = 0x50; b[2] = 0x4e; b[3] = 0x47; return b.toString("base64"); };

function registrar(api, nombre = "Ana", apellido = "Gómez") {
  const r = api({ accion: "registrar", nombre, apellido });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  return r.token;
}
function subir(api, token, extra = {}) {
  return api(Object.assign({ accion: "subir", token, imagen: jpeg(), miniatura: jpeg(120) }, extra));
}
function activasDe(estado, idInvitado) {
  return estado.hojas.Fotos.filas.slice(1).filter((f) => f[1] === idInvitado && (f[4] === "activa" || f[4] === "oculta")).length;
}
function idInvitado(api, token) { return api({ accion: "sesion", token }).invitado.id; }
// Pone la hora de revelado en el pasado (como si la pareja ya hubiera revelado)
function revelar(estado) { estado.props.REVELADO_EN = new Date(Date.now() - 1000).toISOString(); }

/* ------------------------------------------------------------
   Pruebas
------------------------------------------------------------ */
const pruebas = [];
const prueba = (nombre, fn) => pruebas.push({ nombre, fn });

prueba("configurar crea hojas, carpetas y deja el álbum privado", () => {
  const { estado, clave } = crearEntorno();
  assert.ok(estado.hojas.Invitados && estado.hojas.Fotos);
  assert.strictEqual(estado.props.ESTADO_ALBUM, "privado");
  assert.strictEqual(estado.props.CAMARA_ABIERTA, "si");
  assert.ok(clave, "se muestra la clave del panel");
  assert.notStrictEqual(estado.props.CLAVE_PANEL_HASH, clave, "la clave no se guarda en texto plano");
  assert.strictEqual(Object.keys(estado.carpetas).length, 3);
});

prueba("registro: pide nombre y apellido y guarda solo el hash del token", () => {
  const { api, estado } = crearEntorno();
  assert.strictEqual(api({ accion: "registrar", nombre: "Ana" }).error, "datos_invalidos");
  const r = api({ accion: "registrar", nombre: "  Ana ", apellido: "Gómez" });
  assert.match(r.token, /^[0-9a-f]{64}$/);
  const fila = estado.hojas.Invitados.filas[1];
  assert.strictEqual(fila[1], "Ana");
  assert.ok(!fila.includes(r.token), "el token no aparece en la planilla");
  assert.strictEqual(fila[3], crypto.createHash("sha256").update(r.token).digest("hex"));
});

prueba("el nombre no sirve como credencial; un token inválido se rechaza", () => {
  const { api } = crearEntorno();
  registrar(api, "Ana", "Gómez");
  assert.strictEqual(api({ accion: "sesion", token: "Ana Gómez" }).error, "sesion_invalida");
  assert.strictEqual(api({ accion: "sesion", token: "f".repeat(64) }).error, "sesion_invalida");
  assert.strictEqual(api({ accion: "sesion" }).error, "sesion_invalida");
});

prueba("cupo: 24 fotos entran, la 25 se rechaza", () => {
  const { api, estado } = crearEntorno();
  const token = registrar(api);
  for (let i = 1; i <= 24; i++) {
    const r = subir(api, token);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.usadas, i);
  }
  assert.strictEqual(subir(api, token).error, "cupo_lleno");
  assert.strictEqual(activasDe(estado, idInvitado(api, token)), 24);
});

prueba("borrar libera el cupo y manda los archivos a la papelera", () => {
  const { api, estado } = crearEntorno();
  revelar(estado);
  const token = registrar(api);
  const ids = [];
  for (let i = 0; i < 24; i++) ids.push(subir(api, token).foto.id);
  const fila = estado.hojas.Fotos.filas.find((f) => f[0] === ids[3]);
  const r = api({ accion: "borrar", token, idFoto: ids[3] });
  assert.strictEqual(r.usadas, 23);
  assert.strictEqual(estado.archivos[fila[7]].papelera, true);
  assert.strictEqual(estado.archivos[fila[8]].papelera, true);
  assert.strictEqual(subir(api, token).ok, true);
  assert.strictEqual(subir(api, token).error, "cupo_lleno");
});

prueba("reemplazar con el cupo lleno deja 24 activas y borra la anterior", () => {
  const { api, estado } = crearEntorno();
  revelar(estado);
  const token = registrar(api);
  const ids = [];
  for (let i = 0; i < 24; i++) ids.push(subir(api, token).foto.id);
  const r = subir(api, token, { reemplazaA: ids[0], comentario: "mejor esta" });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.usadas, 24);
  const vieja = estado.hojas.Fotos.filas.find((f) => f[0] === ids[0]);
  assert.strictEqual(vieja[4], "borrada");
  assert.strictEqual(estado.archivos[vieja[7]].papelera, true);
  assert.strictEqual(activasDe(estado, idInvitado(api, token)), 24);
});

prueba("concurrencia: dos subidas a la vez con 23 fotos: entra una sola", () => {
  const { api, estado } = crearEntorno();
  const token = registrar(api);
  for (let i = 0; i < 23; i++) subir(api, token);
  let segunda = null;
  // Mientras la primera escribe en Drive (sin el bloqueo), llega la segunda
  estado.alCrearArchivo = () => {
    if (segunda === null) { segunda = "en curso"; segunda = subir(api, token); }
  };
  const primera = subir(api, token);
  estado.alCrearArchivo = null;
  assert.strictEqual(primera.ok, true, JSON.stringify(primera));
  assert.strictEqual(segunda.error, "cupo_lleno");
  assert.strictEqual(activasDe(estado, idInvitado(api, token)), 24);
});

prueba("concurrencia: dos reemplazos simultáneos de la misma foto no suman una 25", () => {
  const { api, estado } = crearEntorno();
  revelar(estado);
  const token = registrar(api);
  const ids = [];
  for (let i = 0; i < 24; i++) ids.push(subir(api, token).foto.id);
  let segunda = null;
  estado.alCrearArchivo = () => {
    if (segunda === null) { segunda = "en curso"; segunda = subir(api, token, { reemplazaA: ids[5] }); }
  };
  const primera = subir(api, token, { reemplazaA: ids[5] });
  estado.alCrearArchivo = null;
  assert.strictEqual(primera.ok, true);
  assert.strictEqual(segunda.error, "cupo_lleno");
  assert.strictEqual(activasDe(estado, idInvitado(api, token)), 24);
});

prueba("reintento con el mismo idCliente no duplica la foto ni gasta cupo", () => {
  const { api, estado } = crearEntorno();
  const token = registrar(api);
  const primera = subir(api, token, { idCliente: "cel-abc-12345" });
  const repetida = subir(api, token, { idCliente: "cel-abc-12345" });
  assert.strictEqual(repetida.ok, true);
  assert.strictEqual(repetida.repetida, true);
  assert.strictEqual(repetida.foto.id, primera.foto.id);
  assert.strictEqual(repetida.usadas, 1);
  assert.strictEqual(estado.hojas.Fotos.filas.length, 2);
  // Mientras la primera sigue subiéndose, el reintento espera ("ocupado")
  let durante = null;
  estado.alCrearArchivo = () => { if (durante === null) { durante = "en curso"; durante = subir(api, token, { idCliente: "cel-xyz-12345" }); } };
  subir(api, token, { idCliente: "cel-xyz-12345" });
  estado.alCrearArchivo = null;
  assert.strictEqual(durante.error, "ocupado");
  assert.strictEqual(api({ accion: "sesion", token }).usadas, 2);
});

prueba("si el bloqueo está tomado por otra subida, responde 'ocupado' sin escribir nada", () => {
  const { api, estado } = crearEntorno();
  const token = registrar(api);
  const filasAntes = estado.hojas.Fotos.filas.length;
  estado.lockTomado = true;
  assert.strictEqual(subir(api, token).error, "ocupado");
  estado.lockTomado = false;
  assert.strictEqual(estado.hojas.Fotos.filas.length, filasAntes);
});

prueba("si Drive falla, la reserva queda 'fallida' y no ocupa cupo", () => {
  const { api, estado } = crearEntorno();
  const token = registrar(api);
  subir(api, token);
  estado.alCrearArchivo = () => { throw new Error("Drive caído"); };
  const r = subir(api, token);
  estado.alCrearArchivo = null;
  assert.strictEqual(r.error, "error_interno");
  assert.ok(estado.hojas.Fotos.filas.some((f) => f[4] === "fallida"));
  assert.strictEqual(api({ accion: "sesion", token }).usadas, 1);
});

prueba("una reserva colgada de más de 10 minutos libera el cupo", () => {
  const { api, estado } = crearEntorno();
  const token = registrar(api);
  for (let i = 0; i < 24; i++) subir(api, token);
  const fila = estado.hojas.Fotos.filas[1];
  fila[4] = "subiendo";
  fila[5] = new Date(Date.now() - 11 * 60 * 1000);
  assert.strictEqual(subir(api, token).ok, true);
  fila[5] = new Date(Date.now() - 2 * 60 * 1000);
  assert.strictEqual(subir(api, token).error, "cupo_lleno");
});

prueba("un invitado no puede ver, borrar ni comentar fotos de otro", () => {
  const { api, estado } = crearEntorno();
  revelar(estado);
  const ana = registrar(api, "Ana", "Gómez");
  const luis = registrar(api, "Luis", "Pérez");
  const idFoto = subir(api, ana).foto.id;
  assert.strictEqual(api({ accion: "borrar", token: luis, idFoto }).error, "no_encontrada");
  assert.strictEqual(api({ accion: "comentar", token: luis, idFoto, comentario: "x" }).error, "no_encontrada");
  assert.strictEqual(api({ accion: "foto", token: luis, idFoto }).error, "no_encontrada");
  assert.strictEqual(api({ accion: "miniaturas", token: luis, ids: [idFoto] }).miniaturas[0].error, "no_encontrada");
  assert.ok(api({ accion: "miniaturas", token: ana, ids: [idFoto] }).miniaturas[0].datos);
  assert.strictEqual(subir(api, luis, { reemplazaA: idFoto }).error, "no_encontrada");
});

prueba("álbum: privado al inicio; al compartir, los invitados ven las activas pero no las ocultas", () => {
  const { api, contexto, clave, estado } = crearEntorno();
  revelar(estado);
  const ana = registrar(api, "Ana", "Gómez");
  const luis = registrar(api, "Luis", "Pérez");
  const f1 = subir(api, ana, { comentario: "¡Vivan los novios!" }).foto.id;
  const f2 = subir(api, ana).foto.id;
  assert.strictEqual(api({ accion: "album", token: luis }).error, "album_privado");

  assert.strictEqual(api({ accion: "panelOcultar", clave, idFoto: f2, ocultar: true }).estado, "oculta");
  contexto.compartirAlbum();
  const album = api({ accion: "album", token: luis });
  assert.deepStrictEqual(album.fotos.map((f) => f.id), [f1]);
  assert.strictEqual(album.fotos[0].comentario, "¡Vivan los novios!");
  assert.strictEqual(album.fotos[0].estado, undefined, "no expone estados internos");
  const minis = api({ accion: "miniaturas", token: luis, ids: [f1, f2] }).miniaturas;
  assert.ok(minis[0].datos);
  assert.strictEqual(minis[1].error, "no_encontrada");
  // La foto oculta sigue ocupando el cupo de Ana y ella la sigue viendo
  assert.strictEqual(api({ accion: "sesion", token: ana }).usadas, 2);

  contexto.hacerPrivadoAlbum();
  assert.strictEqual(api({ accion: "album", token: luis }).error, "album_privado");
});

prueba("panel: exige la clave y muestra totales", () => {
  const { api, clave } = crearEntorno();
  const ana = registrar(api);
  subir(api, ana); subir(api, ana);
  registrar(api, "Luis", "Pérez");
  assert.strictEqual(api({ accion: "panel", clave: "otra" }).error, "clave_invalida");
  assert.strictEqual(api({ accion: "panel" }).error, "clave_invalida");
  const p = api({ accion: "panel", clave });
  assert.strictEqual(p.invitados, 2);
  assert.strictEqual(p.fotosRecibidas, 2);
  assert.strictEqual(p.albumCompartido, false);
  const id = p.fotos[0].id;
  assert.ok(api({ accion: "panelFoto", clave, idFoto: id }).datos);
});

prueba("valida el archivo por su contenido, no por el nombre", () => {
  const { api } = crearEntorno();
  const token = registrar(api);
  assert.strictEqual(subir(api, token, { imagen: png() }).error, "imagen_invalida");
  assert.strictEqual(subir(api, token, { imagen: "esto no es base64 !!" }).error, "imagen_invalida");
  assert.strictEqual(subir(api, token, { imagen: jpeg(5 * 1024 * 1024) }).error, "imagen_grande");
  assert.strictEqual(subir(api, token, { miniatura: jpeg(400 * 1024) }).error, "imagen_grande");
  assert.strictEqual(subir(api, token, { imagen: "data:image/jpeg;base64," + jpeg() }).ok, true);
});

prueba("con la cámara cerrada no se registra ni se sube, pero se puede borrar", () => {
  const { api, contexto } = crearEntorno();
  const token = registrar(api);
  const id = subir(api, token).foto.id;
  contexto.cerrarCamara();
  assert.strictEqual(api({ accion: "registrar", nombre: "Luis", apellido: "Pérez" }).error, "camara_cerrada");
  assert.strictEqual(subir(api, token).error, "camara_cerrada");
  assert.strictEqual(api({ accion: "sesion", token }).abierta, false);
  assert.strictEqual(api({ accion: "borrar", token, idFoto: id }).ok, true);
  contexto.abrirCamara();
  assert.strictEqual(subir(api, token).ok, true);
});

prueba("textos que parecen fórmulas se guardan como texto", () => {
  const { api, estado } = crearEntorno();
  const token = registrar(api, "=HYPERLINK(\"x\")", "Gómez");
  subir(api, token, { comentario: "=IMPORTXML(\"https://malo\",\"//a\")" });
  assert.ok(estado.escrituras.includes("'=HYPERLINK(\"x\")"));
  assert.ok(estado.escrituras.includes("'=IMPORTXML(\"https://malo\",\"//a\")"));
});

prueba("límite de invitados por boda", () => {
  const { api, contexto } = crearEntorno();
  vm.runInContext("CAMARA.MAX_INVITADOS = 2", contexto);
  registrar(api, "A", "A"); registrar(api, "B", "B");
  assert.strictEqual(api({ accion: "registrar", nombre: "C", apellido: "C" }).error, "invitados_llenos");
});

prueba("datos públicos (GET) no exponen fotos ni invitados; acción desconocida se rechaza", () => {
  const { api, contexto } = crearEntorno();
  registrar(api);
  const pub = JSON.parse(contexto.doGet().contenido);
  assert.deepStrictEqual(Object.keys(pub).sort(), ["abierta", "albumCompartido", "boda", "maxFotos", "ok", "revelaEn", "revelado"]);
  assert.strictEqual(pub.boda, "Emilia & Tomás");
  assert.strictEqual(api({ accion: "borrarTodo" }).error, "accion_desconocida");
  assert.strictEqual(JSON.parse(contexto.doPost({ postData: { contents: "{roto" } }).contenido).error, "datos_invalidos");
});

prueba("antes del revelado: nadie ve las fotos, ni las propias, ni pidiéndolas directo", () => {
  const { api, contexto, estado, clave } = crearEntorno();
  const ana = registrar(api, "Ana", "Gómez");
  const luis = registrar(api, "Luis", "Pérez");
  const f1 = subir(api, ana).foto.id;
  const ses = api({ accion: "sesion", token: ana });
  assert.strictEqual(ses.revelado, false);
  assert.strictEqual(ses.fotos.length, 1, "sabe cuántas sacó");
  assert.strictEqual(api({ accion: "miniaturas", token: ana, ids: [f1] }).miniaturas[0].error, "en_revelado");
  assert.strictEqual(api({ accion: "foto", token: ana, idFoto: f1 }).error, "en_revelado");
  contexto.compartirAlbum();
  assert.strictEqual(api({ accion: "album", token: luis }).error, "en_revelado");
  // La pareja sí las ve desde su panel
  assert.ok(api({ accion: "panelFoto", clave, idFoto: f1 }).datos);
  revelar(estado);
  assert.ok(api({ accion: "miniaturas", token: ana, ids: [f1] }).miniaturas[0].datos);
  assert.strictEqual(api({ accion: "album", token: luis }).fotos.length, 1);
});

prueba("antes del revelado solo se borra la última foto y no se reemplaza", () => {
  const { api, estado } = crearEntorno();
  const ana = registrar(api);
  const ids = [];
  for (let i = 0; i < 3; i++) {
    ids.push(subir(api, ana).foto.id);
    estado.hojas.Fotos.filas[estado.hojas.Fotos.filas.length - 1][5] = new Date(Date.now() - (10 - i) * 1000);
  }
  assert.strictEqual(api({ accion: "borrar", token: ana, idFoto: ids[0] }).error, "solo_ultima");
  assert.strictEqual(subir(api, ana, { reemplazaA: ids[2] }).error, "en_revelado");
  assert.strictEqual(api({ accion: "borrar", token: ana, idFoto: ids[2] }).usadas, 2);
  assert.strictEqual(api({ accion: "borrar", token: ana, idFoto: ids[1] }).usadas, 1, "ahora la 2 es la última");
  assert.strictEqual(api({ accion: "comentar", token: ana, idFoto: ids[0], comentario: "¡qué noche!" }).comentario, "¡qué noche!");
});

prueba("configurar con fecha de revelado; fechas futuras no revelan", () => {
  const { estado, api, contexto } = crearEntorno(["Emilia & Tomás", "", "15/03/2027 12:00"]);
  const guardada = new Date(estado.props.REVELADO_EN);
  assert.strictEqual(guardada.getFullYear(), 2027);
  assert.strictEqual(guardada.getMonth(), 2);
  assert.strictEqual(guardada.getDate(), 15);
  assert.strictEqual(guardada.getHours(), 12);
  assert.strictEqual(JSON.parse(contexto.doGet().contenido).revelado, false);
  const sinFecha = crearEntorno(["Emilia & Tomás", "", "el sábado"]);
  assert.strictEqual(sinFecha.estado.props.REVELADO_EN, "");
  assert.strictEqual(api({ accion: "sesion", token: registrar(api) }).revelaEn, guardada.toISOString());
});

prueba("configurar con el link de una carpeta existente guarda las fotos ahí", () => {
  // Primero se crea la carpeta "de la pareja" y después se configura con su link
  const previo = crearEntorno();
  const carpeta = previo.estado.crearCarpeta("CASAMIENTO EMILIA Y TOMAS");
  const link = "https://drive.google.com/drive/folders/" + carpeta.getId() + "?usp=drive_link";
  previo.estado.props = {};
  previo.estado.respuestasPrompt = ["Emilia & Tomás", link, ""];
  previo.contexto.configurar();
  assert.strictEqual(previo.estado.props.CARPETA_RAIZ_ID, carpeta.getId());
  assert.ok(previo.estado.props.CARPETA_FOTOS_ID && previo.estado.props.CARPETA_FOTOS_ID !== carpeta.getId());
  // Un link que no es de carpeta no configura nada
  const otro = crearEntorno();
  otro.estado.props = {};
  otro.estado.respuestasPrompt = ["Emilia & Tomás", "https://google.com", ""];
  otro.contexto.configurar();
  assert.strictEqual(otro.estado.props.CARPETA_FOTOS_ID, undefined);
});

/* ------------------------------------------------------------ */
let fallidas = 0;
pruebas.forEach(({ nombre, fn }) => {
  try { fn(); console.log("  ok   " + nombre); }
  catch (err) { fallidas++; console.log("  FALLA " + nombre + "\n        " + err.message); }
});
console.log(`\n${pruebas.length - fallidas} de ${pruebas.length} pruebas pasaron`);
process.exit(fallidas ? 1 : 0);
