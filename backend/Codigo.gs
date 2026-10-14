/**
 * ============================================================
 *  CÁMARA DESCARTABLE — Koba Digital
 * ============================================================
 *  Backend en Google Apps Script. Vive dentro de la planilla de la
 *  boda (Extensiones → Apps Script) y guarda las fotos en una
 *  carpeta de Google Drive de la cuenta que lo publica (la de la
 *  pareja, así el álbum queda en su Drive para siempre).
 *
 *  La planilla funciona como base de datos:
 *    · Hoja "Invitados": quién se registró (sin guardar el token, solo su hash).
 *    · Hoja "Fotos": cada foto con su estado, comentario y archivo en Drive.
 *  La configuración sensible (carpetas, clave del panel, estado del
 *  álbum) va en las Propiedades del script, que solo ve quien edita.
 *
 *  Todas las reglas (cupo de 24, sesiones, privacidad) se validan acá,
 *  nunca en el navegador. Ver camara/GUIA.md para instalarlo.
 * ============================================================
 */

const CAMARA = {
  MAX_FOTOS_POR_INVITADO: 24,
  MAX_INVITADOS: 400,            // freno ante registros masivos con el QR
  MAX_FOTOS_TOTALES: 6000,       // protege el espacio del Drive de la pareja
  MAX_BYTES_FOTO: 4 * 1024 * 1024,
  MAX_BYTES_MINIATURA: 300 * 1024,
  MAX_COMENTARIO: 280,
  MAX_NOMBRE: 60,
  MINUTOS_RESERVA: 10,           // una subida que no termina en 10 min libera el cupo
  ESPERA_BLOQUEO_MS: 20000,
  MAX_IDS_POR_PEDIDO: 24
};

const HOJA_INVITADOS = "Invitados";
const HOJA_FOTOS = "Fotos";
const COLUMNAS_INVITADOS = ["ID", "Nombre", "Apellido", "Token (hash)", "Registrado", "Estado", "Avisos"];
const COLUMNAS_FOTOS = ["ID", "ID invitado", "Invitado", "Comentario", "Estado", "Creada", "Actualizada", "Archivo", "Miniatura", "Bytes", "Reemplaza a", "ID cliente", "Ver foto"];

// Índices (base 0) de las columnas que se leen y escriben
const INV = { id: 0, nombre: 1, apellido: 2, hash: 3, registrado: 4, estado: 5, avisos: 6 };
const FOTO = { id: 0, invitado: 1, nombreInvitado: 2, comentario: 3, estado: 4, creada: 5, actualizada: 6, archivo: 7, miniatura: 8, bytes: 9, reemplaza: 10, cliente: 11, ver: 12 };

// Estados posibles de una foto:
//   subiendo → reservó cupo y se está guardando el archivo
//   activa   → visible para su autor (y en el álbum si se comparte)
//   oculta   → la pareja la retiró del álbum; sigue ocupando el cupo
//   borrada  → el invitado la borró o la reemplazó; el archivo va a la papelera
//   fallida  → no se pudo guardar el archivo; no ocupa cupo
const OCUPAN_CUPO = ["activa", "oculta"];

/* ============================================================
   ERRORES — códigos estables para que el frontend muestre el mensaje
   ============================================================ */
const MENSAJES = {
  datos_invalidos: "Faltan datos o tienen un formato incorrecto.",
  camara_cerrada: "La cámara de esta boda está cerrada.",
  sesion_invalida: "Tu sesión no es válida. Volvé a entrar con tu enlace personal.",
  cupo_lleno: "Ya usaste todas tus fotos. Borrá una para sacar otra.",
  boda_llena: "La cámara llegó a su límite de fotos.",
  invitados_llenos: "La cámara llegó a su límite de invitados.",
  imagen_invalida: "El archivo no es una foto válida.",
  imagen_grande: "La foto es demasiado pesada.",
  no_encontrada: "No encontramos esa foto.",
  album_privado: "El álbum todavía es privado.",
  en_revelado: "Las fotos todavía se están revelando.",
  solo_ultima: "Antes del revelado solo podés borrar tu última foto.",
  clave_invalida: "La clave del panel no es válida.",
  ocupado: "Hay muchas fotos subiéndose al mismo tiempo. Probá de nuevo en unos segundos.",
  accion_desconocida: "Acción desconocida.",
  error_interno: "Algo salió mal. Probá de nuevo."
};

function ErrorCamara(codigo) {
  this.codigo = codigo;
  this.message = MENSAJES[codigo] || codigo;
}

function fallar(codigo) { throw new ErrorCamara(codigo); }

/* ============================================================
   PUNTOS DE ENTRADA DE LA WEB APP
   ============================================================ */

// GET: datos públicos para el encabezado de la página de la cámara.
// No expone fotos ni nombres de invitados.
function doGet() {
  const props = propiedades();
  return responder({
    ok: true,
    boda: props.getProperty("NOMBRE_BODA") || "",
    abierta: props.getProperty("CAMARA_ABIERTA") !== "no",
    albumCompartido: props.getProperty("ESTADO_ALBUM") === "compartido",
    revelado: revelado(),
    revelaEn: props.getProperty("REVELADO_EN") || "",
    maxFotos: CAMARA.MAX_FOTOS_POR_INVITADO
  });
}

