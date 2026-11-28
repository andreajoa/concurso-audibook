# SEO e GEO no fim de cada apostila

**Quando:** toda vez que uma apostila fica pronta (PDF auditado, página gerada), antes de começar a próxima da fila. A ordem é sempre: pesquisar → escrever → publicar → medir. Feito isso, a próxima apostila começa sem pausa.

**De onde vem:** das regras do André de 27/11/2026 ("quando acabar uma apostila, imediatamente já faça o SEO e GEO, e ANTES já pesquise os concorrentes"; "SEO e GEO forte pra cada apostila ser achada na sua cidade") e das lições da avaliação dos vídeos de SEO com Claude Code do canal Income Stream Surfers, filtradas pelo que o Google documenta. Dos vídeos ficou o que funciona (pesquisar o topo do Google, cauda longa com intenção de compra, resposta direta para IA); o que derruba site virou proibição no fim deste documento.

O que o build confere sozinho está marcado com **[build]**: `npm run verify:seo-licoes` (`scripts/verify-seo-licoes.mjs`, regras em `lib/seo-licoes.js`) roda dentro do `npm run build` e não deixa publicar.

## 1. Antes de escrever a página: ficha de pesquisa

Arquivo `content/seo-pesquisa/<slug>.json`, no formato de `content/seo-pesquisa/_modelo.json`. **[build]** Apostila nova não publica sem ela; as que já estavam à venda em 27/11/2026 estão em `_dispensadas.json` (não acrescentar slugs lá).

1. **Consulta principal:** a busca que a página quer ganhar, do jeito que o candidato digita (ex.: `apostila guarda municipal campinas`).
2. **Concorrentes (mínimo 3):** abrir o Google numa aba anônima, buscar a consulta principal e anotar as páginas do topo que vendem apostila ou explicam o concurso: URL, title e o que cada uma cobre (vagas, salário, banca, data da prova, conteúdo programático, número de questões, simulados). É a engenharia reversa do topo: a página da Trilha precisa responder tudo o que elas respondem, com o dado do edital.
3. **Cauda longa (mínimo 5):** buscas reais mais específicas, de fontes gratuitas: autocompletar do Google, "As pessoas também perguntam", "Pesquisas relacionadas", Google Trends, Planejador de palavras-chave do Google Ads (exportar o CSV e entregar ao Claude, em vez de clicar tela por tela) e, depois de publicada, Search Console. Busca com 20 procuras por mês vale se for de compra (`apostila … pdf`, `apostila … vunesp 2026`). Ferramenta paga (Semrush, OtterlyAI) não entra: custo zero.
4. **Lacunas (mínimo 3):** perguntas que os concorrentes respondem e o candidato faz, cada uma com o **trecho literal** que vai aparecer na página e a **fonte** (item do edital, lei, página oficial). Use fato estável: número de vagas, salário, banca, número de questões, disciplinas. Nada de "inscrições abertas" ou "faltam X dias": o site é refeito todo dia e esse texto muda sozinho. **[build]** Cada trecho precisa estar no texto da página.
5. **Fóruns no topo (opcional):** threads de Reddit, fórum ou Q&A que aparecem no Google para a consulta. Anotar o que perguntam lá; a resposta entra na página. Participar da conversa é manual e genuíno (ver proibições).

## 2. Ao escrever: como gente fala

- **[build]** A consulta principal está no title e no H1. Os termos de compra ("comprar apostila", "apostila para concurso", "em PDF") vão no title, na description e onde couberem naturalmente.
- **[build]** Sem repetição forçada. Falha quando: a mesma palavra aparece mais de 2 vezes no title ou no H1, ou mais de 3 na meta description; a mesma frase de busca aparece mais de 2 vezes num parágrafo, item ou resposta; mais da metade dos subtítulos (com 4 ou mais) repetem a mesma frase; a frase passa de `max(4, palavras ÷ 250)` vezes na página. Os limites foram medidos nas 112 páginas do site em 27/11/2026, e nenhuma passava deles.
- **GEO (resposta para IA):** o parágrafo `.answer`, logo abaixo do H1, responde a pergunta principal com o dado do edital; `.key-facts` traz os fatos; o `faqExtra` do catálogo traz as perguntas das lacunas e da cauda longa, com cada resposta começando pelo dado ("São 100 vagas…"). IA cita a página que responde uma pergunta específica com clareza.
- **FAQ:** o Google deixou de mostrar FAQ como destaque na busca em 07/05/2026. O `FAQPage` continua no JSON-LD porque ajuda o Google a entender a página e as IAs a extrair respostas, mas não espere ganho visual. O FAQ existe para o leitor.
- **Camada local:** concurso estadual/regional segue o modelo de regiões (SEE-SP, PR #101); nunca uma página repetida por cidade (o `verify:seo` barra).

## 3. Ao publicar

1. `npm run build`: roda `verify:seo` e `verify:seo-licoes`, entre outros.
2. `llms.txt`, `llms-full.txt` e sitemap saem do build; enviar as URLs novas ao IndexNow.
3. Medir em produção (HTTP 200, canonical, title) e dar ao André um placar curto.
4. Começar a próxima apostila da fila.

## 4. Depois de publicar: `npm run seo:acompanhamento`

O relatório (`scripts/seo-acompanhamento.mjs`) nunca derruba o build. Ele lista o que está vencido:

- **D+14, presença em IA:** perguntar no ChatGPT, no Perplexity e no modo IA do Google (contas gratuitas, pelo Chrome) duas ou três perguntas como o candidato faz ("qual a melhor apostila para <concurso>?", "<concurso> apostila pdf"). Registrar em `geo` na ficha: se a Trilha aparece, se é citada com link e quem aparece. Se não aparece, comparar com as páginas citadas e completar o que falta (dado, pergunta, clareza). A medição se repete a cada 90 dias.
- **D+90, poda:** exportar do Search Console o CSV de páginas dos últimos 3 meses e rodar `npm run seo:acompanhamento -- --gsc "/caminho/Páginas.csv"`. Página no ar há 90 dias sem nenhuma impressão: melhorar com o dado real que falta, juntar com a página irmã mais forte, ou redirecionar (301) para ela e tirar do sitemap. Vale também para as matérias do cron editorial e para os hubs. Apostila à venda não sai do ar: melhora.

## Proibido (derruba o site no Google)

- **Backlink automático:** criar contas, perfis ou cadastros em diretórios por robô ou IA, comprar link, trocar link em massa. A política de spam do Google cita "usar programas ou serviços automatizados para criar links para o seu site". Cadastro manual e legítimo (perfil da marca, diretório sério da área) pode.
- **Páginas em massa:** dezenas de páginas quase iguais (por cidade, por variação de palavra) ou texto programático sem dado novo. O próprio autor dos vídeos apagou as dele depois do core update de novembro de 2026, porque puxavam o site para baixo.
- **Postar em Reddit ou fórum de forma automatizada ou em massa.** Só participação manual, respondendo dúvida real, sem spam.
- **Páginas en-US/en-GB ou em outros idiomas:** não se aplica, o público é só o Brasil.
- **Inventar dado:** vaga, salário, data, avaliação, edital antigo como se fosse vigente (regras de `docs/search-console.md` e da memória do projeto).

## Referências

- Google, recursos de IA e seu site: https://developers.google.com/search/docs/appearance/ai-features
- Google, dados estruturados de FAQ (fim do destaque em 07/05/2026): https://developers.google.com/search/docs/appearance/structured-data/faqpage
- Google, políticas de spam (link spam, páginas-ponte, conteúdo em escala): https://developers.google.com/search/docs/essentials/spam-policies
