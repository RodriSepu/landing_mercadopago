/// <reference path="../.astro/types.d.ts" />
/// <reference types="@cloudflare/workers-types" />

interface Env {
  BASIC_AUTH_PASSWORD: string;
  BASIC_AUTH_USER: string;
  DB: D1Database;
  MP_ACCESS_TOKEN: string;
  MP_FORCE_SANDBOX?: string;
  MP_TEST_PAYER_EMAIL?: string;
  MP_WEBHOOK_SECRET: string;
}

declare namespace Cloudflare {
  interface Env extends globalThis.Env {}
}

declare namespace App {
  interface Locals {
    runtime?: {
      env: Env;
    };
  }
}

