#!/bin/bash
# Roda a conferência da base de concursos e guarda o resultado.
#
# Feito para o launchd. Duas decisões importam aqui:
#
# 1. O diretório de trabalho é /tmp, que o macOS limpa sozinho. Então o script
#    não confia nele: se sumiu, clona de novo num lugar estável. Um vigia que
#    morre em silêncio porque a pasta evaporou é pior que vigia nenhum.
# 2. Ele nunca escreve em content/concursos.json. Dado de concurso é conferido
#    por gente lendo a página oficial; automatizar a escrita seria trocar o
#    risco de dado velho pelo risco de dado inventado.
set -uo pipefail

REPO="${TRILHA_REPO:-/tmp/concurso-audibook}"
CACHE="$HOME/.local/share/trilha-aprova"
LOGDIR="$HOME/Library/Logs/trilha-aprova"
LOG="$LOGDIR/concursos.log"
REPORT="$LOGDIR/concursos-report.json"
ORIGIN="https://github.com/andreajoa/concurso-audibook.git"

mkdir -p "$LOGDIR"
carimbo() { date "+%Y-%m-%d %H:%M:%S"; }
diz() { echo "[$(carimbo)] $*" >>"$LOG"; }

# O clone de reserva só existe quando a pasta de trabalho não está mais lá.
if [ ! -d "$REPO/.git" ]; then
  diz "pasta de trabalho ausente em $REPO — usando o clone de reserva"
  mkdir -p "$(dirname "$CACHE")"
  if [ -d "$CACHE/.git" ]; then
    git -C "$CACHE" fetch --quiet origin main && git -C "$CACHE" reset --quiet --hard origin/main
  else
    git clone --quiet --depth 1 "$ORIGIN" "$CACHE" || { diz "ERRO: clone falhou"; exit 1; }
  fi
  REPO="$CACHE"
fi

command -v node >/dev/null 2>&1 || {
  # O launchd não herda o PATH do shell interativo.
  for d in /opt/homebrew/bin /usr/local/bin "$HOME/.nvm/versions/node"/*/bin; do
    [ -x "$d/node" ] && PATH="$d:$PATH" && break
  done
}
command -v node >/dev/null 2>&1 || { diz "ERRO: node não encontrado no PATH do launchd"; exit 1; }

cd "$REPO" || { diz "ERRO: não consegui entrar em $REPO"; exit 1; }

diz "conferindo a base de concursos ($(node -e 'console.log(require("./content/concursos.json").length)') certames)"

saida=$(CONCURSOS_REPORT="$REPORT" node scripts/check-concursos.mjs 2>&1)
codigo=$?

echo "$saida" >>"$LOG"

if [ $codigo -ne 0 ]; then
  diz "AÇÃO NECESSÁRIA — a base tem item que precisa de releitura da fonte"
  # Notificação de tela: quem cuida do site precisa ver isso no mesmo dia em
  # que acontece, não no dia em que alguém reclamar de prazo errado.
  quantos=$(echo "$saida" | grep -c '^  !' || true)
  osascript -e "display notification \"$quantos certame(s) precisam de releitura da fonte oficial\" with title \"Trilha Aprova — concursos\" sound name \"Basso\"" 2>/dev/null
else
  diz "ok — nada a corrigir"
fi

# O log não pode crescer para sempre numa máquina que já é apertada de disco.
if [ "$(wc -l <"$LOG")" -gt 4000 ]; then
  tail -n 2000 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

exit $codigo
