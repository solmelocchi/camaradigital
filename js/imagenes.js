/**
 * CÁMARA — preparación de las fotos antes de subirlas.
 * Achica la foto (lado mayor 1600 px) y arma una miniatura de 480 px,
 * las dos en JPEG. Al redibujarla en un canvas se pierden los datos
 * EXIF, incluida la ubicación GPS que guardan los celulares.
 */
(function () {
  "use strict";
  const LADO_FOTO = 1600;
  const LADO_MINI = 480;
  const MAX_FOTO = 3.5 * 1024 * 1024; // el servidor acepta hasta 4 MB
  const MAX_MINI = 250 * 1024;        // y hasta 300 KB de miniatura

  async function decodificar(archivo) {
    if ("createImageBitmap" in window) {
      try { return await createImageBitmap(archivo, { imageOrientation: "from-image" }); }
      catch (e) { /* algunos Safari no aceptan la opción: probamos con <img> */ }
    }
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("formato")); };
      img.src = url;
    });
  }

  function redimensionar(fuente, lado) {
    const ancho = fuente.naturalWidth || fuente.width;
    const alto = fuente.naturalHeight || fuente.height;
    const k = Math.min(1, lado / Math.max(ancho, alto));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(ancho * k));
    canvas.height = Math.max(1, Math.round(alto * k));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // fondo para imágenes con transparencia
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  const aJpeg = (canvas, calidad) => new Promise((ok, mal) =>
    canvas.toBlob((b) => (b ? ok(b) : mal(new Error("jpeg"))), "image/jpeg", calidad));

  async function comprimir(canvas, calidades, maximo) {
    for (const q of calidades) {
      const blob = await aJpeg(canvas, q);
      if (blob.size <= maximo) return blob;
    }
    throw new Error("grande");
  }

  const aDataUrl = (blob) => new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = mal;
    r.readAsDataURL(blob);
  });

  // Acepta un archivo (galería o cámara del celular) o un canvas (visor de la app)
  async function preparar(archivo) {
    let fuente;
    if (archivo instanceof HTMLCanvasElement) fuente = archivo;
    else {
      try { fuente = await decodificar(archivo); }
      catch (e) { throw new Error("No pudimos abrir esa imagen. Probá con otra foto."); }
    }
    const grande = redimensionar(fuente, LADO_FOTO);
    const mini = redimensionar(fuente, LADO_MINI);
    if (fuente.close) fuente.close();
    const [blobFoto, blobMini] = await Promise.all([
      comprimir(grande, [0.82, 0.72, 0.62, 0.5], MAX_FOTO),
      comprimir(mini, [0.72, 0.6, 0.5, 0.4], MAX_MINI)
    ]);
    const [fotoUrl, miniUrl] = await Promise.all([aDataUrl(blobFoto), aDataUrl(blobMini)]);
    return {
      fotoUrl,
      miniUrl,
      imagen: fotoUrl.split(",")[1],
      miniatura: miniUrl.split(",")[1]
    };
  }

  window.CamaraImagenes = { preparar };
})();
