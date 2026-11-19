# Google Merchant Center

Conta 5626195656 ("Trilha Aprova"), loja `https://www.concursotrilhaaprova.online/` verificada e reivindicada.

## Como uma apostila nova entra no Google

1. O produto entra em `products/catalog.json` com `active: true` (preço, `storefront.cover3d`, `storefront.comboCovers`, descrição).
2. `scripts/build-seo.cjs` gera a página `/apostilas/<slug>` e o item em `public/merchant-feed.xml`. Isso acontece em todo deploy e no deploy diário das 03:05.
3. A fonte "PRODUCTS SOURCE 1" do Merchant Center busca `https://www.concursotrilhaaprova.online/merchant-feed.xml` uma vez por dia. Não é preciso cadastrar nada à mão.

Produto cuja prova já passou sai da vitrine e do feed sozinho (mesmo filtro `vendavel`).

## O que garante a aprovação

O feed é montado para as **listagens gratuitas**. PDF conta como e-book, e o Google proíbe e-book em **anúncios** do Shopping ([política](https://support.google.com/merchants/answer/6150006)). Por isso todo item sai com:

- `excluded_destination=Shopping_ads`, categoria `543542` (Mídia > Livros > E-books) e `identifier_exists=no`;
- frete BR R$ 0,00 com entrega em 0 dias (é digital);
- título e descrição limpos de chamada promocional (`MERCHANT_PROMO`: "grátis", "3 por 1", "garantido", "!", emoji).

`tests/merchant-feed.test.cjs` roda dentro de `npm run build` e **barra o deploy** se algum produto à venda tiver:

- imagem ausente, menor que 250 px ou fora do domínio;
- preço do feed diferente do catálogo, do JSON-LD ou do preço visível na página;
- texto promocional no título ou na descrição;
- página sem `shippingDetails`, sem política de devolução ou com `noindex`;
- `robots.txt` bloqueando o Storebot-Google em produtos, imagens, checkout ou feed.

## Configuração na conta (19/11/2026)

- Países: só Brasil.
- Frete "Entrega digital": grátis, 0–0 dias, todos os produtos.
- Devolução "Standard for Brazil": `/cancelamentos`, 7 dias (CDC art. 49), sem troca.
- Suporte: `/contato` e `suporte@concursotrilhaaprova.online`.
