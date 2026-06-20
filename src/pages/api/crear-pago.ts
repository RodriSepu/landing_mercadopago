import type { APIRoute } from 'astro';

type CloudflareWorkersModule = {
  env: Env;
};

type DebtRow = {
  contrato: string | null;
  copesaplan: string | null;
  email: string | null;
  monto: number | null;
  nombre: string | null;
  identificador_cliente: string | null;
};

type DebtItemRow = {
  contrato: string | null;
  copesaplan: string | null;
  email: string | null;
  fecha_docto: string | null;
  fecha_vencimiento: string | null;
  identificador_cliente: string | null;
  monto: number | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });

const cleanRut = (rut: string) => rut.replace(/[.\s]/g, '').toUpperCase();

const normalizeRut = (rut: string) => {
  const cleaned = cleanRut(rut);
  const match = cleaned.match(/^(\d{7,8})-?([\dK])$/);

  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}`;
};

const parseDateOnly = (value: string | null) => {
  if (!value) {
    return null;
  }

  const normalized = value.includes('T') ? value : `${value}T00:00:00`;
  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const diffInDays = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

const getPayableDebtItems = (rows: DebtItemRow[]) => {
  const today = new Date();

  return rows.filter((row) => {
    const compromiso = parseDateOnly(row.fecha_docto);
    if (!compromiso) {
      return false;
    }

    return diffInDays(compromiso, today) > 20;
  });
};

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  let env: Env;

  try {
    ({ env } = await getRuntime(locals));
  } catch {
    return json({ error: 'runtime_no_disponible', status: 500 }, 500);
  }

  if (!env.DB) {
    return json({ error: 'db_no_configurada', status: 503 }, 503);
  }

  if (!env.MP_ACCESS_TOKEN) {
    return json({ error: 'mercado_pago_no_configurado', status: 503 }, 503);
  }

  let payload: { rut?: unknown; email?: unknown };

  try {
    payload = await request.json();
  } catch {
    return json({ error: 'json_invalido' }, 400);
  }

  let rut: string | null = null;
  let email: string | null = null;

  if ('rut' in payload && typeof payload.rut === 'string') {
    const normalized = normalizeRut(payload.rut);
    if (!normalized) {
      return json({ error: 'rut_invalido', status: 400 }, 400);
    }
    rut = normalized;
  } else if ('email' in payload && typeof payload.email === 'string') {
    const trimmed = payload.email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      return json({ error: 'email_invalido', status: 400 }, 400);
    }
    email = trimmed.toLowerCase();
  } else {
    return json({ error: 'datos_insuficientes', status: 400 }, 400);
  }

  let debt: DebtRow | null = null;
  let debtItems: DebtItemRow[] = [];

  if (rut) {
    const rows = await env.DB.prepare(
      `
        SELECT
          MAX(contrato) AS contrato,
          MAX(contrato) AS copesaplan,
          MAX(nombre_cliente) AS nombre,
          MAX(email) AS email,
          MAX(identificador_cliente) AS identificador_cliente,
          SUM(saldo_pendiente) AS monto
        FROM cgc_deudas_reales
        WHERE identificador_cliente = ?
          AND saldo_pendiente > 0
      `,
    )
      .bind(rut)
      .first<DebtRow>();

    debt = rows;

    debtItems = await env.DB.prepare(
      `
        SELECT
          contrato,
          email,
          fecha_docto,
          fecha_vencimiento,
          identificador_cliente,
          saldo_pendiente AS monto
        FROM cgc_deudas_reales
        WHERE identificador_cliente = ?
          AND saldo_pendiente > 0
      `,
    )
      .bind(rut)
      .all<DebtItemRow>()
      .then((result) => result.results);
  } else if (email) {
    const rows = await env.DB.prepare(
      `
        SELECT
          MAX(contrato) AS contrato,
          MAX(contrato) AS copesaplan,
          MAX(nombre_cliente) AS nombre,
          MAX(email) AS email,
          MAX(identificador_cliente) AS identificador_cliente,
          SUM(saldo_pendiente) AS monto
        FROM cgc_deudas_reales
        WHERE LOWER(email) = ?
          AND saldo_pendiente > 0
      `,
    )
      .bind(email)
      .first<DebtRow>();

    debt = rows;

    debtItems = await env.DB.prepare(
      `
        SELECT
          contrato,
          email,
          fecha_docto,
          fecha_vencimiento,
          identificador_cliente,
          saldo_pendiente AS monto
        FROM cgc_deudas_reales
        WHERE LOWER(email) = ?
          AND saldo_pendiente > 0
      `,
    )
      .bind(email)
      .all<DebtItemRow>()
      .then((result) => result.results);
  }

  const payableDebtItems = getPayableDebtItems(debtItems);
  const amount = Math.round(
    payableDebtItems.reduce((sum, item) => sum + Number(item.monto ?? 0), 0),
  );

  if (!debt?.nombre || !amount) {
    return json({ error: 'deuda_no_encontrada', status: 404 }, 404);
  }

  const externalReference = crypto.randomUUID();
  const origin = new URL(request.url).origin;
  const notificationUrl = `${origin}/api/mercadopago/webhook`;
  const idempotencyKey = crypto.randomUUID();
  const usesTestAccessToken = env.MP_ACCESS_TOKEN.startsWith('TEST-');
  const usesSandboxCheckout = usesTestAccessToken || env.MP_FORCE_SANDBOX === 'true';
  const payerEmail = debt.email?.trim() || undefined;
  const productName = debt.copesaplan?.trim() || 'Producto Copesa';
  const items = usesSandboxCheckout
    ? [
        {
          currency_id: 'CLP',
          description: `Prueba sandbox ${productName}`,
          id: 'test-20',
          quantity: 1,
          title: productName,
          unit_price: amount,
        },
      ]
    : [
        {
          currency_id: 'CLP',
          description: `Pago de deuda RUT ${debt.identificador_cliente ?? rut ?? ''} - ${productName}`,
          id: debt.contrato ?? debt.identificador_cliente ?? rut ?? '',
          quantity: 1,
          title: productName,
          unit_price: amount,
        },
      ];

  await env.DB.prepare(
    `
      INSERT INTO mp_payment_transactions (
        id,
        rut,
        contrato,
        copesaplan,
        nombre,
        email,
        amount,
        status,
        external_reference,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'preference_creating', ?, datetime('now'), datetime('now'))
    `,
  )
    .bind(
      externalReference,
      debt.identificador_cliente ?? rut,
      debt.contrato,
      debt.copesaplan,
      debt.nombre,
      debt.email,
      amount,
      externalReference,
    )
    .run();

  const preferenceBody = {
    auto_return: 'approved',
    back_urls: {
      failure: `${origin}/pago/resultado?status=failure&ref=${externalReference}`,
      pending: `${origin}/pago/resultado?status=pending&ref=${externalReference}`,
      success: `${origin}/pago/resultado?status=success&ref=${externalReference}`,
    },
    external_reference: externalReference,
    items,
    metadata: {
      contrato: debt.contrato,
      copesaplan: debt.copesaplan,
      rut: debt.identificador_cliente ?? rut,
    },
    notification_url: notificationUrl,
    ...(payerEmail || debt.nombre
      ? {
          payer: {
            email: payerEmail,
            name: debt.nombre ?? undefined,
          },
        }
      : {}),
  };

  let mpResponse: Response;

  try {
    mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      body: JSON.stringify(preferenceBody),
      headers: {
        Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      method: 'POST',
    });
  } catch (error) {
    await env.DB.prepare(
      `
        UPDATE mp_payment_transactions
        SET status = 'preference_failed',
            raw_preference_response = ?,
            updated_at = datetime('now')
        WHERE external_reference = ?
      `,
    )
      .bind(JSON.stringify({ error: 'fetch_exception', message: error instanceof Error ? error.message : 'unknown' }), externalReference)
      .run();

    return json({ error: 'mercado_pago_error', status: 502 }, 502);
  }

  const preference = (await mpResponse.json()) as Record<string, unknown>;

  if (!mpResponse.ok) {
    await env.DB.prepare(
      `
        UPDATE mp_payment_transactions
        SET status = 'preference_failed',
            raw_preference_response = ?,
            updated_at = datetime('now')
        WHERE external_reference = ?
      `,
    )
      .bind(JSON.stringify(preference), externalReference)
      .run();

    return json({ error: 'mercado_pago_error', status: 502 }, 502);
  }

  const initPoint = String(
    (usesSandboxCheckout ? preference.sandbox_init_point : preference.init_point) ??
      preference.init_point ??
      preference.sandbox_init_point ??
      '',
  );
  const preferenceId = String(preference.id ?? '');

  await env.DB.prepare(
    `
      UPDATE mp_payment_transactions
      SET status = 'preference_created',
          mp_preference_id = ?,
          init_point = ?,
          raw_preference_response = ?,
          updated_at = datetime('now')
      WHERE external_reference = ?
    `,
  )
    .bind(preferenceId, initPoint, JSON.stringify(preference), externalReference)
    .run();

  if (!initPoint) {
    return json({ error: 'mercado_pago_sin_url', status: 502 }, 502);
  }

  return json({
    init_point: initPoint,
    transaction_id: externalReference,
  });
};

const getRuntime = async (locals: App.Locals) => {
  if (import.meta.env.ASTRO_SANDBOX) {
    return { env: locals.runtime?.env as Env };
  }

  const { env } = (await import('cloudflare:workers')) as CloudflareWorkersModule;
  return { env };
};
