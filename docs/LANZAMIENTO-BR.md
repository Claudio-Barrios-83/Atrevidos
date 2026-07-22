# Lanzamiento en Brasil — Atrevidos Premium (Mercado Pago)

Checklist de producción para el operador en **Brasil**. Argentina (CUIT, ARS, Ley 25.326) queda fuera de alcance hasta que te mudes o abras entidad allí.

## Estado actual del código

| Componente | Estado |
|---|---|
| Paywall UI (`/subscription`) | ✅ Funcional en modo mock |
| Tabla `subscriptions` + RLS | ✅ Migrada en Supabase |
| Adaptador mock | ✅ Activo sin credenciales |
| Adaptador Mercado Pago | 🟡 Stub listo para BR (BRL, Preapproval) |
| Edge Function `payments-webhook` | 🟡 Responde 200; aplica cambios cuando hay secrets |

Mientras no existan credenciales reales, la app usa el adaptador **mock** (activación instantánea vía RPC). Al configurar Mercado Pago Brasil, la fábrica en `src/lib/payments/index.ts` cambia automáticamente al adaptador real.

---

## 1. Cuenta Mercado Pago Brasil (sin CUIT)

En Brasil **no se usa CUIT** (es documento argentino). Para cobrar con Mercado Pago necesitás:

### Opción A — Pessoa física (CPF)

