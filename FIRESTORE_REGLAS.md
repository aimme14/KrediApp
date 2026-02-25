# Reglas de Firestore para KrediApp

Cualquier usuario autenticado (Super Administrador, Jefe, Administrador o Trabajador) puede **leer** los datos almacenados. La **escritura** solo la hace el backend (API).

## Cómo aplicar las reglas en Firebase

### Opción 1: Desde la consola de Firebase

1. Entra a [Firebase Console](https://console.firebase.google.com).
2. Selecciona tu proyecto (**krediapp-b9d26**).
3. Menú izquierdo → **Firestore Database** (Base de datos).
4. Arriba, pestaña **Reglas**.
5. **Borra todo** lo que haya en el editor y pega **exactamente** las reglas de abajo (sin recortar nada).
6. Pulsa **Publicar** (o **Publicar cambios**).

### Reglas a copiar y pegar (copiar TODO el bloque)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if false;
    }
  }
}
```

**Importante:**  
- No cambies `request.auth.uid` por `request.au` ni recortes texto.  
- Si tenías `myProfile()` devolviendo solo `get(...)` sin `.data`, estas reglas nuevas no usan esa función y evitan ese error.

### Opción 2: Con Firebase CLI

```bash
firebase deploy --only firestore:rules
```

---

Después de publicar, recarga la página del panel (`/dashboard`). El mensaje "Missing or insufficient permissions" debería desaparecer y todos los roles podrán ver los datos almacenados.
