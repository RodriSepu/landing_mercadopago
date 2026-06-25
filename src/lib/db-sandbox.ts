import fs from 'fs';
import path from 'path';

let dbMockInstance: any = null;

export async function initSandboxDatabase() {
  if ((globalThis as any).process?.env?.DB === "[object Object]") {
    delete (globalThis as any).process.env.DB;
  }

  if (dbMockInstance) {
    return dbMockInstance;
  }

  try {
    const { DatabaseSync } = await import('node:sqlite');
    const dbDir = path.resolve(process.cwd(), '.wrangler');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'sandbox.db');
    const sqliteDb = new DatabaseSync(dbPath);

    // Create tables
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS cgc_deudas_reales (
          org_name TEXT,
          c_invoice_id INTEGER PRIMARY KEY,
          tipo_docto TEXT,
          docto_adempiere TEXT,
          fecha_docto TEXT,
          fecha_vencimiento TEXT,
          contrato TEXT,
          identificador_cliente TEXT,
          nombre_cliente TEXT,
          email TEXT,
          telefono TEXT,
          termino_pago TEXT,
          divisa TEXT,
          monto_neto INTEGER,
          monto_total INTEGER,
          saldo_pendiente INTEGER,
          monto_pagado INTEGER,
          folio_legal TEXT,
          estado_cobranza TEXT,
          fecha_estado_cobranza TEXT,
          cobrado TEXT,
          ispaid TEXT,
          enviado_erp TEXT,
          fecha_envio_erp TEXT,
          created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS pagos (
          id TEXT PRIMARY KEY,
          source TEXT,
          external_reference TEXT,
          mp_payment_id TEXT,
          mp_preference_id TEXT,
          mp_merchant_order_id TEXT,
          status TEXT,
          status_detail TEXT,
          payment_type TEXT,
          payment_method_id TEXT,
          transaction_amount NUMERIC,
          query_params TEXT,
          raw_payment_response TEXT,
          raw_webhook_payload TEXT,
          created_at TEXT,
          updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS mp_payment_transactions (
          id TEXT PRIMARY KEY,
          rut TEXT,
          contrato TEXT,
          copesaplan TEXT,
          nombre TEXT,
          email TEXT,
          amount NUMERIC,
          status TEXT,
          external_reference TEXT,
          raw_preference_response TEXT,
          c_invoice_id TEXT,
          docto_adempiere TEXT,
          init_point TEXT,
          mp_preference_id TEXT,
          mp_payment_id TEXT,
          raw_payment_response TEXT,
          created_at TEXT,
          updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS mp_payment_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          mp_payment_id TEXT,
          event_type TEXT,
          action TEXT,
          live_mode INTEGER,
          signature_valid INTEGER,
          payload TEXT,
          created_at TEXT
      );
    `);

    // Check if we need to seed the cgc_deudas_reales table
    const stmtCheck = sqliteDb.prepare("SELECT COUNT(*) AS count FROM cgc_deudas_reales");
    const countRes = stmtCheck.all() as any[];
    const count = countRes[0]?.count ?? 0;

    if (count === 0) {
      console.log("[Sandbox DB] Seeding database...");
      let seeded = false;
      const exportPath = "/Users/rodri/Proyectos/panel_hold/cobranza_efectiva_export.json";

      const seedRecords = (records: any[]) => {
        const insertStmt = sqliteDb.prepare(`
          INSERT OR IGNORE INTO cgc_deudas_reales (
            org_name,
            c_invoice_id,
            tipo_docto,
            docto_adempiere,
            fecha_docto,
            fecha_vencimiento,
            contrato,
            identificador_cliente,
            nombre_cliente,
            email,
            telefono,
            termino_pago,
            divisa,
            monto_neto,
            monto_total,
            saldo_pendiente,
            monto_pagado,
            folio_legal,
            estado_cobranza,
            fecha_estado_cobranza,
            cobrado,
            ispaid,
            enviado_erp,
            fecha_envio_erp,
            created_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
        `);

        try {
          sqliteDb.exec("BEGIN TRANSACTION");
          for (const r of records) {
            const org_name = r.org_name || 'Copesa';
            let c_invoice_id = r.c_invoice_id ? parseInt(r.c_invoice_id, 10) : parseInt(r.docto_adempiere || r.contrato, 10);
            if (isNaN(c_invoice_id)) {
              c_invoice_id = Math.floor(Math.random() * 1000000000);
            }
            const tipo_docto = r.tipo_docto || 'Boleta';
            const docto_adempiere = r.docto_adempiere || r.contrato || null;

            const today = new Date();
            const fechaVencimientoObj = r.fecha_vencimiento ? new Date(r.fecha_vencimiento + 'T00:00:00') : new Date(today.getTime() - (r.dias_mora ?? 30) * 24 * 60 * 60 * 1000);
            const fechaDoctoObj = r.fecha_docto ? new Date(r.fecha_docto + 'T00:00:00') : new Date(fechaVencimientoObj.getTime() - 30 * 24 * 60 * 60 * 1000);

            const fecha_docto = r.fecha_docto || fechaDoctoObj.toISOString().split('T')[0];
            const fecha_vencimiento = r.fecha_vencimiento || fechaVencimientoObj.toISOString().split('T')[0];

            const contrato = r.contrato ?? null;
            const identificador_cliente = r.rut_contratante ?? null;
            const nombre_cliente = r.nombre ?? null;
            const email = r.email ?? null;
            const telefono = r.telefono ?? null;
            const termino_pago = r.termino_de_pago ?? null;
            const divisa = r.divisa || 'CLP';
            const monto_neto = r.monto_neto !== undefined ? r.monto_neto : (r.deuda_pendiente ?? 0);
            const monto_total = r.monto_total !== undefined ? r.monto_total : (r.deuda_pendiente ?? 0);
            const saldo_pendiente = r.saldo_pendiente !== undefined ? r.saldo_pendiente : (r.deuda_pendiente ?? 0);
            const monto_pagado = r.monto_pagado !== undefined ? r.monto_pagado : 0;
            const folio_legal = r.folio_legal !== undefined ? r.folio_legal : (r.contrato ?? null);
            const estado_cobranza = r.estado_cobranza || (r.estado_documento ?? null);
            const fecha_estado_cobranza = r.fecha_estado_cobranza || r.updated_at || new Date().toISOString();
            const cobrado = r.cobrado || 'N';
            const ispaid = r.ispaid || 'N';
            const enviado_erp = r.enviado_erp || 'N';
            const fecha_envio_erp = r.fecha_envio_erp !== undefined ? r.fecha_envio_erp : null;
            const created_at = r.created_at || r.updated_at || new Date().toISOString();

            insertStmt.run(
              org_name,
              c_invoice_id,
              tipo_docto,
              docto_adempiere,
              fecha_docto,
              fecha_vencimiento,
              contrato,
              identificador_cliente,
              nombre_cliente,
              email,
              telefono,
              termino_pago,
              divisa,
              monto_neto,
              monto_total,
              saldo_pendiente,
              monto_pagado,
              folio_legal,
              estado_cobranza,
              fecha_estado_cobranza,
              cobrado,
              ispaid,
              enviado_erp,
              fecha_envio_erp,
              created_at
            );
          }
          sqliteDb.exec("COMMIT");
        } catch (err) {
          try {
            sqliteDb.exec("ROLLBACK");
          } catch {}
          throw err;
        }
      };

      if (fs.existsSync(exportPath)) {
        try {
          const exportData = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));
          let records = exportData[0]?.results ?? [];
          if (records.length > 0) {
            // Filter out Ignacio's and Alegria's original records
            records = records.filter((r: any) => r.rut_contratante !== "15825969-9" && r.rut_contratante !== "16745326-0");

            // Push custom documents for Ignacio and Alegria
            records.push(
              {
                org_name: "COMERCIALIZADORA GC SA",
                c_invoice_id: "6846078",
                contrato: "5101285",
                termino_de_pago: "MERCADOPAGO",
                estado_documento: "CO",
                rut_contratante: "15825969-9",
                nombre: "IGNACIO RETAMAL",
                email: "iretamalf@gmail.com",
                deuda_pendiente: 16990,
                docto_adempiere: "24521725",
                fecha_docto: "2026-04-24",
                fecha_vencimiento: "2026-04-24",
                telefono: "+56978885954",
                monto_neto: 14277,
                monto_total: 16990,
                saldo_pendiente: 16990,
                estado_cobranza: "ENVIADO",
                fecha_estado_cobranza: "2026-04-23T00:00:00",
                created_at: "2026-06-25T07:05:08.286105"
              },
              {
                org_name: "COMERCIALIZADORA GC SA",
                c_invoice_id: "6846079",
                contrato: "5101285",
                termino_de_pago: "MERCADOPAGO",
                estado_documento: "CO",
                rut_contratante: "15825969-9",
                nombre: "IGNACIO RETAMAL",
                email: "iretamalf@gmail.com",
                deuda_pendiente: 16990,
                docto_adempiere: "24556062",
                fecha_docto: "2026-05-24",
                fecha_vencimiento: "2026-05-24",
                telefono: "+56978885954",
                monto_neto: 14277,
                monto_total: 16990,
                saldo_pendiente: 16990,
                estado_cobranza: "ENVIADO",
                fecha_estado_cobranza: "2026-05-23T00:00:00",
                created_at: "2026-06-25T07:05:08.286105"
              },
              {
                org_name: "COMERCIALIZADORA GC SA",
                c_invoice_id: "6846080",
                contrato: "5101285",
                termino_de_pago: "MERCADOPAGO",
                estado_documento: "CO",
                rut_contratante: "15825969-9",
                nombre: "IGNACIO RETAMAL",
                email: "iretamalf@gmail.com",
                deuda_pendiente: 16990,
                docto_adempiere: "24588701",
                fecha_docto: "2026-06-24",
                fecha_vencimiento: "2026-06-24",
                telefono: "+56978885954",
                monto_neto: 14277,
                monto_total: 16990,
                saldo_pendiente: 16990,
                estado_cobranza: "ENVIADO",
                fecha_estado_cobranza: "2026-06-23T00:00:00",
                created_at: "2026-06-25T07:05:08.286105"
              },
              {
                org_name: "COMERCIALIZADORA GC SA",
                c_invoice_id: "5307607",
                contrato: "5307444",
                termino_de_pago: "MERCADOPAGO",
                estado_documento: "CO",
                rut_contratante: "16745326-0",
                nombre: "IGNACIO ALEGRIA",
                email: "cliente@correo.cl",
                deuda_pendiente: 16990,
                docto_adempiere: "24537898",
                fecha_docto: "2026-05-07",
                fecha_vencimiento: "2026-05-07",
                telefono: "+56978885954",
                monto_neto: 14277,
                monto_total: 16990,
                saldo_pendiente: 16990,
                estado_cobranza: "ENVIADO",
                fecha_estado_cobranza: "2026-05-06T00:00:00",
                created_at: "2026-06-25T07:05:08.286105"
              },
              {
                org_name: "COMERCIALIZADORA GC SA",
                c_invoice_id: "5307608",
                contrato: "5307444",
                termino_de_pago: "MERCADOPAGO",
                estado_documento: "CO",
                rut_contratante: "16745326-0",
                nombre: "IGNACIO ALEGRIA",
                email: "cliente@correo.cl",
                deuda_pendiente: 16990,
                docto_adempiere: "24571422",
                fecha_docto: "2026-06-07",
                fecha_vencimiento: "2026-06-07",
                telefono: "+56978885954",
                monto_neto: 14277,
                monto_total: 16990,
                saldo_pendiente: 16990,
                estado_cobranza: "ENVIADO",
                fecha_estado_cobranza: "2026-06-06T00:00:00",
                created_at: "2026-06-25T07:05:08.286105"
              }
            );

            if (!records.some((r: any) => r.rut_contratante === "15842003-1")) {
              records.push({
                contrato: "1212120",
                termino_de_pago: "MERCADOPAGO",
                estado_documento: "CO",
                rut_contratante: "15842003-1",
                nombre: "Rodrigo Sepulveda",
                email: "rodrigo.sepulveda@grupocopesa.cl",
                deuda_pendiente: 10,
                dias_mora: 30,
                updated_at: new Date().toISOString()
              });
            }
            seedRecords(records);
            seeded = true;
            console.log(`[Sandbox DB] Seeded ${records.length} records from panel_hold export.`);
          }
        } catch (e) {
          console.error("Error reading/parsing cobranza_efectiva_export.json:", e);
        }
      }

      if (!seeded) {
        const fallbackRecords = [
          {
            contrato: "5234151",
            termino_de_pago: "ONECLICK",
            estado_documento: "CO",
            rut_contratante: "4019973-K",
            nombre: "NELSON DEL VILLAR",
            email: "nelsondelvillarm@gmail.com",
            deuda_pendiente: 20660,
            dias_mora: 26,
            updated_at: new Date().toISOString()
          },
          {
            contrato: "1212120",
            termino_de_pago: "MERCADOPAGO",
            estado_documento: "CO",
            rut_contratante: "15842003-1",
            nombre: "Rodrigo Sepulveda",
            email: "rodrigo.sepulveda@grupocopesa.cl",
            deuda_pendiente: 10,
            dias_mora: 30,
            updated_at: new Date().toISOString()
          },
          {
            contrato: "9999999",
            termino_de_pago: "MERCADOPAGO",
            estado_documento: "CO",
            rut_contratante: "11643338-9",
            nombre: "Test User",
            email: "test.user@grupocopesa.cl",
            deuda_pendiente: 5000,
            dias_mora: 35,
            updated_at: new Date().toISOString()
          }
        ];
        seedRecords(fallbackRecords);
        console.log(`[Sandbox DB] Seeded ${fallbackRecords.length} fallback records.`);
      }
    }

    // Build the mock D1Database object
    class SandboxD1PreparedStatement {
      constructor(private sqliteDb: any, private query: string, private params: any[] = []) {}

      bind(...args: any[]) {
        return new SandboxD1PreparedStatement(this.sqliteDb, this.query, args);
      }

      async all() {
        try {
          const stmt = this.sqliteDb.prepare(this.query);
          const results = stmt.all(...this.params);
          return { results, success: true };
        } catch (e: any) {
          console.error("SQL Sandbox Error (all):", e, "Query:", this.query, "Params:", this.params);
          throw e;
        }
      }

      async run() {
        try {
          const stmt = this.sqliteDb.prepare(this.query);
          const res = stmt.run(...this.params);
          return { success: true, changes: res.changes, lastInsertRowid: res.lastInsertRowid };
        } catch (e: any) {
          console.error("SQL Sandbox Error (run):", e, "Query:", this.query, "Params:", this.params);
          throw e;
        }
      }

      async first() {
        try {
          const stmt = this.sqliteDb.prepare(this.query);
          const results = stmt.all(...this.params);
          return results[0] ?? null;
        } catch (e: any) {
          console.error("SQL Sandbox Error (first):", e, "Query:", this.query, "Params:", this.params);
          throw e;
        }
      }
    }

    dbMockInstance = {
      prepare(query: string) {
        return new SandboxD1PreparedStatement(sqliteDb, query);
      }
    };

    return dbMockInstance;
  } catch (error) {
    console.error("Error setting up Sandbox Database:", error);
    return null;
  }
}
