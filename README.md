# Sala de Estudos — Apostilas + Audiobooks

Mini biblioteca de estudos preparada para deploy na Vercel. O projeto foi criado em HTML/CSS/JavaScript sem framework porque o repositório estava vazio; assim, não havia uma arquitetura existente a preservar. A experiência é orientada a conteúdo, mobile-first e não depende de backend.

## O que já existe
- Biblioteca data-driven (`public/materials.json`)
- Leitura de PDF dentro do site
- Audiobook com 1×, 1.25×, 1.5× e 2×
- Progresso do áudio salvo no navegador
- Download de PDF e áudio
- Busca e filtros
- Motion/reveal com respeito a `prefers-reduced-motion`
- Layout responsivo e modal de estudo adaptado ao celular
- Estrutura pronta para novos materiais sem reescrever a interface

## Adicionar uma nova apostila
1. Coloque o PDF, capa e áudio em `public/assets/` (ou adicione-os ao pipeline de `asset-parts`).
2. Acrescente um novo objeto em `public/materials.json` seguindo o primeiro item como modelo.
3. Rode `npm run verify`.

## Assets binários no GitHub
Para contornar limites de upload em conectores de texto, os binários podem ser versionados como partes Base64 em `asset-parts/`. O build da Vercel executa `scripts/build-assets.sh` e recria os arquivos dentro de `public/assets/` antes de publicar.

## Deploy na Vercel
Importe `andreajoa/concurso-audibook` na Vercel. O `vercel.json` já define `npm run build` e `public` como diretório de saída.

## Verificação
```bash
npm run verify
npm run build
```
