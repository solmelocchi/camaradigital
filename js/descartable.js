/**
 * La cámara descartable dibujada (SVG), con los colores y los nombres de
 * la boda. Tiene tres estados: "apagada" (cerrada), "cargando" (el flash
 * se carga y la luz titila) y "lista". La ventanita del contador muestra
 * las fotos que quedan y gira como la rueda de una descartable real.
 */
(function () {
  "use strict";
  let instancias = 0;

  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function svgCamara(id, nombres, fecha) {
    // Ramita de olivo para la etiqueta
    const hojas = [0, 1, 2, 3, 4].map((i) => {
      const x = 8 + i * 9, y = 8 - Math.sin(i * 0.7) * 3, lado = i % 2 ? 1 : -1;
      return `<path d="M0 0C3-3 8-3 11 0C8 3 3 3 0 0Z" transform="translate(${x} ${y}) rotate(${lado * 38}) scale(.8)"/>`;
    }).join("");

    return `
<svg class="d-svg" viewBox="0 0 320 210" role="img" aria-label="Cámara descartable de ${esc(nombres)}">
  <defs>
    <linearGradient id="${id}-cuerpo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--d-cuerpo-claro)"/>
      <stop offset="1" stop-color="var(--d-cuerpo)"/>
    </linearGradient>
    <linearGradient id="${id}-papel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--d-papel)"/>
      <stop offset="1" stop-color="var(--d-papel-sombra)"/>
    </linearGradient>
    <radialGradient id="${id}-vidrio" cx=".38" cy=".34" r=".75">
      <stop offset="0" stop-color="#6d7a86"/>
      <stop offset=".35" stop-color="#1d2228"/>
      <stop offset="1" stop-color="#07090b"/>
    </radialGradient>
    <linearGradient id="${id}-flash" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--d-flash-1)"/>
      <stop offset="1" stop-color="var(--d-flash-2)"/>
    </linearGradient>
    <clipPath id="${id}-ventana"><rect x="139" y="39" width="42" height="24" rx="4"/></clipPath>
    <filter id="${id}-brillo" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
  </defs>

  <!-- rueda de avance y disparador -->
  <g class="d-rueda">
    <rect x="26" y="16" width="62" height="18" rx="5" fill="var(--d-oscuro)"/>
    ${Array.from({ length: 11 }, (_, i) => `<rect x="${30 + i * 5.2}" y="18" width="2.2" height="14" rx="1" fill="var(--d-cuerpo-claro)" opacity=".55"/>`).join("")}
  </g>
  <rect class="d-disparador" x="246" y="18" width="44" height="16" rx="6" fill="var(--color-accent)"/>

  <!-- cuerpo -->
  <rect x="8" y="28" width="304" height="172" rx="20" fill="url(#${id}-cuerpo)"/>
  <rect x="8" y="28" width="304" height="46" rx="20" fill="var(--d-oscuro)" opacity=".35"/>

  <!-- visor óptico -->
  <rect x="30" y="40" width="54" height="22" rx="5" fill="#0d0f11"/>
  <rect x="34" y="43" width="20" height="6" rx="3" fill="#fff" opacity=".18"/>

  <!-- ventanita del contador -->
  <rect x="135" y="35" width="50" height="32" rx="7" fill="var(--d-oscuro)"/>
  <rect x="139" y="39" width="42" height="24" rx="4" fill="#120f0d"/>
  <g clip-path="url(#${id}-ventana)">
    <text class="d-num" x="160" y="57.5" text-anchor="middle">24</text>
  </g>
  <path d="M157 33.5h6l-3 4z" fill="var(--color-accent)"/>

  <!-- flash y luz de carga -->
  <rect class="d-flash-halo" x="226" y="36" width="70" height="30" rx="6" fill="var(--d-flash-1)" filter="url(#${id}-brillo)"/>
  <rect x="222" y="34" width="78" height="34" rx="6" fill="var(--d-oscuro)"/>
  <rect class="d-flash" x="226" y="38" width="70" height="26" rx="4" fill="url(#${id}-flash)"/>
  ${Array.from({ length: 6 }, (_, i) => `<path d="M${232 + i * 11} 40v22" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>`).join("")}
  <circle class="d-led" cx="205" cy="51" r="3.6"/>

  <!-- envoltorio de papel con la etiqueta de la boda -->
  <rect x="8" y="80" width="304" height="120" rx="0" fill="url(#${id}-papel)"/>
  <path d="M8 80h304v100a20 20 0 0 1-20 20H28a20 20 0 0 1-20-20z" fill="url(#${id}-papel)"/>
  <path d="M8 84.5h304" stroke="var(--color-accent)" stroke-width="1" opacity=".7"/>
  <path d="M8 195.5h304" stroke="var(--color-accent)" stroke-width="1" opacity=".5"/>
  <g transform="translate(24 104)" fill="var(--color-primary)" fill-opacity=".25" stroke="var(--color-primary)" stroke-width=".7">
    <path d="M2 10 C 16 8, 34 10, 50 4" fill="none"/>${hojas}
  </g>
  <text class="d-nombres" x="24" y="146">${esc(nombres)}</text>
  <text class="d-fecha" x="25" y="166">${esc(fecha)}</text>
  <text class="d-exp" x="25" y="184">24 EXP · ISO 400 · KOBA</text>

  <!-- objetivo -->
  <circle cx="236" cy="140" r="50" fill="var(--d-oscuro)"/>
  <circle cx="236" cy="140" r="44" fill="#14171a" stroke="var(--color-accent)" stroke-opacity=".55" stroke-width="1.2"/>
  ${Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2, r1 = 40, r2 = 43;
    return `<path d="M${(236 + Math.cos(a) * r1).toFixed(1)} ${(140 + Math.sin(a) * r1).toFixed(1)}L${(236 + Math.cos(a) * r2).toFixed(1)} ${(140 + Math.sin(a) * r2).toFixed(1)}" stroke="#fff" stroke-opacity=".22"/>`;
  }).join("")}
  <circle cx="236" cy="140" r="34" fill="url(#${id}-vidrio)"/>
  <circle class="d-iris" cx="236" cy="140" r="14" fill="#000" opacity=".9"/>
  <ellipse cx="224" cy="126" rx="10" ry="6" fill="#fff" opacity=".22" transform="rotate(-30 224 126)"/>
  <circle cx="250" cy="156" r="3" fill="#fff" opacity=".15"/>
</svg>`;
  }

  function pintar(el, opciones) {
    const id = "d" + (++instancias);
    el.classList.add("descartable");
    el.dataset.estado = "apagada";
    el.innerHTML = svgCamara(id, opciones.nombres || "Nuestra boda", opciones.fecha || "");
    const num = el.querySelector(".d-num");

    return {
      el,
      numero(n, animar) {
        const texto = String(Math.max(0, n));
        if (num.textContent === texto) return;
        num.textContent = texto;
        if (!animar) return;
        num.classList.remove("rueda");
        void num.getBoundingClientRect();
        num.classList.add("rueda");
      },
      estado(e) { el.dataset.estado = e; }
    };
  }

  window.Descartable = { pintar };
})();