// POST: todas las acciones. El frontend manda { accion, ...datos } como
// texto plano (así el navegador no hace una consulta previa CORS).
const ACCIONES = {
  registrar: accionRegistrar,
  sesion: accionSesion,
  subir: accionSubir,
  borrar: accionBorrar,
  comentar: accionComentar,
  miniaturas: accionMiniaturas,
  foto: accionFoto,
  album: accionAlbum,
  panel: accionPanel,
  panelMiniaturas: accionPanelMiniaturas,
  panelFoto: accionPanelFoto,
  panelOcultar: accionPanelOcultar,
  avisos: accionAvisos
};

function doPost(e) {
  try {
    let datos;
    try { datos = JSON.parse((e && e.postData && e.postData.contents) || "{}"); }
    catch (errJson) { fallar("datos_invalidos"); }
    const accion = ACCIONES[datos.accion];
    if (!accion) fallar("accion_desconocida");
    return responder(Object.assign({ ok: true }, accion(datos)));
  } catch (err) {
    if (err instanceof ErrorCamara) {
      return responder({ ok: false, error: err.codigo, mensaje: err.message });
    }
    console.error(err && err.stack ? err.stack : err);
    return responder({ ok: false, error: "error_interno", mensaje: MENSAJES.error_interno });
  }
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   INVITADOS — registro y sesión
   El nombre NO es una credencial: al registrarse, cada invitado
   recibe un token aleatorio de 256 bits que solo vive en su celular
   y en su enlace personal. En la planilla se guarda únicamente su
   hash SHA-256, así ni quien abre la planilla puede hacerse pasar
   por un invitado.
   ============================================================ */
function accionRegistrar(d) {
  const nombre = textoLimpio(d.nombre, CAMARA.MAX_NOMBRE);
  const apellido = textoLimpio(d.apellido, CAMARA.MAX_NOMBRE);
  if (!nombre || !apellido) fallar("datos_invalidos");
  exigirCamaraAbierta();

  const token = nuevoToken();
  const id = "i_" + idCorto();
  conBloqueo(function () {
    const hoja = hojaInvitados();
    if (hoja.getLastRow() - 1 >= CAMARA.MAX_INVITADOS) fallar("invitados_llenos");
    hoja.appendRow([id, paraCelda(nombre), paraCelda(apellido), hashTexto(token), new Date(), "activo"]);
  });

  return {
    token: token,
    invitado: { id: id, nombre: nombre, apellido: apellido },
    usadas: 0,
    maxFotos: CAMARA.MAX_FOTOS_POR_INVITADO,
    abierta: true,
    albumCompartido: albumCompartido(),
    revelado: revelado(),
    revelaEn: propiedades().getProperty("REVELADO_EN") || ""
  };
}

function accionSesion(d) {
  const inv = invitadoPorToken(d.token);
  const filas = filasFotos();
  const propias = filas.filter(function (f) {
    return f.fila[FOTO.invitado] === inv.id && OCUPAN_CUPO.indexOf(f.fila[FOTO.estado]) !== -1;
  });
  return {
    invitado: { id: inv.id, nombre: inv.nombre, apellido: inv.apellido },
    fotos: propias.map(function (f) { return fotoPublica(f.fila, true); }),
    usadas: contarCupo(filas, inv.id, null, Date.now()),
    maxFotos: CAMARA.MAX_FOTOS_POR_INVITADO,
    abierta: propiedades().getProperty("CAMARA_ABIERTA") !== "no",
    albumCompartido: albumCompartido(),
    revelado: revelado(),
    revelaEn: propiedades().getProperty("REVELADO_EN") || ""
  };
}

/* ============================================================
   FOTOS — subir, reemplazar, borrar y comentar
   ============================================================ */

/**
 * Subida en tres pasos para que el cupo nunca se pase, aunque el mismo
 * invitado mande varias fotos a la vez desde dos celulares:
 *   1. Con el bloqueo tomado: se cuenta el cupo y se RESERVA un lugar
 *      (fila en estado "subiendo", que cuenta para el límite).
 *   2. Sin bloqueo: se guardan los archivos en Drive (lo lento).
 *   3. Con el bloqueo: la foto pasa a "activa" y, si era un reemplazo,
 *      la anterior pasa a "borrada" en el mismo paso.
 * Si el paso 2 falla, la reserva pasa a "fallida" y libera el cupo.
 */
function accionSubir(d) {
  const inv = invitadoPorToken(d.token);
  exigirCamaraAbierta();
  const comentario = textoLimpio(d.comentario, CAMARA.MAX_COMENTARIO);
  const reemplazaA = d.reemplazaA ? String(d.reemplazaA) : "";
  if (reemplazaA && !revelado()) fallar("en_revelado"); // no se reemplaza lo que todavía no se ve
  // Identificador que genera el celular para cada foto: si la conexión se
  // corta después de guardarla y el celular reintenta, no se duplica.
  const idCliente = /^[\w-]{8,64}$/.test(d.idCliente || "") ? d.idCliente : "";
  const foto = decodificarJpeg(d.imagen, CAMARA.MAX_BYTES_FOTO);
  const miniatura = decodificarJpeg(d.miniatura, CAMARA.MAX_BYTES_MINIATURA);

  const idFoto = "f_" + idCorto();
  const ahora = new Date();

  // 1. Reserva del cupo
  let repetida = null;
  conBloqueo(function () {
    const filas = filasFotos();
    if (idCliente) {
      const previa = filas.filter(function (f) {
        return f.fila[FOTO.invitado] === inv.id && f.fila[FOTO.cliente] === idCliente;
      }).pop();
      if (previa && OCUPAN_CUPO.indexOf(previa.fila[FOTO.estado]) !== -1) { repetida = previa; return; }
      if (previa && contarCupo([previa], inv.id, null, ahora.getTime()) > 0) fallar("ocupado"); // sigue subiéndose
    }
    if (reemplazaA) {
      const vieja = buscarFoto(filas, reemplazaA);
      if (!vieja || vieja.fila[FOTO.invitado] !== inv.id || OCUPAN_CUPO.indexOf(vieja.fila[FOTO.estado]) === -1) {
        fallar("no_encontrada");
      }
    }
    if (contarCupo(filas, inv.id, reemplazaA, ahora.getTime()) >= CAMARA.MAX_FOTOS_POR_INVITADO) fallar("cupo_lleno");
    if (contarCupo(filas, null, null, ahora.getTime()) >= CAMARA.MAX_FOTOS_TOTALES) fallar("boda_llena");

    const fila = new Array(COLUMNAS_FOTOS.length).fill("");
    fila[FOTO.id] = idFoto;
    fila[FOTO.invitado] = inv.id;
    fila[FOTO.nombreInvitado] = paraCelda(inv.nombre + " " + inv.apellido);
    fila[FOTO.comentario] = paraCelda(comentario);
    fila[FOTO.estado] = "subiendo";
    fila[FOTO.creada] = ahora;
    fila[FOTO.actualizada] = ahora;
    fila[FOTO.reemplaza] = reemplazaA;
    fila[FOTO.cliente] = idCliente;
    hojaFotos().appendRow(fila);
    SpreadsheetApp.flush();
  });

  if (repetida) {
    return {
      foto: fotoPublica(repetida.fila, true),
      usadas: contarCupo(filasFotos(), inv.id, null, Date.now()),
      maxFotos: CAMARA.MAX_FOTOS_POR_INVITADO,
      repetida: true
    };
  }

  // 2. Archivos en Drive
  let archivo, archivoMini;
  try {
    archivo = carpeta("CARPETA_FOTOS_ID").createFile(
      Utilities.newBlob(foto, "image/jpeg", nombreArchivo(inv, idFoto)));
    archivoMini = carpeta("CARPETA_MINIATURAS_ID").createFile(
      Utilities.newBlob(miniatura, "image/jpeg", idFoto + "-mini.jpg"));
  } catch (err) {
    console.error("Falló el guardado en Drive de " + idFoto + ": " + err);
    if (archivo) archivo.setTrashed(true);
    conBloqueo(function () { actualizarFoto(idFoto, { estado: "fallida" }); });
    fallar("error_interno");
  }

  // 3. Confirmación (y baja de la foto reemplazada)
  let usadas = 0;
  let archivosViejos = [];
  conBloqueo(function () {
    actualizarFoto(idFoto, {
      estado: "activa",
      archivo: archivo.getId(),
      miniatura: archivoMini.getId(),
      bytes: foto.length
    });
    if (reemplazaA) {
      const filas = filasFotos();
      const vieja = buscarFoto(filas, reemplazaA);
      if (vieja && OCUPAN_CUPO.indexOf(vieja.fila[FOTO.estado]) !== -1) {
        archivosViejos = [vieja.fila[FOTO.archivo], vieja.fila[FOTO.miniatura]];
        actualizarFoto(reemplazaA, { estado: "borrada" });
      }
    }
    SpreadsheetApp.flush();
    usadas = contarCupo(filasFotos(), inv.id, null, Date.now());
  });
  mandarALaPapelera(archivosViejos);

  return {
    foto: { id: idFoto, comentario: comentario, estado: "activa", creada: ahora.toISOString() },
    usadas: usadas,
    maxFotos: CAMARA.MAX_FOTOS_POR_INVITADO
  };
}

// Borrar libera el cupo al instante. El archivo va a la papelera de Drive,
// que lo elimina definitivamente a los 30 días.
function accionBorrar(d) {
  const inv = invitadoPorToken(d.token);
  let archivos = [];
  let usadas = 0;
  conBloqueo(function () {
    const f = fotoPropia(inv, d.idFoto);
    if (!revelado() && f.fila[FOTO.id] !== ultimaFotoDe(inv.id)) fallar("solo_ultima");
    archivos = [f.fila[FOTO.archivo], f.fila[FOTO.miniatura]];
    actualizarFoto(f.fila[FOTO.id], { estado: "borrada" });
    SpreadsheetApp.flush();
    usadas = contarCupo(filasFotos(), inv.id, null, Date.now());
  });
  mandarALaPapelera(archivos);
  return { usadas: usadas, maxFotos: CAMARA.MAX_FOTOS_POR_INVITADO };
}

function accionComentar(d) {
  const inv = invitadoPorToken(d.token);
  const comentario = textoLimpio(d.comentario, CAMARA.MAX_COMENTARIO);
  conBloqueo(function () {
    const f = fotoPropia(inv, d.idFoto);
    actualizarFoto(f.fila[FOTO.id], { comentario: paraCelda(comentario) });
  });
  return { comentario: comentario };
}

/* ============================================================
   VER FOTOS — el Drive es privado: las imágenes nunca tienen un
   enlace público, se entregan en base64 solo a quien tiene permiso.
   ============================================================ */

// Miniaturas propias, o de cualquier foto si la pareja compartió el álbum
function accionMiniaturas(d) {
  const inv = invitadoPorToken(d.token);
  const compartido = albumCompartido();
  const rev = revelado();
  const filas = filasFotos();
  const ids = listaDeIds(d.ids);
  return {
    miniaturas: ids.map(function (id) {
      const f = buscarFoto(filas, id);
      if (!f || !puedeVer(inv, f.fila, compartido)) return { id: id, error: "no_encontrada" };
      if (!rev) return { id: id, error: "en_revelado" };
      return { id: id, datos: leerArchivoBase64(f.fila[FOTO.miniatura]) };
    })
  };
}

// Foto en tamaño completo (para descargar)
function accionFoto(d) {
  const inv = invitadoPorToken(d.token);
  const f = buscarFoto(filasFotos(), String(d.idFoto || ""));
  if (!f || !puedeVer(inv, f.fila, albumCompartido())) fallar("no_encontrada");
  if (!revelado()) fallar("en_revelado");
  return { id: f.fila[FOTO.id], datos: leerArchivoBase64(f.fila[FOTO.archivo]) };
}

// Álbum común para invitados: solo existe si la pareja lo compartió
function accionAlbum(d) {
  invitadoPorToken(d.token);
  if (!albumCompartido()) fallar("album_privado");
  if (!revelado()) fallar("en_revelado");
  const fotos = filasFotos()
    .filter(function (f) { return f.fila[FOTO.estado] === "activa"; })
    .map(function (f) { return fotoPublica(f.fila, false); });
  return { fotos: fotos };
}

function puedeVer(inv, fila, compartido) {
  if (fila[FOTO.invitado] === inv.id) return OCUPAN_CUPO.indexOf(fila[FOTO.estado]) !== -1;
  return compartido && fila[FOTO.estado] === "activa";
}

/* ============================================================
   AVISOS AL CELULAR (Firebase Cloud Messaging)
   El celular del invitado manda su "dirección de avisos" de Firebase;
   se guarda en la hoja Invitados. Para enviar se usa la cuenta de
   servicio de Firebase, que la pareja o Koba pegan una sola vez desde
   el menú y queda en las Propiedades del script (nunca en el código).
   ============================================================ */
function accionAvisos(d) {
  const inv = invitadoPorToken(d.token);
  const fcm = String(d.fcmToken || "");
  if (fcm && (fcm.length > 4096 || !/^[\w:.-]+$/.test(fcm))) fallar("datos_invalidos");
  const hoja = hojaInvitados();
  if (!hoja.getRange(1, INV.avisos + 1).getValue()) hoja.getRange(1, INV.avisos + 1).setValue("Avisos");
  hoja.getRange(inv.fila, INV.avisos + 1).setValue(fcm);
  // Dirección de la app para que el aviso abra la cámara de esta boda
  if (/^https:\/\/[^\s]+$/.test(d.app || "") && String(d.app).length < 300) {
    propiedades().setProperty("URL_APP", String(d.app));
  }
  return { activos: !!fcm };
}

function credencialesFirebase() {
  const texto = propiedades().getProperty("FIREBASE_CUENTA");
  if (!texto) return null;
  try {
    const c = JSON.parse(texto);
    return c.client_email && c.private_key && c.project_id ? c : null;
  } catch (e) { return null; }
}

// Token de acceso de Google para FCM (JWT firmado con la cuenta de servicio)
function accesoFirebase(cred) {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get("FCM_ACCESO");
  if (guardado) return guardado;
  const ahora = Math.floor(Date.now() / 1000);
  const b64 = function (texto) { return Utilities.base64EncodeWebSafe(texto).replace(/=+$/, ""); };
  const sinFirmar = b64(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64(JSON.stringify({
    iss: cred.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: ahora,
    exp: ahora + 3600
  }));
  const firma = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(sinFirmar, cred.private_key)).replace(/=+$/, "");
  const r = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: sinFirmar + "." + firma },
    muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) throw new Error("Firebase no aceptó la llave: " + r.getContentText());
  const acceso = JSON.parse(r.getContentText()).access_token;
  cache.put("FCM_ACCESO", acceso, 3000);
  return acceso;
}

