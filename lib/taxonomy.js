/**
 * Normalização taxonômica do catálogo Trilha Aprova.
 *
 * Agrupa apostilas ativas dinamicamente por banca organizadora, área/carreira,
 * estado (todos os 27 UFs + Nacional) e escolaridade para gerar hubs indexáveis
 * (/apostilas/banca/*, /apostilas/area/*, /apostilas/estado/*, /apostilas/nivel/*)
 * e títulos H1 transacionais coerentes conforme novas apostilas entram no catálogo.
 */

const BOARDS = [
  {
    slug: 'fgv',
    name: 'FGV',
    fullName: 'FGV (Fundação Getulio Vargas)',
    match: /\bfgv\b|getulio vargas/i,
    profile: 'A FGV é conhecida por enunciados extensos, interpretação de texto exigente e casos práticos que cobram aplicação da teoria e da legislação, não apenas memorização literal.',
    tip: 'Priorize resolução de questões anteriores da FGV em Língua Portuguesa e Conhecimentos Específicos, marcando termos restritivos e comparando alternativas próximas.'
  },
  {
    slug: 'vunesp',
    name: 'VUNESP',
    fullName: 'Fundação VUNESP',
    match: /\bvunesp\b/i,
    profile: 'A VUNESP combina cobrança direta de letra de lei, interpretação de texto clara e questões de matemática, raciocínio lógico e informática com padrão recorrente.',
    tip: 'Releia os artigos exatos citados no edital (lei seca) e treine simulados cronometrados com cinco alternativas para ganhar ritmo de leitura no dia da prova.'
  },
  {
    slug: 'cebraspe',
    name: 'Cebraspe',
    fullName: 'Cebraspe (Cespe)',
    match: /\bcebraspe\b|\bcespe\b/i,
    profile: 'O Cebraspe utiliza com frequência itens de julgamento (Certo ou Errado) ou múltipla escolha contextualizada, cobrando precisão conceitual e atenção a exceções legais.',
    tip: 'Treine leitura cirúrgica de cada afirmação: identifique palavras absolutas ("sempre", "apenas", "exceto") e gerencie o risco em provas com penalização por erro.'
  },
  {
    slug: 'fcc',
    name: 'FCC',
    fullName: 'FCC (Fundação Carlos Chagas)',
    match: /\bfcc\b|carlos chagas/i,
    profile: 'A Fundação Carlos Chagas valoriza gramática normativa, raciocínio técnico bem estruturado e literalidade combinada com situações práticas do cargo.',
    tip: 'Faça revisões frequentes de concordância, regência, crase e legislação específica, usando o caderno de erros para mapear temas que a FCC repete entre certames.'
  },
  {
    slug: 'cesgranrio',
    name: 'Cesgranrio',
    fullName: 'Fundação Cesgranrio',
    match: /\bcesgranrio\b/i,
    profile: 'A Fundação Cesgranrio organiza grandes seleções nacionais, bancárias e censitárias, com enunciados claros, textos bem estruturados e boa aderência ao conteúdo programático.',
    tip: 'Resolva baterias completas de provas da Cesgranrio para dominar o estilo das questões de Português, Matemática Financeira/RLM e conhecimentos específicos.'
  },
  {
    slug: 'verbena-ufg',
    name: 'Verbena/UFG',
    fullName: 'Instituto Verbena/UFG',
    match: /\bverbena\b|\bufg\b/i,
    profile: 'O Instituto Verbena/UFG organiza grandes concursos em Goiás, com provas bem redigidas, foco em legislação municipal e estadual, realidade regional e fundamentos da carreira.',
    tip: 'Dê atenção especial às legislações locais e aos conteúdos específicos de maior peso no edital, combinando leitura em PDF com revisão diária em áudio.'
  },
  {
    slug: 'itame',
    name: 'ITAME',
    fullName: 'ITAME',
    match: /\bitame\b/i,
    profile: 'O ITAME organiza concursos de prefeituras e câmaras municipais em Goiás, cobrando objetividade em Português, Matemática, legislação local e conhecimentos do cargo.',
    tip: 'Revise a Lei Orgânica, o Estatuto dos Servidores e o Regimento previstos no edital junto com baterias de questões comentadas de nível equivalente.'
  },
  {
    slug: 'quadrix',
    name: 'Quadrix',
    fullName: 'Instituto Quadrix',
    match: /\bquadrix\b/i,
    profile: 'O Instituto Quadrix atua fortemente em conselhos profissionais e autarquias, adotando com frequência o modelo Certo ou Errado sobre legislação da categoria e administração pública.',
    tip: 'Domine a legislação específica do conselho e as rotinas administrativas do cargo, simulando a regra de pontuação adotada no edital.'
  },
  {
    slug: 'ibam',
    name: 'IBAM',
    fullName: 'IBAM',
    match: /\bibam\b/i,
    profile: 'O IBAM é referência em concursos municipais no Brasil, com provas objetivas de quatro alternativas focadas em rotinas do cargo, legislação municipal e conceitos-chave.',
    tip: 'Concentre o tempo nas disciplinas de maior peso na nota final e contraste alternativas muito parecidas usando questões comentadas.'
  },
  {
    slug: 'ganzaroli',
    name: 'Ganzaroli',
    fullName: 'Ganzaroli Assessoria',
    match: /\bganzaroli\b/i,
    profile: 'A Ganzaroli Assessoria conduz certames municipais com foco direto nos itens do conteúdo programático, legislação educacional e fundamentos pedagógicos do cargo.',
    tip: 'Siga o edital verticalizado tópico por tópico, revisando LDB, BNCC, ECA e legislação local com questões comentadas e áudio.'
  },
  {
    slug: 'aocp',
    name: 'Instituto AOCP',
    fullName: 'Instituto AOCP',
    match: /\baocp\b/i,
    profile: 'O Instituto AOCP organiza concursos de institutos federais, universidades, polícias e saúde em todo o Brasil, com cobrança direta de teoria, lei seca e interpretação.',
    tip: 'Combine leitura dos artigos citados no edital com treino constante de questões comentadas no estilo objetivo do Instituto AOCP.'
  },
  {
    slug: 'ibfc',
    name: 'IBFC',
    fullName: 'IBFC',
    match: /\bibfc\b/i,
    profile: 'O IBFC elabora provas diretas e bem distribuídas sobre os itens do edital, com foco em gramática aplicada, raciocínio lógico e conhecimentos específicos do cargo.',
    tip: 'Estude cada tópico do conteúdo programático sem pular itens básicos e use revisões curtas em áudio para fixar definições e prazos legais.'
  },
  {
    slug: 'idecan',
    name: 'IDECAN',
    fullName: 'IDECAN',
    match: /\bidecan\b/i,
    profile: 'O IDECAN é conhecido por provas detalhistas em Língua Portuguesa, legislação específica e conhecimentos técnicos, exigindo atenção redobrada à leitura dos enunciados.',
    tip: 'Treine questões comentadas de gramática normativa e legislação seca, registrando no caderno de erros os detalhes que costumam derrubar candidatos.'
  },
  {
    slug: 'fundatec',
    name: 'FUNDATEC',
    fullName: 'FUNDATEC',
    match: /\bfundatec\b/i,
    profile: 'A FUNDATEC organiza grande volume de concursos municipais e estaduais, especialmente no Sul do país, com questões objetivas ligadas à legislação e prática do cargo.',
    tip: 'Dê prioridade a Português, legislação municipal/estadual e questões anteriores da FUNDATEC para se acostumar com a estrutura das alternativas.'
  },
  {
    slug: 'instituto-mais',
    name: 'Instituto Mais',
    fullName: 'Instituto Mais',
    match: /instituto mais/i,
    profile: 'O Instituto Mais realiza concursos municipais e estaduais principalmente em São Paulo, com provas objetivas voltadas para rotinas práticas e fundamentos básicos do edital.',
    tip: 'Reforce interpretação de texto, matemática básica e os deveres do cargo previstos no conteúdo programático.'
  },
  {
    slug: 'instituto-avalia',
    name: 'Instituto Avalia',
    fullName: 'Instituto Avalia',
    match: /\bavalia\b/i,
    profile: 'O Instituto Avalia organiza concursos federais, estaduais e da área da saúde com provas objetivas e discursivas diretas sobre legislação específica, administração pública e conhecimentos técnicos do cargo.',
    tip: 'Combine leitura atenta da legislação do SUS, administração pública e gestão com baterias de questões comentadas no estilo objetivo do Instituto Avalia.'
  }
];

