# Chat

Mensajería 1-a-1 y grupal con adjuntos.

## URLs
- `/chat` — lista de conversaciones + panel de mensajes

## API
- `GET    /api/chat/conversations` — listar mis conversaciones
- `POST   /api/chat/conversations` — crear (direct con userId, o group con memberIds + name)
- `GET    /api/chat/conversations/:id/messages?before=&limit=` — mensajes paginados
- `POST   /api/chat/conversations/:id/messages` — enviar (texto + adjuntos multipart)
- `DELETE /api/chat/messages/:id` — borrar mensaje
- `POST   /api/chat/conversations/:id/read` — marcar como leído

## Notificaciones
- `chat.message` a todos los participantes excepto el sender

## Audit log
- `chat.create_conv`, `chat.send_message`, `chat.delete_message`

## Adjuntos
- Multipart `files` (plural) en el mismo request que el texto
- Tipos: imagen, video, audio, pdf, doc, archive, code, design, font, other
- Storage: `/code/server/uploads/` (servido en `/api/uploads/`)
