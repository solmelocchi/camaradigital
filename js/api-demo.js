/**
 * Modo demostración: imita al servidor guardando todo en este navegador.
 * Se usa cuando la boda no tiene webAppUrl, para mostrar la cámara a
 * clientes. Las fotos se "revelan" a los pocos minutos de registrarse.
 */
(function () {
  "use strict";
  const CLAVE = "koba-camara-demo";
  const { ErrorCamara } = window.CamaraAPI;
  const error = (codigo, mensaje) => new ErrorCamara(codigo, mensaje);

  function crear(maxFotos, minutosRevelado) {
    const completas = {}; // fotos grandes solo en memoria

    function leer() {
      try { return JSON.parse(localStorage.getItem(CLAVE)) || { invitados: {}, fotos: [] }; }
      catch (e) { return { invitados: {}, fotos: [] }; }
    }
    function guardar(db) {
      try { localStorage.setItem(CLAVE, JSON.stringify(db)); } catch (e) { /* sin espacio */ }
    }
    const azar = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    const demora = () => new Promise((r) => setTimeout(r, 400 + Math.random() * 600));

    function invitado(db, token) {
      const inv = token && db.invitados[token];
      if (!inv) throw error("sesion_invalida", "Tu sesión no es válida. Volvé a entrar con tu enlace personal.");
      return inv;
    }
    const propias = (db, inv) => db.fotos.filter((f) => f.invitado === inv.id && f.estado === "activa");
    const nombreDe = (db, id) => { const i = Object.values(db.invitados).find((x) => x.id === id); return i ? i.nombre + " " + i.apellido : ""; };
    const publica = (f, db) => ({ id: f.id, comentario: f.comentario, estado: f.estado, creada: f.creada, invitado: nombreDe(db, f.invitado) });
    const revelaEn = (inv) => new Date(new Date(inv.registrado).getTime() + minutosRevelado * 60000).toISOString();
    const revelado = (inv) => Date.now() >= new Date(revelaEn(inv)).getTime();

    const acciones = {
      registrar(db, d) {
        const nombre = String(d.nombre || "").trim();
        const apellido = String(d.apellido || "").trim();
        if (!nombre || !apellido) throw error("datos_invalidos", "Faltan datos.");
        const token = azar() + azar();
        db.invitados[token] = { id: "i_" + azar().slice(0, 12), nombre, apellido, registrado: new Date().toISOString() };
        const inv = db.invitados[token];
        return { token, invitado: inv, usadas: 0, maxFotos, revelado: false, revelaEn: revelaEn(inv) };
      },
      sesion(db, d) {
        const inv = invitado(db, d.token);
        const fotos = propias(db, inv);
        return {
          invitado: inv, fotos: fotos.map((f) => publica(f, db)), usadas: fotos.length, maxFotos,
          abierta: true, albumCompartido: true, revelado: revelado(inv), revelaEn: revelaEn(inv)
        };
      },
      subir(db, d) {
        const inv = invitado(db, d.token);
        if (d.reemplazaA && !revelado(inv)) throw error("en_revelado", "Las fotos todavía se están revelando.");
        const repetida = db.fotos.find((f) => f.invitado === inv.id && d.idCliente && f.idCliente === d.idCliente && f.estado === "activa");
        if (repetida) return { foto: publica(repetida, db), usadas: propias(db, inv).length, maxFotos, repetida: true };
        const otras = propias(db, inv).filter((f) => f.id !== d.reemplazaA);
        if (d.reemplazaA && otras.length === propias(db, inv).length) throw error("no_encontrada", "No encontramos esa foto.");
        if (otras.length >= maxFotos) throw error("cupo_lleno", "Ya usaste todas tus fotos.");
        const foto = {
          id: "f_" + azar().slice(0, 12), invitado: inv.id, idCliente: d.idCliente || "",
          comentario: String(d.comentario || "").slice(0, 280), estado: "activa",
          creada: new Date().toISOString(), mini: "data:image/jpeg;base64," + d.miniatura
        };
        completas[foto.id] = d.imagen;
        db.fotos.push(foto);
        if (d.reemplazaA) db.fotos.find((f) => f.id === d.reemplazaA).estado = "borrada";
        return { foto: publica(foto, db), usadas: propias(db, inv).length, maxFotos };
      },
      borrar(db, d) {
        const inv = invitado(db, d.token);
        const mias = propias(db, inv);
        const f = mias.find((x) => x.id === d.idFoto);
        if (!f) throw error("no_encontrada", "No encontramos esa foto.");
        if (!revelado(inv) && f !== mias[mias.length - 1]) throw error("solo_ultima", "Antes del revelado solo podés borrar tu última foto.");
        f.estado = "borrada";
        return { usadas: propias(db, inv).length, maxFotos };
      },
      comentar(db, d) {
        const inv = invitado(db, d.token);
        const f = propias(db, inv).find((x) => x.id === d.idFoto);
        if (!f) throw error("no_encontrada", "No encontramos esa foto.");
        f.comentario = String(d.comentario || "").slice(0, 280);
        return { comentario: f.comentario };
      },
      miniaturas(db, d) {
        const inv = invitado(db, d.token);
        return {
          miniaturas: (d.ids || []).map((id) => {
            const f = db.fotos.find((x) => x.id === id && x.estado === "activa");
            if (!f) return { id, error: "no_encontrada" };
            if (!revelado(inv)) return { id, error: "en_revelado" };
            return { id, datos: f.mini.split(",")[1] };
          })
        };
      },
      foto(db, d) {
        const inv = invitado(db, d.token);
        const f = db.fotos.find((x) => x.id === d.idFoto && x.estado === "activa");
        if (!f) throw error("no_encontrada", "No encontramos esa foto.");
        if (!revelado(inv)) throw error("en_revelado", "Las fotos todavía se están revelando.");
        return { id: f.id, datos: completas[f.id] || f.mini.split(",")[1] };
      },
      album(db, d) {
        const inv = invitado(db, d.token);
        if (!revelado(inv)) throw error("en_revelado", "Las fotos todavía se están revelando.");
        return { fotos: db.fotos.filter((f) => f.estado === "activa").map((f) => publica(f, db)) };
      }
    };

    return {
      demo: true,
      async llamar(accion, datos) {
        await demora();
        const db = leer();
        if (!acciones[accion]) throw error("accion_desconocida", "Acción desconocida.");
        const r = acciones[accion](db, datos || {});
        guardar(db);
        return Object.assign({ ok: true }, r);
      },
      async info() {
        return { ok: true, abierta: true, albumCompartido: true, revelado: false, revelaEn: "", maxFotos };
      }
    };
  }

  window.CamaraDemo = { crear };
})();