/**
 * Manda un aviso a todos los invitados que los activaron. Las direcciones
 * que Firebase da por vencidas se borran de la planilla.
 */
function enviarAvisos(titulo, cuerpo) {
  const cred = credencialesFirebase();
  if (!cred) return { enviados: 0, total: 0, sinConfigurar: true };
  const hoja = hojaInvitados();
  const valores = hoja.getDataRange().getValues();
  const destinos = [];
  for (let i = 1; i < valores.length; i++) {
    if (valores[i][INV.avisos] && valores[i][INV.estado] === "activo") destinos.push({ fila: i + 1, fcm: valores[i][INV.avisos] });
  }
  if (!destinos.length) return { enviados: 0, total: 0 };

  const acceso = accesoFirebase(cred);
  const url = "https://fcm.googleapis.com/v1/projects/" + cred.project_id + "/messages:send";
  const app = propiedades().getProperty("URL_APP") || "";
  const icono = app ? app.replace(/[?#].*$/, "").replace(/[^/]*$/, "") + "assets/icono-192.png" : "";
  let enviados = 0, vencidos = 0;
  for (let i = 0; i < destinos.length; i += 50) {
    const tanda = destinos.slice(i, i + 50);
    const respuestas = UrlFetchApp.fetchAll(tanda.map(function (d) {
      const webpush = { notification: { title: titulo, body: cuerpo } };
      if (icono) webpush.notification.icon = icono;
      if (app) webpush.fcm_options = { link: app };
      return {
        url: url,
        method: "post",
        contentType: "application/json",
        headers: { Authorization: "Bearer " + acceso },
        muteHttpExceptions: true,
        payload: JSON.stringify({ message: { token: d.fcm, notification: { title: titulo, body: cuerpo }, webpush: webpush } })
      };
    }));
    respuestas.forEach(function (r, k) {
      const codigo = r.getResponseCode();
      if (codigo === 200) enviados++;
      else if (codigo === 404 || /UNREGISTERED|registration-token-not-registered/.test(r.getContentText())) {
        hoja.getRange(tanda[k].fila, INV.avisos + 1).setValue("");
        vencidos++;
      } else {
        console.error("FCM respondió " + codigo + ": " + r.getContentText());
      }
    });
  }
  return { enviados: enviados, total: destinos.length, vencidos: vencidos };
}

// Lo dispara el reloj del script a la hora del revelado (ver programarAvisoRevelado)
function avisarRevelado() {
  const r = propiedades().getProperty("REVELADO_EN");
  if (!r) return null;
  if (!revelado()) { programarAvisoRevelado(new Date(new Date(r).getTime() + 60000)); return null; } // se adelantó
  const nombre = propiedades().getProperty("NOMBRE_BODA") || "la boda";
  return enviarAvisos("¡Se revelaron las fotos!", "Ya podés ver las fotos que sacaste en " + nombre + ".");
}

function programarAvisoRevelado(fecha) {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === "avisarRevelado"; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  if (fecha && fecha.getTime() > Date.now()) ScriptApp.newTrigger("avisarRevelado").timeBased().at(fecha).create();
}

/* ============================================================
   PANEL DE LA PAREJA
   Protegido por una clave larga y aleatoria que se genera al
   configurar (menú Cámara descartable → Ver enlace del panel).
   Compartir o cerrar el álbum NO se hace desde la web: solo desde
   el menú de la planilla, que exige iniciar sesión en Google.
   ============================================================ */
function accionPanel(d) {
  exigirClavePanel(d.clave);
  const filas = filasFotos();
  const visibles = filas.filter(function (f) { return OCUPAN_CUPO.indexOf(f.fila[FOTO.estado]) !== -1; });
  return {
    boda: propiedades().getProperty("NOMBRE_BODA") || "",
    invitados: Math.max(0, hojaInvitados().getLastRow() - 1),
    fotosRecibidas: visibles.length,
    albumCompartido: albumCompartido(),
    revelado: revelado(),
    revelaEn: propiedades().getProperty("REVELADO_EN") || "",
    camaraAbierta: propiedades().getProperty("CAMARA_ABIERTA") !== "no",
    fotos: visibles.map(function (f) { return fotoPublica(f.fila, true); })
  };
}

function accionPanelMiniaturas(d) {
  exigirClavePanel(d.clave);
  const filas = filasFotos();
  return {
    miniaturas: listaDeIds(d.ids).map(function (id) {
      const f = buscarFoto(filas, id);
      if (!f || OCUPAN_CUPO.indexOf(f.fila[FOTO.estado]) === -1) return { id: id, error: "no_encontrada" };
      return { id: id, datos: leerArchivoBase64(f.fila[FOTO.miniatura]) };
    })
  };
}

function accionPanelFoto(d) {
  exigirClavePanel(d.clave);
  const f = buscarFoto(filasFotos(), String(d.idFoto || ""));
  if (!f || OCUPAN_CUPO.indexOf(f.fila[FOTO.estado]) === -1) fallar("no_encontrada");
  return { id: f.fila[FOTO.id], datos: leerArchivoBase64(f.fila[FOTO.archivo]) };
}

// Moderación: ocultar una foto del álbum compartido (o volver a mostrarla)
function accionPanelOcultar(d) {
  exigirClavePanel(d.clave);
  const estado = d.ocultar ? "oculta" : "activa";
  conBloqueo(function () {
    const f = buscarFoto(filasFotos(), String(d.idFoto || ""));
    if (!f || OCUPAN_CUPO.indexOf(f.fila[FOTO.estado]) === -1) fallar("no_encontrada");
    actualizarFoto(f.fila[FOTO.id], { estado: estado });
  });
  return { idFoto: d.idFoto, estado: estado };
}

function exigirClavePanel(clave) {
  const guardada = propiedades().getProperty("CLAVE_PANEL_HASH");
  if (!clave || !guardada || hashTexto(String(clave)) !== guardada) fallar("clave_invalida");
}

/* ============================================================
   MENÚ DE LA PLANILLA (solo para quien la edita: la pareja / Koba)
   ============================================================ */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Cámara descartable")
    .addItem("1. Configurar por primera vez", "configurar")
    .addSeparator()
    .addItem("Programar el revelado", "programarRevelado")
    .addItem("Revelar las fotos ahora", "revelarAhora")
    .addSeparator()
    .addItem("Compartir el álbum con los invitados", "compartirAlbum")
    .addItem("Volver a hacer privado el álbum", "hacerPrivadoAlbum")
    .addSeparator()
    .addItem("Abrir la cámara", "abrirCamara")
    .addItem("Cerrar la cámara", "cerrarCamara")
    .addSeparator()
    .addItem("Mandar un aviso a los invitados", "mandarAviso")
    .addItem("Configurar avisos (Firebase)", "configurarAvisos")
    .addSeparator()
    .addItem("Ver resumen", "verResumen")
    .addItem("Generar nueva clave del panel", "nuevaClavePanel")
    .addToUi();
}

function configurar() {
  const ui = SpreadsheetApp.getUi();
  const props = propiedades();
  if (props.getProperty("CARPETA_FOTOS_ID")) {
    ui.alert("La cámara ya estaba configurada. Para ver la clave del panel usá \"Generar nueva clave del panel\".");
    return;
  }
  const respuesta = ui.prompt("Cámara descartable", "Nombre de la boda (ej. Emilia & Tomás):", ui.ButtonSet.OK_CANCEL);
  if (respuesta.getSelectedButton() !== ui.Button.OK) return;
  const nombre = textoLimpio(respuesta.getResponseText(), 80) || "Nuestra boda";
  const preguntaCarpeta = ui.prompt("Carpeta de Drive",
    "Pegá el link de la carpeta de Drive donde se guardan las fotos.\n(Si lo dejás vacío, se crea una carpeta nueva.)",
    ui.ButtonSet.OK_CANCEL);
  if (preguntaCarpeta.getSelectedButton() !== ui.Button.OK) return;
  const idCarpeta = idDeCarpeta(preguntaCarpeta.getResponseText());
  let raiz;
  if (idCarpeta) {
    try { raiz = DriveApp.getFolderById(idCarpeta); }
    catch (e) { ui.alert("No pude abrir esa carpeta. Revisá que el link sea de una carpeta de esta cuenta."); return; }
  } else if (preguntaCarpeta.getResponseText().trim()) {
    ui.alert("Ese link no parece de una carpeta de Drive."); return;
  }
  const pregunta = ui.prompt("Revelado",
    "¿Cuándo se revelan las fotos para los invitados? Fecha y hora, ej. 15/03/2027 12:00\n(podés dejarlo vacío y elegirlo después).",
    ui.ButtonSet.OK_CANCEL);
  const revelaEn = pregunta.getSelectedButton() === ui.Button.OK ? leerFechaHora(pregunta.getResponseText()) : null;

  prepararHoja(HOJA_INVITADOS, COLUMNAS_INVITADOS);
  prepararHoja(HOJA_FOTOS, COLUMNAS_FOTOS);

  if (!raiz) raiz = DriveApp.createFolder("Cámara descartable · " + nombre);
  const fotos = raiz.createFolder("Fotos");
  const miniaturas = raiz.createFolder("Miniaturas");
  const clave = nuevoToken();

  props.setProperties({
    NOMBRE_BODA: nombre,
    CARPETA_RAIZ_ID: raiz.getId(),
    CARPETA_FOTOS_ID: fotos.getId(),
    CARPETA_MINIATURAS_ID: miniaturas.getId(),
    CLAVE_PANEL_HASH: hashTexto(clave),
    ESTADO_ALBUM: "privado",
    CAMARA_ABIERTA: "si",
    REVELADO_EN: revelaEn ? revelaEn.toISOString() : ""
  });
  if (revelaEn) programarAvisoRevelado(revelaEn);

  ui.alert("¡Listo!",
    "Las fotos se guardan en la carpeta \"" + raiz.getName() + "\" de tu Drive.\n\n" +
    "CLAVE DEL PANEL (guardala, no se vuelve a mostrar):\n" + clave + "\n\n" +
    "El álbum empieza PRIVADO.\n" +
    "Revelado: " + (revelaEn ? formatoFecha(revelaEn) : "sin fecha (elegila con \"Programar el revelado\")") + ".\n\n" +
    "Ahora publicá el script como aplicación web (ver GUIA.md).",
    ui.ButtonSet.OK);
}

function programarRevelado() {
  const ui = SpreadsheetApp.getUi();
  const actual = propiedades().getProperty("REVELADO_EN");
  const r = ui.prompt("Programar el revelado",
    "Ahora: " + (actual ? formatoFecha(new Date(actual)) : "sin fecha") + "\n\nNueva fecha y hora (ej. 15/03/2027 12:00):",
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const fecha = leerFechaHora(r.getResponseText());
  if (!fecha) { ui.alert("No entendí la fecha. Usá el formato 15/03/2027 12:00."); return; }
  propiedades().setProperty("REVELADO_EN", fecha.toISOString());
  programarAvisoRevelado(fecha);
  ui.alert("Las fotos se revelan el " + formatoFecha(fecha) + ".\nA esa hora les llega un aviso a los invitados que los activaron.");
}

function revelarAhora() {
  const ui = SpreadsheetApp.getUi();
  if (ui.alert("Revelar ahora", "Los invitados van a poder ver sus fotos desde este momento. ¿Seguimos?", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  propiedades().setProperty("REVELADO_EN", new Date().toISOString());
  programarAvisoRevelado(null);
  let detalle = "";
  try {
    const r = avisarRevelado();
    if (r && r.total) detalle = "\nAvisos enviados: " + r.enviados + " de " + r.total + ".";
  } catch (e) { detalle = "\nNo se pudieron mandar los avisos: " + e.message; }
  ui.alert("¡Listo! Las fotos ya están reveladas." + detalle);
}

function compartirAlbum() { cambiarPropiedad("ESTADO_ALBUM", "compartido", "El álbum ahora está COMPARTIDO: los invitados registrados pueden ver todas las fotos."); }
function hacerPrivadoAlbum() { cambiarPropiedad("ESTADO_ALBUM", "privado", "El álbum volvió a ser PRIVADO: solo ustedes pueden verlo."); }
function abrirCamara() { cambiarPropiedad("CAMARA_ABIERTA", "si", "La cámara está ABIERTA: los invitados pueden registrarse y sacar fotos."); }
function cerrarCamara() { cambiarPropiedad("CAMARA_ABIERTA", "no", "La cámara está CERRADA: nadie puede registrarse ni subir fotos nuevas."); }

function cambiarPropiedad(clave, valor, mensaje) {
  propiedades().setProperty(clave, valor);
  SpreadsheetApp.getUi().alert(mensaje);
}

function nuevaClavePanel() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert("Nueva clave del panel", "La clave anterior va a dejar de funcionar. ¿Seguimos?", ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  const clave = nuevoToken();
  propiedades().setProperty("CLAVE_PANEL_HASH", hashTexto(clave));
  ui.alert("Nueva clave del panel (guardala):\n" + clave);
}

function configurarAvisos() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt("Avisos con Firebase",
    "Abrí con el Bloc de notas el archivo .json de la cuenta de servicio de Firebase, copiá TODO el contenido y pegalo acá:",
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  let cred;
  try { cred = JSON.parse(r.getResponseText()); } catch (e) { cred = null; }
  if (!cred || !cred.client_email || !cred.private_key || !cred.project_id) {
    ui.alert("Eso no parece el archivo de la cuenta de servicio. Tiene que empezar con { y tener \"private_key\".");
    return;
  }
  propiedades().setProperty("FIREBASE_CUENTA", JSON.stringify(cred));
  CacheService.getScriptCache().remove("FCM_ACCESO");
  try {
    accesoFirebase(cred);
    ui.alert("¡Avisos configurados! Proyecto de Firebase: " + cred.project_id + ".");
  } catch (e) {
    ui.alert("Se guardó, pero Firebase no aceptó la llave:\n" + e.message);
  }
}

function mandarAviso() {
  const ui = SpreadsheetApp.getUi();
  const nombre = propiedades().getProperty("NOMBRE_BODA") || "Nuestra boda";
  const r = ui.prompt("Mandar un aviso",
    "Le llega a los invitados que activaron los avisos. Ej.: ¡Ya empieza el vals, no te olvides de tu cámara!",
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const texto = textoLimpio(r.getResponseText(), 180);
  if (!texto) return;
  try {
    const res = enviarAvisos(nombre, texto);
    if (res.sinConfigurar) ui.alert("Primero configurá los avisos (menú Cámara descartable → Configurar avisos).");
    else ui.alert("Aviso enviado a " + res.enviados + " de " + res.total + " celulares.");
  } catch (e) {
    ui.alert("No se pudo mandar: " + e.message);
  }
}

function verResumen() {
  const filas = filasFotos();
  const activas = filas.filter(function (f) { return f.fila[FOTO.estado] === "activa"; }).length;
  const ocultas = filas.filter(function (f) { return f.fila[FOTO.estado] === "oculta"; }).length;
  SpreadsheetApp.getUi().alert(
    "Invitados registrados: " + Math.max(0, hojaInvitados().getLastRow() - 1) + "\n" +
    "Fotos activas: " + activas + "\n" +
    "Fotos ocultas: " + ocultas + "\n" +
    "Álbum: " + (albumCompartido() ? "compartido" : "privado") + "\n" +
    "Cámara: " + (propiedades().getProperty("CAMARA_ABIERTA") !== "no" ? "abierta" : "cerrada"));
}

/* ============================================================
   AYUDANTES
   ============================================================ */
function propiedades() { return PropertiesService.getScriptProperties(); }
function albumCompartido() { return propiedades().getProperty("ESTADO_ALBUM") === "compartido"; }

// Las fotos se revelan para los invitados a partir de REVELADO_EN.
// Sin fecha cargada, siguen en revelado.
function revelado() {
  const r = propiedades().getProperty("REVELADO_EN");
  return !!r && Date.now() >= new Date(r).getTime();
}

function ultimaFotoDe(idInvitado) {
  const propias = filasFotos().filter(function (f) {
    return f.fila[FOTO.invitado] === idInvitado && OCUPAN_CUPO.indexOf(f.fila[FOTO.estado]) !== -1;
  });
  propias.sort(function (a, b) { return new Date(a.fila[FOTO.creada]) - new Date(b.fila[FOTO.creada]); });
  return propias.length ? propias[propias.length - 1].fila[FOTO.id] : null;
}

// Acepta el link de una carpeta (…/folders/ID…) o el ID solo
function idDeCarpeta(texto) {
  const t = String(texto || "").trim();
  const m = t.match(/folders\/([\w-]{15,})/) || t.match(/[?&]id=([\w-]{15,})/) || t.match(/^([\w-]{15,})$/);
  return m ? m[1] : null;
}

// "15/03/2027 12:00" → fecha en la zona horaria del script
function leerFechaHora(texto) {
  const m = String(texto || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const f = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]));
  return isNaN(f.getTime()) ? null : f;
}

function formatoFecha(fecha) {
  return Utilities.formatDate(fecha, Session.getScriptTimeZone(), "dd/MM/yyyy 'a las' HH:mm");
}

function exigirCamaraAbierta() {
  if (propiedades().getProperty("CAMARA_ABIERTA") === "no") fallar("camara_cerrada");
}

function conBloqueo(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CAMARA.ESPERA_BLOQUEO_MS)) fallar("ocupado");
  try { return fn(); }
  finally { lock.releaseLock(); }
}

function hojaInvitados() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_INVITADOS); }
function hojaFotos() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_FOTOS); }

