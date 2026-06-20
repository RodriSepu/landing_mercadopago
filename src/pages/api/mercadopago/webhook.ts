import type { APIRoute } from 'astro';

type CloudflareWorkersModule = {
  env: Env;
};

type MercadoPagoNotification = {
  action?: string;
  data?: {
    id?: string | number;
  };
  live_mode?: boolean;
  type?: string;
};

type MercadoPagoPayment = {
  external_reference?: string;
  id?: string | number;
  payment_method_id?: string;
  status?: string;
  status_detail?: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const { env } = await getRuntime(locals);

  if (!env.DB || !env.MP_ACCESS_TOKEN || !env.MP_WEBHOOK_SECRET) {
    return json({ error: 'webhook_no_configurado' }, 503);
  }

  const url = new URL(request.url);
  const rawBody = await request.text();
  let payload: MercadoPagoNotification;

  try {
    payload = JSON.parse(rawBody) as MercadoPagoNotification;
  } catch {
    return json({ error: 'json_invalido' }, 400);
  }

  const dataId = String(url.searchParams.get('data.id') ?? payload.data?.id ?? '').toLowerCase();
  const signatureValid = await validateSignature({
    dataId,
    request,
    secret: env.MP_WEBHOOK_SECRET,
  });

  const eventInsert = await env.DB.prepare(
    `
      INSERT INTO mp_payment_events (
        mp_payment_id,
        event_type,
        action,
        live_mode,
        signature_valid,
        payload,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `,
  )
    .bind(
      dataId || null,
      payload.type ?? null,
      payload.action ?? null,
      payload.live_mode ? 1 : 0,
      signatureValid ? 1 : 0,
      rawBody,
    )
    .run();

  if (!signatureValid) {
    return json({ error: 'firma_invalida' }, 401);
  }

  if (payload.type !== 'payment' || !dataId) {
    return json({ received: true });
  }

  const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
    },
  });

  const payment = (await paymentResponse.json()) as MercadoPagoPayment;

  if (!paymentResponse.ok || !payment.external_reference) {
    return json({ received: true });
  }

  await env.DB.prepare(
    `
      UPDATE mp_payment_transactions
      SET mp_payment_id = ?,
          status = ?,
          status_detail = ?,
          raw_payment_response = ?,
          updated_at = datetime('now')
      WHERE external_reference = ?
    `,
  )
    .bind(
      String(payment.id ?? dataId),
      payment.status ?? 'unknown',
      payment.status_detail ?? null,
      JSON.stringify(payment),
      payment.external_reference,
    )
    .run();

  await env.DB.prepare(
    `
      UPDATE mp_payment_events
      SET transaction_id = ?,
          external_reference = ?
      WHERE id = ?
    `,
  )
    .bind(payment.external_reference, payment.external_reference, eventInsert.meta.last_row_id)
    .run();

  if (payment.status === 'approved') {
    const tx = await env.DB.prepare(
      `
        SELECT contrato, amount
        FROM mp_payment_transactions
        WHERE external_reference = ?
      `,
    )
      .bind(payment.external_reference)
      .first<{ contrato: string | null; amount: number | null }>();

    if (tx?.contrato) {
      // NOTA: Se deja comentada esta actualización para no descontar saldo_pendiente durante pruebas.
      /*
      await env.DB.prepare(
        `
          UPDATE cgc_deudas_reales
          SET saldo_pendiente = MAX(0, saldo_pendiente - ?),
              updated_at = datetime('now')
          WHERE contrato = ?
        `,
      )
        .bind(tx.amount ?? 0, tx.contrato)
        .run();
      */
    }
  }

  await env.DB.prepare(
    `
      INSERT INTO pagos (
        id,
        source,
        external_reference,
        mp_payment_id,
        status,
        status_detail,
        payment_method_id,
        c_invoice_id,
        docto_adempiere,
        raw_payment_response,
        raw_webhook_payload,
        created_at,
        updated_at
      )
      VALUES (?, 'webhook', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `,
  )
    .bind(
      crypto.randomUUID(),
      payment.external_reference,
      String(payment.id ?? dataId),
      payment.status ?? 'unknown',
      payment.status_detail ?? null,
      'payment_method_id' in payment ? String(payment.payment_method_id ?? '') : null,
      null,
      null,
      JSON.stringify(payment),
      rawBody,
    )
    .run();

  return json({ received: true });
};

const validateSignature = async ({
  dataId,
  request,
  secret,
}: {
  dataId: string;
  request: Request;
  secret: string;
}) => {
  const xSignature = request.headers.get('x-signature');
  const xRequestId = request.headers.get('x-request-id');

  if (!xSignature || !xRequestId || !dataId) {
    return false;
  }

  const parts = Object.fromEntries(
    xSignature.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key?.trim(), value?.trim()];
    }),
  );

  if (!parts.ts || !parts.v1) {
    return false;
  }

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return hex === parts.v1;
};

const getRuntime = async (locals: App.Locals) => {
  if (import.meta.env.ASTRO_SANDBOX) {
    return { env: (locals.runtime?.env ?? process.env) as unknown as Env };
  }

  const { env } = (await import('cloudflare:workers')) as CloudflareWorkersModule;
  return { env };
};
