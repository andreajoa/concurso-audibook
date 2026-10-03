# Investigação da compra e entrega — SME SP 2026 PEIF

Auditado em 03/10/2026, aproximadamente 19h42 de São Paulo. Base atual: `origin/main`, commit `e5d93c1`, no worktree `concurso-audibook-peif-20261003`. O checkout local antigo estava em `1b09d31`, com quatro produtos; a base atual tem seis. Nenhum arquivo desse checkout antigo foi alterado. Esta investigação consultou código e endpoints públicos; não comprou, não enviou e-mails, não publicou objetos e não fez deploy.

## Resultado principal

A plataforma já vincula a compra ao produto e libera PDF, resumo e audiobook na mesma área. Para a nova apostila, o caminho existente exige capa privada, PDF privado, resumo MP3 e **oito capítulos MP3**, todos em uma pasta própria no R2. Existe, porém, uma pendência real na produção: o endpoint de configuração informa `webhook: false`. Sem o segredo do webhook, a entrega por e-mail depende do cliente retornar à página de confirmação ou usar a recuperação. Não há garantia de e-mail espontâneo se o navegador for fechado logo após pagar. Fontes: `lib/r2.js:49`, `api/checkout.js:25`, `api/stripe-webhook.js:62`, `api/order-status.js:24`.

## Contrato do catálogo

- `products/catalog.json` é a fonte de produto, preço, apresentação, capa e chaves de mídia. Na base auditada, seis produtos ativos custam R$ 24,99, com referência de R$ 49,99. O novo material pode seguir `priceCents: 2499` conforme orientação do proprietário. Fonte: `products/catalog.json`.
- A chave do objeto do JSON, `product.slug`, a pasta no R2, as URLs da página e a metadata do pagamento devem identificar o mesmo produto. `getSellableProduct` recusa produto desativado ou cuja prova já passou. `getProduct` continua entregando a compradores antigos depois da desativação. Fontes: `lib/catalog.js:8`, `lib/catalog.js:16`, `lib/exam-watch.js:150`.
- A configuração mínima inclui nome, nome curto, edição, público, moeda, preço, descrição, pontos de valor, `storefront.badge`, `storefront.cover3d`, `assets.coverKey`, `assets.pdfKey`, `assets.pdfDownloadName`, `assets.summary` e `assets.chapters`. Os capítulos têm ID, título, descrição, chave e nome de download. Fontes: `products/catalog.json:2`, `scripts/build-seo.cjs:2008`, `lib/r2.js:38`.
- A entrega exige exatamente **11 chaves únicas**: PDF + capa + resumo + oito capítulos. Cada chave deve começar com `<slug>/` e não conter `..`. Outro número de capítulos faz a área de compra falhar, mesmo que a cobrança tenha sido aprovada. Fontes: `lib/r2.js:49`, `tests/commerce-integrity.test.cjs:10`, `scripts/audit-study-media.py:59`.
- O pré-edital pode manter `exam: null`, sem inventar data. A regra de venda aceita produto ativo sem data. Fonte: `lib/exam-watch.js:150`.

## Compra, confirmação e acesso

1. O gerador de páginas produz a ficha pública e os dados do produto para `/comprar?produto=<slug>`. O controlador atualiza capa, descrição, público e preço pelo slug. Fontes: `scripts/build-seo.cjs:641`, `scripts/build-seo.cjs:2008`, `public/checkout-embedded.js:4`.
2. O cliente informa nome, e-mail e telefone. `POST /api/checkout` valida esses dados e consulta o catálogo no servidor; o cliente não escolhe o valor cobrado. Falhas no registro do CRM são capturadas e não impedem abrir o pagamento. Fonte: `api/checkout.js:59`.
3. A sessão Stripe é de pagamento único, cartão, quantidade 1, com validade de uma hora. A Checkout Session e o Payment Intent recebem `site_id=concurso_audiobook`, `project_id=concurso_audiobook` e `product_slug`. Um Price fixo é opcional: sem a variável indicada por `stripePriceEnv`, o backend usa `price_data` com o valor do catálogo. Fonte: `lib/checkout-hosted.js:16`, `lib/checkout-hosted.js:62`.
4. O retorno vai para `/obrigado.html?session_id=...`. A página consulta `/api/order-status`, mostra o link individual `/acesso?session_id=...` e permite copiá-lo. Não existe polling contínuo: se o pagamento ainda estiver pendente, a mensagem orienta atualizar a página. Fonte: `public/obrigado.html:1`.
5. A cada abertura da área, `verifyPurchase` consulta a Stripe, exige os dois identificadores do projeto, produto conhecido e pagamento aprovado. Compra de outro produto não concede acesso ao produto pedido. Reembolso total bloqueia novas aberturas. Fontes: `lib/stripe.js:89`, `lib/stripe.js:100`, `tests/commerce-integrity.test.cjs:25`.
6. A área entrega PDF embutido, abertura/download do PDF, player de resumo e capítulos, velocidade de reprodução e download de cada faixa. O cliente recebe somente os arquivos de seu produto; o slug recebido por query não substitui o slug da compra. Fonte: `api/access-page.js:148`, `api/access-page.js:160`.
7. Os links S3 para PDF e áudio duram seis horas; a capa dura 30 minutos. A página de acesso não tem prazo de seis horas: ao reabri-la com a mesma sessão válida, o servidor gera novos links. Acesso é por link de compra, sem login do cliente. Fontes: `lib/r2.js:22`, `lib/r2.js:32`, `api/access-page.js:151`.

