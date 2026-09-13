# Search Console e descoberta orgânica

Domínio canônico: https://www.concursotrilhaaprova.online
Sitemap: https://www.concursotrilhaaprova.online/sitemap.xml

O build gera páginas públicas a partir do catálogo, com preço e capítulos reais, sitemap e metadados. Dashboard, checkout, recuperação e área de compra não devem aparecer nos resultados. Nunca inserir PDFs privados ou URLs assinadas no sitemap.

Para verificar propriedade de prefixo de URL, definir GOOGLE_SITE_VERIFICATION no ambiente de build de produção com o token fornecido pelo Google. O build valida o formato e publica a meta tag na página inicial. Não inventar token. Para propriedade de domínio, usar o TXT fornecido pelo Google no DNS. Esses métodos exigem acesso autorizado à propriedade no Google; preparar os arquivos não equivale a verificar a propriedade ou enviar o sitemap.

## Verificação por arquivo HTML e o conflito com cleanUrls

O `vercel.json` usa `cleanUrls: true`. Com essa opção, qualquer arquivo `.html` servido na raiz responde **308 redirect** para a versão sem extensão. O Google trata redirecionamento como falha e a verificação por arquivo nunca conclui — é a causa mais comum de "não encontramos o arquivo de verificação".

A solução em uso: o token fica em `public/gsc/<token>.txt` e chega na URL exigida por um `rewrite`, que serve o conteúdo sem redirecionar, com `Content-Type: text/html` forçado nos headers.

```
/googlef2a7a77b144edac3.html  ->  /gsc/googlef2a7a77b144edac3.txt   (rewrite, HTTP 200)
```

Ao trocar de token: substituir o `.txt` em `public/gsc/`, atualizar `source`/`destination` do rewrite e o header correspondente no `vercel.json`, e ajustar a constante `GSC_TOKEN` em `scripts/verify-seo.mjs`. O `/gsc/` fica em `Disallow` no robots.txt para não ser indexado. A meta tag na home continua ativa como segundo método — manter os dois.

Após deploy, verificar HTTP 200, canonical e ausência de noindex nas páginas públicas. Enviar sitemap na propriedade verificada e usar inspeção de URL. Acompanhar impressões, cliques, CTR e consultas por página e país Brasil. Search Console não oferece segmentação orgânica precisa por cidade; não apresentar números locais inventados. Comparar períodos de 28 dias e separar dados do CRM de cliques medidos pelo Google.

Guias focam conteúdo real e a região da Baixada Santista. Não publicar páginas repetidas por cidade, avaliações fictícias, vagas ou inscrições abertas não verificadas. GEO usa conteúdo público legível e informações consistentes; não garante recomendações de IAs. Não há markup especial que garanta presença em respostas generativas.

## Camada para buscadores de IA (GEO)

O build publica `llms.txt` (índice curto no formato llmstxt.org) e `llms-full.txt` (corpo completo em texto puro), e o `robots.txt` traz blocos `User-agent` explícitos liberando os rastreadores de IA — GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot e outros — mantendo `/api/`, `/acesso` e `/dashboard` fora do alcance.

As páginas são escritas para serem citáveis: um parágrafo `.answer` que responde a pergunta logo abaixo do h1, uma lista `.key-facts` com os dados objetivos, e o FAQ em `<h3>`/`<p>` (não em `<details>`, que esconde o texto de parte dos extratores). O `SpeakableSpecification` aponta para esses mesmos seletores.

## O que `npm run verify:seo` bloqueia

`scripts/verify-seo.mjs` roda dentro do `npm run build` e falha o build quando:

- o arquivo/rewrite de verificação do Search Console sai do ar ou muda de conteúdo;
- o sitemap aponta para uma página que não existe em disco, repete URL ou expõe rota privada;
- alguma página indexável perde canonical, hreflang, h1 único, JSON-LD válido, title (≤70) ou meta description (70–160);
- dois títulos ou duas descrições ficam iguais — assinatura de página-ponte;
- aparece `aggregateRating` ou `Review` no markup sem avaliação real de comprador;
- uma página de cidade repete o corpo de outra, cita menos de dois órgãos oficiais, ou anuncia vaga, inscrição aberta ou salário sem negação.

Referências oficiais:
- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/docs/appearance/structured-data/product
- https://support.google.com/webmasters/answer/9008080
