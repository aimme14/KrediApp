# Reglas de Firestore para KrediApp

Cualquier usuario autenticado puede **leer** los datos. La **escritura** solo la hace el backend (API).

## Estructura de datos

```
/superAdmin/{uid}           - Super Administradores (fuera de empresas)
/users/{uid}                - Índice de auth (empresaId, role, email...)
/empresas/{empresaId}
  ├── nombre, logo, dueño, sedePrincipal, fechaCreacion, activa, dueñoUid
  ├── /usuarios/{usuarioId} - jefes, admins, empleados de la empresa
  ├── /rutas/{rutaId}
  ├── /clientes/{clienteId}
  ├── /prestamos/{prestamoId}
  │     └── /pagos/{pagoId}
  └── /gastos/{gastoId}
```

## Cómo aplicar las reglas en Firebase

### Opción 1: Desde la consola de Firebase

1. Entra a [Firebase Console](https://console.firebase.google.com).
2. Selecciona tu proyecto (**krediapp-b9d26**).
3. Menú izquierdo → **Firestore Database** (Base de datos).
4. Arriba, pestaña **Reglas**.
5. **Borra todo** lo que haya en el editor y pega **exactamente** las reglas del archivo `firestore.rules`.
6. Pulsa **Publicar** (o **Publicar cambios**).

### Opción 2: Con Firebase CLI

```bash
firebase deploy --only firestore:rules
```

---

## Reglas de Storage (imágenes)

Para subir imágenes (logos de empresa, avatares, etc.) a Firebase Storage:

1. En Firebase Console → **Storage** (si no está activado, actívalo).
2. Asegúrate de tener `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` en `.env.local`.

### Desplegar reglas con Firebase CLI

```bash
firebase deploy --only storage
```

Las reglas están en `storage.rules` y permiten:
- **empresas/{jefeUid}/**: cada jefe solo escribe en su carpeta (logos).
- **avatars/{userId}/**: cada usuario solo escribe en su carpeta.
- **usuarios/{userId}/**: carpeta genérica por usuario.
