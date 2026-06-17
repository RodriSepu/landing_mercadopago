import type { APIRoute } from 'astro';

type DeudorRow = {
  copesaplan: string | null;
  nombre: string | null;
  monto: number | null;
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
  const match = cleaned.match(/^(\d{7,8})-?([\dK])$/);

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

  try {
    if (rut) {
      result = await db
        .prepare(
          `
            SELECT
              MAX(copesaplan) AS copesaplan,
              MAX(nombre) AS nombre,
              SUM(deuda_pendiente) AS monto
            FROM cobranza_efectiva
            WHERE rut_contratante = ?
              AND deuda_pendiente > 0
          `,
        )
        .bind(rut)
        .first<DeudorRow>();
    } else if (email) {
      result = await db
        .prepare(
          `
            SELECT
              MAX(copesaplan) AS copesaplan,
              MAX(nombre) AS nombre,
              SUM(deuda_pendiente) AS monto
            FROM cobranza_efectiva
            WHERE LOWER(email) = ?
              AND deuda_pendiente > 0
          `,
        )
        .bind(email)
        .first<DeudorRow>();
    }
  } catch {
    return json({ error: 'db_error' }, 503);
  }

  if (!result?.nombre || !result.monto) {
    return json({ found: false });
  }

  return json({
    copesaplan: result.copesaplan,
    found: true,
    nombre: result.nombre,
    monto: Math.round(Number(result.monto)),
  });
};

const getDatabase = async (locals: App.Locals) => {
  if (import.meta.env.ASTRO_SANDBOX) {
    return locals.runtime?.env?.DB;
  }

  try {
    const { env } = (await import('cloudflare:workers')) as CloudflareWorkersModule;
    return env.DB;
  } catch {
    return locals.runtime?.env?.DB;
  }
};
