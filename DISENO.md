# Cámara descartable: diseño técnico (etapa 1)

Responde al primer entregable de la especificación de Koba Digital:
auditoría del repositorio, modelo de datos y reglas de seguridad, antes de
construir la interfaz.

## 1. Auditoría breve del repositorio

- **Invitación:** `index.html` + `css/style.css` + `js/main.js`, que arma
  todo leyendo `js/config.js` (único archivo por boda). Secciones: sobre de
  apertura, portada, cuenta regresiva, historia, galería, ceremonia y fiesta,
  itinerario, dress code, regalos, preguntas frecuentes, RSVP y pie.
- **RSVP:** `js/rsvp.js`, modos `whatsapp`, `sheets` y `both`. El modo
  `sheets` usa un Apps Script publicado como aplicación web
  (`guia-google-sheets.md`). **La cámara no lo toca.**
- **Publicación:** GitHub Pages, repo `solmelocchi/invitacion` (rama `main`),
  con la misma estructura de carpetas que la copia local.
- **Diferencia con la especificación:** el documento pide Cormorant Garamond,
  pero la invitación hoy usa **Bodoni Moda + Jost** (rediseño del 13/10). La
  cámara va a seguir a la invitación actual para que se vean iguales.

## 2. Decisión de plataforma

Se eligió **Google Apps Script + Google Drive de la pareja** en lugar de
Supabase (que la especificación pedía evaluar):

| | Apps Script + Drive | Supabase gratis | Supabase Pro |
|---|---|---|---|
| Costo para Koba | USD 0 | USD 0 | USD 25 por mes |
| Espacio | 15 GB por boda (Drive de la pareja) | 1 GB para todas las bodas | 100 GB |
| Pausa por inactividad | No | Sí, a la semana | No |
| Álbum "para siempre" | Sí, queda en su cuenta | No | Mientras se pague |
| Panel de la pareja | Menú en la planilla + panel web + Drive | Propio, más flexible | Propio |

Precios de Supabase consultados el 14/10/2026 en supabase.com/pricing.

## 3. Modelo de datos

La planilla de cada boda es la base de datos y la carpeta de Drive es el
almacenamiento. **Cada boda tiene su propia planilla, script, carpeta y
URL**: el aislamiento entre bodas es total porque no comparten nada.

**Hoja `Invitados`:** ID, Nombre, Apellido, Token (hash), Registrado, Estado.

**Hoja `Fotos`:** ID, ID invitado, Invitado, Comentario, Estado, Creada,
Actualizada, Archivo (ID en Drive), Miniatura (ID en Drive), Bytes,
Reemplaza a, Ver foto (enlace).

**Estados de una foto:**

| Estado | Ocupa cupo | La ve su autor | En el álbum compartido |
|---|---|---|---|
| `subiendo` | Sí, por 10 minutos | No | No |
| `activa` | Sí | Sí | Sí |
| `oculta` (la retiró la pareja) | Sí | Sí | No |
| `borrada` | No | No | No |
| `fallida` | No | No | No |

**Propiedades del script** (no visibles en la planilla): IDs de carpetas,
nombre de la boda, hash de la clave del panel, estado del álbum
(`privado`/`compartido`), cámara abierta o cerrada.

Las imágenes nunca se guardan en la planilla: van a Drive (original y
miniatura) y la fila guarda sus IDs.

## 4. Reglas de seguridad

**Identidad del invitado.** El nombre no es una credencial. Al registrarse,
el servidor genera un token aleatorio de 256 bits que se guarda en el
celular del invitado y en su **enlace personal** (para recuperar la sesión
en otro dispositivo o si borra los datos del navegador). En la planilla solo
queda el hash SHA-256, así que ni quien abre la planilla puede hacerse pasar
por un invitado.

**Cupo de 24 validado en el servidor.** Cada subida tiene tres pasos:
1. Con el bloqueo del script (`LockService`): cuenta el cupo y reserva un
   lugar con una fila `subiendo`.
2. Sin bloqueo: guarda los archivos en Drive (lo lento).
3. Con el bloqueo: pasa a `activa` y, si era un reemplazo, la anterior pasa
   a `borrada` en el mismo paso.

Como la reserva cuenta para el cupo, dos subidas simultáneas del mismo
invitado no pueden pasarse de 24. Si Drive falla, la reserva queda `fallida`
y libera el lugar. Si una reserva queda colgada (se cortó la conexión), a
los 10 minutos deja de contar.

**Borrado.** Libera el cupo en el acto; los archivos van a la papelera de
Drive, que los elimina definitivamente a los 30 días.

**Archivos.** Se valida que sea un JPEG real por sus primeros bytes, no por
el nombre ni por el tipo que diga el navegador. Máximo 4 MB por foto y
300 KB por miniatura. El navegador convierte todo a JPEG antes de subir, lo
que además borra la ubicación GPS que traen las fotos del celular.

**Privacidad.**
- La carpeta de Drive es privada: ninguna foto tiene enlace público. El
  script entrega las imágenes en base64 solo a quien tiene permiso.
