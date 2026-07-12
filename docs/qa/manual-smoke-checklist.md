# 🧪 Atrevidos — Manual QA Smoke Checklist

> **Versión:** 1.0 — MVP Launch  
> **Propósito:** Verificar que los flujos críticos funcionan antes de cada despliegue.  
> **Tiempo estimado:** 10-15 min por ronda.

---

## ✅ 1. Autenticación

- [ ] **Registro:** Ir a `/signup`, crear usuario con email, password y username.  
  - Esperado: Redirige a `/onboarding` (o mensaje de verificación de email si está habilitado).
- [ ] **Login:** Ir a `/login`, ingresar con credenciales válidas.  
  - Esperado: Redirige al feed (`/`) o al onboarding si es primera vez.
- [ ] **Logout:** Hacer clic en "Cerrar sesión".  
  - Esperado: Redirige a `/login` y no se puede acceder a rutas protegidas.
- [ ] **Persistencia de sesión:** Recargar la página estando logueado.  
  - Esperado: Sigue autenticado, no redirige al login.
- [ ] **Ruta protegida anónima:** Abrir `/feed` sin sesión.  
  - Esperado: Redirige a `/login`.
- [ ] **Ruta pública anónima:** Abrir `/terms`, `/privacy`, `/safety` sin sesión.  
  - Esperado: Las páginas cargan correctamente.

---

## ✅ 2. Onboarding

- [ ] **Redirección al onboarding:** Registrarse y luego navegar a `/`.  
  - Esperado: Redirige a `/onboarding` si el perfil está incompleto.
- [ ] **Formulario completo:** Llenar todos los campos (username, display name, bio, location, interests, intent, consentimiento).  
  - Esperado: Guarda y redirige al feed.
- [ ] **Validación de username duplicado:** Intentar usar un username existente.  
  - Esperado: Muestra error "ya está en uso".
- [ ] **Campos requeridos:** Intentar enviar sin llenar campos obligatorios.  
  - Esperado: Muestra error de validación.

---

## ✅ 3. Feed de Publicaciones

- [ ] **Feed carga:** Estando logueado, el feed muestra publicaciones existentes o mensaje vacío.
- [ ] **Crear post de texto:** Escribir contenido y publicar.  
  - Esperado: El post aparece en el feed.
- [ ] **Crear post con imágenes:** Adjuntar 1-3 imágenes JPG/PNG/WEBP y publicar.  
  - Esperado: Las imágenes se muestran en el post.
- [ ] **Validación de imágenes:** Intentar subir archivo no soportado (>8 MB o formato incorrecto).  
  - Esperado: Muestra mensaje de error.
- [ ] **Like:** Hacer clic en Me gusta en un post.  
  - Esperado: El contador aumenta y corazón se llena. Al hacer clic de nuevo, se desmarca.
- [ ] **Comentarios:** Abrir comentarios, escribir y enviar.  
  - Esperado: El comentario aparece. Eliminar comentario propio funciona.
- [ ] **Bloqueo desde feed:** Bloquear al autor de un post.  
  - Esperado: El post y otros posts del mismo autor desaparecen del feed.

---

## ✅ 4. Perfil de Usuario

- [ ] **Ver perfil:** Ir a `/profile`.  
  - Esperado: Muestra avatar, nombre, bio, ubicación, intereses, intención.
- [ ] **Editar perfil:** Hacer clic en "Editar perfil".  
  - Esperado: Se abre formulario con campos editables. Cancelar restaura valores originales.
- [ ] **Guardar cambios:** Modificar bio, ubicación o intereses y guardar.  
  - Esperado: Los cambios persisten al recargar la página.
- [ ] **Subir avatar:** En modo edición, seleccionar una foto de perfil y guardar.  
  - Esperado: El avatar se actualiza en el perfil y en el feed.
- [ ] **Galería de imágenes:** Añadir hasta 6 fotos a la galería y guardar.  
  - Esperado: Las fotos aparecen en la galería del perfil.
- [ ] **Eliminar foto de galería:** En modo edición, eliminar una foto existente.  
  - Esperado: La foto desaparece y no vuelve al recargar.

---

## ✅ 5. Descubrimiento

