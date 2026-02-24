# Desplegar KrediApp en Vercel

## 1. Subir el código a GitHub

No hace falta usar el **mismo correo** en GitHub y en Vercel. Puedes tener una cuenta de GitHub (por ejemplo tu correo personal) y otra en Vercel (la que quieras). Luego conectas tu cuenta de GitHub desde Vercel y eliges el repositorio.

En la raíz del proyecto (en la terminal):

```bash
git add .
git commit -m "Preparar despliegue en Vercel"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/KrediApp.git
git push -u origin main
```

(Sustituye `TU_USUARIO` por tu usuario de GitHub. Si el repo ya existe, solo haz `git push`.)

---

## 2. Crear proyecto en Vercel

1. Entra en **https://vercel.com** e inicia sesión (o regístrate con GitHub/GitLab/Email).
2. Clic en **"Add New..."** → **"Project"**.
3. **Import** el repositorio de GitHub (si no ves tu repo, conecta GitHub en *Settings → Integrations*).
4. Selecciona el repo **KrediApp**.
5. **Framework Preset**: Vercel detectará Next.js. No cambies nada.
6. **Root Directory**: dejar en blanco.
7. **Build and Output Settings**: dejar por defecto (`npm run build`).

---

## 3. Variables de entorno en Vercel

**No subas `.env` ni `.env.local` a Git.** Configura las variables en Vercel:

1. En la pantalla de importación del proyecto, abre **"Environment Variables"**.
2. Añade **todas** estas variables (copia los valores de tu `.env.local`):

| Nombre | Dónde está el valor |
|--------|----------------------|
| `FIREBASE_PROJECT_ID` | .env.local |
| `FIREBASE_CLIENT_EMAIL` | .env.local |
| `FIREBASE_PRIVATE_KEY` | .env.local (pega la clave **entera** entre comillas; los `\n` deben estar) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | .env.local |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | .env.local |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | .env.local |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | .env.local |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | .env.local |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | .env.local |

Para **FIREBASE_PRIVATE_KEY**: pega todo el contenido, incluido `-----BEGIN PRIVATE KEY-----` y `-----END PRIVATE KEY-----`, en una sola línea con `\n` donde van los saltos de línea (como en tu .env.local).

3. Marca las variables para **Production**, **Preview** y **Development** si quieres que apliquen en todos los entornos.
4. Clic en **Deploy**.

---

## 4. Después del despliegue

- Vercel te dará una URL tipo `https://kredi-app-xxx.vercel.app`.
- Cada `git push` a `main` volverá a desplegar automáticamente.
- Si algo falla, revisa **Deployments** → el despliegue fallido → **Logs** o **Building**.

---

## 5. Firebase: dominios autorizados

Para que el login funcione en tu URL de Vercel:

1. **Firebase Console** → **Authentication** → **Settings** (Configuración) → **Authorized domains**.
2. Añade el dominio de Vercel, por ejemplo: `kredi-app-xxx.vercel.app` (o tu dominio propio si lo configuras después).

Si no añades el dominio, Firebase puede bloquear el inicio de sesión en producción.

---

## 6. Si sale "No Output Directory named 'public'"

Este proyecto es **Next.js**, no un sitio estático. Next.js genera la salida en `.next`, no en `public`.

1. En Vercel: **Project Settings** (Configuración del proyecto) → **Build & Development Settings**.
2. En **Output Directory** déjalo **vacío** (no pongas `public`).
3. **Framework Preset** debe ser **Next.js**.
4. Guarda y haz **Redeploy**.
