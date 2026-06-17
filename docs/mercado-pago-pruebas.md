# Pruebas de pago Mercado Pago

Este documento contiene solo datos de prueba públicos. No guardar aqui access tokens, claves de webhook, credenciales de usuarios ni claves Basic Auth.
## comprador

- User ID: `3472009589`
- Usuario: `TESTUSER5868912305806450288`
- Email usado por la preferencia: `TESTUSER5868912305806450288@testuser.com`
- Contrasena: `iZ0MMJsd6R`
- Codigo de verificacion: `009589`

## Flujo de prueba

1. Abrir una ventana incognito o un perfil de navegador sin sesion de Mercado Pago.
2. Iniciar sesion en Mercado Pago sandbox solo con el comprador de prueba.
3. Abrir la landing de prueba protegida.
4. Ingresar el RUT de prueba: `158420031`.
5. Confirmar que se muestre la deuda.
6. Presionar `Pagar deuda`.
7. Completar el checkout sandbox de Mercado Pago con una tarjeta de prueba.

Generar siempre una preferencia nueva desde la landing despues de un cambio de configuracion. Los links antiguos de Mercado Pago conservan el payload anterior.

## Tarjeta para pago aprobado

- Numero: `4168 8188 4444 7115`
- Vencimiento: `11/30`
- CVV: `123`
- Nombre del titular: `APRO`
- Tipo de documento: `Otro`
- Numero de documento: `123456789`

El nombre `APRO` fuerza una respuesta aprobada en el entorno de pruebas.

## Otras respuestas utiles

Mercado Pago permite simular distintos estados cambiando el nombre del titular:

- `APRO`: pago aprobado.
- `OTHE`: rechazado por error general.
- `CONT`: pendiente de pago.
- `CALL`: rechazado con validacion para autorizar.
- `FUND`: rechazado por fondos insuficientes.
- `SECU`: rechazado por codigo de seguridad.
- `EXPI`: rechazado por fecha de expiracion.
- `FORM`: rechazado por error en formulario.

## Notas

- Usar siempre el checkout sandbox cuando el access token empieza con `TEST-`.
- Este ambiente fuerza checkout sandbox con `MP_FORCE_SANDBOX=true`, incluso si el token de prueba viene con prefijo `APP_USR-`.
- Si se configura `MP_TEST_PAYER_EMAIL`, debe ser un comprador de prueba distinto del vendedor. Si no se configura, Mercado Pago pedira el comprador durante el checkout.
- No usar una cuenta compradora que sea la misma cuenta vendedora de la integracion.
- No usar una cuenta real de Mercado Pago en el navegador durante pruebas sandbox. Si Mercado Pago conserva una sesion real por cookies, puede mostrar "Una de las partes con la que intentas hacer el pago es de prueba".
- Si el checkout muestra "No pudimos procesar tu pago", probar con otro comprador de prueba y verificar que la preferencia use `sandbox_init_point`.



c9671b48-73e9-4542-8607-17139b20430f	15842003-1	TEST-15842003-1	Rodrigo Sepúlveda	rodrigo.sepulveda@test.local	10	CLP	preference_created	NULL	514537256-0525592c-e073-4d96-bc24-1a30decf1b41	NULL	https://sandbox.mercadopago.cl/checkout/v1/redirect?pref_id=514537256-0525592c-e073-4d96-bc24-1a30decf1b41	c9671b48-73e9-4542-8607-17139b20430f	2026-06-16 18:40:01	2026-06-16 18:40:02	"{""additional_info"":"""",""auto_return"":""approved"",""back_urls"":{""failure"":""https://landing-pago.servicios-digitales.workers.dev/pago/resultado?status=failure&ref=c9671b48-73e9-4542-8607-17139b20430f"",""pending"":""https://landing-pago.servicios-digitales.workers.dev/pago/resultado?status=pending&ref=c9671b48-73e9-4542-8607-17139b20430f"",""success"":""https://landing-pago.servicios-digitales.workers.dev/pago/resultado?status=success&ref=c9671b48-73e9-4542-8607-17139b20430f""},""binary_mode"":false,""client_id"":""29673152163912"",""collector_id"":514537256,""coupon_code"":null,""coupon_labels"":null,""date_created"":""2026-06-16T14:40:02.467-04:00"",""date_of_expiration"":null,""expiration_date_from"":null,""expiration_date_to"":null,""expires"":false,""external_reference"":""c9671b48-73e9-4542-8607-17139b20430f"",""id"":""514537256-0525592c-e073-4d96-bc24-1a30decf1b41"",""init_point"":""https://www.mercadopago.cl/checkout/v1/redirect?pref_id=514537256-0525592c-e073-4d96-bc24-1a30decf1b41"",""internal_metadata"":null,""items"":[{""id"":""test-20"",""category_id"":"""",""currency_id"":""CLP"",""description"":""Prueba sandbox Plan Impreso SD + Acceso Digital"",""title"":""Plan Impreso SD + Acceso Digital"",""quantity"":1,""unit_price"":10}],""marketplace"":""NONE"",""marketplace_fee"":0,""metadata"":{},""notification_url"":""https://landing-pago.servicios-digitales.workers.dev/api/mercadopago/webhook"",""operation_type"":""regular_payment"",""payer"":{""phone"":{""area_code"":"""",""number"":""""},""address"":{""zip_code"":"""",""street_name"":"""",""street_number"":null},""email"":"""",""identification"":{""number"":"""",""type"":""""},""name"":"""",""surname"":"""",""date_created"":null,""last_purchase"":null},""payment_methods"":{""default_card_id"":null,""default_payment_method_id"":null,""excluded_payment_methods"":[{""id"":""""}],""excluded_payment_types"":[{""id"":""""}],""installments"":null,""default_installments"":null},""processing_modes"":null,""product_id"":null,""preference_expired"":false,""redirect_urls"":{""failure"":"""",""pending"":"""",""success"":""""},""sandbox_init_point"":""https://sandbox.mercadopago.cl/checkout/v1/redirect?pref_id=514537256-0525592c-e073-4d96-bc24-1a30decf1b41"",""site_id"":""MLC"",""shipments"":{""default_shipping_method"":null,""receiver_address"":{""zip_code"":"""",""street_name"":"""",""street_number"":null,""floor"":"""",""apartment"":"""",""city_name"":null,""state_name"":null,""country_name"":null,""neighborhood"":null}},""total_amount"":null,""last_updated"":null,""financing_group"":""""}"	NULL	Plan Impreso SD + Acceso Digital