- [ ] **Carga de perfiles:** Ir a `/discover`.  
  - Esperado: Muestra perfiles de usuarios activos (excluye matches y bloqueados).
- [ ] **Filtros:** Usar filtro por ubicación, interés, intención.  
  - Esperado: Los resultados se actualizan.
- [ ] **Like a perfil:** Hacer clic en "Like" en un perfil.  
  - Esperado: El perfil desaparece de la lista.
- [ ] **Pass:** Hacer clic en "Pass".  
  - Esperado: El perfil desaparece (no vuelve en la sesión actual).
- [ ] **Bloqueo:** Bloquear un perfil.  
  - Esperado: El perfil desaparece.
- [ ] **Reporte:** Reportar un perfil.  
  - Esperado: Modal de reporte se abre y se envía correctamente.

---

## ✅ 6. Matches

- [ ] **Lista de matches:** Ir a `/matches`.  
  - Esperado: Muestra matches mutuos (si existen) o mensaje vacío.
- [ ] **Bloquear match:** Bloquear un match.  
  - Esperado: El match desaparece y se crea registro de bloqueo.

---

## ✅ 7. Mensajería

- [ ] **Lista de conversaciones:** Ir a `/messages`.  
  - Esperado: Muestra conversaciones activas o mensaje vacío.
- [ ] **Abrir chat:** Hacer clic en una conversación.  
  - Esperado: Se carga el historial de mensajes.
- [ ] **Enviar mensaje:** Escribir y enviar.  
  - Esperado: El mensaje aparece en el timeline.
- [ ] **Tiempo real:** En otra ventana/pestaña, enviar un mensaje como el otro usuario.  
  - Esperado: El mensaje aparece sin recargar la página.
- [ ] **Bloquear desde chat:** Bloquear al otro participante.  
  - Esperado: La conversación se cierra con mensaje de bloqueo.
- [ ] **Reportar mensaje:** Reportar un mensaje del otro usuario.  
  - Esperado: Modal de reporte funciona.

---

## ✅ 8. Reportes

- [ ] **Reportar post:** Desde el feed, reportar una publicación.  
  - Esperado: El reporte se crea (verificar en DB o feedback visual).
- [ ] **Reportar perfil:** Desde discover, reportar un perfil.  
  - Esperado: Reporte creado.
- [ ] **Reportar mensaje:** Desde el chat, reportar un mensaje.  
  - Esperado: Reporte creado.
- [ ] **Auto-reporte:** Intentar reportarse a uno mismo.  
  - Esperado: Botón deshabilitado o muestra error.

---

## ✅ 9. UI/UX General

- [ ] **Modo oscuro:** La interfaz se ve correctamente en modo claro y oscuro.
- [ ] **Responsive:** Navegar desde un viewport móvil (320px-768px).  
  - Esperado: Los elementos se reordenan, no hay desbordamiento horizontal.
- [ ] **Estados vacíos:** Cada sección sin datos muestra un mensaje amigable.
- [ ] **Estados de error:** Simular fallo de red (desconectar WiFi momentáneamente).  
  - Esperado: Mensajes de error con botón "Reintentar".

---

## ✅ 10. Seguridad y Privacidad

- [ ] **Páginas legales:** `/terms`, `/privacy`, `/safety` cargan correctamente.
- [ ] **Consentimiento en onboarding:** No se puede completar onboarding sin marcar consentimiento y edad.
- [ ] **RLS verificadas:** Un usuario no puede ver/modificar datos de otro (verificar en logs de Supabase si hay errores RLS).
- [ ] **Storage:** Las imágenes subidas son accesibles solo mediante URLs firmadas.

---

## 📋 Resumen

| Área | Estado |
|------|--------|
| 1. Autenticación | ⬜ |
| 2. Onboarding | ⬜ |
| 3. Feed | ⬜ |
| 4. Perfil | ⬜ |
| 5. Descubrimiento | ⬜ |
| 6. Matches | ⬜ |
| 7. Mensajería | ⬜ |
| 8. Reportes | ⬜ |
| 9. UI/UX | ⬜ |
| 10. Seguridad | ⬜ |

---

*Marca cada checkbox con `[x]` cuando pase la prueba. Si algo falla, anota el error y revísalo antes del despliegue.*