const AREAS = [
  {
    slug: 'educacao',
    name: 'Educação e Professores',
    shortName: 'Educação',
    metaTitle: 'Apostilas para Concurso de Professor e Educação | Trilha Aprova',
    description: 'Apostilas digitais para concursos de professor, pedagogo, educação especial e apoio escolar em PDF com audiobook grátis e questões comentadas.',
    intro: 'Materiais completos para concursos da área de educação — professores de diversas disciplinas, pedagogos, educação especial, agentes educativos e auxiliares de secretaria — alinhados aos editais e à legislação educacional (LDB, BNCC, ECA e normas locais).'
  },
  {
    slug: 'administrativa',
    name: 'Área Administrativa e Gestão',
    shortName: 'Administrativa',
    metaTitle: 'Apostilas para Concurso Área Administrativa PDF | Trilha Aprova',
    description: 'Apostilas para concursos administrativos em PDF com audiobook: assistente administrativo, técnico legislativo, autarquias, prefeituras e órgãos federais.',
    intro: 'Apostilas direcionadas a cargos administrativos, técnicos e legislativos em prefeituras, câmaras, conselhos profissionais, estatais, institutos federais e órgãos nacionais, com foco em Português, Informática, Raciocínio Lógico, Direito Administrativo e rotinas de gestão.'
  },
  {
    slug: 'policial-e-seguranca',
    name: 'Policial e Segurança Pública',
    shortName: 'Policial e Segurança',
    metaTitle: 'Apostilas para Concursos Policiais e Guardas PDF | Trilha Aprova',
    description: 'Apostilas para concursos policiais e guardas municipais em PDF com audiobook: PC-PE, Polícia Penal, PM-SP e GCM com legislação e questões comentadas.',
    intro: 'Preparação completa para carreiras policiais e de segurança pública — Polícia Civil, Polícia Militar, Polícia Penal e Guardas Municipais — reunindo Direito Penal, Processual Penal, Constitucional, legislação especial atualizada, simulados e audiobook.'
  },
  {
    slug: 'tribunais-e-controle',
    name: 'Tribunais e Controle Externo',
    shortName: 'Tribunais e Controle',
    metaTitle: 'Apostilas para Concursos de Tribunais e TCE PDF | Trilha Aprova',
    description: 'Apostilas para concursos de tribunais e controle externo em PDF com audiobook: TJ-SP Escrevente, Oficial de Justiça e TCE-GO com lei seca e simulados.',
    intro: 'Materiais completos para concursos de tribunais de justiça e tribunais de contas, com teoria organizada pelo edital, legislação seca atualizada, centenas de questões comentadas da banca e revisão em audiobook.'
  },
  {
    slug: 'bancaria-e-fiscal',
    name: 'Bancária, Fiscal e Previdenciária',
    shortName: 'Bancária e Fiscal',
    metaTitle: 'Apostilas Concursos Bancários, Fiscais e INSS | Trilha Aprova',
    description: 'Apostilas em PDF com audiobook para carreiras bancárias, fiscais e previdenciárias: INSS, Receita Federal e Banestes com questões comentadas.',
    intro: 'Apostilas para concursos de bancos públicos, fisco e seguridade social — incluindo edições pré-edital e pós-edital com legislação atualizada, teoria objetiva, simulados no estilo da banca e audiobook para revisão diária.'
  },
  {
    slug: 'saude',
    name: 'Saúde e SUS',
    shortName: 'Saúde',
    metaTitle: 'Apostilas para Concursos da Área da Saúde e SUS | Trilha Aprova',
    description: 'Apostilas digitais para concursos da área da saúde em PDF com audiobook: Ministério da Saúde (FNS), Coren-SP e legislação do SUS comentada.',
    intro: 'Materiais completos para concursos da área da saúde — órgãos federais como Ministério da Saúde/FNS e conselhos profissionais como Coren-SP — reunindo legislação do SUS, gestão em saúde, questões comentadas e audiobook.'
  },
  {
    slug: 'materias-basicas-e-redacao',
    name: 'Matérias Básicas, Redação e Questões',
    shortName: 'Matérias Básicas',
    metaTitle: 'Apostilas de Matérias Básicas e Redação Concurso | Trilha Aprova',
    description: 'Apostilas de Português, Matemática, Raciocínio Lógico, Informática, Direito, Redação e cadernos de questões em PDF com audiobook para qualquer concurso.',
    intro: 'A base que se repete em quase todos os editais do Brasil: Língua Portuguesa, Redação discursiva, Matemática e Raciocínio Lógico, Informática, Direito Constitucional e Administrativo e cadernos de questões por banca, válidos para qualquer certame.'
  }
];

