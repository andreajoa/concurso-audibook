# Catálogo pago — procedimento para novas apostilas

A plataforma usa `products/catalog.json` como fonte única do catálogo pago.

Para adicionar um novo material:

1. Crie uma nova entrada no `products/catalog.json` com `slug`, nome, público, preço em centavos, preço comparativo, descrição e pontos de valor.
2. Envie a capa, o PDF e os MP3 para o bucket R2 privado e informe somente as chaves (`coverKey`, `pdfKey`, `summary.key`, `chapters[].key`) no catálogo. Nunca grave URLs assinadas no GitHub.
3. Para gerar o audiobook, reutilize o pipeline de TTS do repositório, ajustando a fonte PDF e a divisão dos capítulos. Os MP3 finais devem ser enviados ao R2 e adicionados no catálogo.
4. Se houver um Price fixo no Stripe, crie uma variável de ambiente com o nome indicado em `stripePriceEnv`. Se não houver, o checkout usa `price_data` com o valor do catálogo.
5. O checkout grava `product_slug` na metadata da Checkout Session e do Payment Intent. Essa metadata é o vínculo entre pagamento e conteúdo.
6. Após pagamento, `/obrigado` consulta a sessão Stripe. O link individual é `/acesso?session_id=...`.
7. `/acesso` valida a compra novamente no Stripe antes de gerar URLs temporárias do R2. O PDF e os MP3 nunca precisam ficar públicos.
8. `/recuperar` procura compras aprovadas pelo e-mail do cliente no Stripe e reenvia o link do material comprado.

## Variáveis necessárias na Vercel

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `APP_BASE_URL=https://concurso-audibook.vercel.app`
- `R2_ACCOUNT_ID=dbad4dc0550693a69d5956df7344e001`
- `R2_BUCKET=apostila`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

E-mail transacional — escolha uma opção:

### Resend
- `RESEND_API_KEY`
- `EMAIL_FROM`

### Gmail SMTP (alternativa inicial)
- `SMTP_USER`
- `SMTP_APP_PASSWORD`
- `EMAIL_FROM` opcional

## Segurança

O bucket usado para PDF e áudio deve ter o acesso público `r2.dev` desativado quando o paywall entrar em produção. A página de vendas recebe apenas uma URL temporária para a capa. O conteúdo pago é entregue por URLs S3 assinadas e temporárias geradas pelo backend da Vercel.
