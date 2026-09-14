# Materiais privados de Santos

`Publish private Santos study media` é executado manualmente no GitHub Actions e usa as credenciais R2 existentes. Cada apostila roda em um job separado.

Os PDFs e capas fornecidos estão em `ops/santos-2026.sources.enc`, um ZIP criptografado com AES-256-GCM. A chave fica exclusivamente no secret `SANTOS_MEDIA_SOURCE_KEY`. O pacote usa 12 bytes iniciais de nonce e os demais bytes contêm ciphertext e tag, autenticados com `trilha-aprova:santos-2026:v1`. O workflow descriptografa somente no diretório temporário do runner. Não publique o ZIP aberto, PDFs ou áudios como artefatos do GitHub: este repositório é público.

`products/santos-media-sources.json` registra os hashes SHA-256 dos originais, o número de páginas e a divisão dos capítulos. `scripts/publish_santos_media.py` exige os hashes corretos e cobertura integral de todas as páginas após a capa ilustrada. O resumo lê a página de raio-X da própria apostila; nenhum texto de estudo é inventado por modelo de linguagem.

Os áudios usam a voz brasileira `pt_BR-cadu-medium`, também usada nos materiais anteriores. O processo valida a decodificação integral do MP3, duração compatível com o texto, igualdade dos bytes no R2 e streaming por URL temporária com HTTP Range. Os objetos recebem `Cache-Control: private, no-store`; o acesso público do bucket permanece desativado.

Uma nova execução retoma os capítulos concluídos apenas se os hashes de origem e do áudio coincidirem. Arquivos diferentes já existentes não são sobrescritos. O manifesto de conclusão é gravado em `<slug>/audio/manifest.json` somente depois de validar PDF, capa e nove áudios.

Depois de concluir os dois jobs, execute novamente os workflows `Verify study library` e `Audit PDF and audiobook integrity` para verificar o catálogo completo contra o R2. A auditoria compara os hashes dos PDFs originais (72 e 76 páginas), das capas e dos nove áudios de cada produto com as fontes e os manifestos de conclusão. A capa ilustrada pode não ter texto extraível; todas as páginas seguintes precisam ter texto e estar cobertas pelos oito capítulos, em ordem. O resumo também precisa corresponder às páginas registradas. Cada MP3 é decodificado integralmente e o streaming privado precisa devolver os mesmos bytes do arquivo validado.