const STATE_LIST = [
  ['nacional', 'BR', 'Concursos Nacionais (Brasil)', 'no Brasil', /\bnacional\b|todo o brasil|\binss\b|receita federal|\bibge\b|\bcorreios\b|pol[íi]cia federal|pol[íi]cia rodovi[áa]ria federal|banco do brasil|caixa econ[oô]mica/i],
  ['sp', 'SP', 'São Paulo (SP)', 'em São Paulo (SP)', /\/SP\b|\(SP\)|\bSP\b|S[ãa]o Paulo|SEDUC-SP|SME-SP|TJ-SP|PM-SP|Coren-SP|CETESB|Campinas|Mat[ãa]o|Santana de Parna[íi]ba|Santos/],
  ['go', 'GO', 'Goiás (GO)', 'em Goiás (GO)', /\/GO\b|\(GO\)|Goi[áa]s|Goi[âa]nia|TCE-GO|\bIFG\b|Santa Helena|Montes Belos|Faina|Uirapuru|Campo Limpo|S[ãa]o Francisco de Goi[áa]s|Petrolina de Goi[áa]s/],
  ['pe', 'PE', 'Pernambuco (PE)', 'em Pernambuco (PE)', /\/PE\b|\(PE\)|Pernambuco|\bPC-PE\b|Pol[íi]cia Penal PE|Recife/],
  ['ma', 'MA', 'Maranhão (MA)', 'no Maranhão (MA)', /\/MA\b|\(MA\)|Maranh[ãa]o|SEDUC-MA|Unificado MA/],
  ['es', 'ES', 'Espírito Santo (ES)', 'no Espírito Santo (ES)', /\/ES\b|\(ES\)|Banestes|Esp[íi]rito Santo|Vit[óo]ria\/ES/],
  ['rj', 'RJ', 'Rio de Janeiro (RJ)', 'no Rio de Janeiro (RJ)', /\/RJ\b|\(RJ\)|Rio de Janeiro|SEEDUC-RJ|PMERJ|PCERJ|TJRJ/],
  ['mg', 'MG', 'Minas Gerais (MG)', 'em Minas Gerais (MG)', /\/MG\b|\(MG\)|Minas Gerais|Belo Horizonte|SEE-MG|PMMG|PCMG|TJMG/],
  ['ba', 'BA', 'Bahia (BA)', 'na Bahia (BA)', /\/BA\b|\(BA\)|\bBahia\b|Salvador\/BA|PMBA|PCBA|TJBA|SEC-BA/],
  ['pr', 'PR', 'Paraná (PR)', 'no Paraná (PR)', /\/PR\b|\(PR\)|Paran[áa]|Curitiba|PMPR|PCPR|TJPR|SEED-PR/],
  ['rs', 'RS', 'Rio Grande do Sul (RS)', 'no Rio Grande do Sul (RS)', /\/RS\b|\(RS\)|Rio Grande do Sul|Porto Alegre|Brigada Militar|TJRS/],
  ['sc', 'SC', 'Santa Catarina (SC)', 'em Santa Catarina (SC)', /\/SC\b|\(SC\)|Santa Catarina|Florian[óo]polis|PMSC|PCSC|TJSC/],
  ['df', 'DF', 'Distrito Federal (DF)', 'no Distrito Federal (DF)', /\/DF\b|\(DF\)|Distrito Federal|Bras[íi]lia|SEEDF|PMDF|PCDF|TJDFT/],
  ['ce', 'CE', 'Ceará (CE)', 'no Ceará (CE)', /\/CE\b|\(CE\)|Cear[áa]|Fortaleza|PMCE|PCCE|SEDUC-CE/],
  ['pa', 'PA', 'Pará (PA)', 'no Pará (PA)', /\/PA\b|\(PA\)|\bPará\b|Estado do Par[áa]|Bel[ée]m\/PA|SEDUC-PA|PMPA|PCPA/],
  ['pb', 'PB', 'Paraíba (PB)', 'na Paraíba (PB)', /\/PB\b|\(PB\)|Para[íi]ba|Jo[ãa]o Pessoa|Campina Grande|PMPB|PCPB/],
  ['rn', 'RN', 'Rio Grande do Norte (RN)', 'no Rio Grande do Norte (RN)', /\/RN\b|\(RN\)|Rio Grande do Norte|Natal\/RN/],
  ['al', 'AL', 'Alagoas (AL)', 'em Alagoas (AL)', /\/AL\b|\(AL\)|Alagoas|Macei[óo]/],
  ['se', 'SE', 'Sergipe (SE)', 'em Sergipe (SE)', /\/SE\b|\(SE\)|Sergipe|Aracaju/],
  ['pi', 'PI', 'Piauí (PI)', 'no Piauí (PI)', /\/PI\b|\(PI\)|Piau[íi]|Teresina/],
  ['mt', 'MT', 'Mato Grosso (MT)', 'em Mato Grosso (MT)', /\/MT\b|\(MT\)|Mato Grosso(?! do Sul)|Cuiab[áa]/],
  ['ms', 'MS', 'Mato Grosso do Sul (MS)', 'em Mato Grosso do Sul (MS)', /\/MS\b|\(MS\)|Mato Grosso do Sul|Campo Grande\/MS/],
  ['am', 'AM', 'Amazonas (AM)', 'no Amazonas (AM)', /\/AM\b|\(AM\)|Amazonas|Manaus/],
  ['to', 'TO', 'Tocantins (TO)', 'no Tocantins (TO)', /\/TO\b|\(TO\)|Tocantins|Palmas\/TO/],
  ['ro', 'RO', 'Rondônia (RO)', 'em Rondônia (RO)', /\/RO\b|\(RO\)|Rond[ôo]nia|Porto Velho/],
  ['ac', 'AC', 'Acre (AC)', 'no Acre (AC)', /\/AC\b|\(AC\)|\bAcre\b|Rio Branco/],
  ['ap', 'AP', 'Amapá (AP)', 'no Amapá (AP)', /\/AP\b|\(AP\)|Amap[áa]|Macap[áa]/],
  ['rr', 'RR', 'Roraima (RR)', 'em Roraima (RR)', /\/RR\b|\(RR\)|Roraima|Boa Vista\/RR/]
];

