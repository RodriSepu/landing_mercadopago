import type { APIRoute } from 'astro';

type DeudorRow = {
  copesaplan: string | null;
  nombre: string | null;
  monto: number | null;
};

type DeudorItem = {
  c_invoice_id: number;
  monto: number;
  fecha_docto: string | null;
  fecha_vencimiento: string | null;
};

type DeudorResponseItem = DeudorItem & {
  dias_desde_compromiso: number | null;
};

type CloudflareWorkersModule = {
  env: Env;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const cleanRut = (rut: string) => rut.replace(/[.\s]/g, '').toUpperCase();

const normalizeRut = (rut: string) => {
  const cleaned = cleanRut(rut);
  const match = cleaned.match(/^(\d{7,9})-?([\dK])$/);

  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}`;
};

const isValidRut = (rut: string) => {
  const normalized = normalizeRut(rut);

  if (!normalized) {
    return false;
  }

  const [body, checkDigit] = normalized.split('-');
  let sum = 0;
  let multiplier = 2;

  for (let index = body.length - 1; index >= 0; index -= 1) {
    sum += Number(body[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const expectedValue = 11 - (sum % 11);
  const expectedDigit =
    expectedValue === 11 ? '0' : expectedValue === 10 ? 'K' : String(expectedValue);

  return expectedDigit === checkDigit;
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

const filterItems = (rows: Array<{
  contrato: string | null;
  nombre_cliente: string | null;
  saldo_pendiente: number | null;
  fecha_docto: string | null;
  fecha_vencimiento: string | null;
  c_invoice_id: number;
}>) => {
  const today = new Date();
  const cobrables: DeudorResponseItem[] = [];
  const gestion: DeudorResponseItem[] = [];

  for (const row of rows) {
    const compromiso = parseDateOnly(row.fecha_docto);
    const diasDesdeCompromiso =
      compromiso ? diffInDays(compromiso, today) : null;
    const item = {
      c_invoice_id: row.c_invoice_id,
      fecha_docto: row.fecha_docto,
      fecha_vencimiento: row.fecha_vencimiento,
      monto: Math.round(Number(row.saldo_pendiente ?? 0)),
      dias_desde_compromiso: diasDesdeCompromiso,
    };

    if (diasDesdeCompromiso !== null && diasDesdeCompromiso > 20) {
      cobrables.push(item);
    } else {
      gestion.push(item);
    }
  }

  return {
    cobrables,
    gestion,
  };
};

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  if (request.headers.get('content-type')?.includes('application/json') !== true) {
    return json({ error: 'content_type_invalido' }, 415);
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
    if (!normalized || !isValidRut(normalized)) {
      return json({ error: 'rut_invalido' }, 400);
    }
    rut = normalized;
  } else if ('email' in payload && typeof payload.email === 'string') {
    const trimmed = payload.email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      return json({ error: 'email_invalido' }, 400);
    }
    email = trimmed.toLowerCase();
  } else {
    return json({ error: 'datos_insuficientes' }, 400);
  }

  const db = await getDatabase(locals);

  if (!db) {
    return json({ error: 'db_no_configurada' }, 503);
  }

  let result: DeudorRow | null = null;
  let items: DeudorResponseItem[] = [];
  let gestionItems: DeudorResponseItem[] = [];

  try {
    if (rut) {
      const rows = await db
        .prepare(
          `
          SELECT
              contrato,
              nombre_cliente,
              saldo_pendiente,
              fecha_docto,
              fecha_vencimiento,
              c_invoice_id
            FROM cgc_deudas_reales
            WHERE identificador_cliente = ?
              AND saldo_pendiente > 0
            ORDER BY fecha_docto DESC, c_invoice_id DESC
          `,
        )
        .bind(rut)
        .all<{
          contrato: string | null;
          nombre_cliente: string | null;
          saldo_pendiente: number | null;
          fecha_docto: string | null;
          fecha_vencimiento: string | null;
          c_invoice_id: number;
        }>();

      const filtered = filterItems(rows.results);
      items = filtered.cobrables;
      gestionItems = filtered.gestion;

      result = {
        copesaplan: rows.results[0]?.contrato ?? null,
        nombre: rows.results[0]?.nombre_cliente ?? null,
        monto: items.reduce((sum, item) => sum + item.monto, 0),
      };
    } else if (email) {
      const rows = await db
        .prepare(
          `
          SELECT
              contrato,
              nombre_cliente,
              saldo_pendiente,
              fecha_docto,
              fecha_vencimiento,
              c_invoice_id
            FROM cgc_deudas_reales
            WHERE LOWER(email) = ?
              AND saldo_pendiente > 0
            ORDER BY fecha_docto DESC, c_invoice_id DESC
          `,
        )
        .bind(email)
        .all<{
          contrato: string | null;
          nombre_cliente: string | null;
          saldo_pendiente: number | null;
          fecha_docto: string | null;
          fecha_vencimiento: string | null;
          c_invoice_id: number;
        }>();

      const filtered = filterItems(rows.results);
      items = filtered.cobrables;
      gestionItems = filtered.gestion;

      result = {
        copesaplan: rows.results[0]?.contrato ?? null,
        nombre: rows.results[0]?.nombre_cliente ?? null,
        monto: items.reduce((sum, item) => sum + item.monto, 0),
      };
    }
  } catch {
    return json({ error: 'db_error' }, 503);
  }

  if (!result?.nombre || (!result.monto && gestionItems.length === 0) || (items.length === 0 && gestionItems.length === 0)) {
    return json({ found: false });
  }

  return json({
    copesaplan: result.copesaplan,
    items,
    gestion_items: gestionItems,
    found: true,
    nombre: result.nombre,
    monto: Math.round(Number(result.monto)),
  });
};

const getDatabase = async (locals: App.Locals) => {
  if (import.meta.env.ASTRO_SANDBOX) {
    return (locals.runtime?.env ?? process.env).DB as D1Database | undefined;
  }

  try {
    const { env } = (await import('cloudflare:workers')) as CloudflareWorkersModule;
    return env.DB;
  } catch {
    return locals.runtime?.env?.DB;
  }
};