function prepararHoja(nombre, columnas) {
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = libro.getSheetByName(nombre) || libro.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(columnas);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, columnas.length).setFontWeight("bold");
  }
  return hoja;
}

// Filas de la hoja Fotos con su número de fila real (para actualizar)
function filasFotos() {
  const valores = hojaFotos().getDataRange().getValues();
  const filas = [];
  for (let i = 1; i < valores.length; i++) filas.push({ numero: i + 1, fila: valores[i] });
  return filas;
}

function buscarFoto(filas, id) {
  for (let i = 0; i < filas.length; i++) if (filas[i].fila[FOTO.id] === id) return filas[i];
  return null;
}

function fotoPropia(inv, idFoto) {
  const f = buscarFoto(filasFotos(), String(idFoto || ""));
  if (!f || f.fila[FOTO.invitado] !== inv.id || OCUPAN_CUPO.indexOf(f.fila[FOTO.estado]) === -1) fallar("no_encontrada");
  return f;
}

/**
 * Cuántos lugares del cupo están ocupados. Cuentan las fotos activas u
 * ocultas y las reservas "subiendo" recientes. idInvitado = null cuenta
 * toda la boda. excluirId deja afuera la foto que se está reemplazando.
 */
function contarCupo(filas, idInvitado, excluirId, ahoraMs) {
  const limiteReserva = ahoraMs - CAMARA.MINUTOS_RESERVA * 60 * 1000;
  return filas.filter(function (f) {
    const fila = f.fila;
    if (idInvitado && fila[FOTO.invitado] !== idInvitado) return false;
    if (excluirId && fila[FOTO.id] === excluirId) return false;
    if (OCUPAN_CUPO.indexOf(fila[FOTO.estado]) !== -1) return true;
    return fila[FOTO.estado] === "subiendo" && new Date(fila[FOTO.creada]).getTime() > limiteReserva;
  }).length;
}