const STATES = STATE_LIST.map(([slug, uf, name, prep, match]) => ({
  slug,
  uf,
  name,
  prep,
  match,
  metaTitle: slug === 'nacional'
    ? 'Apostilas para Concursos Nacionais e Federais | Trilha Aprova'
    : `Apostilas para Concursos ${prep} | Trilha Aprova`,
  description: slug === 'nacional'
    ? 'Apostilas em PDF com audiobook para concursos nacionais e federais: INSS, Receita Federal, IBGE e matérias básicas válidas em todo o Brasil.'
    : `Apostilas digitais para concursos públicos ${prep} em PDF com audiobook grátis e questões comentadas. Acesso imediato na Trilha Aprova.`,
  intro: slug === 'nacional'
    ? 'Apostilas válidas para candidatos de todo o Brasil: grandes seleções nacionais e federais acompanhadas da linha completa de matérias básicas, redação e cadernos de questões comentadas.'
    : `Catálogo de apostilas digitais para concursos públicos ${prep}, com teoria direcionada ao edital, questões comentadas e audiobook em capítulos para estudar e revisar no seu ritmo.`
}));

const LEVELS = [
  {
    slug: 'fundamental',
    name: 'Nível Fundamental e Alfabetizado',
    shortName: 'Nível Fundamental',
    metaTitle: 'Apostilas para Concurso Nível Fundamental PDF | Trilha Aprova',
    description: 'Apostilas em PDF com audiobook para concursos de nível fundamental e alfabetizado: IBGE, prefeituras, redação e matérias básicas explicadas do zero.',
    intro: 'Materiais pensados para quem vai prestar concursos de nível fundamental ou alfabetizado — inclusive para quem está há anos sem estudar — com explicação do zero, linguagem clara, questões comentadas e audiobook.'
  },
  {
    slug: 'medio',
    name: 'Nível Médio e Técnico',
    shortName: 'Nível Médio',
    metaTitle: 'Apostilas para Concurso de Nível Médio em PDF | Trilha Aprova',
    description: 'Apostilas para concursos de nível médio e técnico em PDF com audiobook: TJ-SP Escrevente, INSS, PM-SP, Banestes, CETESB, Coren-SP, IFG e prefeituras.',
    intro: 'Os concursos de nível médio e técnico reúnem algumas das maiores oportunidades do país. Aqui estão todas as apostilas da Trilha Aprova para cargos de ensino médio e técnico, com teoria completa, simulados e audiobook.'
  },
  {
    slug: 'superior',
    name: 'Nível Superior',
    shortName: 'Nível Superior',
    metaTitle: 'Apostilas para Concurso de Nível Superior PDF | Trilha Aprova',
    description: 'Apostilas para concursos de nível superior em PDF com audiobook: professores SEE-SP, PC-PE, Polícia Penal PE, TJ-SP Oficial, Receita Federal e mais.',
    intro: 'Apostilas completas para cargos de nível superior em educação, segurança pública, tribunais, conselhos profissionais, área fiscal e legislativo, com legislação comentada, simulados no estilo da banca e audiobook.'
  }
];

