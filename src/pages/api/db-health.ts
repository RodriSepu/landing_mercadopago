import type { APIRoute } from 'astro';

type CloudflareWorkersModule = {
  env: Env;
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

export const GET: APIRoute = async ({ locals }) => {
  const db = await getDatabase(locals);

  if (!db) {
    return json({ ok: false, error: 'db_no_configurada' }, 503);
  }

  try {
    const table = await db
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name IN ('cgc_deudas_reales', 'mp_payment_transactions', 'mp_payment_events', 'pagos')
          ORDER BY name
        `,
      )
      .all<{ name: string }>();

    return json({
      ok: true,
      tables: table.results.map((row) => row.name),
    });
  } catch (error) {
    return json(
      {
        ok: false,
        error: 'db_error',
        message: error instanceof Error ? error.message : 'unknown',
      },
      503,
    );
  }
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
