# SME-SP PEIF — pré-edital 2026

Produto: `sme-sp-peif-pre-edital-2026`. Preço autorizado pelo proprietário: o mesmo da coleção, R$ 24,99 (referência R$ 49,99). O produto fica inativo até a conclusão da geração e da auditoria dos arquivos privados.

## PDF e identidade editorial

O original fornecido tem 220 páginas, 89 aulas e 14 módulos, edição pré-edital de 01/10/2026. A padronização foi comparada com as edições atuais de Professor Adjunto I e Secretário de Unidade Escolar: A4, títulos em azul-marinho, destaques em cobre e verde, cabeçalho da Trilha Aprova e rodapé numerado.

`scripts/standardize_peif_pdf.py` preserva o original e produz uma cópia. Substitui a capa e os elementos correntes; mantém as fontes incorporadas, tabelas e conteúdo das páginas internas, sem reescrever questões ou respostas. Uma comparação de tokens por página antes e depois da gravação exige que as 219 páginas internas mantenham todo o texto. A numeração continua em 220 páginas, preservando referências e a divisão dos áudios. O script não contém texto pago.

O original tem SHA-256 `fe3cc142ac8db53b3cd5cde938fa3bdf41a0e00f8cb44178ddd8edb8162e27ab`. Os hashes da cópia padronizada e de sua capa plana constam em `products/sme-sp-peif-source.json`.

O mockup público foi gerado pela ferramenta integrada de imagem do ChatGPT/Codex, usando como referência a capa de Professor Adjunto I e a marca existente. Direção enviada: livro físico em perspectiva, lombada à esquerda, fundo transparente; identidade Trilha Aprova em azul-marinho, marfim e cobre; textos “CURSO PREPARATÓRIO NO PAPEL”, “SME-SP 2026”, “PEIF”, “PROFESSOR DE EDUCAÇÃO INFANTIL E ENSINO FUNDAMENTAL I”, “EDIÇÃO PRÉ-EDITAL”, “220 PÁGINAS · 89 AULAS · 14 MÓDULOS”; elementos escolares discretos. Sem preço, nomes de pessoas, chancela pública ou banca inventada. Arquivo: `public/assets/apostila-sme-sp-peif-3d.png`.

## Audiobook e resumo

Os oito capítulos cobrem as páginas 1–220 exatamente uma vez e na ordem original. A narração usa a mesma voz brasileira da coleção, Piper `pt_BR-cadu-medium`. Cabeçalhos e rodapés são retirados da leitura. Não há resumo artificial em lugar das aulas.

O M4A fornecido tem 19min54s e é identificado como resumo complementar “Por que grifar textos engana seu cérebro”. A conversão para MP3 preserva a duração. Não se afirma que esse áudio cobre todo o curso.

`Publish private PEIF study media` gera oito capítulos em jobs separados. O PDF, sua capa e o resumo ficam em um pacote AES-GCM autenticado; apenas o runner e o armazenamento privado recebem arquivos em claro. Nenhum PDF, áudio ou URL assinada é publicado no GitHub como artefato.

`scripts/publish_peif_media.py` valida hashes, páginas, cobertura, texto de origem, duração, decodificação completa e streaming privado por Range. Arquivos existentes de conteúdo diferente nunca são sobrescritos. O manifesto final só é gravado quando todas as nove faixas passam na auditoria. `scripts/audit-study-media.py` conhece este produto e confere seus arquivos e manifesto antes da liberação.

## Entrega e pendências de publicação

A entrega usa o fluxo existente: Checkout Stripe com o slug exato, confirmação de pagamento e área `/acesso` com URLs privadas temporárias. O cadastro não libera compra enquanto `active` for falso.

A investigação do ambiente identificou um problema pré-existente: a produção informa `readiness.webhook:false`. A liberação ao retornar do pagamento funciona, mas o e-mail automático independente do retorno exige configurar o endpoint e sua assinatura. Esse ajuste deve ser validado antes de afirmar que o envio automático de e-mail foi concluído.

Validação local inicial: 164 testes Node, build completo, verificações de acesso, SEO e layout aprovados; seis testes Python de integridade das fontes aprovados. Geração real, auditoria R2, ativação e publicação serão registradas conforme concluídas.