const GENERAL_SLUGS = new Set([
  'redacao-nivel-fundamental-2026',
  'curso-redacao-concursos-2026',
  'portugues-completo-concursos',
  'conhecimentos-pedagogicos-professor',
  'matematica-raciocinio-logico-concursos',
  'informatica-para-concursos',
  'direito-constitucional-administrativo-concursos',
  'cadernos-questoes-por-banca',
  'kit-base-plano-de-estudos'
]);

function detectBoard(p) {
  const raw = String(p.examBoard || '');
  return BOARDS.find(b => b.match.test(raw)) || null;
}

function detectAreas(p) {
  const areas = new Set();
  const sfArea = (p.storefront && p.storefront.area) || '';
  const text = `${p.slug} ${p.shortName} ${p.contest} ${p.audience} ${p.category}`.toLowerCase();

  if (GENERAL_SLUGS.has(p.slug)) areas.add('materias-basicas-e-redacao');
  if (sfArea === 'educacao' || /professor|pedagog|educa[çc][ãa]o|peif|escolar|agente educativo|auxiliar de secretaria/.test(text)) {
    areas.add('educacao');
  }
  if (sfArea === 'seguranca' || /pol[íi]cia|guarda municipal|soldado|penal|bombeiro/.test(text)) {
    areas.add('policial-e-seguranca');
  }
  if (/tribunal|tj-|tjsp|tce-|tcm-|controle externo|escrevente|oficial de justi/.test(text)) {
    areas.add('tribunais-e-controle');
  }
  if (/banestes|banc[áa]rio|banco do brasil|caixa|receita federal|tribut[áa]rio|auditor|inss|seguro social/.test(text)) {
    areas.add('bancaria-e-fiscal');
  }
  if (sfArea === 'saude' || /sa[úu]de|enfermeir|coren|sus\b|\bfns\b|hospital|m[ée]dic/.test(text)) {
    areas.add('saude');
  }
  if (sfArea === 'administrativo' || sfArea === 'tecnico' || sfArea === 'saude' || /administrativ|legislativo|fiscal|assistente|recenseador|alfabetizado|gestor/.test(text)) {
    if (!GENERAL_SLUGS.has(p.slug)) areas.add('administrativa');
  }
  if (!areas.size) areas.add('administrativa');
  return [...areas];
}

