/**
 * Visor de la cámara dentro de la app (getUserMedia). Muestra la imagen
 * en un cuadro 3:4 y la foto sale exactamente con ese encuadre.
 * Necesita https: si el navegador no lo permite, la app usa la cámara
 * del celular con un <input type="file" capture>.
 */
(function () {
  "use strict";
  let stream = null;
  let frontal = false;
  let video = null;

  const disponible = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);

  async function abrir(elVideo) {
    video = elVideo;
    await cerrar();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: frontal ? "user" : { ideal: "environment" },
        width: { ideal: 2560 },
        height: { ideal: 1920 }
      }
    });
    video.srcObject = stream;
    video.classList.toggle("es-frontal", frontal);
    await video.play().catch(() => {});
    if (!video.videoWidth) await new Promise((ok) => video.addEventListener("loadedmetadata", ok, { once: true }));
  }

  async function cerrar() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (video) video.srcObject = null;
  }

  async function girar() {
    frontal = !frontal;
    if (video) await abrir(video);
  }

  // Linterna como flash (solo en algunos Android); devuelve si se pudo
  async function linterna(prender) {
    const pista = stream && stream.getVideoTracks()[0];
    const capacidades = pista && pista.getCapabilities ? pista.getCapabilities() : {};
    if (!capacidades.torch) return false;
    try { await pista.applyConstraints({ advanced: [{ torch: !!prender }] }); return true; }
    catch (e) { return false; }
  }

  // Recorta el centro del video en proporción 3:4 vertical
  function capturar() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) throw new Error("La cámara todavía no está lista.");
    const proporcion = 3 / 4;
    let w = vw, h = vw / proporcion;
    if (h > vh) { h = vh; w = vh * proporcion; }
    const x = (vw - w) / 2, y = (vh - h) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    canvas.getContext("2d").drawImage(video, x, y, w, h, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  window.Visor = {
    disponible,
    abrir,
    cerrar,
    girar,
    linterna,
    capturar,
    get frontal() { return frontal; },
    get abierto() { return !!stream; }
  };
})();
