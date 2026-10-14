# Cámara descartable: cómo instalarla para una boda

Tiempo estimado: 15 minutos. Se hace **con la cuenta de Google de la
pareja** (o una que ellos vayan a conservar), porque las fotos se guardan en
el Drive de esa cuenta y ahí quedan para siempre. Si se instala con la
cuenta de Koba Digital, las fotos ocupan el espacio de Koba y el álbum deja
de ser de ellos.

## 1. Crear la planilla y pegar el script

1. Con la cuenta de la pareja, creá una planilla nueva en
   [sheets.new](https://sheets.new) y llamala, por ejemplo,
   "Cámara · Emilia & Tomás".
2. Andá a **Extensiones → Apps Script**.
3. Borrá todo lo que hay en `Código.gs` y pegá el contenido completo de
   `backend/Codigo.gs`.
4. Guardá (ícono de disquete). Nombre sugerido del proyecto: "Cámara descartable".

## 2. Configurar

1. Volvé a la planilla y recargá la página. Aparece el menú
   **Cámara descartable**.
2. Elegí **Cámara descartable → 1. Configurar por primera vez**.
3. Google pide permisos (planilla y Drive): aceptalos. Si aparece "Google
   no verificó esta app", tocá **Configuración avanzada → Ir a Cámara
   descartable**. Es normal en scripts propios.
4. Responde tres preguntas:
   - **Nombre de la boda** (ej. `Emilia & Tomás`).
   - **Carpeta de Drive:** pegá el link de la carpeta donde se guardan las
     fotos, o dejalo vacío para que cree una nueva.
   - **Revelado:** fecha y hora en que los invitados ven sus fotos, con el
     formato `15/03/2027 12:00`. Se puede dejar vacío y elegir después.
5. Se crean:
   - las hojas **Invitados** y **Fotos**;
   - dentro de la carpeta, las subcarpetas *Fotos* y *Miniaturas*;
   - la **clave del panel**, que aparece una sola vez. Guardala y pasásela a la
     pareja: es la que abre su panel privado en la web.

El álbum empieza **privado** y la cámara **abierta**.

## 3. Publicar como aplicación web

1. En Apps Script: **Implementar → Nueva implementación → Aplicación web**.
2. **Ejecutar como:** *Yo* (la cuenta de la pareja).
3. **Quién tiene acceso:** *Cualquier usuario* (no "Cualquier usuario con
   una Cuenta de Google": con esa opción los invitados ven un pedido de
   iniciar sesión). Hace falta para que los
   invitados suban fotos sin tener cuenta de Google; igual nadie puede hacer
   nada sin registrarse, y nadie ve fotos ajenas mientras el álbum sea privado.
4. **Implementar** y copiá la URL que termina en `/exec`.
5. Esa URL va en `bodas/<boda>.js` → `webAppUrl`.

> Si más adelante cambiás el código: **Implementar → Administrar
> implementaciones → Editar → Versión: Nueva versión**. La URL no cambia.

## 4. Cómo la usa la pareja

Todo desde el menú **Cámara descartable** de la planilla (requiere iniciar
sesión con su Google):

| Acción | Qué hace |
|---|---|
| Programar el revelado | Cambia la fecha y hora en que los invitados ven sus fotos |
| Revelar las fotos ahora | Las revela en el momento |
| Compartir el álbum con los invitados | Los invitados registrados pasan a ver todas las fotos activas |
| Volver a hacer privado el álbum | Solo la pareja ve las fotos |
| Cerrar la cámara | Nadie puede registrarse ni subir fotos nuevas (borrar sí) |
| Abrir la cámara | Vuelve a habilitar registros y fotos |
| Ver resumen | Cantidad de invitados, fotos activas y ocultas |
| Generar nueva clave del panel | Invalida la clave anterior (por si se filtró) |

Las fotos en tamaño original están en la carpeta de Drive, con nombre
`fecha_Invitado_id.jpg`. Para descargarlas todas: clic derecho en la carpeta
*Fotos* → **Descargar** (Drive arma un ZIP). En la hoja **Fotos** cada fila
tiene un enlace "Ver" y el comentario del invitado.

Para retirar una foto inapropiada: desde el panel web (ocultar) o, en la
hoja Fotos, cambiando su **Estado** de `activa` a `oculta`.

## 5. Probar las reglas sin publicar

```bash
node backend/pruebas/pruebas.js
```

Simula Planillas, Drive y los bloqueos, y verifica el cupo de 24, las subidas
simultáneas, el revelado, la privacidad entre invitados, el álbum privado y
el panel.

## 6. Antes del revelado

Hasta la hora del revelado los invitados solo ven el contador y sus fotos
como negativos "en revelado": no pueden verlas (ni pidiéndoselas directo al
servidor), solo pueden borrar la última que sacaron y no pueden
reemplazarlas. La pareja sí ve todo desde Drive y desde su panel.