function detectStates(p) {
  const local = String((p.storefront && p.storefront.concurso && p.storefront.concurso.local) || '');
  const text = `${p.slug} ${p.contest} ${local}`;
  const states = new Set();

  if (GENERAL_SLUGS.has(p.slug)) states.add('nacional');
  for (const s of STATES) {
    if (s.match.test(text)) states.add(s.slug);
  }
  if (!states.size) states.add('nacional');
  return [...states];
}

function detectLevels(p) {
  const req = String((p.storefront && p.storefront.concurso && p.storefront.concurso.requisito) || '');
  const text = `${p.slug} ${p.audience} ${p.name} ${req}`.toLowerCase();
  const levels = new Set();

  if (p.slug === 'redacao-nivel-fundamental-2026' || /alfabetizado|ensino fundamental|n[íi]vel fundamental/.test(text)) {
    levels.add('fundamental');
  }
  if (/ensino m[ée]dio|n[íi]vel m[ée]dio|n[íi]vel t[ée]cnico|t[ée]cnico em|t[ée]cnico banc|guarda municipal|soldado|escrevente|assistente administr|auxiliar de secretaria|agente educativo|t[ée]cnico legislativo|t[ée]cnico de controle|fiscal de obras|t[ée]cnico do seguro social/.test(text)) {
    levels.add('medio');
  }
  if (/n[íi]vel superior|ensino superior|licenciatura|gradua[çc][ãa]o|bacharel|professor|pedagog|enfermeiro|analista|agente de pol[íi]cia|policial penal|oficial de justi/.test(text)) {
    levels.add('superior');
  }
  if (GENERAL_SLUGS.has(p.slug) && p.slug !== 'redacao-nivel-fundamental-2026' && p.slug !== 'conhecimentos-pedagogicos-professor') {
    levels.add('medio');
    levels.add('superior');
    if (p.slug !== 'curso-redacao-concursos-2026' && p.slug !== 'direito-constitucional-administrativo-concursos') {
      levels.add('fundamental');
    }
  }
  if (!levels.size) levels.add('medio');
  return [...levels];
}

