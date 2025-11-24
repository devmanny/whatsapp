# WhatsApp Web.js Bot

Bot de WhatsApp usando whatsapp-web.js con Bun runtime.

## Desarrollo Local

Para instalar dependencias:

```bash
bun install
```

Para ejecutar:

```bash
bun run index.ts
```

## Despliegue en Northflank

### Configuración de Volumen (IMPORTANTE)

Para que la sesión de WhatsApp persista entre reinicios y no tengas que escanear el QR cada vez, debes crear un volumen persistente:

**Carpeta a montar:** `/app/.wwebjs_auth`

### Pasos en Northflank:

1. Crea un nuevo servicio desde este repositorio
2. En la sección de **Volumes**, agrega un nuevo volumen:
   - **Mount path:** `/app/.wwebjs_auth`
   - **Size:** 1GB es suficiente
3. Despliega el servicio
4. La primera vez verás el código QR en los logs - escanéalo con WhatsApp
5. En los siguientes reinicios, la sesión se mantendrá y no necesitarás el QR

## Features

- Autenticación persistente con LocalAuth
- Logs detallados con zona horaria de Ciudad de México
- Registro de mensajes recibidos y enviados
- Comando de prueba: `!ping` responde con `pong`

This project was created using `bun init` in bun v1.2.21. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
