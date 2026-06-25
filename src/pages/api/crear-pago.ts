import type { APIRoute } from 'astro';

type CloudflareWorkersModule = {
  env: Env;
};

type DebtRow = {
  c_invoice_id: string | null;
  contrato: string | null;
  copesaplan: string | null;
  docto_adempiere: string | null;
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
  docto_adempiere: string | null;
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

const getChileDateParts = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };
};

const parseDateParts = (value: string | null) => {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
};

const getDaysSinceCompromiso = (compromisoStr: string | null, todayDate: Date = new Date()) => {
  const compParts = parseDateParts(compromisoStr);
  if (!compParts) return null;

  const todayParts = getChileDateParts(todayDate);

  const compUtc = Date.UTC(compParts.year, compParts.month - 1, compParts.day);
  const todayUtc = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);

  return Math.floor((todayUtc - compUtc) / (1000 * 60 * 60 * 24));
};

const getPayableDebtItems = (rows: DebtItemRow[]) => {
  const today = new Date();

  return rows.filter((row) => {
    const diasDesdeCompromiso = getDaysSinceCompromiso(row.fecha_docto, today);
    if (diasDesdeCompromiso === null) {
      return false;
    }

    return diasDesdeCompromiso >= 20;
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

  try {
    let payload: { rut?: unknown; email?: unknown; contrato?: unknown; docto_adempiere?: unknown };

    try {
      payload = await request.json();
    } catch {
      return json({ error: 'json_invalido' }, 400);
    }

    let rut: string | null = null;
    let email: string | null = null;
    let contratoPayload: string | null = null;
    let doctoAdempierePayload: string | null = null;
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

    if ('contrato' in payload && typeof payload.contrato === 'string') {
      contratoPayload = payload.contrato.trim() || null;
    }
    if ('docto_adempiere' in payload && typeof payload.docto_adempiere === 'string') {
      doctoAdempierePayload = payload.docto_adempiere.trim() || null;
    }

    let debt: DebtRow | null = null;
    let debtItems: DebtItemRow[] = [];

    if (rut) {
      const rows = await env.DB.prepare(
        `
          SELECT
            MAX(c_invoice_id) AS c_invoice_id,
            MAX(contrato) AS contrato,
            MAX(contrato) AS copesaplan,
            MAX(docto_adempiere) AS docto_adempiere,
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
            saldo_pendiente AS monto,
            docto_adempiere
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
            MAX(c_invoice_id) AS c_invoice_id,
            MAX(contrato) AS contrato,
            MAX(contrato) AS copesaplan,
            MAX(docto_adempiere) AS docto_adempiere,
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
            saldo_pendiente AS monto,
            docto_adempiere
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

    const contratos = Array.from(new Set(payableDebtItems.map((item) => item.contrato).filter(Boolean)));
    const contratoFallback = contratos.length > 0 ? contratos.join(', ') : null;
    const resolvedContrato = contratoPayload ?? contratoFallback ?? debt.contrato ?? '';

    const adempieres = payableDebtItems.map((item) => item.docto_adempiere || item.contrato).filter(Boolean);
    const doctoAdempiereFallback = adempieres.length > 0 ? adempieres.join(', ') : null;
    const resolvedDoctoAdempiere = doctoAdempierePayload ?? doctoAdempiereFallback ?? debt.docto_adempiere ?? '';

    const externalReference = crypto.randomUUID();
    const origin = new URL(request.url).origin;
    const notificationUrl = `${origin}/api/mercadopago/webhook`;
    const idempotencyKey = crypto.randomUUID();
    const usesTestAccessToken = env.MP_ACCESS_TOKEN.startsWith('TEST-');
    const usesSandboxCheckout = usesTestAccessToken || env.MP_FORCE_SANDBOX === 'true';
    const payerEmail = debt.email?.trim() || undefined;
    const productName = 'Producto Copesa';
    const documentNumber = resolvedDoctoAdempiere || resolvedContrato;
    const documentLabel = documentNumber || null;
    const isMultiple = documentNumber.includes(',');
    const checkoutItemTitle = documentNumber
      ? `${isMultiple ? 'Documentos' : 'Documento'} ${documentNumber}`
      : productName;
    const items = usesSandboxCheckout
      ? [
          {
            currency_id: 'CLP',
            description: `Prueba sandbox ${isMultiple ? 'documentos' : 'documento'} ${documentNumber}`,
            id: documentNumber || 'test-20',
            quantity: 1,
            title: checkoutItemTitle,
            unit_price: amount,
          },
        ]
      : [
          {
            currency_id: 'CLP',
            description: `Pago de ${isMultiple ? 'documentos' : 'documento'} ${documentNumber} - ${productName}`,
            id: documentNumber,
            quantity: 1,
            title: checkoutItemTitle,
            unit_price: amount,
          },
        ];

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
        contrato: resolvedContrato,
        copesaplan: null,
        regla_de_pago: null,
        docto_adempiere: resolvedDoctoAdempiere || documentLabel,
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

    try {
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
            raw_preference_response,
            c_invoice_id,
            docto_adempiere,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `,
      )
        .bind(
          externalReference,
          debt.identificador_cliente ?? rut,
          resolvedContrato,
          null,
          debt.nombre,
          debt.email,
          amount,
          'preference_creating',
          externalReference,
          JSON.stringify(preferenceBody),
          null,
          resolvedDoctoAdempiere || documentLabel,
        )
        .run();
    } catch (error) {
      console.error('mp_payment_transactions_insert_failed', error);
    }

    let preference: Record<string, unknown>;

    if (import.meta.env.ASTRO_SANDBOX) {
      preference = {
        id: `mock-pref-${crypto.randomUUID()}`,
        sandbox_init_point: `${origin}/pago/resultado?status=success&preference_id=mock-pref&ref=${externalReference}`,
        init_point: `${origin}/pago/resultado?status=success&preference_id=mock-pref&ref=${externalReference}`,
      };
    } else {
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

      preference = (await mpResponse.json()) as Record<string, unknown>;

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
      docto_adempiere: resolvedDoctoAdempiere || documentLabel,
    });
  } catch (error) {
    console.error('crear_pago_unhandled_error', error);
    return json({ error: 'error_interno_crear_pago', status: 500 }, 500);
  }
};

const getRuntime = async (locals: App.Locals) => {
  if (import.meta.env.ASTRO_SANDBOX) {
    const { initSandboxDatabase } = await import('../../lib/db-sandbox');
    const db = await initSandboxDatabase();
    return {
      env: {
        DB: db,
        MP_ACCESS_TOKEN: 'TEST-MOCK-TOKEN',
        MP_FORCE_SANDBOX: 'true',
        MP_WEBHOOK_SECRET: 'test-secret',
        BASIC_AUTH_USER: 'admin',
        BASIC_AUTH_PASSWORD: 'password'
      } as unknown as Env
    };
  }

  const { env } = (await import(/* @vite-ignore */ 'cloudflare:workers')) as CloudflareWorkersModule;
  return { env };
};
