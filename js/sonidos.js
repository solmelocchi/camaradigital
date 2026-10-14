/**
 * Sonidos de cámara analógica generados con Web Audio (no hay archivos):
 * el "clac" del obturador y el "tr-tr-tr" de la rueda que avanza el rollo.
 * Se pueden apagar desde el perfil.
 */
(function () {
  "use strict";
  let ctx = null;
  let activo = true;
  try { activo = localStorage.getItem("koba-camara:sonido") !== "no"; } catch (e) { /* nada */ }

  function contexto() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // Ruido corto filtrado: suena a mecanismo
  function golpe(c, cuando, duracion, frecuencia, volumen) {
    const muestras = Math.floor(c.sampleRate * duracion);
    const buffer = c.createBuffer(1, muestras, c.sampleRate);
    const datos = buffer.getChannelData(0);
    for (let i = 0; i < muestras; i++) datos[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / muestras, 3);
    const fuente = c.createBufferSource();
    fuente.buffer = buffer;
    const filtro = c.createBiquadFilter();
    filtro.type = "bandpass";
    filtro.frequency.value = frecuencia;
    filtro.Q.value = 0.9;
    const g = c.createGain();
    g.gain.value = volumen;
    fuente.connect(filtro).connect(g).connect(c.destination);
    fuente.start(cuando);
  }

  window.Sonidos = {
    get activo() { return activo; },
    set activo(v) {
      activo = !!v;
      try { localStorage.setItem("koba-camara:sonido", activo ? "si" : "no"); } catch (e) { /* nada */ }
    },
    // Hay que llamarlo en un toque del usuario para que iPhone habilite el audio
    preparar() { if (activo) contexto(); },
    obturador() {
      const c = activo && contexto();
      if (!c) return;
      const t = c.currentTime;
      golpe(c, t, 0.045, 2400, 0.9);
      golpe(c, t + 0.07, 0.06, 1500, 0.7);
    },
    avanzar() {
      const c = activo && contexto();
      if (!c) return;
      const t = c.currentTime + 0.25;
      for (let i = 0; i < 5; i++) golpe(c, t + i * 0.055, 0.025, 3200, 0.35);
    }
  };
})();