function classifyProduct(p) {
  return {
    board: detectBoard(p),
    areas: detectAreas(p),
    states: detectStates(p),
    levels: detectLevels(p),
    isGeneral: GENERAL_SLUGS.has(p.slug)
  };
}

/**
 * Gera um H1 transacional claro contendo a palavra-chave exata buscada no Google
 * ("Apostila ...", "Curso ...", "Cadernos ...", "Kit ...") sem duplicar termos.
 */
function productH1(p) {
  const short = String(p.shortName || p.name || '').trim();
  const board = detectBoard(p);
  const hasBoardInName = board && new RegExp('\\b' + board.name.replace('/', '\\/') + '\\b', 'i').test(short);
  const boardTag = board && !hasBoardInName ? ` (${board.name})` : '';

  if (p.kind === 'curso') {
    return `${short} — PDF, Modelos e Audiobook`;
  }
  if (/^(apostila|curso|cadernos?|kit)\b/i.test(short)) {
    return `${short}${boardTag} — PDF + Audiobook`;
  }
  return `Apostila ${short}${boardTag} — PDF + Audiobook`;
}

function clampMetaTitle(s) {
  if (s.length <= 70) return s;
  return s.replace(' | Trilha Aprova', '').slice(0, 54).trimEnd() + ' | Trilha Aprova';
}

