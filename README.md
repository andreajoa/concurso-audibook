# Trilha Aprova

Plataforma digital para venda e entrega protegida de materiais de preparação para concursos públicos.

## Arquitetura atual

- **Vitrine multi-concurso** em `public/index.html`
- **Catálogo** em `products/catalog.json`
- **Checkout Stripe** híbrido: Embedded Checkout quando `STRIPE_PUBLISHABLE_KEY` está disponível, com fallback seguro para Checkout hospedado
- **Paywall** em `/acesso`, validando a sessão diretamente na Stripe antes de gerar URLs temporárias dos arquivos
- **R2 privado** para PDF e áudio; `r2.dev` público deve permanecer desativado
- **CRM** com visitas, leads, checkout, compras e consumo do conteúdo
- **E-mails** transacionais e marketing consentido
- **Dashboard** privado em `/dashboard.html`

## Estrutura de funil

Cada produto pode declarar no catálogo:

- `orderBump`
- `upsell`
- `crossSell`
- `downsell`

Enquanto existir apenas um produto, essas relações ficam vazias. Novos produtos podem ser conectados sem alterar o modelo de dados da plataforma.

## Produto ativo

`autores-ibam-2026` — Concurso Prefeitura de Santos • Banca IBAM.

Preço atual: **R$ 24,99**. Preço de referência: ~~R$ 49,99~~.

## Variáveis de ambiente

### Pagamento

- `STRIPE_SECRET_KEY` — obrigatória
- `STRIPE_PUBLISHABLE_KEY` — necessária para Embedded Checkout; sem ela o sistema usa Checkout hospedado
- `STRIPE_WEBHOOK_SECRET` — necessária para eventos assíncronos e e-mails pós-compra
- `APP_BASE_URL=https://concurso-audibook.vercel.app`

### Entrega R2

- `CLOUDFLARE_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET=apostila`

### E-mail

- `RESEND_API_KEY` ou SMTP configurado
- `EMAIL_FROM=Trilha Aprova <noreply@adhdautism.online>` se o domínio estiver verificado
- `UNSUBSCRIBE_SECRET`

### Dashboard e cron

- `DASHBOARD_PASSWORD`
- `DASHBOARD_SESSION_SECRET`
- `CRON_SECRET`

## Segurança

Não disponibilizar `materials.json` público. Não reativar o domínio público `r2.dev` do bucket pago. O navegador só recebe URLs temporárias depois que a Stripe confirma uma compra válida e não reembolsada.