- Un invitado solo ve, borra y comenta sus fotos.
- El álbum común existe solo si la pareja lo compartió, y muestra fotos
  `activa` (no las ocultas).
- **Compartir el álbum solo se puede desde el menú de la planilla**, que
  exige iniciar sesión en Google. No hay forma de compartirlo desde la web.
- El QR de la boda solo lleva a la página de registro: no da permisos.

**Panel de la pareja.** Clave aleatoria de 256 bits generada al configurar;
se guarda solo su hash. Permite ver, descargar y ocultar fotos. Se puede
regenerar desde el menú si se filtra.

**Freno de abusos.** Máximo 400 invitados y 6.000 fotos por boda (cualquiera
con el QR puede registrarse). La pareja puede cerrar la cámara en cualquier
momento. Textos que empiezan con `=`, `+`, `-` o `@` se guardan como texto
para que la planilla no los ejecute como fórmula.

**Secretos.** No hay ninguna clave secreta en el código público: la URL de la
aplicación web es pública por diseño y sin token no permite nada.

## 5. Límites reales a tener en cuenta

- **Enlace personal y clave del panel son "llaves al portador"**: quien los
  tenga actúa como ese invitado o como la pareja. Hay que decirlo en el aviso
  de privacidad y recomendar no reenviarlos.
- **Picos de uso.** Apps Script admite unas 30 ejecuciones simultáneas por
  cuenta. En el momento de más fotos puede responder `ocupado`: el frontend
  va a tener una cola con reintentos automáticos para que el invitado no lo note.
- **Velocidad.** Las imágenes pasan por el script en base64, más lento que un
  CDN. Por eso la grilla usa miniaturas de unos 30 KB y el original solo se
  pide para ver en grande o descargar.
- **Espacio.** 100 invitados × 24 fotos × ~500 KB ≈ 1,2 GB, bien dentro de
  los 15 GB gratis de la pareja.

## 6. Verificación

`camara/backend/pruebas/pruebas.js` carga `Codigo.gs` sin cambios con una
simulación de Planillas, Drive, bloqueos y propiedades. Son 19 pruebas: cupo,
borrado, reemplazo, dos subidas simultáneas, dos reemplazos simultáneos,
bloqueo ocupado, falla de Drive, reserva vencida, aislamiento entre
invitados, álbum privado y compartido, panel, validación de archivos, cámara
cerrada, fórmulas y límites. Se comprobó que fallan si se rompe la regla del
cupo o la reserva.

**Falta verificar en una cuenta real de Google:** la publicación, los
permisos, la respuesta CORS desde GitHub Pages y el comportamiento del
bloqueo con subidas reales desde varios celulares.

## 7. Próximas etapas

| Etapa | Archivos nuevos | Qué incluye |
|---|---|---|
| 2. Cámara del invitado (**hecha**) | `camara/index.html`, `css/camara.css`, `js/camara/api.js`, `sesion.js`, `captura.js`, `fotos.js` | Registro, enlace personal, cámara del celular con alternativa de subir imagen, vista previa, comentario, contador "18 de 24", compresión, cola con reintentos, borrar y reemplazar |
| 3. Álbum y panel | `camara/album.html`, `js/camara/album.js` | Panel de la pareja con clave, grilla de miniaturas, vista ampliada, descarga, ocultar; álbum compartido para invitados |
| 4. Integración | cambios chicos en `js/config.js`, `index.html`, `js/main.js` | Bloque `camara` en el config, botón "Nuestra cámara" en la invitación, generador de QR para las mesas |
| 5. Prueba y lanzamiento | `camara/privacidad.html` | Aviso de datos personales, pruebas en iPhone y Android reales, publicación |

## 8. Etapa 2: pantalla del invitado (hecha)

`camara/index.html` + `css/camara.css` + `js/camara/` (`api.js`, `api-demo.js`, `imagenes.js`, `app.js`).

- Toma la URL del servidor de `js/config.js` → `camara.webAppUrl`. Si está vacía, arranca en
  **modo demostración**: todo queda en el navegador, sirve para mostrársela a clientes.
- Registro, rueda contadora, "Sacar foto" (abre la cámara del celular) y "elegí una de tu
  galería" como alternativa, vista previa tipo polaroid con comentario, rollo de película
  con fotos numeradas, detalle con comentar, reemplazar y borrar, enlace personal con botón
  para mandárselo por WhatsApp, salir.
- Las fotos se suben de a una, con reintentos ante cortes o picos. Si fallan, quedan
  marcadas y se reintentan con un toque. Cada foto lleva un identificador para que un
  reintento no la duplique en el servidor.

**Probar en la compu, de punta a punta, sin Google:**

```bash
node camara/backend/pruebas/servidor-local.js
```

y abrir `http://127.0.0.1:8790/camara/?api=http://127.0.0.1:8790/exec` (el parámetro `api`
solo se acepta en la compu local).
