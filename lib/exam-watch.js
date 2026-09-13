/**
 * Vigia das datas de prova.
 *
 * Uma apostila existe por causa de uma prova. Depois que a prova acontece ela
 * deixa de ter motivo para ser vendida, e continuar vendendo é vender um
 * material vencido para alguém que não vai usar. Este módulo transforma a data
 * do edital em um aviso dentro do painel, com dias restantes e o que fazer.
 *
 * Ele só avisa. Desativar é decisão de quem vende — ninguém quer descobrir que
 * um robô tirou o produto do ar sozinho na véspera.
 */

const ZONE = 'America/Sao_Paulo';
const DAY = 86400000;
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
});

/** Data civil de São Paulo, como 'AAAA-MM-DD', sem depender do fuso do servidor. */
function todayInBrazil(now = new Date()) {
  return dayFormatter.format(now);
}

/**
 * Converte 'AAAA-MM-DD' em milissegundos de meia-noite UTC, para subtrair dias inteiros.
 * Date.UTC aceita 40 de janeiro e devolve fevereiro caladinho, então a data é
 * reconstruída e comparada: um dia que não volta igual é um dia que não existe.
 */
function toUtcMidnight(isoDay) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDay || ''));
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const ms = Date.UTC(year, month - 1, day);
  if (Number.isNaN(ms)) return null;
  const back = new Date(ms);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() + 1 !== month || back.getUTCDate() !== day) return null;
  return ms;
}

/** Diferença em dias inteiros entre a prova e hoje. Negativo = a prova já passou. */
function daysUntil(examDay, now = new Date()) {
  const target = toUtcMidnight(examDay);
  if (target === null) return null;
  return Math.round((target - toUtcMidnight(todayInBrazil(now))) / DAY);
}

function formatDay(isoDay) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDay || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

/**
 * Situação de um produto em relação à sua prova.
 *
 * stage:
 *   sem-data   — ninguém cadastrou a data; é o único caso em que o painel pede um dado
 *   preparacao — prova distante, venda normal
 *   reta-final — janela em que a procura sobe
 *   semana     — última semana antes da prova
 *   hoje       — a prova é hoje
 *   encerrado  — a prova passou e a apostila deveria sair de venda
 */
function examStatus(product, now = new Date()) {
  const exam = product && product.exam;
  const base = {
    slug: product && product.slug,
    name: (product && (product.shortName || product.name)) || '',
    active: !(product && product.active === false),
    date: null,
    dateLabel: '',
    daysLeft: null,
    confirmed: false,
    source: (exam && exam.source) || '',
    sourceUrl: (exam && exam.sourceUrl) || ''
  };

  const days = exam ? daysUntil(exam.date, now) : null;
  if (days === null) {
    return Object.assign(base, {
      stage: 'sem-data',
      severity: 'atencao',
      headline: 'Data da prova não cadastrada',
      action: 'Abra o edital e registre a data em products/catalog.json para receber o aviso de desativação.'
    });
  }

  const on = Object.assign(base, {
    date: exam.date,
    dateLabel: formatDay(exam.date),
    daysLeft: days,
    confirmed: exam.confirmed === true
  });
  const ressalva = on.confirmed ? '' : ' A data ainda não está confirmada por edital de convocação.';

  if (days < 0) {
    const passed = Math.abs(days);
    return Object.assign(on, {
      stage: 'encerrado',
      severity: on.active ? 'critico' : 'ok',
      headline: on.active
        ? `A prova foi em ${on.dateLabel}, há ${passed} ${plural(passed, 'dia', 'dias')}`
        : `Prova realizada em ${on.dateLabel} · apostila já fora de venda`,
      action: on.active
        ? 'A apostila não tem mais motivo para ser vendida. Marque "active": false no catálogo — quem já comprou continua com acesso.'
        : 'Nada a fazer. Quem comprou antes continua acessando normalmente.'
    });
  }
  if (days === 0) {
    return Object.assign(on, {
      stage: 'hoje', severity: 'critico',
      headline: `A prova é hoje, ${on.dateLabel}`,
      action: 'Amanhã esta apostila deixa de fazer sentido para novos compradores. Prepare a desativação.'
    });
  }
  if (days <= 7) {
    return Object.assign(on, {
      stage: 'semana', severity: 'critico',
      headline: `${plural(days, 'Falta', 'Faltam')} ${days} ${plural(days, 'dia', 'dias')} para a prova de ${on.dateLabel}`,
      action: `Última semana de venda com uso real: quem comprar agora tem ${days} ${plural(days, 'dia', 'dias')} de estudo.${ressalva}`
    });
  }
  if (days <= 45) {
    return Object.assign(on, {
      stage: 'reta-final', severity: 'atencao',
      headline: `Faltam ${days} dias para a prova de ${on.dateLabel}`,
      action: `Reta final: é a janela em que a procura sobe. Programe a desativação para ${on.dateLabel}.${ressalva}`
    });
  }
  return Object.assign(on, {
    stage: 'preparacao', severity: 'ok',
    headline: `Faltam ${days} dias para a prova de ${on.dateLabel}`,
    action: `Venda normal. O painel volta a avisar a 45 dias da prova.${ressalva}`
  });
}

const ORDER = { encerrado: 0, hoje: 1, semana: 2, 'sem-data': 3, 'reta-final': 4, preparacao: 5 };

/** Lista de situações, do que exige decisão hoje para o que pode esperar. */
function examWatch(catalog, now = new Date()) {
  return Object.values(catalog || {})
    .map((product) => examStatus(product, now))
    .sort((a, b) => (ORDER[a.stage] - ORDER[b.stage]) || ((a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9)));
}

/** Uma apostila só pode ser vendida se estiver ativa e se a prova ainda não passou. */
function sellable(product, now = new Date()) {
  if (!product || product.active === false) return false;
  const days = product.exam ? daysUntil(product.exam.date, now) : null;
  return days === null || days >= 0;
}

module.exports = { examStatus, examWatch, sellable, daysUntil, todayInBrazil, formatDay };