function actualizarFoto(idFoto, cambios) {
  const f = buscarFoto(filasFotos(), idFoto);
  if (!f) fallar("no_encontrada");
  const fila = f.fila.slice();
  Object.keys(cambios).forEach(function (k) { fila[FOTO[k]] = cambios[k]; });
  fila[FOTO.actualizada] = new Date();
  fila[FOTO.ver] = fila[FOTO.archivo] && fila[FOTO.estado] !== "borrada"
    ? '=HYPERLINK("https://drive.google.com/file/d/' + fila[FOTO.archivo] + '/view","Ver")'
    : "";
  hojaFotos().getRange(f.numero, 1, 1, fila.length).setValues([fila]);
}

function fotoPublica(fila, conEstado) {
  const out = {
    id: fila[FOTO.id],
    invitado: fila[FOTO.nombreInvitado],
    comentario: fila[FOTO.comentario],
    creada: new Date(fila[FOTO.creada]).toISOString()
  };
  if (conEstado) out.estado = fila[FOTO.estado];
  return out;
}

function invitadoPorToken(token) {
  if (!token || typeof token !== "string" || token.length < 32) fallar("sesion_invalida");
  const hash = hashTexto(token);
  const valores = hojaInvitados().getDataRange().getValues();
  for (let i = 1; i < valores.length; i++) {
    const v = valores[i];
    if (v[INV.hash] === hash) {
      if (v[INV.estado] !== "activo") fallar("sesion_invalida");
      return { id: v[INV.id], nombre: v[INV.nombre], apellido: v[INV.apellido], fila: i + 1 };
    }
  }
  fallar("sesion_invalida");
}

