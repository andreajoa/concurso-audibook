/**
 * Regras do portal de concursos.
 *
 * Esta parte do site não vende nada. Ela existe porque a primeira pergunta de
 * quem vai prestar concurso não é "qual apostila comprar", é "qual concurso
 * está aberto perto de mim e até quando dá para me inscrever". A apostila só
 * aparece depois, e só quando existe material para aquele cargo.
 *
 * Por isso toda entrada precisa de `sourceUrl`: um número de vaga ou uma data
 * de prova errada faz alguém perder a inscrição. Sem fonte, a entrada não
 * entra no site — `problems()` é o que garante isso no build.
 */

const UF_NOMES = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins'
};

const STATUS = {
  inscricoes_abertas: { label: 'Inscrições abertas', tone: 'open', order: 0 },
  previsto: { label: 'Edital publicado', tone: 'soon', order: 1 },
  prova_marcada: { label: 'Inscrições encerradas, prova marcada', tone: 'exam', order: 2 },
  inscricoes_encerradas: { label: 'Inscrições encerradas', tone: 'closed', order: 3 },
  encerrado: { label: 'Concurso encerrado', tone: 'closed', order: 4 }
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Acentos fora, espaços viram hífen: é o que vai virar URL e precisa ser estável. */
function slugify(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Diferença em dias inteiros entre duas datas ISO, em UTC para não pegar fuso. */
function daysBetween(fromIso, toIso) {
  if (!ISO.test(String(fromIso)) || !ISO.test(String(toIso))) return null;
  const from = Date.parse(fromIso + 'T00:00:00Z');
  const to = Date.parse(toIso + 'T00:00:00Z');
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86400000);
}

/**
 * O que o site pode dizer sobre o prazo, sem adjetivo.
 * Devolve null quando não há data — silêncio é melhor que "corra, últimas vagas".
 */
function deadlineNotice(entry, todayIso) {
  const fim = entry.inscricaoFim;
  if (!fim) return null;
  const dias = daysBetween(todayIso, fim);
  if (dias === null) return null;
  if (dias < 0) return { tone: 'closed', dias, text: 'Inscrições encerradas em ' + brDate(fim) + '.' };
  if (dias === 0) return { tone: 'urgent', dias, text: 'Último dia de inscrição: ' + brDate(fim) + '.' };
  if (dias === 1) return { tone: 'urgent', dias, text: 'Falta 1 dia para o fim das inscrições (' + brDate(fim) + ').' };
  if (dias <= 7) return { tone: 'urgent', dias, text: 'Faltam ' + dias + ' dias para o fim das inscrições (' + brDate(fim) + ').' };
  return { tone: 'open', dias, text: 'Inscrições até ' + brDate(fim) + '.' };
}

/** 2026-10-11 -> 11/10/2026. Sem Date(), que mudaria o dia conforme o fuso. */
function brDate(iso) {
  if (!ISO.test(String(iso))) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Status efetivo: o campo declarado pode envelhecer entre um build e outro.
 * Se a data de encerramento já passou, o site não continua dizendo "abertas".
 */
function effectiveStatus(entry, todayIso) {
  const declared = STATUS[entry.status] ? entry.status : 'previsto';
  if (declared === 'inscricoes_abertas' && entry.inscricaoFim) {
    const dias = daysBetween(todayIso, entry.inscricaoFim);
    if (dias !== null && dias < 0) return entry.dataProva ? 'prova_marcada' : 'inscricoes_encerradas';
  }
  if (entry.dataProva) {
    const dias = daysBetween(todayIso, entry.dataProva);
    if (dias !== null && dias < 0) return 'encerrado';
  }
  return declared;
}

/** Tudo que o build precisa saber sobre uma entrada, já resolvido. */
function normalize(entry, todayIso) {
  const uf = String(entry.uf || '').toUpperCase();
  const municipioSlug = slugify(entry.municipio);
  const status = effectiveStatus(entry, todayIso);
  const slug = entry.slug || slugify(entry.orgao + '-' + (entry.edital || entry.id));
  return {
    ...entry,
    uf,
    ufNome: UF_NOMES[uf] || uf,
    ufSlug: uf.toLowerCase(),
    municipioSlug,
    slug,
    status,
    statusLabel: STATUS[status].label,
    statusTone: STATUS[status].tone,
    statusOrder: STATUS[status].order,
    path: `/concursos/${uf.toLowerCase()}/${municipioSlug}`,
    deadline: deadlineNotice(entry, todayIso),
    diasParaProva: entry.dataProva ? daysBetween(todayIso, entry.dataProva) : null
  };
}

/**
 * Agrupa em estado -> município -> concursos, na ordem em que interessa a quem
 * está procurando: o que ainda dá para se inscrever vem primeiro.
 */
function groupByUf(entries) {
  const estados = new Map();
  for (const c of entries) {
    if (!estados.has(c.uf)) estados.set(c.uf, { uf: c.uf, ufNome: c.ufNome, ufSlug: c.ufSlug, municipios: new Map() });
    const estado = estados.get(c.uf);
    if (!estado.municipios.has(c.municipioSlug)) {
      estado.municipios.set(c.municipioSlug, {
        municipio: c.municipio, municipioSlug: c.municipioSlug,
        uf: c.uf, ufNome: c.ufNome, ufSlug: c.ufSlug, path: c.path, concursos: []
      });
    }
    estado.municipios.get(c.municipioSlug).concursos.push(c);
  }

  const byStatus = (a, b) => a.statusOrder - b.statusOrder || String(a.orgao).localeCompare(b.orgao, 'pt-BR');
  return [...estados.values()]
    .map(e => ({
      ...e,
      municipios: [...e.municipios.values()]
        .map(m => ({ ...m, concursos: m.concursos.sort(byStatus) }))
        .sort((a, b) => a.concursos[0].statusOrder - b.concursos[0].statusOrder || a.municipio.localeCompare(b.municipio, 'pt-BR')),
      abertos: [...e.municipios.values()].reduce((n, m) => n + m.concursos.filter(c => c.status === 'inscricoes_abertas').length, 0)
    }))
    .sort((a, b) => b.abertos - a.abertos || a.ufNome.localeCompare(b.ufNome, 'pt-BR'));
}

/**
 * A trava. Uma entrada sem fonte oficial ou com data inventada não vira página:
 * quem lê isso decide se paga uma taxa de inscrição com base no que está escrito.
 */
function problems(entry) {
  const found = [];
  const id = entry.id || entry.orgao || '(sem id)';
  const need = (field) => { if (!entry[field]) found.push(`${id}: falta ${field}`); };

  need('id'); need('orgao'); need('municipio'); need('uf'); need('resumo'); need('capturedAt');

  if (!entry.sourceUrl) found.push(`${id}: sem sourceUrl — nada é publicado sem fonte oficial`);
  for (const field of ['sourceUrl', 'editalUrl']) {
    const url = entry[field];
    if (url && !/^https:\/\//.test(url)) found.push(`${id}: ${field} precisa ser https`);
  }
  if (entry.uf && !UF_NOMES[String(entry.uf).toUpperCase()]) found.push(`${id}: UF desconhecida "${entry.uf}"`);
  if (entry.status && !STATUS[entry.status]) found.push(`${id}: status desconhecido "${entry.status}"`);

  for (const field of ['inscricaoInicio', 'inscricaoFim', 'dataProva', 'capturedAt']) {
    const value = entry[field];
    if (value != null && !ISO.test(String(value))) found.push(`${id}: ${field} fora do formato AAAA-MM-DD`);
  }
  if (entry.inscricaoInicio && entry.inscricaoFim && daysBetween(entry.inscricaoInicio, entry.inscricaoFim) < 0) {
    found.push(`${id}: inscrição termina antes de começar`);
  }
  for (const field of ['vagas', 'taxaInscricao', 'salarioMin', 'salarioMax']) {
    const value = entry[field];
    if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
      found.push(`${id}: ${field} precisa ser número ou null`);
    }
  }
  if (typeof entry.salarioMin === 'number' && typeof entry.salarioMax === 'number' && entry.salarioMax < entry.salarioMin) {
    found.push(`${id}: salário máximo menor que o mínimo`);
  }
  if (entry.dataProva && entry.dataProvaConfirmada !== true && entry.dataProvaConfirmada !== false) {
    found.push(`${id}: dataProva sem dizer se está confirmada`);
  }
  return found;
}

module.exports = {
  UF_NOMES, STATUS, slugify, brDate, daysBetween,
  deadlineNotice, effectiveStatus, normalize, groupByUf, problems
};
