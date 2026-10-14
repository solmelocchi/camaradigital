/**
 * App de la cámara descartable: registro, cámara (visor propio o la del
 * celular), rollo con revelado, álbum y perfil. El servidor decide el
 * cupo, el revelado y la privacidad; acá solo se muestra.
 */
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const params = new URLSearchParams(location.search);
  const esLocal = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(location.hostname);
  const REINTENTOS = 4;
  const PASAJEROS = ["red", "ocupado", "error_interno"];

  const E = {
    boda: null, api: null, url: "", slug: window.BODA_SLUG,
    token: null, invitado: null,
    usadas: 0, max: 24, abierta: true,
    revelado: false, revelaEn: "", albumCompartido: false,
    fotos: [],          // { id, idCliente, comentario, creada, mini, completa, subiendo, enviando, error, datos }
    cola: [], subiendo: false,
    album: { fotos: [], cargado: false, filtro: "todas" },
    detalle: null, chipFoto: null, flash: false, disparando: false,
    descartables: [], instalar: null
  };

  /* ---------------------------------------------------------
     Utilidades
  --------------------------------------------------------- */
  const pareja = () => `${E.boda.pareja.nombre1} & ${E.boda.pareja.nombre2}`;
  const claveToken = () => `koba-camara:token:${E.slug}:${E.url || "demo"}`;
  const guardarToken = (t) => { try { localStorage.setItem(claveToken(), t); } catch (e) { /* modo privado */ } };
  const leerToken = () => { try { return localStorage.getItem(claveToken()); } catch (e) { return null; } };
  const borrarToken = () => { try { localStorage.removeItem(claveToken()); } catch (e) { /* nada */ } };
  const vibrar = (ms) => { if (navigator.vibrate) navigator.vibrate(ms); };
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const instalada = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const nuevoIdCliente = () => "c-" + Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

  function enlacePersonal() {
    const api = esLocal && params.get("api") ? `&api=${encodeURIComponent(params.get("api"))}` : "";
    return `${location.origin}${location.pathname}?b=${E.slug}${api}#t=${E.token}`;
  }

  let toastTimer;
  function aviso(texto, esError) {
    const t = $("#toast");
    t.textContent = texto;
    t.classList.toggle("is-error", !!esError);
    t.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-visible"), esError ? 4500 : 2600);
  }

  function mostrarPantalla(id) {
    $$(".pantalla").forEach((p) => { p.hidden = p.id !== id; });
    $$(".tab").forEach((t) => t.classList.toggle("is-activa", t.dataset.tab === id));
    if (id === "p-album") abrirAlbum();
    const pantalla = document.getElementById(id);
    if (pantalla) pantalla.scrollTop = 0;
  }

  function fechaHumana(iso) {
    const d = new Date(iso);
    const hoy = new Date();
    const manana = new Date(); manana.setDate(hoy.getDate() + 1);
    const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
    if (d.toDateString() === hoy.toDateString()) return `hoy a las ${hora}`;
    if (d.toDateString() === manana.toDateString()) return `mañana a las ${hora}`;
    return `el ${d.toLocaleDateString("es-AR", { day: "numeric", month: "long" })} a las ${hora}`;
  }
  function cuentaRegresiva(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 60000) return "menos de un minuto";
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    if (h >= 48) return `${Math.floor(h / 24)} días`;
    return h ? `${h} h ${m} min` : `${m} min`;
  }

  function aplicarColores() {
    const c = E.boda.colores || {};
    const mapa = { fondo: "--color-bg", tinta: "--color-ink", principal: "--color-primary", acento: "--color-accent" };
    Object.keys(mapa).forEach((k) => { if (c[k]) document.documentElement.style.setProperty(mapa[k], c[k]); });
    if (c.fondo) $('meta[name="theme-color"]').setAttribute("content", c.fondo);
  }

  // Si la sesión dejó de valer en el servidor, se vuelve a la bienvenida
  function sesionCaida(e) {
    if (!e || e.codigo !== "sesion_invalida") return false;
    salir("Tu sesión ya no es válida. Si tenés tu enlace personal, abrilo para volver.");
    return true;
  }

  /* ---------------------------------------------------------
     Arranque
  --------------------------------------------------------- */
  async function iniciar() {
    mostrarPantalla("p-cargando");
    try { E.boda = await window.cargarBoda; }
    catch (e) {
      $("#error-texto").textContent = "No encontramos esta cámara. Revisá el link que te pasaron.";
      $("#btn-reintentar").hidden = true;
      mostrarPantalla("p-error");
      return;
    }
    E.url = (esLocal && params.get("api")) || E.boda.webAppUrl || "";
    const minutosDemo = (E.boda.demo && E.boda.demo.revelarEnMinutos) || 3;
    E.api = E.url ? window.CamaraAPI.crear(E.url) : window.CamaraDemo.crear(24, minutosDemo);

    aplicarColores();
    const f = new Date(E.boda.fecha);
    const fechaCorta = `${f.getDate()} · ${String(f.getMonth() + 1).padStart(2, "0")} · ${String(f.getFullYear()).slice(2)}`;
    document.title = `Cámara · ${pareja()}`;
    $("#meta-titulo-app").setAttribute("content", `Cámara ${E.boda.pareja.nombre1} & ${E.boda.pareja.nombre2}`);
    $("#tb-nombres").textContent = pareja();
    $("#tb-fecha").textContent = fechaCorta;
    $("#bv-kicker").textContent = `${pareja()} · ${fechaCorta}`;
    $("#bv-bajada").textContent = `Tenés 24 fotos para la boda. Como en las descartables de antes, las vas a ver recién cuando se revelen.`;
    $("#perfil-modo").hidden = !!E.url;
    E.descartables = $$("[data-descartable]").map((el) => window.Descartable.pintar(el, {
      nombres: pareja(),
      fecha: `${String(f.getDate()).padStart(2, "0")} · ${String(f.getMonth() + 1).padStart(2, "0")} · ${f.getFullYear()}`
    }));

    // El enlace personal trae el token después del #: se guarda y se quita de la barra
    const m = location.hash.match(/^#t=([0-9a-f]{32,128})$/i);
    if (m) {
      guardarToken(m[1]);
      history.replaceState(null, "", location.pathname + location.search);
    }
    E.token = leerToken();

    try {
      if (E.token) {
        aplicarSesion(await E.api.llamar("sesion", { token: E.token }, 3));
        entrarALaApp();
      } else {
        const info = await E.api.info();
        $("#bv-cerrada").hidden = info.abierta !== false;
        $("#form-registro").hidden = info.abierta === false;
        mostrarPantalla("p-bienvenida");
      }
    } catch (e) {
      if (e.codigo === "sesion_invalida") { salir("Tu sesión anterior ya no es válida. Registrate de nuevo o abrí tu enlace personal."); return; }
      $("#error-texto").textContent = e.message || "No pudimos conectarnos.";
      $("#btn-reintentar").hidden = false;
      mostrarPantalla("p-error");
    }
  }

  function aplicarSesion(r) {
    E.invitado = r.invitado;
    E.usadas = r.usadas || 0;
    E.max = r.maxFotos || 24;
    E.abierta = r.abierta !== false;
    E.albumCompartido = !!r.albumCompartido;
    const antes = E.revelado;
    E.revelado = !!r.revelado;
    E.revelaEn = r.revelaEn || "";
    // Se conservan las fotos que se están subiendo desde este celular
    const locales = E.fotos.filter((x) => x.subiendo || x.error);
    const previas = new Map(E.fotos.map((x) => [x.id, x]));
    E.fotos = (r.fotos || [])
      .slice()
      .sort((a, b) => new Date(a.creada) - new Date(b.creada))
      .map((x) => Object.assign(previas.get(x.id) || {}, { id: x.id, comentario: x.comentario || "", creada: x.creada }))
      .concat(locales);
    if (!antes && E.revelado && E.invitado) {
      E.album.cargado = false;
      setTimeout(() => { aviso("¡Se revelaron tus fotos!"); vibrar([30, 60, 30]); }, 300);
    }
    const iniciales = (r.invitado.nombre.charAt(0) + r.invitado.apellido.charAt(0)).toUpperCase();
    $("#btn-perfil").textContent = iniciales;
    $("#perfil-avatar").textContent = iniciales;
    $("#perfil-nombre").textContent = `${r.invitado.nombre} ${r.invitado.apellido}`;
    render();
    renderAvisos();
    if (E.revelado) cargarMiniaturas();
  }

  function entrarALaApp() {
    $("#topbar").hidden = false;
    $("#tabbar").hidden = false;
    mostrarPantalla("p-camara");
    $("#btn-instalar").hidden = instalada() || !(E.instalar || esIOS);
    renovarAvisos();
  }

  /* ---------------------------------------------------------
     Avisos al celular
  --------------------------------------------------------- */
  const claveAvisos = () => `koba-camara:avisos:${E.slug}:${E.url}`;
  const avisosGuardados = () => { try { return localStorage.getItem(claveAvisos()); } catch (e) { return null; } };

  function estadoAvisos() {
    if (!E.url) return "demo";
    if (!Avisos.configurado()) return "sin-configurar";
    if (esIOS && !instalada()) return "instalar";
    if (!Avisos.soportado()) return "no-soportado";
    if (Avisos.permiso === "denied") return "bloqueados";
    if (Avisos.permiso === "granted" && avisosGuardados()) return "activos";
    return "pendiente";
  }

  const TEXTOS_AVISOS = {
    "demo": "No están en la demostración",
    "sin-configurar": "Muy pronto",
    "instalar": "Instalá la app para recibirlos",
    "no-soportado": "Este navegador no los permite",
    "bloqueados": "Bloqueados: activalos en la configuración del celular",
    "activos": "Activados: te avisamos cuando se revelen",
    "pendiente": "Tocá para activarlos"
  };

  function renderAvisos() {
    const est = estadoAvisos();
    $("#avisos-estado").textContent = TEXTOS_AVISOS[est];
    const tarjeta = $("#tarjeta-avisos");
    tarjeta.hidden = E.revelado || !(est === "pendiente" || est === "instalar");
    if (est === "instalar") {
      $("#ta-titulo").textContent = "Instalá la app y te avisamos";
      $("#ta-texto").textContent = "En iPhone los avisos llegan a la app instalada.";
      $("#ta-boton").textContent = "Instalar";
    } else {
      $("#ta-titulo").textContent = "¿Te avisamos cuando se revelen?";
      $("#ta-texto").textContent = "Te llega una notificación al celular.";
      $("#ta-boton").textContent = "Avisarme";
    }
  }

  async function enviarDireccionAvisos(fcm) {
    await E.api.llamar("avisos", { token: E.token, fcmToken: fcm, app: `${location.origin}${location.pathname}?b=${E.slug}` }, 3);
    try { localStorage.setItem(claveAvisos(), fcm); } catch (e) { /* nada */ }
  }

  async function activarAvisos() {
    const est = estadoAvisos();
    if (est === "instalar") { instalar(); return; }
    if (est !== "pendiente") { aviso(TEXTOS_AVISOS[est] + "."); return; }
    try {
      const fcm = await Avisos.activar(); // pide el permiso dentro del toque
      await enviarDireccionAvisos(fcm);
      aviso("¡Listo! Te avisamos cuando se revelen.");
    } catch (e) {
      if (e.codigo === "bloqueados") aviso("Los avisos están bloqueados. Activalos en la configuración del celular.", true);
      else if (e.codigo !== "sin_permiso" && !sesionCaida(e)) aviso("No pudimos activar los avisos. Probá de nuevo.", true);
    }
    renderAvisos();
  }

  // Si el celular ya dio permiso, se confirma la dirección (Firebase a veces la cambia)
  let escuchandoAvisos = false;
  async function renovarAvisos() {
    if (!E.url || !Avisos.soportado() || Avisos.permiso !== "granted") return;
    try {
      const fcm = await Avisos.token();
      if (fcm && fcm !== avisosGuardados()) await enviarDireccionAvisos(fcm);
      if (!escuchandoAvisos) {
        escuchandoAvisos = true;
        Avisos.alRecibir((p) => {
          const n = (p && p.notification) || {};
          aviso([n.title, n.body].filter(Boolean).join(" · ") || "Tenés un aviso nuevo.");
          if (E.token) E.api.llamar("sesion", { token: E.token }, 2).then(aplicarSesion).catch(() => {});
        });
      }
    } catch (e) { /* sin avisos no se rompe nada */ }
    renderAvisos();
  }

  /* ---------------------------------------------------------
     Pintado
  --------------------------------------------------------- */
  const pendientes = () => E.fotos.filter((x) => x.subiendo && !x.reemplazaA).length;
  const disponibles = () => Math.max(0, E.max - E.usadas - pendientes());
  const confirmadas = () => E.fotos.filter((x) => !x.subiendo && !x.error);
  const ultimaConfirmada = () => { const c = confirmadas(); return c[c.length - 1]; };

  function render() {
    const libres = disponibles();
    E.descartables.forEach((d) => d.numero(libres, true));
    $("#cam-quedan").textContent = libres;
    $("#cam-quedan-txt").textContent = libres === 0 ? "se terminó tu rollo" : libres === 1 ? "foto en tu rollo" : "fotos en tu rollo";
    $("#cam-revela").innerHTML = textoRevelado();
    const sinFotos = libres <= 0 || !E.abierta;
    $("#btn-abrir").disabled = sinFotos;
    $("#btn-galeria").classList.toggle("is-disabled", sinFotos);
    $("#input-galeria").disabled = sinFotos;
    $("#visor-num").textContent = libres;
    $("#visor-disparar").disabled = libres <= 0;
    const enCola = E.fotos.filter((x) => x.subiendo || x.error).length;
    $("#tab-badge").hidden = !enCola;
    $("#tab-badge").textContent = enCola;
    renderRollo();
  }

  function textoRevelado() {
    if (!E.abierta) return "La cámara está cerrada.";
    if (E.revelado) return "Tus fotos ya están <strong>reveladas</strong>.";
    if (E.revelaEn) return `Se revelan <strong>${fechaHumana(E.revelaEn)}</strong>`;
    return "Se revelan cuando los novios lo decidan.";
  }

  function renderRollo() {
    const total = confirmadas().length;
    $("#rollo-resumen").textContent = `${total} de ${E.max}`;
    $("#rollo-vacio").hidden = E.fotos.length > 0;
    $("#rollo-revelado").innerHTML = E.fotos.length === 0 ? "" : E.revelado
      ? `<p class="revelado-titulo">¡Revelado!</p><p class="revelado-cuenta">Tocá una foto para verla en grande y guardarla.</p>`
      : `<p class="revelado-titulo">En revelado</p><p class="revelado-cuenta">${E.revelaEn ? `Se revelan ${fechaHumana(E.revelaEn)} · faltan <strong>${cuentaRegresiva(E.revelaEn)}</strong>` : "Se revelan cuando los novios lo decidan."}</p>`;

    const grid = $("#rollo-grid");
    grid.innerHTML = "";
    E.fotos.map((x, i) => ({ x, n: i + 1 })).reverse().forEach(({ x, n }) => {
      const b = document.createElement("button");
      b.type = "button";
      const negativo = !E.revelado || !x.mini || x.subiendo || x.error;
      b.className = "cuadro" + (negativo ? " es-negativo" : "") + (x.subiendo ? " is-subiendo" : "") + (x.error ? " is-error" : "");
      b.setAttribute("aria-label", x.error ? "Foto sin subir, tocá para reintentar" : `Foto ${n}`);
      if (!negativo) {
        const img = document.createElement("img");
        img.src = x.mini;
        img.alt = "";
        b.appendChild(img);
      } else {
        const et = document.createElement("span");
        et.className = "cuadro-etiqueta";
        et.textContent = x.error ? "No se subió · tocá para reintentar" : x.subiendo ? "Guardando…" : E.revelado ? "" : "En revelado";
        b.appendChild(et);
      }
      const num = document.createElement("span");
      num.className = "cuadro-num";
      num.textContent = n + "A";
      b.appendChild(num);
      if (x.comentario && !x.error) {
        const nota = document.createElement("span");
        nota.className = "cuadro-nota";
        b.appendChild(nota);
      }
      b.addEventListener("click", () => tocarCuadro(x, n));
      grid.appendChild(b);
    });
  }

  async function cargarMiniaturas() {
    const faltan = E.fotos.filter((x) => !x.mini && !x.subiendo && !x.error).map((x) => x.id);
    for (let i = 0; i < faltan.length; i += 12) {
      try {
        const r = await E.api.llamar("miniaturas", { token: E.token, ids: faltan.slice(i, i + 12) }, 3);
        r.miniaturas.forEach((m) => {
          const x = E.fotos.find((y) => y.id === m.id);
          if (x && m.datos) x.mini = "data:image/jpeg;base64," + m.datos;
        });
        renderRollo();
      } catch (e) { if (sesionCaida(e)) return; }
    }
  }

  /* ---------------------------------------------------------
     Registro y salida
  --------------------------------------------------------- */
  async function registrar(ev) {
    ev.preventDefault();
    const nombre = $("#reg-nombre").value.trim();
    const apellido = $("#reg-apellido").value.trim();
    const fb = $("#reg-feedback");
    if (!nombre || !apellido) { fb.textContent = "Completá tu nombre y tu apellido."; return; }
    Sonidos.preparar();
    const btn = $("#btn-registro");
    btn.disabled = true;
    fb.textContent = "";
    try {
      const r = await E.api.llamar("registrar", { nombre, apellido }, REINTENTOS);
      E.token = r.token;
      guardarToken(r.token);
      aplicarSesion(Object.assign({ fotos: [], abierta: true }, r));
      entrarALaApp();
      // Por si el servidor es de una versión anterior, se completa el estado con la sesión
      E.api.llamar("sesion", { token: r.token }, 2).then(aplicarSesion).catch(() => {});
      aviso(`¡Hola, ${nombre}! Tu cámara está lista.`);
    } catch (e) {
      fb.textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  }

  let salirArmado = false;
  function pedirSalir() {
    const b = $("#btn-salir");
    if (!salirArmado) {
      salirArmado = true;
      b.textContent = "¿Guardaste tu enlace personal? Tocá de nuevo para salir";
      setTimeout(() => { salirArmado = false; b.textContent = "Salir de esta cámara"; }, 5000);
      return;
    }
    salir();
  }
  function salir(mensaje) {
    borrarToken();
    Object.assign(E, { token: null, invitado: null, usadas: 0, fotos: [], cola: [] });
    E.album = { fotos: [], cargado: false, filtro: "todas" };
    salirArmado = false;
    $("#btn-salir").textContent = "Salir de esta cámara";
    cerrarHojas();
    $("#form-registro").reset();
    $("#form-registro").hidden = false;
    $("#reg-feedback").textContent = mensaje || "";
    $("#topbar").hidden = true;
    $("#tabbar").hidden = true;
    mostrarPantalla("p-bienvenida");
  }

  /* ---------------------------------------------------------
     Cámara: abrir, disparar, cerrar
  --------------------------------------------------------- */
  function abrirCamara() {
    if (disponibles() <= 0 || !E.abierta) return;
    Sonidos.preparar();
    // Sin https o sin permiso de cámara en el navegador: la cámara del celular
    if (!Visor.disponible()) { $("#input-camara-nativa").click(); return; }
    const d = E.descartables[E.descartables.length - 1];
    d.estado("cargando");
    vibrar(10);
    setTimeout(async () => {
      d.estado("lista");
      $("#visor").hidden = false;
      $("#visor-aviso").hidden = true;
      $("#visor-chip").hidden = true;
      render();
      try {
        await Visor.abrir($("#visor-video"));
        $("#visor-flash").hidden = false;
      } catch (e) {
        mostrarAvisoVisor();
      }
    }, 650);
  }

  function mostrarAvisoVisor() {
    const a = $("#visor-aviso");
    a.innerHTML = `No pudimos usar la cámara desde acá. Revisá que el navegador tenga permiso, o usá la cámara del celular.<br><br><label class="btn btn-primary" for="input-camara-nativa">Usar la cámara del celular</label>`;
    a.hidden = false;
  }

  async function cerrarCamara() {
    await Visor.cerrar();
    $("#visor").hidden = true;
    E.descartables.forEach((d) => d.estado("apagada"));
    if (E.flash) alternarFlash();
  }

  async function disparar() {
    if (E.disparando || disponibles() <= 0) return;
    E.disparando = true;
    try {
      const usarPantalla = E.flash && Visor.frontal;
      const usarLinterna = E.flash && !Visor.frontal && await Visor.linterna(true);
      if (usarPantalla) { $("#visor-destello").style.opacity = "1"; await new Promise((r) => setTimeout(r, 180)); }
      if (usarLinterna) await new Promise((r) => setTimeout(r, 300));
      const canvas = Visor.capturar();
      if (usarLinterna) Visor.linterna(false);
      $("#visor-destello").style.opacity = "";
      const destello = $("#visor-destello");
      destello.classList.remove("disparo");
      void destello.offsetWidth;
      destello.classList.add("disparo");
      Sonidos.obturador();
      vibrar(25);
      // La foto se reserva en el rollo al instante; comprimirla y subirla
      // sigue en segundo plano, así se puede sacar la siguiente enseguida
      const pendiente = encolar(canvas);
      animarContador();
      Sonidos.avanzar();
      pendiente.then((foto) => { if (foto) mostrarChip(foto); });
    } catch (e) {
      aviso(e.message || "No se pudo sacar la foto.", true);
    } finally {
      setTimeout(() => { E.disparando = false; }, 300);
    }
  }

  function animarContador() {
    const n = $("#visor-num");
    n.textContent = disponibles();
    n.classList.remove("rueda");
    void n.offsetWidth;
    n.classList.add("rueda");
  }

  let chipTimer;
  function mostrarChip(foto) {
    E.chipFoto = foto;
    const n = E.fotos.indexOf(foto) + 1;
    $("#visor-chip-texto").textContent = `Foto ${n}A en tu rollo · dejá un mensaje`;
    $("#visor-chip").hidden = false;
    clearTimeout(chipTimer);
    chipTimer = setTimeout(() => { $("#visor-chip").hidden = true; }, 4500);
  }

  function alternarFlash() {
    E.flash = !E.flash;
    const b = $("#visor-flash");
    b.setAttribute("aria-pressed", String(E.flash));
    b.querySelector("use").setAttribute("href", E.flash ? "#i-flash" : "#i-flash-off");
  }

  /* ---------------------------------------------------------
     Fotos: preparar y subir de a una, con reintentos
  --------------------------------------------------------- */
  async function encolar(fuente, reemplazaA) {
    if (!reemplazaA && disponibles() <= 0) { aviso("Se terminó tu rollo.", true); return null; }
    const idCliente = nuevoIdCliente();
    const foto = { id: "local-" + idCliente, idCliente, comentario: "", creada: new Date().toISOString(), subiendo: true, reemplazaA: reemplazaA || null };
    E.fotos.push(foto);
    render();
    try {
      const datos = await CamaraImagenes.preparar(fuente);
      foto.datos = { imagen: datos.imagen, miniatura: datos.miniatura };
      foto.miniLocal = datos.miniUrl;
      foto.completaLocal = datos.fotoUrl;
    } catch (e) {
      E.fotos = E.fotos.filter((x) => x !== foto);
      render();
      aviso(e.message, true);
      return null;
    }
    E.cola.push(foto);
    procesarCola();
    return foto;
  }

  async function procesarCola() {
    if (E.subiendo) return;
    E.subiendo = true;
    while (E.cola.length) {
      const foto = E.cola[0];
      foto.enviando = true;
      try {
        const r = await E.api.llamar("subir", {
          token: E.token,
          imagen: foto.datos.imagen,
          miniatura: foto.datos.miniatura,
          comentario: foto.comentario,
          reemplazaA: foto.reemplazaA || undefined,
          idCliente: foto.idCliente
        }, REINTENTOS);
        if (foto.reemplazaA) E.fotos = E.fotos.filter((x) => x.id !== foto.reemplazaA);
        Object.assign(foto, { id: r.foto.id, subiendo: false, enviando: false, error: null, datos: null, reemplazaA: null });
        if (E.revelado) { foto.mini = foto.miniLocal; foto.completa = foto.completaLocal; }
        E.usadas = r.usadas;
        if (foto.comentarioPendiente != null) {
          const texto = foto.comentarioPendiente;
          foto.comentarioPendiente = null;
          E.api.llamar("comentar", { token: E.token, idFoto: foto.id, comentario: texto }, REINTENTOS)
            .then((c) => { foto.comentario = c.comentario; renderRollo(); })
            .catch(() => {});
        }
      } catch (e) {
        foto.enviando = false;
        if (sesionCaida(e)) { E.subiendo = false; return; }
        if (PASAJEROS.includes(e.codigo)) {
          foto.subiendo = false;
          foto.error = e.message;
        } else {
          E.fotos = E.fotos.filter((x) => x !== foto);
          if (e.codigo === "camara_cerrada") E.abierta = false;
          aviso(e.message, true);
        }
      }
      E.cola.shift();
      render();
    }
    E.subiendo = false;
  }

  function reintentar(foto) {
    foto.error = null;
    foto.subiendo = true;
    E.cola.push(foto);
    render();
    procesarCola();
  }

  /* ---------------------------------------------------------
     Mensaje para los novios
  --------------------------------------------------------- */
  function abrirMensaje(foto) {
    E.detalle = foto;
    const n = E.fotos.indexOf(foto) + 1;
    $("#mensaje-sub").textContent = `Va junto a tu foto ${n}A.`;
    $("#mensaje-texto").value = foto.comentario || "";
    abrirHoja("#h-mensaje");
    setTimeout(() => $("#mensaje-texto").focus(), 350);
  }

  async function guardarMensaje(foto, texto) {
    texto = texto.trim().slice(0, 280);
    if (foto.subiendo || foto.error) {
      if (foto.enviando) foto.comentarioPendiente = texto;
      else foto.comentario = texto;
      foto.comentario = texto;
      renderRollo();
      return true;
    }
    try {
      const r = await E.api.llamar("comentar", { token: E.token, idFoto: foto.id, comentario: texto }, REINTENTOS);
      foto.comentario = r.comentario;
      renderRollo();
      return true;
    } catch (e) {
      if (!sesionCaida(e)) aviso(e.message, true);
      return false;
    }
  }

  /* ---------------------------------------------------------
     Detalle de una foto (rollo propio o álbum)
  --------------------------------------------------------- */
  function tocarCuadro(foto, n) {
    if (foto.error) { reintentar(foto); return; }
    if (foto.subiendo) { abrirMensaje(foto); return; }
    if (E.revelado) {
      const lista = confirmadas();
      abrirCarrusel(lista, lista.indexOf(foto), false);
      return;
    }
    abrirFoto(foto, n, false); // negativo: mensaje y, si es la última, borrar
  }

  /* ---------------------------------------------------------
     Carrusel: fotos a pantalla completa, se pasan deslizando
  --------------------------------------------------------- */
  const C = { lista: [], i: 0, deAlbum: false };
  const fechaFoto = (iso) => new Date(iso).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

  function abrirCarrusel(lista, indice, deAlbum) {
    if (!lista.length) return;
    C.lista = lista.slice();
    C.i = Math.max(0, indice);
    C.deAlbum = deAlbum;
    const pista = $("#car-pista");
    pista.innerHTML = "";
    C.lista.forEach((f) => {
      const slide = document.createElement("div");
      slide.className = "car-slide";
      slide.dataset.id = f.id;
      const img = document.createElement("img");
      img.alt = deAlbum && f.invitado ? `Foto de ${f.invitado}` : "Tu foto";
      img.decoding = "async";
      if (f.completa || f.mini) img.src = f.completa || f.mini;
      slide.appendChild(img);
      pista.appendChild(slide);
    });
    $("#carrusel").hidden = false;
    document.body.classList.add("sin-scroll");
    requestAnimationFrame(() => {
      pista.scrollLeft = C.i * pista.clientWidth;
      mostrarActual();
    });
  }

  function cerrarCarrusel() {
    $("#carrusel").hidden = true;
    document.body.classList.remove("sin-scroll");
    E.detalle = null;
  }

  function mostrarActual() {
    const f = C.lista[C.i];
    if (!f) return;
    E.detalle = f;
    $("#car-titulo").textContent = C.deAlbum ? (f.invitado || "Foto") : `Foto ${E.fotos.indexOf(f) + 1}A`;
    $("#car-sub").textContent = f.creada ? fechaFoto(f.creada) : "";
    $("#car-cuenta").textContent = `${C.i + 1} / ${C.lista.length}`;
    $("#car-comentario").hidden = !f.comentario;
    $("#car-comentario").textContent = f.comentario ? `“${f.comentario}”` : "";
    $("#car-mensaje").hidden = C.deAlbum;
    $("#car-borrar").hidden = C.deAlbum;
    $("#car-reemplazar").hidden = C.deAlbum;
    $("#car-reemplazar").classList.toggle("is-disabled", !E.abierta);
    $("#input-reemplazo").disabled = !E.abierta;
    desarmarBorrarCarrusel();
    [C.i, C.i + 1, C.i - 1].forEach(cargarCompleta);
  }

  // La foto grande se pide cuando se va a ver (y la de al lado, para que pase suave)
  async function cargarCompleta(k) {
    const f = C.lista[k];
    if (!f || f.completa || f.cargando) return;
    f.cargando = true;
    try {
      const r = await E.api.llamar("foto", { token: E.token, idFoto: f.id }, 2);
      f.completa = "data:image/jpeg;base64," + r.datos;
      const img = document.querySelector(`.car-slide[data-id="${f.id}"] img`);
      if (img) img.src = f.completa;
    } catch (e) { sesionCaida(e); }
    finally { f.cargando = false; }
  }

  let carruselTimer;
  function alDeslizar() {
    clearTimeout(carruselTimer);
    carruselTimer = setTimeout(() => {
      const pista = $("#car-pista");
      const i = Math.round(pista.scrollLeft / pista.clientWidth);
      if (i !== C.i && C.lista[i]) { C.i = i; mostrarActual(); }
    }, 60);
  }
  function irA(i) {
    if (!C.lista[i]) return;
    const pista = $("#car-pista");
    pista.scrollTo({ left: i * pista.clientWidth, behavior: "smooth" });
  }

  let borrarCarruselTimer;
  function desarmarBorrarCarrusel() {
    const b = $("#car-borrar");
    b.classList.remove("is-confirmando");
    b.querySelector("span").textContent = "Borrar";
    clearTimeout(borrarCarruselTimer);
  }
  async function borrarDesdeCarrusel() {
    const b = $("#car-borrar");
    const f = C.lista[C.i];
    if (!f) return;
    if (!b.classList.contains("is-confirmando")) {
      b.classList.add("is-confirmando");
      b.querySelector("span").textContent = "¿Seguro?";
      borrarCarruselTimer = setTimeout(desarmarBorrarCarrusel, 4000);
      return;
    }
    desarmarBorrarCarrusel();
    try {
      const r = await E.api.llamar("borrar", { token: E.token, idFoto: f.id }, REINTENTOS);
      E.fotos = E.fotos.filter((x) => x !== f);
      E.usadas = r.usadas;
      E.album.cargado = false;
      C.lista.splice(C.i, 1);
      const slide = document.querySelector(`.car-slide[data-id="${f.id}"]`);
      if (slide) slide.remove();
      render();
      aviso("Borrada. Recuperaste un lugar en tu rollo.");
      if (!C.lista.length) { cerrarCarrusel(); return; }
      C.i = Math.min(C.i, C.lista.length - 1);
      $("#car-pista").scrollLeft = C.i * $("#car-pista").clientWidth;
      mostrarActual();
    } catch (e) {
      if (!sesionCaida(e)) aviso(e.message, true);
    }
  }

  async function abrirFoto(foto, n, deAlbum) {
    E.detalle = foto;
    const verImagen = E.revelado;
    $("#foto-titulo").textContent = deAlbum ? (foto.invitado || "Foto") : `Foto ${n}A`;
    $("#foto-img").hidden = !verImagen;
    $("#foto-negativo").hidden = verImagen;
    $("#foto-negativo-num").textContent = `${n}A`;
    $("#foto-img").src = verImagen ? (foto.completa || foto.mini || "") : "";
    $("#foto-autor").hidden = true;
    $("#foto-comentario-ver").hidden = !deAlbum || !foto.comentario;
    $("#foto-comentario-ver").textContent = foto.comentario ? `“${foto.comentario}”` : "";
    $("#foto-campo-comentario").hidden = deAlbum;
    $("#foto-comentario").value = foto.comentario || "";
    $("#foto-guardar-comentario").hidden = true;
    $("#foto-descargar").hidden = !verImagen;
    const reemplazar = $("#foto-reemplazar");
    reemplazar.hidden = deAlbum || !verImagen;
    reemplazar.classList.toggle("is-disabled", !E.abierta);
    $("#input-reemplazo").disabled = !E.abierta;
    const esUltima = foto === ultimaConfirmada();
    $("#foto-borrar").hidden = deAlbum || (!verImagen && !esUltima);
    $("#foto-acciones").hidden = deAlbum ? !verImagen : false;
    reiniciarBorrar();
    abrirHoja("#h-foto");

    if (verImagen && !foto.completa) {
      try {
        const r = await E.api.llamar("foto", { token: E.token, idFoto: foto.id }, 2);
        foto.completa = "data:image/jpeg;base64," + r.datos;
        if (E.detalle === foto) $("#foto-img").src = foto.completa;
      } catch (e) { sesionCaida(e); }
    }
  }

  async function descargar() {
    const foto = E.detalle;
    if (!foto) return;
    const datos = foto.completa || foto.mini;
    if (!datos) return;
    const nombre = `${E.slug}-${foto.id}.jpg`;
    // En celulares, compartir permite "Guardar imagen" en la galería
    try {
      const blob = await (await fetch(datos)).blob();
      const archivo = new File([blob], nombre, { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo] });
        return;
      }
    } catch (e) { if (e && e.name === "AbortError") return; }
    const a = document.createElement("a");
    a.href = datos;
    a.download = nombre;
    a.click();
  }

  let borrarTimer;
  function reiniciarBorrar() {
    const b = $("#foto-borrar");
    b.classList.remove("is-confirmando");
    b.textContent = "Borrar";
    b.disabled = false;
    clearTimeout(borrarTimer);
  }
  async function borrar() {
    const b = $("#foto-borrar");
    const foto = E.detalle;
    if (!foto) return;
    if (!b.classList.contains("is-confirmando")) {
      b.classList.add("is-confirmando");
      b.textContent = "¿Seguro?";
      borrarTimer = setTimeout(reiniciarBorrar, 4000);
      return;
    }
    clearTimeout(borrarTimer);
    b.disabled = true;
    try {
      const r = await E.api.llamar("borrar", { token: E.token, idFoto: foto.id }, REINTENTOS);
      E.fotos = E.fotos.filter((x) => x !== foto);
      E.usadas = r.usadas;
      E.album.cargado = false;
      cerrarHojas();
      render();
      aviso("Borrada. Recuperaste un lugar en tu rollo.");
    } catch (e) {
      if (!sesionCaida(e)) { aviso(e.message, true); reiniciarBorrar(); }
    }
  }

  /* ---------------------------------------------------------
     Álbum
  --------------------------------------------------------- */
  let observadorAlbum = null;
  async function abrirAlbum() {
    if (!E.invitado) return;
    const bloqueado = !E.albumCompartido || !E.revelado;
    $("#album-bloqueado").hidden = !bloqueado;
    $("#album-abierto").hidden = bloqueado;
    if (!E.albumCompartido) {
      $("#album-bloqueado-titulo").textContent = "El álbum es privado";
      $("#album-bloqueado-texto").textContent = `Cuando ${pareja()} lo compartan, vas a ver acá las fotos de todos los invitados.`;
      $("#album-resumen").textContent = "";
      return;
    }
    if (!E.revelado) {
      $("#album-bloqueado-titulo").textContent = "Todavía en revelado";
      $("#album-bloqueado-texto").textContent = E.revelaEn ? `El álbum se abre cuando se revelen las fotos, ${fechaHumana(E.revelaEn)}.` : "El álbum se abre cuando se revelen las fotos.";
      return;
    }
    if (!E.album.cargado) {
      try {
        const r = await E.api.llamar("album", { token: E.token }, 3);
        const previas = new Map(E.album.fotos.map((x) => [x.id, x]));
        E.album.fotos = r.fotos.map((x) => Object.assign(previas.get(x.id) || {}, x)).sort((a, b) => new Date(b.creada) - new Date(a.creada));
        E.album.cargado = true;
      } catch (e) {
        if (sesionCaida(e)) return;
        if (e.codigo === "album_privado") { E.albumCompartido = false; abrirAlbum(); return; }
        aviso(e.message, true);
        return;
      }
    }
    renderAlbum();
  }

  function renderAlbum() {
    const mias = new Set(E.fotos.map((x) => x.id));
    const lista = E.album.filtro === "mias" ? E.album.fotos.filter((x) => mias.has(x.id)) : E.album.fotos;
    $("#album-resumen").textContent = `${E.album.fotos.length} fotos`;
    $("#album-vacio").hidden = lista.length > 0;
    const grid = $("#album-grid");
    grid.innerHTML = "";
    if (observadorAlbum) observadorAlbum.disconnect();
    observadorAlbum = new IntersectionObserver(cargarVisibles, { rootMargin: "300px" });
    lista.forEach((x) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "album-item";
      b.dataset.id = x.id;
      const img = document.createElement("img");
      img.alt = x.invitado ? `Foto de ${x.invitado}` : "Foto";
      if (x.mini) { img.src = x.mini; img.classList.add("cargada"); }
      img.onload = () => img.classList.add("cargada");
      b.appendChild(img);
      const autor = document.createElement("span");
      autor.className = "album-item-autor";
      autor.textContent = x.invitado || "";
      b.appendChild(autor);
      b.addEventListener("click", () => abrirCarrusel(lista, lista.indexOf(x), true));
      grid.appendChild(b);
      if (!x.mini) observadorAlbum.observe(b);
    });
  }

  // Pide las miniaturas de a tandas, solo de las fotos que se van a ver
  let pedidoAlbum = null;
  function cargarVisibles(entradas) {
    entradas.filter((en) => en.isIntersecting).forEach((en) => {
      observadorAlbum.unobserve(en.target);
      (pedidoAlbum = pedidoAlbum || new Set()).add(en.target.dataset.id);
    });
    clearTimeout(cargarVisibles.t);
    cargarVisibles.t = setTimeout(async () => {
      const ids = Array.from(pedidoAlbum || []);
      pedidoAlbum = null;
      for (let i = 0; i < ids.length; i += 12) {
        try {
          const r = await E.api.llamar("miniaturas", { token: E.token, ids: ids.slice(i, i + 12) }, 3);
          r.miniaturas.forEach((m) => {
            const x = E.album.fotos.find((y) => y.id === m.id);
            if (!x || !m.datos) return;
            x.mini = "data:image/jpeg;base64," + m.datos;
            const img = document.querySelector(`.album-item[data-id="${m.id}"] img`);
            if (img) img.src = x.mini;
          });
        } catch (e) { if (sesionCaida(e)) return; }
      }
    }, 120);
  }

  /* ---------------------------------------------------------
     Hojas, perfil e instalación
  --------------------------------------------------------- */
  function abrirHoja(sel) {
    $$(".hoja").forEach((h) => { h.hidden = true; });
    $(sel).hidden = false;
  }
  function cerrarHojas() {
    $$(".hoja").forEach((h) => { h.hidden = true; });
    E.detalle = null;
    // Si se había agregado el token a la dirección para instalar en iPhone, se quita
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  }

  async function copiarEnlace() {
    const link = enlacePersonal();
    try { await navigator.clipboard.writeText(link); }
    catch (e) {
      const ta = document.createElement("textarea");
      ta.value = link;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (err) { /* nada */ }
      ta.remove();
    }
    aviso("Enlace copiado. Guardalo en un lugar seguro.");
  }

  async function instalar() {
    if (E.instalar) {
      E.instalar.prompt();
      const r = await E.instalar.userChoice;
      if (r.outcome === "accepted") $("#btn-instalar").hidden = true;
      E.instalar = null;
      return;
    }
    // iPhone: el ícono guarda la dirección actual. Se agrega el token para
    // que la app instalada entre con la sesión del invitado.
    history.replaceState(null, "", `${location.pathname}?b=${E.slug}#t=${E.token}`);
    abrirHoja("#h-instalar");
  }

  /* ---------------------------------------------------------
     Eventos
  --------------------------------------------------------- */
  function conectar() {
    $("#form-registro").addEventListener("submit", registrar);
    $("#btn-reintentar").addEventListener("click", iniciar);
    $$(".tab").forEach((t) => t.addEventListener("click", () => mostrarPantalla(t.dataset.tab)));
    $("#btn-abrir").addEventListener("click", abrirCamara);
    $("#btn-perfil").addEventListener("click", () => abrirHoja("#h-perfil"));

    const alElegir = (input, reemplazo) => input.addEventListener("change", async () => {
      const archivo = input.files && input.files[0];
      input.value = "";
      if (!archivo) return;
      const id = reemplazo && E.detalle ? E.detalle.id : null;
      if (reemplazo) { cerrarHojas(); cerrarCarrusel(); }
      const foto = await encolar(archivo, id);
      if (foto && !reemplazo) {
        Sonidos.avanzar();
        aviso(`Foto ${E.fotos.indexOf(foto) + 1}A guardada en tu rollo.`);
      }
      if (foto && reemplazo) aviso("Reemplazando tu foto…");
      if ($("#visor").hidden === false) { animarContador(); if (foto) mostrarChip(foto); }
    });
    alElegir($("#input-galeria"));
    alElegir($("#input-galeria-visor"));
    alElegir($("#input-camara-nativa"));
    alElegir($("#input-reemplazo"), true);

    $("#visor-cerrar").addEventListener("click", cerrarCamara);
    $("#visor-disparar").addEventListener("click", disparar);
    $("#visor-girar").addEventListener("click", async () => {
      try { await Visor.girar(); } catch (e) { aviso("No pudimos cambiar de cámara.", true); }
    });
    $("#visor-flash").addEventListener("click", alternarFlash);
    $("#visor-chip").addEventListener("click", () => { $("#visor-chip").hidden = true; if (E.chipFoto) abrirMensaje(E.chipFoto); });

    $("#mensaje-guardar").addEventListener("click", async () => {
      const foto = E.detalle;
      if (foto && await guardarMensaje(foto, $("#mensaje-texto").value)) {
        cerrarHojas();
        if (!$("#carrusel").hidden) mostrarActual();
        aviso("Mensaje guardado.");
      }
    });

    $("#car-cerrar").addEventListener("click", cerrarCarrusel);
    $("#car-pista").addEventListener("scroll", alDeslizar, { passive: true });
    $("#car-guardar").addEventListener("click", descargar);
    $("#car-borrar").addEventListener("click", borrarDesdeCarrusel);
    $("#car-mensaje").addEventListener("click", () => { const f = C.lista[C.i]; if (f) abrirMensaje(f); });

    // Sin zoom con pellizco en iPhone (Safari ignora user-scalable=no)
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("touchmove", (e) => { if (e.scale && e.scale !== 1) e.preventDefault(); }, { passive: false });
    $("#foto-comentario").addEventListener("input", () => {
      $("#foto-guardar-comentario").hidden = !E.detalle || $("#foto-comentario").value.trim() === (E.detalle.comentario || "");
    });
    $("#foto-guardar-comentario").addEventListener("click", async () => {
      if (E.detalle && await guardarMensaje(E.detalle, $("#foto-comentario").value)) {
        $("#foto-guardar-comentario").hidden = true;
        aviso("Mensaje guardado.");
      }
    });
    $("#foto-descargar").addEventListener("click", descargar);
    $("#foto-borrar").addEventListener("click", borrar);

    $$(".chip").forEach((c) => c.addEventListener("click", () => {
      E.album.filtro = c.dataset.filtro;
      $$(".chip").forEach((x) => { x.classList.toggle("is-activo", x === c); x.setAttribute("aria-selected", String(x === c)); });
      renderAlbum();
    }));

    $("#btn-enlace").addEventListener("click", async () => {
      if (navigator.share) {
        try {
          await navigator.share({ title: `Mi cámara · ${pareja()}`, text: "Mi enlace personal para la cámara de la boda (no lo compartas):", url: enlacePersonal() });
          return;
        } catch (e) { if (e && e.name === "AbortError") return; }
      }
      copiarEnlace();
    });
    $("#btn-instalar").addEventListener("click", instalar);
    $("#btn-avisos").addEventListener("click", activarAvisos);
    $("#ta-boton").addEventListener("click", activarAvisos);
    $("#sw-sonido").checked = Sonidos.activo;
    $("#sw-sonido").addEventListener("change", (e) => { Sonidos.activo = e.target.checked; });
    $("#btn-salir").addEventListener("click", pedirSalir);

    $$(".hoja").forEach((h) => h.addEventListener("click", (e) => { if (e.target === h) cerrarHojas(); }));
    $$("[data-cerrar]").forEach((b) => b.addEventListener("click", cerrarHojas));
    document.addEventListener("keydown", (e) => {
      const carrusel = !$("#carrusel").hidden && $("#h-mensaje").hidden;
      if (carrusel && e.key === "ArrowRight") irA(C.i + 1);
      if (carrusel && e.key === "ArrowLeft") irA(C.i - 1);
      if (e.key !== "Escape") return;
      if (!$("#visor").hidden) cerrarCamara();
      else if (carrusel) cerrarCarrusel();
      else cerrarHojas();
    });

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      E.instalar = e;
      if (E.invitado && !instalada()) $("#btn-instalar").hidden = false;
    });
    window.addEventListener("beforeunload", (e) => {
      if (E.fotos.some((x) => x.subiendo || x.error)) { e.preventDefault(); e.returnValue = ""; }
    });

    // Al volver a la app, y cada minuto, se revisa si ya se reveló o se compartió el álbum
    const refrescar = async () => {
      if (!E.token || !E.invitado || document.hidden) return;
      try { aplicarSesion(await E.api.llamar("sesion", { token: E.token }, 2)); }
      catch (e) { sesionCaida(e); }
    };
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refrescar(); });
    setInterval(() => {
      if (!E.revelado && E.revelaEn && Date.now() >= new Date(E.revelaEn).getTime()) refrescar();
      else if (E.invitado) renderRollo(), ($("#cam-revela").innerHTML = textoRevelado());
    }, 30000);
  }

  function arrancar() {
    conectar();
    iniciar();
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
