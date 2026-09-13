# Publicação automática de matérias

O site publica uma matéria nova por semana sem intervenção humana. Este documento
explica o desenho, e principalmente **por que ele é desse jeito** — porque a parte
mais importante do sistema é o que ele se recusa a fazer.

## O problema que define a arquitetura

O pedido original era "matérias sobre concursos que estão em alta". Um modelo de
linguagem **não tem como saber** qual concurso está aberto hoje: ele não lê o
Diário Oficial nem o site da banca. Se a pauta pedir notícia de certame, ele vai
gerar vaga, data e salário plausíveis e falsos, semana após semana.

Isso não é um detalhe de qualidade. É:

- **violação da regra do próprio site** — `docs/search-console.md` proíbe publicar
  vaga, inscrição ou avaliação não verificada, e as páginas prometem ao leitor que
  isso não acontece;
- **spam de conteúdo pelo critério do Google** — geração em escala sem fonte e sem
  revisão é *scaled content abuse*, e a penalidade atinge o domínio, não a página;
- **risco ao leitor** — quem perde um prazo por causa de informação errada no site
  não volta.

Por isso o cron escreve **matéria de preparação**, não notícia. Toda afirmação
factual sobre certame é motivo de **rejeição**, não de correção: o texto é
descartado e a semana fica sem publicar. É melhor um site com menos páginas do que
um site com páginas que ninguém pode acreditar.

## Fluxo

```
Vercel Cron (terça, 11h UTC)
  → lib/editorial-cron-handler.js          autentica com Bearer CRON_SECRET
  → lê content/articles.json no GitHub        (fonte de verdade, não o bundle)
  → lib/editorial.js: pickTopic()             próxima pauta, sem repetir
  → API Anthropic escreve o texto             prompt com as regras inegociáveis
  → lib/editorial.js: validateArticle()       aprova ou reprova
  → GitHub Contents API (PUT)                 commit em content/articles.json
  → push dispara build na Vercel
  → scripts/build-seo.cjs                     gera /materias/<slug> estático,
                                              sitemap, feed.xml, llms.txt
  → scripts/verify-seo.mjs                    trava final; build quebra se passar
                                              afirmação não sustentável
  → IndexNow                                  avisa o Bing da URL nova
```

### Por que passar pelo GitHub

Função serverless roda em sistema de arquivos efêmero: o que ela escrevesse
morreria no fim da invocação. Commitar no repositório é o único caminho que
resulta em **HTML estático de verdade** — que é também a melhor opção de SEO,
porque a página existe no disco antes de qualquer rastreador chegar. O efeito
colateral é bom: todo texto publicado tem commit, autor e histórico.

### Duas tentativas, nunca uma concessão

O worker tenta duas vezes. A segunda recebe a lista de problemas da primeira,
porque a falha mais comum é de forma (meta description de 161 caracteres) e não de
conteúdo. O que **nunca** acontece é publicar com problema pendente — se as duas
tentativas falharem, o endpoint responde `published: false` com a lista de
problemas e a semana passa em branco.

## As travas

Elas existem em duas camadas de propósito. A primeira vive no worker e decide o
que é publicado. A segunda vive no build e decide o que vai ao ar. Se alguém
editar `content/articles.json` à mão, ou alterar o worker, a segunda ainda pega.

### `lib/editorial.js` — antes de publicar

Rejeita a matéria quando ela:

- afirma vaga aberta, inscrição, prazo, data de prova, salário, nota de corte ou
  número de edital;
- nomeia certame com ano como se estivesse em andamento;
- usa estatística, percentual ou "segundo pesquisa" — não verificável;
- promete aprovação ou cita número de aprovados;
- tem menos de 750 palavras, menos de 3 seções, menos de 3 perguntas no FAQ;
- traz `metaTitle` que não cabe na SERP com o sufixo da marca, ou description fora
  de 70–160 caracteres;
- usa tag fora da lista branca (`p ul ol li strong em a`);
- linka para fora, para caminho inexistente, ou para URL com `.html` — que na
  Vercel custa um 308 por clique por causa do `cleanUrls`;
- repete slug, título ou description de matéria já publicada.

A menção **negada** é permitida de propósito: "não divulgamos vagas abertas" é
justamente o que o site precisa dizer. A trava olha 90 caracteres para trás
procurando negação antes de reprovar.

### `scripts/verify-seo.mjs` — antes do deploy

Repete a checagem factual sobre o HTML gerado, e além disso exige que cada matéria
tenha data válida, pauta de origem, no mínimo 5 links internos, e que nenhuma
pauta tenha sido publicada duas vezes. Também valida o backlog e a chave do
IndexNow.

## Fila editorial

`content/editorial-backlog.json` tem 28 pautas perenes — cerca de sete meses de
publicação semanal. A seleção é determinística e, a cada três publicações, força
uma pauta regional da Baixada Santista. Sem isso, todo o conteúdo nacional sairia
primeiro e o regional só no fim do ano — exatamente ao contrário do que interessa,
porque é no regional que o site tem chance real de ranquear no curto prazo.

**Quando a fila acaba, o cron para.** Não gera pauta sozinho. Isso é decisão, não
limitação: fila vazia é o sinal de que uma pessoa precisa olhar para a direção
editorial antes de publicar mais 28 textos.

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
|---|---|---|
| `CRON_SECRET` | sim | autenticação do cron (já usada pelo cron de marketing) |
| `ANTHROPIC_API_KEY` | sim | a API que escreve o texto |
| `GITHUB_TOKEN` | sim | token com permissão de escrita em *Contents* do repositório |
| `GITHUB_REPO` | sim | `andreajoa/concurso-audibook` |
| `EDITORIAL_MODEL` | não | padrão `claude-opus-4-6` |
| `INDEXNOW_KEY` | não | sem ela o aviso ao Bing é apenas pulado |

Sem as três obrigatórias o endpoint responde `500 missing_env` com o nome da que
falta, em vez de falhar silenciosamente.

## Publicar manualmente

Para escrever uma matéria à mão, monte o JSON no mesmo formato, valide com
`validateArticle` e acrescente o registro a `content/articles.json`. O
`npm run build` faz o resto. A validação é a mesma — não existe caminho que
contorne as travas.

## Próximo passo: matérias ancoradas em edital

O caminho honesto para falar de concurso real é **exigir a âncora em vez de
proibir a afirmação**: o cron busca o documento oficial (Diário Oficial do
município, site da prefeitura, site da banca), extrai apenas o que está no
documento capturado, e cada fato carrega `sourceUrl` e `capturedAt`. Se o fetch
falhar, não publica.

Isso reaproveita todo o motor descrito aqui — só troca a regra de validação. E o
efeito colateral é E-E-A-T real: "fonte oficial: [link], capturado em [data]" é
exatamente o tipo de sinal que falta a um site novo.
