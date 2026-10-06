# DETRAN-SP 2026 — Agente Estadual de Trânsito

Produto: `detran-sp-agente-de-transito-2026`. Preço autorizado pelo proprietário: o mesmo da coleção, R$ 24,99 (referência R$ 49,99). O cadastro entra com `active: false` e só é ativado depois da geração e auditoria dos arquivos privados e da aprovação do proprietário.

## PDF e identidade editorial

O original fornecido tem 49 páginas (A4), edição revisada de 01/10/2026, corte legal até 08/09/2026; SHA-256 `049e7faa…19f8eb`. A padronização segue o método de `standardize_peif_pdf.py`: `scripts/standardize_detran_pdf.py` preserva o original, substitui a capa e os elementos correntes (cabeçalho/rodapé "TRILHA APROVA CONCURSOS", numeração `n / 49`) e ajusta a paleta para azul-marinho, cobre e verde-azulado. As 48 páginas internas mantêm fontes, tabelas, questões e gabarito; uma comparação de tokens por página antes e depois da gravação exige texto idêntico. Hash da cópia padronizada e da capa plana em `products/detran-sp-2026-source.json`.

O mockup público `public/assets/apostila-detran-sp-agente-de-transito-3d.png` foi desenhado em código (Remotion), no padrão das capas 3D da coleção, com o logo real da marca e ilustração sem texto.

## Audiobook e resumo

Oito capítulos cobrem as páginas 1–49 exatamente uma vez, na ordem. Voz da coleção: Piper `pt_BR-cadu-medium` (português do Brasil). Cabeçalhos e rodapés são retirados da leitura; alternativas viram "Alternativa A: …". O M4A fornecido ("Tudo sobre o concurso do DETRAN-SP", 29min28s) é o resumo; a conversão para MP3 preserva a duração.

`Publish private DETRAN-SP study media` decifra o pacote AES-GCM (`ops/detran-sp-2026.sources.enc`, chave no secret `DETRAN_MEDIA_SOURCE_KEY`, AAD `trilha-aprova:detran-sp-2026:v1`) só no runner, publica PDF, capa e resumo, gera os oito capítulos em jobs separados e grava o manifesto apenas quando todas as nove faixas passam na auditoria (`scripts/publish_detran_media.py`, derivado de `publish_peif_media.py`). Nenhum PDF, áudio ou URL assinada vai para o GitHub.
