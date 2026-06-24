# Testing

Suite E2E con Python stdlib (sin pip) que corre contra cualquier deployment de Aguitech Core.

## Uso

```bash
python3 tests/test_system.py                                    # contra https://sxxysecret.com
python3 tests/test_system.py --base http://localhost:4000       # contra local
python3 tests/test_system.py --base http://web_sxxysecret_api:4000  # contra API directo
```

## Cobertura (10 secciones, 31 asserts)

| # | Sección | Tests | Qué valida |
|---|---|---|---|
| 1 | Health check | 2 | `/api/health` → 200, service name |
| 2 | Authentication | 4 | admin login, member login, bad password → 401, /me |
| 3 | Public blog | 2 | lista pública con ≥1 post |
| 4 | Public appointment booking | 3 | crear → 201, availability refleja slot, **doble booking → 409** |
| 5 | Admin appointment CRUD | 5 | listar, contiene test appt, PATCH status (confirmed/completed), staffNotes saved |
| 6 | Notifications | 3 | admin tiene unread, `appointment.created` present, mark-read |
| 7 | Audit log | 8 | listar, ≥1 entry, filter category, filter action, search by label, stats.byCategory, **CSV export con BOM** |
| 8 | RBAC audit | 2 | member → 403, anonymous → 401 |
| 9 | RBAC notif | 1 | anonymous → 401 |
| 10 | Cleanup | 1 | DELETE test appointment |

## Salida

```
aguitech-core test suite
Base:   https://sxxysecret.com
...

━━━ 1. Health check ━━━
  ✓ GET /api/health → 200
  ✓ service name 'aguittech-core'
...

━━━ summary ━━━
  passed: 31
  0 failed

🎉 all green
```

Exit code 0 = todo verde. Non-zero = al menos un fail (con detalle).

## Diseño

- **Una sola corrida, sin setup.** No requiere DB seeding, no requiere fixtures, crea su propio appointment de prueba y lo limpia al final.
- **Agnóstico al deployment.** Mismo script corre contra prod, staging, local. Cambia `--base`.
- **Captura el bug real.** El test "doble booking → 409" atrapa el bug clásico de no detectar solapamientos. "CSV export con BOM" atrapa el bug de encoding para Excel.
- **RBAC estricto.** Verifica que member no pueda ver audit (403) y anónimo no pueda ver nada (401). Si rompes el middleware, los tests lo cachan.
- **Cleanup al final.** El test appointment se borra, no deja basura.

## Crea tu propio test

Copia `test_system.py` y agrega una sección:

```python
def test_my_feature(c):
    section("11. My new feature")
    status, body = c.get("/api/my-endpoint", expect=200)
    record("my endpoint works", body.get("ok") is True, str(body))
```

Y agrégala al `main()`. Stdlib `urllib.request` para HTTP, sin requests/httpx.

## Cron (opcional)

Para monitoreo continuo, puedes agendar el test cada hora y alertar si falla:

```bash
# /etc/cron.d/aguittech-tests
0 * * * * root python3 /root/inspect/tests/test_system.py >> /var/log/aguittech-tests.log 2>&1 || echo "TESTS FAILED" | mail -s "Aguitech tests failing" hector@aguitech.com
```
