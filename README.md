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

## SEO e GEO

`node scripts/build-seo.cjs` gera todo o conteúdo indexável a partir de quatro fontes: `products/catalog.json`, `content/search-guides.json` (guias nacionais e glossário), `content/local-seo.json` (cidades da Baixada Santista) e `content/articles.json` (matérias publicadas pelo cron editorial). Ele produz as páginas de produto, catálogo, guias, cidades, matérias, sobre e FAQ, mais `sitemap.xml`, `robots.txt`, `llms.txt`, `llms-full.txt`, `feed.xml`, `site.webmanifest`, a chave do IndexNow e `404.html` — e sincroniza o rodapé de `lib/site-footer.html` em todas as páginas estáticas.

Para publicar conteúdo novo, edite o JSON correspondente e rode o build; não edite o HTML gerado à mão, ele é sobrescrito.

`npm run verify:seo` roda junto do build e derruba a publicação se a verificação do Search Console quebrar, se o sitemap apontar para página inexistente, se faltar canonical/h1/JSON-LD, se dois títulos ficarem iguais ou se uma página de cidade virar página-ponte. Os detalhes estão em `docs/search-console.md`.

## Publicação automática

Os cron jobs compartilham `api/cron.js`. Os endereços `/api/marketing-cron` e `/api/editorial-cron` são preservados por rewrites em `vercel.json`, com os mesmos horários e autenticação por `CRON_SECRET`. Os handlers ficam em `lib/` para manter o deploy dentro do limite de 12 funções do plano Hobby. `npm test` verifica esse limite e o roteamento dos jobs.

`lib/editorial-cron-handler.js` publica uma matéria por semana sem intervenção humana: escolhe a pauta em `content/editorial-backlog.json`, pede o texto à API da Anthropic, valida com `lib/editorial.js` e commita em `content/articles.json` pela API do GitHub — o que dispara o build e transforma a matéria em página estática.

A regra que governa o sistema: o cron escreve **preparação, não notícia**. Qualquer texto que afirme vaga, data de prova, inscrição, salário ou número de edital é **descartado sem publicar**, porque um modelo de linguagem não tem como saber essas informações e inventá-las é *scaled content abuse* aos olhos do Google. O desenho completo, as travas e as variáveis de ambiente necessárias estão em `docs/publicacao-automatica.md`.

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