## E-mail e webhook: pendência de produção

O webhook valida assinatura e timestamp, rejeitando pedidos sem `STRIPE_WEBHOOK_SECRET`. Para apostilas, trata `checkout.session.completed`, `checkout.session.async_payment_succeeded`, sessão expirada, pagamento falho e reembolso. Quando aprovado, consulta novamente a Stripe, registra CRM/analytics e envia o link. Fontes: `api/stripe-webhook.js:17`, `api/stripe-webhook.js:102`.

Nas duas origens públicas consultadas — `https://concurso-audibook.vercel.app/api/checkout` e `https://www.concursotrilhaaprova.online/api/checkout` — a resposta foi:

```json
{"embedded":true,"readiness":{"paymentSecret":true,"webhook":false,"email":true,"delivery":true}}
```

Essa resposta confirma presença das variáveis verificadas, não prova autorização funcional da credencial, existência dos objetos, entrega de e-mail ou registro de endpoint no painel Stripe. A chave pública retornada não foi reproduzida aqui. Fonte do significado dos campos: `api/checkout.js:21`.

O fallback `/api/order-status` envia o acesso quando a sessão paga ainda não tem `metadata.access_email_sent`. Usa a chave de idempotência `purchase-access-<session.id>` no Resend e grava a marcação na Stripe depois de o provedor aceitar. Falha de e-mail é registrada, mas o cliente recebe `paid:true` e pode abrir a área. Isso preserva o acesso imediato, mas não assegura o recebimento do e-mail. Fontes: `api/order-status.js:23`, `lib/email.js:11`, `lib/email.js:34`.

Para entrega automática independente do navegador, configurar o endpoint de produção `/api/stripe-webhook` na conta Stripe correspondente, habilitar os eventos tratados e instalar o segredo desse endpoint na Vercel. Depois verificar `webhook:true` e a entrega de um evento aprovado em ambiente adequado. Apenas adicionar a variável não comprova que os eventos estejam chegando. O workflow de smoke atual aceita `webhook:false` como aviso; portanto um smoke verde não resolve essa pendência. Fonte: `.github/workflows/smoke-production.yml:101`.

Há uma lacuna adicional de duplicação: o webhook usa a marca `access_email_sent`, mas não passa a mesma chave de idempotência que o fallback; dois processos simultâneos ou falha ao gravar metadata depois de enviar podem duplicar o e-mail. Isso é leitura do código, não incidente observado. Fontes: `api/stripe-webhook.js:112`, `api/order-status.js:24`.

## Recuperação e visão do proprietário

- `/recuperar` aceita o e-mail usado no pagamento. O backend pesquisa até dez clientes Stripe e até cem sessões de cada um, filtrando metadata e pagamento, e envia no máximo dez links. A resposta é genérica para não revelar quem comprou. Não há paginação ou limitação de frequência explícita nesse handler. Fontes: `lib/stripe.js:115`, `api/recover-access.js:5`.
- A pesquisa de recuperação não confere reembolso ao selecionar o link; o acesso revalida a compra depois, recusando reembolso total. Fontes: `lib/stripe.js:128`, `lib/stripe.js:100`.
- `GET /acesso` sem compra apresenta login de proprietário. A senha é validada por RPC do dashboard, e o passe assinado dura 12 horas, com cookie HttpOnly/Secure/SameSite. O proprietário pode revisar todos os produtos sem comprar; isso não deixa o conteúdo público. Fontes: `api/access-page.js:58`, `api/access-page.js:81`, `api/access-page.js:143`.
- A assinatura mensal do caderno de erros é outra linha de produto, fora do catálogo PDF/audiobook. A nova apostila segue o fluxo de pagamento único existente, sem alteração na assinatura. Fontes: `lib/assinatura.js:10`, `api/checkout.js:42`, `api/order-status.js:13`.

## Armazenamento e verificação de mídia

O serviço assina objetos no R2 da conta configurada por `R2_ACCOUNT_ID`, usando `R2_BUCKET` (padrão `apostila`). São necessárias as duas credenciais R2. O README antigo menciona também `CLOUDFLARE_ACCOUNT_ID`, mas o assinador atual lê `R2_ACCOUNT_ID`; seguir o código efetivo. Fontes: `lib/r2.js:4`, `products/README.md:16`, `README.md`.

O build normal não envia PDF/áudio: `build-assets.sh` apenas prepara a pasta estática. Os publishers de mídia fazem upload e validam bytes separadamente. A capa 3D da vitrine é uma URL pública estática; a capa da área paga é `coverKey` privado. Podem representar a mesma arte, mas precisam estar disponíveis nos dois usos. Fontes: `scripts/build-assets.sh:1`, `scripts/publish_santos_media.py:112`, `scripts/build-seo.cjs:641`, `lib/r2.js:34`.