- Cuenta Mercado Pago personal verificada con **CPF**.
- Ideal para beta / primeros meses con volumen bajo.
- Límite de facturación según políticas de MP; revisar en [Mercado Pago BR](https://www.mercadopago.com.br).

### Opción B — MEI ou CNPJ (recomendado para producción)

- **MEI** (Microempreendedor Individual): CPF + registro MEI — facturación formal simplificada.
- **CNPJ** (empresa): conta jurídica Mercado Pago para mayor volumen y notas fiscais.
- Portal de desarrolladores: [developers.mercadopago.com.br](https://www.mercadopago.com.br/developers)

### Opción C — Conta Mercado Pago pessoa jurídica

- Si ya tenés CNPJ activo, abrí conta **Pessoa Jurídica** en Mercado Pago.
- Creá una **aplicación** en el panel de developers y obtené:
  - **Access Token** de producción (y de test para sandbox)
  - **Public Key** (solo si integrás Checkout Pro en frontend; hoy usamos server-side)

> **No bloquees el lanzamiento beta** esperando CNPJ. Podés empezar con CPF + sandbox, luego migrar a MEI/CNPJ antes de escalar marketing pagado.

---

## 2. Variables de entorno (servidor / Supabase)

Agregar en `.env` del host Docker **y** en secrets de la Edge Function (nunca `PUBLIC_` / `VITE_`):

```bash
# Mercado Pago Brasil
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...        # Token de producción (o TEST-... en sandbox)
MERCADOPAGO_PLAN_ID=...                     # ID del plan Preapproval creado en BRL
MERCADOPAGO_WEBHOOK_SECRET=...              # Secreto para validar x-signature
MERCADOPAGO_COUNTRY=BR                      # Default del adaptador (Brasil primero)
MERCADOPAGO_CURRENCY=BRL                    # Moneda del plan recurrente
```

Opcional (URLs de retorno personalizadas):

```bash
MERCADOPAGO_BACK_URL=https://atrevido55.duckdns.org/subscription?checkout=return
```

La fábrica `getPaymentsAdapter()` activa Mercado Pago real cuando existen `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_PLAN_ID` y `MERCADOPAGO_WEBHOOK_SECRET`.

---

## 3. Crear plan de suscripción (Preapproval) en BRL

Ejemplo vía API (ajustá el monto; referencia UI: **R$ 19,90/mes**):

```bash
curl -X POST 'https://api.mercadopago.com/preapproval_plan' \
  -H 'Authorization: Bearer $MERCADOPAGO_ACCESS_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "reason": "Atrevidos Premium",
    "auto_recurring": {
      "frequency": 1,
      "frequency_type": "months",
      "transaction_amount": 19.90,
      "currency_id": "BRL"
    },
    "back_url": "https://atrevido55.duckdns.org/subscription?checkout=return"
  }'
```

Guardá el `id` de la respuesta en `MERCADOPAGO_PLAN_ID`.

Documentación: [Suscripciones — Mercado Pago BR](https://www.mercadopago.com.br/developers/es/docs/subscriptions/integration-configuration/subscription-management)

### Checkout Preference (pagos únicos)

Para **pagos one-shot** (no suscripción), la API es `/checkout/preferences` con `items[].currency_id: "BRL"`. Atrevidos Premium usa **Preapproval** (recurrente); Preference queda documentada por si más adelante vendés packs puntuales.

---

## 4. Webhook en Supabase

1. Desplegar la función:
   ```bash
   supabase functions deploy payments-webhook --no-verify-jwt
   ```
2. Configurar secrets en el proyecto Supabase:
   ```bash
   supabase secrets set MERCADOPAGO_ACCESS_TOKEN=... MERCADOPAGO_WEBHOOK_SECRET=...
   ```
3. Registrar URL en Mercado Pago:
   ```
   https://<project-ref>.supabase.co/functions/v1/payments-webhook
   ```
4. Eventos relevantes: `subscription_preapproval`, `preapproval`.

---

## 5. Privacidad — LGPD (no Ley 25.326)

| Argentina (futuro) | Brasil (ahora) |
|---|---|
| Ley 25.326 de datos personales | **LGPD** (Lei 13.709/2018) |
| AAIP / registro opcional | ANPD — bases legales, consentimiento, DPO si aplica |
| Política en español | Política de privacidad en **portugués** (y español opcional) |

Checklist LGPD mínimo para beta:

- [ ] Política de privacidad publicada (`/privacy` o similar) mencionando finalidad, retención, derechos ARCO/LGPD.
- [ ] Checkbox de consentimiento en registro (tratamiento de datos + mayor de 18 años).
- [ ] Canal de contacto para ejercer derechos (email dedicado).
- [ ] Registro de bases legales para matches, mensajes y pagos (ejecución de contrato).
- [ ] No compartir datos con terceros sin base legal (Mercado Pago = procesador de pago).

---

## 6. Plan beta Brasil

### Fase 0 — Hoy (mock)

- [x] Paywall y gating premium operativos sin cobro real.
- [ ] Invitar 10–30 testers brasileños; recoger feedback en WhatsApp/Telegram.

### Fase 1 — Sandbox Mercado Pago

- [ ] Cuenta MP BR + app en developers.
- [ ] Plan Preapproval TEST en BRL.
- [ ] Secrets en Supabase + redeploy app.
- [ ] Probar flujo completo: checkout → webhook → `subscriptions.status = active`.
- [ ] Tarjetas de prueba MP BR ([documentación](https://www.mercadopago.com.br/developers/es/docs/your-integrations/test/cards)).

### Fase 2 — Producción limitada

- [ ] Token de producción + plan BRL real.
- [ ] Precio referencia: **R$ 19,90/mes** (ajustable en el plan Preapproval).
- [ ] Monitorear webhooks en logs de Supabase.
- [ ] Desactivar o restringir RPC mock en producción (opcional: policy que rechace `provider='mock'` salvo admins).

### Fase 3 — Escala

- [ ] Migrar a MEI/CNPJ si el volumen lo exige.
- [ ] Notas fiscais / NF-e según contador.
- [ ] Soporte en portugués en `/subscription` y emails transaccionales.

---

## 7. Verificación local

```bash
npm run test
npm run build
```

Con credenciales configuradas, confirmar que `getPaymentsAdapter()` devuelve `MercadoPagoPaymentsAdapter` (log temporal o test de integración).

---

## 8. Argentina (cuando corresponda)

No requiere acción ahora. Cuando estés en Argentina:

- CUIT + cuenta Mercado Pago AR (`developers.mercadopago.com.ar`).
- Plan en **ARS** (referencia UI: $2.990/mes).
- Ley 25.326 y política en español argentino.

El código ya contempla `MERCADOPAGO_COUNTRY=AR` y `MERCADOPAGO_CURRENCY=ARS` para ese momento.

---

## Referencias en el repo

- `src/lib/payments/mercadopago-adapter.ts` — integración Preapproval
- `src/lib/payments/index.ts` — selección mock vs real
- `supabase/functions/payments-webhook/index.ts` — webhook
- `src/routes/subscription/+page.svelte` — UI del plan
- `database/migrations/20260721_add_subscriptions_system.sql` — esquema
