# Guía para Pruebas de Pago E2E y Validación de Base de Datos

Esta guía detalla el proceso paso a paso para ejecutar una prueba de pago y verificar el registro de punta a punta en la base de datos de Cloudflare D1.

## 🔗 URL del Entorno de Producción
`https://landing-pago.servicios-digitales.workers.dev/`

---

## 👤 1. Datos del Usuario Deudor (Búsqueda)
*   **RUT**: `11643338-9`

---

## 💳 2. Datos de Tarjeta de Prueba (Mercado Pago Sandbox)
Para simular un pago **aprobado** con éxito:

*   **Número de Tarjeta**: `4168 8188 4444 7115`
*   **Vencimiento**: `11/30`
*   **CVV**: `123`
*   **Nombre del titular**: `APRO` (forzar estado aprobado)
*   **Tipo de documento**: `Otro`
*   **Número de documento**: `123456789`

---

## 📊 3. Validación en Base de Datos D1 (cobranza)
El worker productivo está configurado mediante `wrangler.toml` para usar la base de datos `cobranza`. Puedes ejecutar las siguientes consultas mediante Wrangler CLI en la terminal:

### A. Verificar Transacciones en `mp_payment_transactions`
Esta tabla registra la intención de pago inicial (`status = preference_creating` o `preference_created`) y se actualiza a `approved` cuando el webhook procesa la confirmación del pago.

```bash
npx wrangler d1 execute cobranza --remote --command "SELECT id, status, amount, created_at, external_reference FROM mp_payment_transactions ORDER BY created_at DESC LIMIT 5"
```

### B. Verificar Eventos del Webhook en `mp_payment_events`
Esta tabla registra las notificaciones directas recibidas por la pasarela de pago.

```bash
npx wrangler d1 execute cobranza --remote --command "SELECT id, mp_payment_id, event_type, action, signature_valid, created_at FROM mp_payment_events ORDER BY created_at DESC LIMIT 5"
```

### C. Verificar Pagos Registrados en `pagos`
Esta tabla recopila el log consolidado de confirmaciones de pago exitosas (tanto por retorno del usuario en `resultado.astro` como por webhook).

```bash
npx wrangler d1 execute cobranza --remote --command "SELECT id, status, status_detail, transaction_amount, external_reference, created_at FROM pagos ORDER BY created_at DESC LIMIT 5"
```