`npm run verify:remote` verifica existência/tamanho dos arquivos e uma leitura Range do resumo autenticada. A auditoria mais completa verifica páginas, assunto, arquivos distintos, duração, codec MP3, decodificação integral e streaming assinado por Range. **Novo produto ativo precisa de expectativa explícita em `PRODUCT_EXPECTATIONS` ou fonte reconhecida**; apenas acrescentar ao catálogo faz essa auditoria falhar. Para PEIF, registrar expectativa própria com a contagem real e temas reais, e preferir manifesto específico contendo hash do PDF, cobertura ordenada das páginas e hashes dos áudios. O ramo de fontes Santos tem regras de assunto ligadas a portaria/inspetor e não deve ser reutilizado cegamente para PEIF. Fontes: `scripts/verify-remote.mjs:10`, `scripts/audit-study-media.py:16`, `scripts/audit-study-media.py:66`, `scripts/audit-study-media.py:75`, `scripts/audit-study-media.py:107`.

## Evidências externas observadas

| Consulta pública, sem sessão/cookie | Resultado observado |
|---|---|
| `/api/checkout` nas duas origens | HTTP 200; pagamento, e-mail e R2 com variáveis presentes; webhook ausente |
| `/acesso` e `/api/access-page` na origem Vercel | HTTP 200; título “Acesso do proprietário”; sem player, iframe ou assinatura S3 |
| `/api/order-status` sem sessão | HTTP 200, `{"paid":false}` |
| `/materials.json` | HTTP 404 |
| `/build-info.json` | HTTP 404; não foi possível identificar commit do deploy por esse caminho |
| `/apostilas-para-concurso` e `/comprar` | HTTP 200 |
| PDF legado no host público `pub-7783b168338945eebb519768f0dbd176.r2.dev` | HTTP 401 na consulta HEAD |

A recusa do objeto legado confirma que aquele caminho não é público; não é inspeção completa das configurações Cloudflare, dos demais objetos ou de domínios alternativos. Não houve compra real, envio transacional de prova ou download autenticado de biblioteca nesta investigação. A página protegida observada coincide com o login de proprietário do código atual, mas não comprova que o deploy contenha integralmente o commit auditado.

## Sequência para publicar o novo material com entrega pronta

1. Confirmar conteúdo, título, público e natureza pré-edital no PDF fornecido. Preservar o original; não anunciar data oficial desconhecida. Preço informado: R$ 24,99.
2. Preparar capa 3D no padrão visual atual e capa para o R2; validar arquivos de imagem reais e legíveis.
3. Converter o M4A fornecido para MP3 como resumo, preservando o conteúdo recebido, e descrever sua função complementar de acordo com o que realmente contém. Gerar oito capítulos com divisão que cubra o PDF completo, sem repetir o resumo como audiobook.
4. Validar texto narrado, cobertura de páginas, duração e decodificação integral. Gerar manifesto de fontes e hashes; registrar expectativa PEIF na auditoria de mídia.
5. Criar entrada própria no catálogo e preparar 11 arquivos sob `<slug>/images`, `<slug>/docs` e `<slug>/audio`. Fazer upload no mesmo bucket privado usado pelo deploy; verificar os objetos e streaming assinado antes de ativar a oferta. Não copiar URLs temporárias para Git.
6. Construir páginas pelo gerador e validar vitrine, ficha, checkout correto e mapa de mídia; manter a prova sem data (`exam:null`) enquanto não houver informação oficial.
7. Configurar/validar webhook de produção para e-mail independente do retorno do comprador. Rever idempotência compartilhada se webhook e fallback permanecerem ativos juntos.
8. Revisar a área pelo modo proprietário, incluindo PDF, as nove faixas e todos os downloads. Validar pagamento em ambiente de teste e a recuperação por e-mail; a investigação atual não executou esses passos com compra.
9. Publicar catálogo e páginas somente depois de os arquivos estarem prontos. A API de checkout **não verifica existência no R2 antes de cobrar**: sem essa ordem, uma entrada ativa pode receber pagamento por arquivos ausentes. Fontes: `api/checkout.js:59`, `lib/checkout-hosted.js:8`, `lib/r2.js:32`.

## Testes locais executados

Na base atual `e5d93c1`, executados `commerce-integrity.test.cjs`, `deployment.test.cjs`, `exam-watch.test.cjs`, `access-owner-login.test.cjs` e `study-media-expectations.test.cjs`: **34 testes passaram, nenhum falhou**. As dependências já existentes do checkout antigo foram fornecidas via `NODE_PATH`; nenhum pacote ou arquivo de aplicação foi alterado por isso.

Os testes de pagamento usam `fetch` simulado, e a assinatura de URLs usa credenciais fictícias, sem acessar a Stripe ou o R2. Comprovam seleção do produto, vínculo de metadata, isolamento de chaves e recusa de compra inválida/reembolsada, mas não cobrança ou entrega real. Fontes: `tests/commerce-integrity.test.cjs:7`, `tests/commerce-integrity.test.cjs:25`.
