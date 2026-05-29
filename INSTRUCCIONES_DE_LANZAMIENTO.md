# 🚀 Atrevidos - Instrucciones de Lanzamiento

## ✅ Lo que ya está done (PAQUETE 1 y 2 completados)

1. **Base de Datos**: El esquema SQL completo está en `database/schema.sql` y listo para aplicar en Supabase.
2. **Configuración del Proyecto**: SvelteKit + Tailwind CSS configurados.
3. **Cliente Supabase**: `src/lib/supabase.ts` listo para conectarse.
4. **Tipos de TypeScript**: `src/lib/database.types.ts` generado automáticamente.
5. **Autenticación**: Página de Login/Registro en `/login`.
6. **Frontend Básico**: Página principal (`/`) con feed de publicaciones y creación de posts.

## ⚠️ PASO CRÍTICO: Configurar tus credenciales

Antes de ejecutar la aplicación, debes completar tus credenciales de Supabase:

1. **Obtén tu clave `anon public`**:
   - Ve a tu dashboard de Supabase: https://app.supabase.com
   - Selecciona tu proyecto (`ynkhwsbeeythmkgjjsmoo`)
   - Ve a **Settings > API**
   - Copia la clave **"anon public"** (no uses la "service_role key" en el frontend).

2. **Actualiza el archivo `.env`**:
   ```bash
   cd /home/ubuntu/Atrevidos
   nano .env
   ```
   Reemplaza la línea:
   ```
   VITE_SUPABASE_ANON_KEY=PEGA_AQUI_TU_ANON_KEY_PUBLICA
   ```
   por:
   ```
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUz... (tu clave real aquí)
   ```

3. **Guarda el archivo** y sal de nano (Ctrl+X, Y, Enter).

## 📥 Aplicar el esquema de base de datos a Supabase

Si aún no has aplicado el esquema SQL:

1. Ve a Supabase > **SQL Editor**
2. Crea un nuevo query
3. Copia todo el contenido de `database/schema.sql`
4. Pégalo y ejecútalo
5. Verifica que las tablas (`profiles`, `posts`, `likes`, `comments`, `matches`) se hayan creado.

## 🏃 Ejecutar la aplicación localmente

Una vez configurado el `.env`:

```bash
cd /home/ubuntu/Atrevidos
npm run dev
```

El servidor se abrirá en `http://localhost:5173` (o el puerto que asigne Vite).

## 🧪 Verificar la instalación

1. Abre tu navegador en el puerto indicado.
2. Ve a `/login` y registra un nuevo usuario.
3. Verifica tu correo (Supabase envía un email de confirmación por defecto).
4. Inicia sesión.
5. Crea una publicación y vérificala en el feed.

## 🔒 Seguridad

- **NUNCA** commits el archivo `.env` a Git (ya está en `.gitignore`).
- Las políticas RLS en `database/schema.sql` garantizan que los usuarios solo puedan ver/editar su propio contenido.
- La clave `anon` es segura para el frontend, pero si la comprometes, puedes regenerarla en Supabase sin afectar la base de datos.

## 📦 Próximos pasos (PAQUETE 3)

Cuando estés listo, puedo generar:
- Perfil de usuario editable
- Sistema de comentarios
- Notificaciones en tiempo real
- Subida de imágenes a Storage de Supabase
- Diseño responsive avanzado

---

**Estado actual**: 🔴 **Pendiente de configuración de clave `anon`** (hazlo tú mismo para seguridad)
**Lanzamiento**: Lista para ejecutar una vez completada la clave.

¿Necesitas ayuda con algún paso? ¡Dímelo!