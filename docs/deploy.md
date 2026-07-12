# 🚀 Atrevidos — Production Deployment Hardening

> **Versión:** 1.0 — MVP Launch  
> Checklist para preparar el proyecto para un despliegue seguro en producción.

---

## 1. Variables de Entorno

### Requeridas
Crea un archivo `.env` en la raíz del proyecto:

```bash
# Supabase - Obtener del Dashboard > Settings > API
VITE_SUPABASE_URL=https://ynkhwsbeeythmkgjjsmoo.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...  # anon public key

# También necesarias para SSR (hooks.server.ts)
PUBLIC_SUPABASE_URL=https://ynkhwsbeeythmkgjjsmoo.supabase.co
PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...  # misma anon key
```

### Seguridad
- [ ] **NUNCA** committear `.env` (ya está en `.gitignore`).
- [ ] Usar `VITE_` para variables del frontend, `PUBLIC_` para SSR.
- [ ] La clave `anon` es segura para frontend — no usar `service_role` en el cliente.
- [ ] Regenerar la `anon key` si se compromete (Settings > API).

---

## 2. Supabase Auth — Configuración

- [ ] **Redirect URLs:** Configurar en Auth > URL Configuration:
  - Site URL: `https://tudominio.com`
  - Redirect URLs: `https://tudominio.com/**`, `http://localhost:5173/**`
- [ ] **Email templates:** Personalizar en Auth > Email Templates:
  - Confirm signup
  - Magic link
  - Reset password
- [ ] **Providers:** Deshabilitar providers no usados (solo email/password para MVP).
- [ ] **Rate limiting:** Verificar límites por defecto en Auth > Settings.
- [ ] **Confirmar email:** Decidir si se requiere verificación de email (recomendado para producción).

---

## 3. Base de Datos — RLS y Seguridad

- [ ] **Ejecutar schema:** `database/schema.sql` en Supabase SQL Editor.
- [ ] **Verificar RLS:** Ejecutar `database/verify-installation.sql` y confirmar:
  - 10 tablas creadas
  - Todas las políticas RLS activas
  - Trigger `on_auth_user_created` funcionando
- [ ] **Probar RLS como usuario anónimo** (usar SQL Editor con roles):
  ```sql
  -- Debería fallar (no autenticado):
  SELECT * FROM profiles LIMIT 1;
  ```
- [ ] **Backups automáticos:** Supabase los activa por defecto — verificar en Database > Backups.
- [ ] **PITR (Point-in-Time Recovery):** Habilitar si el presupuesto lo permite.

---

## 4. Storage — Buckets y Políticas

### Buckets requeridos
| Bucket | Visibilidad | Propósito |
|--------|-------------|-----------|
| `avatars` | Private | Fotos de perfil |
| `covers` | Private | Galería de perfiles |
| `post-images` | Private | Imágenes de posts |
| `media-chats` | Private | Archivos de chat |

### Configuración
- [ ] Crear buckets en Dashboard > Storage > New Bucket (todos `public: false`).
- [ ] Ejecutar `database/storage-policies.sql` en SQL Editor.
- [ ] Verificar que las políticas permiten:
  - Subir solo en carpetas propias (`auth.uid()` == folder name)
  - Leer cualquier archivo (la app controla acceso por RLS + signed URLs)
- [ ] **Límites de tamaño:** Configurar en application layer ya definidos:
  - Avatar: 5 MB
  - Galería: 8 MB por imagen
  - Posts: 8 MB por imagen

---

## 5. Aplicación — Build y Deploy

### Build
```bash
npm run build
```

### Adapter
El proyecto usa `@sveltejs/adapter-node`. Para desplegar:
- **Vercel:** Cambiar a `@sveltejs/adapter-vercel`
- **Netlify:** Cambiar a `@sveltejs/adapter-netlify`
- **Node server:** Usar el build actual, ejecutar con `node build`

### Health check
```bash
npm run check     # TypeScript type checking
npm run check:svelte  # Svelte diagnostics
npm test          # Smoke tests unitarios
```

---

## 6. Checklist Pre-Lanzamiento

### Código
- [ ] `svelte-check` pasa con 0 errores.
- [ ] `npm run build` produce build exitoso.
- [ ] Tests unitarios pasan (124 tests actualmente).
- [ ] **No hay `console.log` o `debugger` en producción.**
- [ ] **No hay claves hardcodeadas** (revisar `check_feed.mjs` y similares).

### Infraestructura
- [ ] Dominio configurado con SSL.
- [ ] Supabase project en plan adecuado (Free para empezar, Pro para producción).
- [ ] Auth redirect URLs apuntan al dominio real.
- [ ] Storage buckets creados y con políticas aplicadas.
- [ ] Backups automáticos verificados.

### Legal
- [ ] Páginas `/terms`, `/privacy`, `/safety` tienen contenido real (no placeholder).
- [ ] Consentimiento de edad y términos en onboarding funciona.
- [ ] Política de privacidad cumple con GDPR si aplica.

### Monitoreo
- [ ] Supabase Logs > verificar que no hay errores RLS recurrentes.
- [ ] Configurar alertas de rate limiting si el plan lo permite.

---

## 7. Post-Lanzamiento

- [ ] Monitorear errores en Supabase Logs (Auth, Database, Storage).
- [ ] Recopilar feedback de primeros usuarios.
- [ ] Configurar analíticas básicas (opcional: PostHog, Plausible).
- [ ] Plan de moderación: definir roles de admin/moderador en DB.

---

> **Estado:** ⬜ Pendiente de ejecutar  
> **Última revisión:** Junio 2026
