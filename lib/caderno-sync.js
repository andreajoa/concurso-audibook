/**
 * Sincronização do caderno de erros entre aparelhos.
 *
 * Entra por api/forms.js como mais um `kind` porque o plano da Vercel dá doze
 * funções e as doze já existem. Não é gambiarra: sincronizar é um POST que
 * manda o estado local e recebe o estado combinado, e isso cabe inteiro no
 * multiplexador que já está lá.
 *
 * A fusão em si mora em public/ferramentas.js, a mesma função que o navegador
 * usa. Duas implementações da mesma regra é o jeito garantido de um dia elas
 * discordarem sobre qual questão ainda precisa de revisão.
 */

const { rpc } = require('./crm-rpc');
const { fundirCadernos } = require('../public/ferramentas.js');

const CHAVE = /^[a-f0-9]{48}$/;

/** Tudo o que a tela precisa saber quando o sync não pode acontecer. */
const RECUSAS = {
  chave: { erro: 'Esta chave não abre nenhum caderno. Confira o link do e-mail.' },
  inativa: { erro: 'Sua assinatura não está ativa. O caderno continua guardado e volta assim que o pagamento for retomado.' },
  payload: { erro: 'Não entendi o caderno enviado.' },
  grande: { erro: 'Este caderno passou do tamanho que a assinatura guarda.' }
};

function saneia(estado) {
  if (!estado || typeof estado !== 'object' || !Array.isArray(estado.itens)) return null;
  if (estado.itens.length > 5000) return 'grande';
  return { versao: 1, itens: estado.itens };
}

module.exports = async (req, res) => {
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const chave = String(body.chave || '').trim().toLowerCase();
  if (!CHAVE.test(chave)) return res.status(400).json(RECUSAS.chave);

  const local = saneia(body.estado);
  if (local === 'grande') return res.status(413).json(RECUSAS.grande);
  if (!local) return res.status(400).json(RECUSAS.payload);

  res.setHeader('Cache-Control', 'private, no-store');

  try {
    /* Ler, fundir, gravar. Entre a leitura e a gravação o outro aparelho pode
       ter gravado; nesse caso o banco recusa e a volta refaz a fusão com o que
       chegou. Uma tentativa basta: duas pessoas não usam a mesma assinatura ao
       mesmo segundo, e insistir em silêncio esconderia um problema real. */
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const remoto = await rpc('caderno_puxar', { payload: { chave } });
      if (!remoto || !remoto.ok) {
        return res.status(remoto && remoto.motivo === 'inativa' ? 402 : 401)
          .json(RECUSAS[(remoto && remoto.motivo) || 'chave']);
      }
      const junto = fundirCadernos(remoto.estado, local);
      const gravou = await rpc('caderno_gravar', {
        payload: { chave, estado: junto, revisao: remoto.revisao }
      });
      if (gravou && gravou.ok) {
        return res.status(200).json({ ok: true, estado: junto, valeAte: remoto.vale_ate || null });
      }
      if (!gravou || gravou.motivo !== 'conflito') {
        return res.status(gravou && gravou.motivo === 'grande' ? 413 : 400)
          .json(RECUSAS[(gravou && gravou.motivo) || 'payload']);
      }
    }
    return res.status(409).json({ erro: 'Outro aparelho estava salvando agora. Tente de novo em alguns segundos.' });
  } catch (error) {
    console.error('caderno-sync', error);
    /* O caderno da pessoa está inteiro no navegador dela. Se o servidor cair,
       a ferramenta continua funcionando — a tela só precisa saber que o que
       ela anotou hoje ainda não saiu deste aparelho. */
    return res.status(503).json({ erro: 'Não consegui sincronizar agora. O que você anotou está salvo neste aparelho e sobe na próxima vez.' });
  }
};
