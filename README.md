# KrediApp

Aplicación web con **4 roles** y almacenamiento en Firebase, pensada para desplegar en **Vercel** y guardar el código en **Git**.

## Roles

| Rol            | Quién lo crea     | Puede hacer                                                                 |
|----------------|-------------------|-----------------------------------------------------------------------------|
| **Super Admin**| (primer usuario)  | Crear jefes, habilitar/deshabilitar jefes                                  |
| **Jefe**       | Super Admin       | Crear administradores                                                       |
| **Admin**      | Jefe              | Crear trabajadores                                                          |
| **Trabajador** | Admin             | Acceso al panel (sin crear usuarios)                                        |

## Requisitos

- Node.js 18+
- Cuenta en [Firebase](https://console.firebase.google.com/) y [Vercel](https://vercel.com/)
- Repositorio en Git (GitHub, GitLab o Bitbucket) para conectar con Vercel

---

## 1. Clonar e instalar

```bash
cd KrediApp
npm install
```

## 2. Configurar Firebase

### 2.1 Crear proyecto en Firebase

1. Entra en [Firebase Console](https://console.firebase.google.com/).
2. Crea un proyecto (o usa uno existente).
3. Activa **Authentication** > método **Correo/contraseña**.
4. Activa **Firestore Database** (modo producción; luego ajustamos reglas).

### 2.2 Variables de entorno (cliente)

En el proyecto Firebase: **Configuración del proyecto** (engranaje) > **Tus apps** > añade una app web. Copia los valores y crea un archivo `.env.local` en la raíz del proyecto:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

### 2.3 Cuenta de servicio (Firebase Admin, servidor)

Para que la app pueda **crear usuarios** y **habilitar/deshabilitar jefes** sin cerrar la sesión del usuario actual:

1. Firebase Console > **Configuración del proyecto** > **Cuentas de servicio**.
2. **Generar nueva clave privada**.
3. En el JSON descargado tendrás `project_id`, `client_email` y `private_key`.
4. Añade en `.env.local` (en Vercel serán variables de entorno):

```env
FIREBASE_PROJECT_ID=tu-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-...@tu-proyecto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

En **Vercel**, si la clave tiene saltos de línea, pega el valor entre comillas o usa el bloque completo en una sola línea con `\n` literal.

### 2.4 Reglas de Firestore

En Firebase Console > **Firestore** > **Reglas**, pega el contenido de `firestore.rules` del repositorio (o el que te hayan indicado). Así los usuarios solo leen lo que les corresponde; la escritura de usuarios se hace desde el servidor con la API.

### 2.5 Primer Super Administrador

El primer usuario con rol **Super Admin** se crea a mano o con el script:

**Opción A — Script (recomendado):**
```bash
$env:SETUP_EMAIL="super@tudominio.com"; $env:SETUP_PASSWORD="TuClave123"; npm run create-super-admin
```

**Opción B — Manual:**
1. En **Authentication** > **Users** > **Add user**: crea un usuario con email y contraseña. Copia el **User UID**.
2. En **Firestore** > **Start collection** > id de colección: `superAdmin`.
3. **Add document** con ID = ese **User UID** y los campos:

   - `email` (string): el mismo correo del usuario.
   - `role` (string): `superAdmin`
   - `enabled` (boolean): `true`
   - `createdBy` (string): `""`
   - `createdAt` (timestamp): fecha actual.
   - `updatedAt` (timestamp): fecha actual.
   - `emailVerified` (boolean): `true`

Guarda. Ese usuario ya puede iniciar sesión y actuar como Super Admin (crear jefes, habilitar/deshabilitar).

---

## 3. Ejecutar en local

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000), inicia sesión con el Super Admin y prueba crear un jefe.

---

## 4. Subir código a Git

Si aún no tienes repositorio remoto:

```bash
git remote add origin https://github.com/TU_USUARIO/KrediApp.git
git add .
git commit -m "Initial commit: KrediApp con roles y Firebase"
git push -u origin main
```

(Sustituye la URL por la de tu repo en GitHub, GitLab o Bitbucket.)

---

## 5. Desplegar en Vercel

1. Entra en [Vercel](https://vercel.com/) e inicia sesión (con GitHub/GitLab/Bitbucket si quieres).
2. **Add New** > **Project** e importa el repositorio **KrediApp**.
3. En **Environment Variables** añade **todas** las variables que tienes en `.env.local`:
   - `NEXT_PUBLIC_FIREBASE_*` (las 6 del cliente).
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
4. **Deploy**. Vercel construye la app y te da una URL (ej. `kredi-app.vercel.app`).

Cada **push** a la rama que hayas conectado (p. ej. `main`) generará un nuevo despliegue.

---

## Resumen

- **Código**: en Git (repositorio que conectas a Vercel).
- **Base de datos y autenticación**: Firebase (Firestore + Auth).
- **Visualización web**: Vercel (deploy automático desde Git).

Si quieres, en los siguientes pasos podemos añadir más pantallas para el rol Trabajador o configurar un dominio propio en Vercel.
