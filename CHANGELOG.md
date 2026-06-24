# Changelog

## [Unreleased]

### Added
- **Citas (Appointments)**: modelo, rutas admin + público, detección de conflictos (409), notificaciones automáticas, audit log, calendario admin + usuario, landing page booking widget
- **Notificaciones**: modelo con TTL 90d, `notify()` lib, bell con polling, página completa, integración con chat/tasks/appointments
- **Bitácora (Audit Log)**: modelo con TTL 180d, `audit()` lib, instrumentación automática en auth/tasks/chat/appointments, página admin con stats + CSV export
- **Landing page**: `/` público con hero, features, booking widget 3 pasos
- **Tests E2E**: `tests/test_system.py` — 10 secciones, 31 asserts, stdlib puro
- **Documentación completa**: `docs/` con 8 archivos (DATA-MODEL, DEPLOY, TESTING, APPOINTMENTS, NOTIFICATIONS, AUDIT-LOG, BLOG, LANDING)

### Fixed
- **Traefik routers missing**: documentado el fix (EasyPanel borra routers custom, restaurar `main.yaml` + `kill -s HUP`)
- **Blog editor**: galerías multi-archivo (Imágenes/Videos/Documentos) ahora visibles dentro del modo edición con multi-select, lightbox, drag-drop, bulk delete, set cover
- **Blog new post**: cola `PendingUploads` con misma UX, subida en batch al guardar

## Recent commits

- `aa7ade3` feat: end-to-end system — appointments, notifications, audit log, landing page, E2E tests
- `6be3b58` feat(blog): galleries (images/videos/docs) inside edit modal + multi-file pending uploads
- `d05780f` fix(blog): eliminate duplicate edit form, add cover image picker + links editor
- `9e4122b` feat(blog): full editor UX for /blog admin dashboard