// Valida que sea un JPEG real mirando sus primeros bytes (FF D8 FF),
// no el nombre ni el tipo que diga el navegador. El frontend convierte
// todo a JPEG, lo que además borra los datos de ubicación (EXIF/GPS).
function decodificarJpeg(base64, maxBytes) {
  if (!base64 || typeof base64 !== "string") fallar("imagen_invalida");
  const limpio = base64.replace(/^data:image\/[a-z]+;base64,/, "");
  if (limpio.length > Math.ceil(maxBytes * 4 / 3) + 8) fallar("imagen_grande");
  let bytes;
  try { bytes = Utilities.base64Decode(limpio); } catch (e) { fallar("imagen_invalida"); }
  if (bytes.length > maxBytes) fallar("imagen_grande");
  if (bytes.length < 100 || (bytes[0] & 0xff) !== 0xff || (bytes[1] & 0xff) !== 0xd8 || (bytes[2] & 0xff) !== 0xff) {
    fallar("imagen_invalida");
  }
  return bytes;
}

function carpeta(propiedad) {
  const id = propiedades().getProperty(propiedad);
  if (!id) throw new Error("Falta configurar la cámara (menú Cámara descartable → Configurar).");
  return DriveApp.getFolderById(id);
}

function leerArchivoBase64(id) {
  return Utilities.base64Encode(DriveApp.getFileById(id).getBlob().getBytes());
}

