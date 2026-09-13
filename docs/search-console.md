# Search Console e descoberta orgânica

Domínio canônico: https://www.concursotrilhaaprova.online
Sitemap: https://www.concursotrilhaaprova.online/sitemap.xml

O build gera páginas públicas a partir do catálogo, com preço e capítulos reais, sitemap e metadados. Dashboard, checkout, recuperação e área de compra não devem aparecer nos resultados. Nunca inserir PDFs privados ou URLs assinadas no sitemap.

Para verificar propriedade de prefixo de URL, definir GOOGLE_SITE_VERIFICATION no ambiente de build de produção com o token fornecido pelo Google. O build valida o formato e publica a meta tag na página inicial. Não inventar token. Para propriedade de domínio, usar o TXT fornecido pelo Google no DNS. Esses métodos exigem acesso autorizado à propriedade no Google; preparar os arquivos não equivale a verificar a propriedade ou enviar o sitemap.

Após deploy, verificar HTTP 200, canonical e ausência de noindex nas páginas públicas. Enviar sitemap na propriedade verificada e usar inspeção de URL. Acompanhar impressões, cliques, CTR e consultas por página e país Brasil. Search Console não oferece segmentação orgânica precisa por cidade; não apresentar números locais inventados. Comparar períodos de 28 dias e separar dados do CRM de cliques medidos pelo Google.

Guias focam conteúdo real e a região da Baixada Santista. Não publicar páginas repetidas por cidade, avaliações fictícias, vagas ou inscrições abertas não verificadas. GEO usa conteúdo público legível e informações consistentes; não garante recomendações de IAs. Não há markup especial que garanta presença em respostas generativas.

Referências oficiais:
- https://developers.google.com/search/docs/appearance/ai-features
- https://developers.google.com/search/docs/appearance/structured-data/product
- https://support.google.com/webmasters/answer/9008080