function buildTaxonomyHubs(products) {
  const classified = products.map(p => ({ p, tax: classifyProduct(p) }));
  const basicProducts = classified.filter(x => x.tax.isGeneral).map(x => x.p);

  const boardHubs = BOARDS.map(b => {
    const items = classified.filter(x => x.tax.board && x.tax.board.slug === b.slug).map(x => x.p);
    return {
      group: 'banca',
      slug: b.slug,
      path: `/apostilas/banca/${b.slug}`,
      label: b.name,
      fullName: b.fullName,
      title: `Apostilas banca ${b.name} em PDF e Audiobook`,
      metaTitle: clampMetaTitle(`Apostilas Banca ${b.name} para Concursos PDF | Trilha Aprova`),
      description: `Apostilas direcionadas para a banca ${b.fullName} em PDF com audiobook grátis e questões comentadas no estilo da organizadora.`,
      kicker: `BANCA ORGANIZADORA · ${b.name.toUpperCase()}`,
      intro: `${b.profile} Reunimos abaixo todas as apostilas da Trilha Aprova elaboradas para certames da banca ${b.fullName}, com PDF completo, questões comentadas e audiobook.`,
      tip: b.tip,
      items,
      complementary: []
    };
  }).filter(h => h.items.length >= 2);

  const areaHubs = AREAS.map(a => {
    const items = classified.filter(x => x.tax.areas.includes(a.slug)).map(x => x.p);
    return {
      group: 'area',
      slug: a.slug,
      path: `/apostilas/area/${a.slug}`,
      label: a.shortName,
      fullName: a.name,
      title: `Apostilas para Concursos — ${a.name}`,
      metaTitle: clampMetaTitle(a.metaTitle),
      description: a.description,
      kicker: `ÁREA DE CONCURSO · ${a.shortName.toUpperCase()}`,
      intro: a.intro,
      items,
      complementary: []
    };
  }).filter(h => h.items.length >= 2);

  const stateHubs = STATES.map(s => {
    const items = classified.filter(x => x.tax.states.includes(s.slug)).map(x => x.p);
    const complementary = s.slug === 'nacional' || items.length >= 4
      ? []
      : basicProducts.filter(bp => !items.some(i => i.slug === bp.slug)).slice(0, 6);
    return {
      group: 'estado',
      slug: s.slug,
      uf: s.uf,
      path: `/apostilas/estado/${s.slug}`,
      label: s.name,
      fullName: s.name,
      title: s.slug === 'nacional' ? 'Apostilas para Concursos Nacionais e Federais' : `Apostilas para Concursos ${s.prep}`,
      metaTitle: clampMetaTitle(s.metaTitle),
      description: s.description,
      kicker: s.slug === 'nacional' ? 'ABRANGÊNCIA NACIONAL · TODO O BRASIL' : `CONCURSOS POR ESTADO · ${s.uf}`,
      intro: s.intro,
      items,
      complementary
    };
  }).filter(h => h.items.length >= 1);

  const levelHubs = LEVELS.map(l => {
    const items = classified.filter(x => x.tax.levels.includes(l.slug)).map(x => x.p);
    return {
      group: 'nivel',
      slug: l.slug,
      path: `/apostilas/nivel/${l.slug}`,
      label: l.shortName,
      fullName: l.name,
      title: `Apostilas para Concursos de ${l.name}`,
      metaTitle: clampMetaTitle(l.metaTitle),
      description: l.description,
      kicker: `ESCOLARIDADE · ${l.shortName.toUpperCase()}`,
      intro: l.intro,
      items,
      complementary: []
    };
  }).filter(h => h.items.length >= 2);

  return {
    boardHubs,
    areaHubs,
    stateHubs,
    levelHubs,
    allHubs: [...boardHubs, ...areaHubs, ...stateHubs, ...levelHubs]
  };
}

module.exports = {
  BOARDS,
  AREAS,
  STATES,
  LEVELS,
  classifyProduct,
  productH1,
  buildTaxonomyHubs
};