function mandarALaPapelera(ids) {
  ids.filter(Boolean).forEach(function (id) {
    try { DriveApp.getFileById(id).setTrashed(true); }
    catch (e) { console.error("No se pudo mandar a la papelera " + id + ": " + e); }
  });
}

function nombreArchivo(inv, idFoto) {
  const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HH-mm-ss");
  const autor = (inv.nombre + "-" + inv.apellido).replace(/[^\wáéíóúñÁÉÍÓÚÑ-]+/g, "-");
  return fecha + "_" + autor + "_" + idFoto + ".jpg";
}

function listaDeIds(ids) {
  if (!Array.isArray(ids)) fallar("datos_invalidos");
  return ids.slice(0, CAMARA.MAX_IDS_POR_PEDIDO).map(String);
}

// Un texto que empieza con = + - @ la planilla lo tomaría como fórmula:
// el apóstrofo inicial lo fuerza a texto (y Sheets no lo muestra).
function paraCelda(texto) {
  return /^[=+\-@]/.test(texto) ? "'" + texto : texto;
}

function textoLimpio(valor, max) {
  return String(valor == null ? "" : valor).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function nuevoToken() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "");
}

function idCorto() {
  return Utilities.getUuid().replace(/-/g, "").slice(0, 12);
}

function hashTexto(texto) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8)
    .map(function (b) { return ((b & 0xff) + 0x100).toString(16).slice(1); })
    .join("");
}
