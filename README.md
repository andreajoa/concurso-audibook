# Sala de Estudos — Apostilas + Audiobooks

Biblioteca de estudos para concursos, preparada para crescer com novas apostilas e audiobooks. O front-end do repositório é estático (HTML/CSS/JavaScript), adequado à Vercel e sem backend obrigatório.

## Experiência já implementada
- Biblioteca orientada por dados em `public/materials.json`
- Leitura do PDF dentro do próprio site
- Audiobook com 1×, 1.25×, 1.5× e 2×
- Retomada automática do ponto do áudio no navegador
- Download do PDF e do audiobook
- Busca e filtros
- Motion/reveal com suporte a `prefers-reduced-motion`
- Layout responsivo, inclusive modal de estudo no celular
- Estrutura pronta para novos materiais sem reescrever a interface

## Material inicial
**Quem disse o quê? — Apostila de Autores — Banca IBAM**  
Professor Adjunto I • Professor Adjunto II — Educação Especial  
Santos 2026 • Margareth Almeida  
34 páginas • 100 questões • gabarito comentado • audiobook de estudo

## Arquivos grandes
PDFs e audiobooks ficam em object storage, não no repositório. A Vercel expõe URLs amigáveis em `/files/...` usando rewrites do `vercel.json`. Isso mantém o GitHub leve mesmo quando a biblioteca crescer.

Os dois arquivos atuais são entregues pelas rotas:
- `/files/apostila-autores-ibam-santos-2026.pdf`
- `/files/como-desarmar-as-armadilhas-da-ibam.mp3`

## Como adicionar uma nova apostila
1. Hospede o PDF e, se houver, o audiobook em object storage.
2. Adicione rotas amigáveis para os arquivos no bloco `rewrites` do `vercel.json`.
3. Acrescente um novo objeto em `public/materials.json`, usando o item atual como modelo.
4. Adicione a capa em `public/assets/` ou use uma URL pública estável.
5. Rode a verificação antes da publicação.

## Verificação
```bash
npm run verify
npm run build
```

## Deploy na Vercel
O repositório está preparado para importação direta na Vercel. `vercel.json` já define o build e `public` como diretório de saída.

Repositório: `andreajoa/concurso-audibook`
