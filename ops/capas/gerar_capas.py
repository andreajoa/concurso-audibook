"""Capas 3D padrão Trilha Aprova: 3 capas por apostila (Simulados · Apostila Completa · 3º caderno),
todas a partir do MESMO molde (capa 3D do Professor Adjunto I), trocando só os textos.

Uso:  PYTHONPATH=<deps com PIL e numpy> python3.12 ops/capas/gerar_capas.py [slug ...]
Saída: public/assets/capa-<slug>-<parte>-3d.png  (parte = completa | simulados | terceiro)
Baseado em capa3d.py da produção de Aparecida (12/11/2026), aprovado pelo André.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
MOLDE = ROOT / 'public/assets/apostila-professor-adjunto-i-3d.png'
SUP = '/System/Library/Fonts/Supplemental/'; SYS = '/System/Library/Fonts/'
TF = SUP + 'Georgia Bold.ttf'; AV = SYS + 'Avenir Next.ttc'
NAVY = (14, 33, 58); COPPER = (176, 92, 42); INK = (30, 40, 55)

def font(path, size, index=0): return ImageFont.truetype(path, size, index=index)
def coeffs(src, dst):
    m = []
    for (x, y), (u, v) in zip(dst, src):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    return np.linalg.solve(np.array(m, float), np.array(src, float).reshape(8)).tolist()
def paint_rows(img, x0, x1, y0, y1, xl, xr, fx=45, fy=5):
    a = np.array(img).astype(float); b = a.copy()
    for y in range(y0, y1):
        cl = a[y, xl, :3]; cr = a[y, xr, :3]; t = np.linspace(0, 1, x1 - x0)[:, None]
        b[y, x0:x1, :3] = cl * (1 - t) + cr * t
    m = np.zeros(a.shape[:2]); m[y0:y1, x0:x1] = 1
    for i in range(fx):
        w = (i + 1) / (fx + 1); m[y0:y1, x0 + i] = np.minimum(m[y0:y1, x0 + i], w); m[y0:y1, x1 - 1 - i] = np.minimum(m[y0:y1, x1 - 1 - i], w)
    for i in range(fy):
        w = (i + 1) / (fy + 1); m[y0 + i, x0:x1] *= w; m[y1 - 1 - i, x0:x1] *= w
    a[:, :, :3] = a[:, :, :3] * (1 - m[:, :, None]) + b[:, :, :3] * m[:, :, None]
    return Image.fromarray(a.astype('uint8'), img.mode)
def paint_cols(img, x0, x1, y0, y1, ysample):
    a = np.array(img).astype(float); a[y0:y1, x0:x1, :3] = a[ysample, x0:x1, :3][None, :, :]
    return Image.fromarray(a.astype('uint8'), img.mode)
def fit(draw, text, path, maxw, start, index=0):
    s = start
    while s > 8:
        f = font(path, s, index)
        if draw.textlength(text, font=f) <= maxw: return f
        s -= 1
    return font(path, s, index)
def center(draw, cx, y, text, f, fill):
    w = draw.textlength(text, font=f); draw.text((cx - w / 2, y), text, font=f, fill=fill)

FQ = [(248, 7), (1062, 104), (1062, 1326), (248, 1390)]; FW, FH = 900, 1380
SQ = [(106, 48), (246, 4), (246, 1391), (106, 1368)]; SW, SH = 150, 1380

def gerar(t1, t2, cobre, caixa, linhas, lombada, lombada3, destino):
    src = Image.open(MOLDE).convert('RGBA')
    front = src.transform((FW, FH), Image.PERSPECTIVE, coeffs(FQ, [(0, 0), (FW, 0), (FW, FH), (0, FH)]), Image.BICUBIC)
    spine = src.transform((SW, SH), Image.PERSPECTIVE, coeffs(SQ, [(0, 0), (SW, 0), (SW, SH), (0, SH)]), Image.BICUBIC)
    front = paint_rows(front, 30, 875, 446, 668, 22, 882)
    front = paint_rows(front, 30, 848, 664, 718, 22, 850, fx=14, fy=3)
    front = paint_rows(front, 60, 788, 738, 864, 57, 791, fx=6, fy=3)
    # apaga "PREFEITURA MUNICIPAL DE SANTOS" do frontão do prédio
    reg = (640, 870, 900, 1010); patch = front.crop(reg).convert('RGBA')
    poly = [(18, 92), (240, 14), (246, 52), (24, 132)]
    m = Image.new('L', patch.size, 0); ImageDraw.Draw(m).polygon(poly, fill=255)
    arr = np.array(patch).astype(float); mm = np.array(m) > 0
    for x in range(patch.width):
        ys = np.where(mm[:, x])[0]
        if len(ys) == 0: continue
        y0, y1 = max(ys.min() - 3, 0), min(ys.max() + 3, patch.height - 1)
        top = arr[y0, x, :3]; bot = arr[y1, x, :3]
        for y in range(y0, y1 + 1):
            t = (y - y0) / max(1, (y1 - y0)); arr[y, x, :3] = top * (1 - t) + bot * t
    fill = Image.fromarray(arr.astype('uint8'), 'RGBA').filter(ImageFilter.GaussianBlur(1.5))
    patch.paste(fill, (0, 0), m.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(3))); front.paste(patch, reg[:2])
    d = ImageDraw.Draw(front)
    f1 = fit(d, t1, TF, 720, 130); center(d, 450, 438, t1, f1, NAVY)
    if t2:
        f2 = fit(d, t2, TF, 720, f1.size + 6); center(d, 450, 548 + max(0, (f1.size - f2.size) // 2), t2, f2, NAVY)
    center(d, 405, 674, cobre, fit(d, cobre, AV, 700, 34, index=2), COPPER)
    center(d, 425, 750, caixa, fit(d, caixa, AV, 700, 25, index=2), NAVY)
    for i, t in enumerate(linhas[:3]): center(d, 425, 786 + i * 25, t, fit(d, t, AV, 712, 19, index=0), INK)
    spine = paint_cols(spine, 6, 148, 352, 938, 350); spine = paint_cols(spine, 8, 145, 985, 1128, 975)
    sd = ImageDraw.Draw(spine); ft = font(TF, 58)
    while ft.size > 20 and sd.textlength(lombada, font=ft) > 640: ft = font(TF, ft.size - 1)
    w = int(sd.textlength(lombada, font=ft)); bb = ft.getbbox(lombada); h = bb[3] - bb[1]
    lay = Image.new('RGBA', (w + 10, h + 20), (0, 0, 0, 0)); ImageDraw.Draw(lay).text((5, 10 - bb[1]), lombada, font=ft, fill=NAVY + (255,))
    lay = lay.rotate(-90, expand=True); spine.paste(lay, (int(SW / 2 - lay.width / 2) + 2, int(605 - lay.height / 2)), lay)
    for i, t in enumerate(lombada3[:3]): center(sd, SW / 2 + 2, 1000 + i * 30, t, fit(sd, t, AV, 130, 19, index=2), NAVY)
    out = src.copy()
    fw = front.transform(src.size, Image.PERSPECTIVE, coeffs([(0, 0), (FW, 0), (FW, FH), (0, FH)], FQ), Image.BICUBIC)
    sw = spine.transform(src.size, Image.PERSPECTIVE, coeffs([(0, 0), (SW, 0), (SW, SH), (0, SH)], SQ), Image.BICUBIC)
    def qmask(q, shrink=3):
        mk = Image.new('L', src.size, 0); ImageDraw.Draw(mk).polygon(q, fill=255)
        return mk.filter(ImageFilter.MinFilter(2 * shrink + 1)).filter(ImageFilter.GaussianBlur(1.2))
    alpha = src.getchannel('A'); out.paste(sw, (0, 0), qmask(SQ)); out.paste(fw, (0, 0), qmask(FQ))
    al = np.array(alpha); al[np.array(qmask(FQ, 0)) > 0] = 255
    al[np.array(qmask(SQ, 0)) > 0] = np.maximum(al[np.array(qmask(SQ, 0)) > 0], 250); out.putalpha(Image.fromarray(al))
    out.save(destino, optimize=True); print(destino.name, out.size)

# textos por apostila: centro (Apostila Completa), simulados (esquerda) e terceiro caderno (direita)
SPEC = {
 'aparecida-de-goiania-pe1-pedagogia-2026': dict(sigla='PE-I', cobre='PREFEITURA DE APARECIDA DE GOIÂNIA • 2026', ed='EDITAL Nº 01/2026', lomb=['APARECIDA', 'DE GOIÂNIA', 'PE-I • 2026'],
   completa=('PEDAGOGIA', 'PE-I', ['Instituto Verbena/UFG • Educação Infantil e anos iniciais • BNCC • PNE 2026', 'CF, LDB, ECA e LBI • Lei Orgânica • Goiás e Aparecida • alfabetização', 'inclusão • redação dissertativa • questões comentadas • 2 simulados']),
   simulados=['2 simulados de 50 questões • 4 alternativas • formato da prova', 'gabarito comentado questão a questão • tempo de prova cronometrado', 'Língua Portuguesa • Raciocínio Lógico • Goiás • Conhecimentos Específicos'],
   terceiro=('LEGISLAÇÃO', ['Constituição Federal • LDB (Lei 9.394/1996) • ECA (Lei 8.069/1990)', 'Novo PNE (Lei 15.388/2026) • BNCC • Lei Brasileira de Inclusão', 'Lei Orgânica de Aparecida de Goiânia • textos oficiais compilados'])),
 'tjsp-escrevente-tecnico-judiciario-2026': dict(sigla='TJ-SP', cobre='TRIBUNAL DE JUSTIÇA DE SÃO PAULO • 2026', ed='EDITAL Nº 02/2026', lomb=['TJ-SP', 'ESCREVENTE', 'VUNESP • 2026'],
   completa=('ESCREVENTE', 'TJ-SP', ['VUNESP • Português • Matemática • Raciocínio Lógico • Informática', 'Direito Constitucional, Penal, Processual Penal e Processual Civil', 'Direito Administrativo • Normas da Corregedoria • redação']),
   simulados=['simulado autoral de 70 questões no estilo VUNESP', 'gabarito comentado questão a questão', 'Português • Matemática • Informática • Direito • Normas'],
   terceiro=('LEGISLAÇÃO', ['Constituição Federal • Código Penal • Código de Processo Penal', 'Código de Processo Civil • Estatuto dos Servidores • Regimento Interno', 'Normas da Corregedoria • textos oficiais do edital'])),
 'banestes-tecnico-bancario-2026': dict(sigla='BANESTES', cobre='BANCO DO ESTADO DO ESPÍRITO SANTO • 2026', ed='EDITAL Nº 01/2026', lomb=['BANESTES', 'TÉCNICO', 'FCC • 2026'],
   completa=('TÉCNICO', 'BANCÁRIO', ['Fundação Carlos Chagas • Conhecimentos Bancários • Vendas e Negociação', 'Matemática Financeira • Probabilidade e Estatística • Informática', 'Português • Atualidades do mercado • Ética, compliance e ESG']),
   simulados=['2 simulados de 70 questões • 5 alternativas • formato FCC', 'gabarito comentado questão a questão', 'Bancários • Vendas • Matemática Financeira • Português • Informática'],
   terceiro=('NORMAS', ['Guia de Conduta Ética do Banestes', 'Resolução CMN 4.966/2021', 'compliance, prevenção e regulação bancária'])),
 'ibge-recenseador-censo-agro-2026': dict(sigla='IBGE', cobre='IBGE • 12º CENSO AGROPECUÁRIO • 2026', ed='EDITAL Nº 03/2026', lomb=['IBGE', 'RECENSEADOR', 'CESGRANRIO'],
   completa=('RECENSEADOR', 'IBGE', ['Fundação Cesgranrio • Língua Portuguesa • Matemática', 'Conhecimentos Técnicos do Censo Agro capítulo a capítulo', 'setores censitários • coordenadas • estabelecimento agropecuário']),
   simulados=['2 simulados de 60 questões • 5 alternativas • formato Cesgranrio', 'gabarito comentado questão a questão', 'Português • Matemática • Conhecimentos Técnicos'],
   terceiro=('TÉCNICO', ['Documento técnico oficial do IBGE na íntegra', 'conceitos e procedimentos do Censo Agropecuário', 'material de consulta para a parte técnica da prova'])),
 'matao-sp-fiscal-de-obras-ed02-2026': dict(sigla='FISCAL', cobre='PREFEITURA DE MATÃO - SP • 2026', ed='CONCURSO PÚBLICO Nº 02/2026', lomb=['MATÃO', 'FISCAL', 'IBAM • 2026'],
   completa=('FISCAL', 'DE OBRAS', ['IBAM • 22 unidades: Português, Matemática, Informática', 'Projetos, medições, construção, fiscalização e drenagem', 'Legislação e Defesa Civil • relatórios e documentação']),
   simulados=['2 simulados de 40 questões + exercícios • 160 questões', 'gabarito comentado questão a questão', 'Português • Matemática • Informática • Conhecimentos Específicos'],
   terceiro=('REVISÃO', ['revisão final por unidade do edital', 'matriz do edital e fontes oficiais', 'roteiro para a reta final da prova'])),
 'matao-sp-assistente-administrativo-2026': dict(sigla='ASSISTENTE', cobre='PREFEITURA DE MATÃO - SP • 2026', ed='CONCURSO PÚBLICO Nº 01/2026', lomb=['MATÃO', 'ASSISTENTE', 'IBAM • 2026'],
   completa=('ASSISTENTE', 'ADMINISTRATIVO', ['IBAM • cargo 101 • Língua Portuguesa • Matemática', 'Informática • Legislação aplicada à administração pública', '160 questões autorais comentadas • 2 simulados de 40 itens']),
   simulados=['2 simulados de 40 questões + 80 exercícios comentados', 'gabarito comentado questão a questão', 'Português • Matemática • Informática • Legislação'],
   terceiro=('REVISÃO', ['roteiro da primeira leitura à revisão', 'pontos-chave do edital do cargo 101', 'plano para a semana da prova'])),
 'professor-adjunto-i-ibam-santos-2026': dict(sigla='PROF. ADJ. I', cobre='PREFEITURA DE SANTOS • 2026', ed='EDITAL Nº 79/2026', lomb=['SANTOS', 'PROFESSOR', 'IBAM • 2026'],
   completa=None,
   simulados=['200 questões, incluindo 3 simulados completos', 'gabarito comentado questão a questão', 'Legislação • autores • Educação Infantil, anos iniciais e EJA'],
   terceiro=('REVISÃO', ['revisão final: o que foi conferido no edital', 'mapa de cobertura do Edital 79/2026 e rerratificações', 'prova dissertativa: mapas de argumentação'])),
 'sme-sp-peif-pre-edital-2026': dict(sigla='PEIF', cobre='SME-SP • PROFESSOR PEIF • PRÉ-EDITAL 2026', ed='EDIÇÃO PRÉ-EDITAL 2026', lomb=['SME-SP', 'PEIF', 'PRÉ-EDITAL'],
   completa=None,
   simulados=['simulado final de 60 questões autorais', '18 estudos de caso e 12 pontos de prova prática', 'gabarito comentado questão a questão'],
   terceiro=('REVISÃO', ['roteiros de estudo por módulo', 'revisão final dos 14 módulos', 'Currículo da Cidade • legislação • autores'])),
 'redacao-nivel-fundamental-2026': dict(sim_t1='EXERCÍCIOS', sigla='REDAÇÃO', cobre='CONCURSOS DE NÍVEL FUNDAMENTAL • 2026', ed='CONCURSOS 2026', lomb=['REDAÇÃO', 'NÍVEL', 'FUNDAMENTAL'],
   completa=('REDAÇÃO', 'NÍVEL FUNDAMENTAL', ['19 módulos • 325 páginas • 500 questões com gabarito comentado', 'dissertação, narração, relato, descrição, carta, e-mail, bilhete e aviso', 'ortografia • acentuação • pontuação • concordância • interpretação']),
   simulados=['500 questões de múltipla escolha, módulo a módulo', 'gabarito comentado de todas as questões', 'comando, revisão e reescrita • português da prova objetiva'],
   terceiro=('MODELOS', ['20 propostas comentadas com redação-modelo', 'modelos de carta, requerimento, declaração, aviso e relato', 'folhas pautadas para treinar no tempo da prova'])),
 'curso-redacao-concursos-2026': dict(sim_t1='SIMULADOS', sigla='REDAÇÃO', cobre='CONCURSOS PÚBLICOS • TODAS AS BANCAS • 2026/2027', ed='2026/2027', lomb=['CURSO DE', 'REDAÇÃO', '2026/2027'],
   completa=('CURSO DE', 'REDAÇÃO', ['22 módulos + 10 anexos • 728 páginas • 1.616 questões comentadas', 'tese, planejamento, coesão, conclusão e a gramática que derruba nota', 'redação por banca: Cebraspe, FGV, Vunesp, FCC, Cesgranrio, IBFC e Ibam']),
   simulados=['30 propostas inéditas no formato das bancas', 'grade de autocorreção e 3 correções comentadas', '75 questões discursivas por área de cargo'],
   terceiro=('MODELOS', ['60 textos-modelo comentados: redações, respostas e documentos', 'banco de 80 temas com planejamento pronto', 'ofício, requerimento, relatório, ata e parecer'])),
 'aparecida-de-goiania-agente-educativo-2026': dict(sim_t1='SIMULADOS', sigla='AGENTE EDUCATIVO', cobre='PREFEITURA DE APARECIDA DE GOIÂNIA • 2026', ed='EDITAL Nº 01/2026', lomb=['APARECIDA', 'DE GOIÂNIA', 'AGENTE • 2026'],
   completa=('AGENTE', 'EDUCATIVO', ['Instituto Verbena/UFG • 651 páginas • 1.512 questões comentadas', 'Português • Raciocínio Lógico • Goiás e Aparecida • Conhecimentos Específicos', 'ética e sigilo • LDB • ECA • rotinas • primeiros socorros • inclusão']),
   simulados=['2 simulados de 40 questões • 4 alternativas • formato da prova', 'mesma distribuição e pesos do edital • tabela para calcular a nota', 'gabarito comentado questão a questão'],
   terceiro=('LEGISLAÇÃO', ['LDB (arts. 2º a 7º e 29 a 31) • ECA aplicado à escola', 'Estatuto da Pessoa com Deficiência (arts. 3º e 27 a 30)', 'Lei Orgânica de Aparecida: educação e servidores públicos'])),
 'pm-sp-aluno-soldado-2027': dict(sim_t1='SIMULADOS', sigla='ALUNO-SOLDADO PM', cobre='POLÍCIA MILITAR DO ESTADO DE SÃO PAULO • 2027', ed='EDITAL DP-4/321/26', lomb=['PM-SP', 'SOLDADO', 'VUNESP • 2027'],
   completa=('SOLDADO', 'PM-SP', ['Fundação VUNESP • 882 páginas • 1.530 questões comentadas', 'Português • Matemática • Conhecimentos Gerais • Informática', 'Administração Pública • Redação VUNESP • legislação na íntegra']),
   simulados=['2 simulados de 60 questões • 5 alternativas • formato da prova', 'Português 20 • Matemática 15 • Gerais 15 • Informática 5 • Adm. 5', 'gabarito comentado questão a questão'],
   terceiro=('LEGISLAÇÃO', ['Constituição Federal: arts. 5º, 14 a 16, 37, 38, 42 e 144', 'Constituição Paulista: Executivo, Justiça Militar, servidores e PM', 'Lei de Acesso à Informação e Decreto estadual nº 68.155/2023'])),
 'portugues-completo-concursos': dict(sim_t1='SIMULADOS', sigla='PORTUGUÊS', cobre='PARA TODOS OS CONCURSOS • NÍVEIS FUNDAMENTAL, MÉDIO E SUPERIOR', ed='ACORDO ORTOGRÁFICO VIGENTE', lomb=['PORTUGUÊS', 'COMPLETO', 'CONCURSOS'],
   completa=('PORTUGUÊS', 'COMPLETO', ['751 páginas • 1.526 questões comentadas • estilo das bancas', 'interpretação • coesão • semântica • ortografia • morfologia • sintaxe', 'pontuação • concordância • regência • crase • colocação • redação oficial']),
   simulados=['3 simulados de 40 questões: VUNESP, FGV e Cebraspe', 'múltipla escolha e itens de Certo ou Errado', 'gabarito comentado questão a questão'],
   terceiro=('REDAÇÃO OFICIAL', ['Manual de Redação da Presidência da República (3ª ed.)', 'padrão ofício • pronomes de tratamento • fechos', 'correio eletrônico • requerimento • atestado'])),
 'matematica-raciocinio-logico-concursos': dict(sim_t1='SIMULADOS', sigla='MATEMÁTICA', cobre='PARA TODOS OS CONCURSOS • NÍVEIS FUNDAMENTAL, MÉDIO E SUPERIOR', ed='MATEMÁTICA E RLM', lomb=['MATEMÁTICA', 'RACIOCÍNIO', 'LÓGICO'],
   completa=('MATEMÁTICA', 'E RLM', ['643 páginas • 1.592 questões comentadas • passo a passo', 'frações • MMC e MDC • proporção • porcentagem • juros', 'equações • geometria • estatística • probabilidade • lógica']),
   simulados=['2 simulados de 40 questões com gabarito comentado', 'múltipla escolha e itens de Certo ou Errado', '1.592 questões em 13 módulos de treino'],
   terceiro=('RACIOCÍNIO LÓGICO', ['conectivos, tabela-verdade, negações e equivalências', 'argumentos, quantificadores e diagramas de conjuntos', 'sequências, calendário, verdades e mentiras'])),
 'informatica-para-concursos': dict(sim_t1='SIMULADOS', sigla='INFORMÁTICA', cobre='PARA TODOS OS CONCURSOS • NÍVEIS FUNDAMENTAL, MÉDIO E SUPERIOR', ed='WINDOWS 11 • MICROSOFT 365', lomb=['INFORMÁTICA', 'PARA', 'CONCURSOS'],
   completa=('INFORMÁTICA', 'CONCURSOS', ['616 páginas • 1.949 questões comentadas • todas as bancas', 'hardware • Windows • Linux • Word e Writer • Excel e Calc', 'redes • internet • e-mail • segurança • nuvem • LGPD • IA']),
   simulados=['2 simulados de 40 questões com gabarito comentado', 'múltipla escolha e itens de Certo ou Errado', '1.949 questões em 11 módulos de treino'],
   terceiro=('SEGURANÇA DIGITAL', ['vírus, worm, trojan, ransomware e golpes de phishing', 'backup completo, incremental e diferencial', 'criptografia, assinatura e certificado digital'])),
 'direito-constitucional-administrativo-concursos': dict(sim_t1='SIMULADOS', sigla='DIREITO', cobre='PARA TODOS OS CONCURSOS • NÍVEIS MÉDIO E SUPERIOR', ed='LEI VIGENTE • LEI 14.133 • LEI 14.230', lomb=['DIREITO', 'CONSTITUCIONAL', 'E ADMINISTRATIVO'],
   completa=('DIREITO CONST.', 'E ADMINISTRATIVO', ['806 páginas • 1.759 questões comentadas • todas as bancas', 'princípios • art. 5º • organização do Estado • art. 37 • Poderes', 'atos administrativos • 9.784 • 14.133 • 8.112 • improbidade • LAI']),
   simulados=['2 simulados de 40 questões com gabarito comentado', 'múltipla escolha e itens de Certo ou Errado', '1.759 questões em 11 módulos de treino'],
   terceiro=('LETRA DA LEI', ['texto oficial e vigente: Constituição e leis federais', 'complete a lacuna • redação correta do artigo', 'gabarito com o dispositivo literal'])),
 'cadernos-questoes-por-banca': dict(sim_t1='SIMULADOS', sigla='CADERNOS', cobre='VUNESP • FGV • FCC • CEBRASPE', ed='4 BANCAS • QUESTÕES COMENTADAS', lomb=['CADERNOS', 'POR BANCA', 'VUNESP • FGV'],
   completa=('CADERNOS', 'POR BANCA', ['792 páginas • 2.010 questões comentadas • 4 bancas', 'raio-X de cada banca • técnicas de prova • estratégia', 'Português • Matemática e RLM • Informática • Direito']),
   simulados=['4 simulados de 40 questões, um por banca', 'VUNESP, FGV e FCC: 5 alternativas', 'Cebraspe: Certo ou Errado • nota líquida'],
   terceiro=('CEBRASPE', ['500 itens de Certo ou Errado comentados', 'Português, RLM, Informática e Direito', 'estratégia: quando deixar em branco'])),
 'kit-base-plano-de-estudos': dict(sim_t1='SIMULADOS', sigla='KIT BASE', cobre='PORTUGUÊS • MATEMÁTICA • INFORMÁTICA • REDAÇÃO', ed='4 APOSTILAS + PLANO DE ESTUDOS', lomb=['KIT BASE', 'PLANO DE', 'ESTUDOS'],
   completa=('KIT BASE', 'CONCURSOS', ['2.395 páginas • 5.627 questões comentadas • 5 audiobooks', 'Português • Matemática e RLM • Informática • Redação', 'Plano de Estudos: 30, 60 e 90 dias • ciclo • revisões']),
   simulados=['simulado diagnóstico de 60 questões', 'simulados finais em cada apostila', 'fichas de controle para imprimir'],
   terceiro=('PLANO DE ESTUDOS', ['planos de 30, 60 e 90 dias', 'ciclo de estudos e revisões 24h, 7d, 30d', 'técnicas com base científica e reta final'])),
 'tce-go-tecnico-controle-externo-2027': dict(sim_t1='SIMULADOS', sigla='TCE-GO', cobre='TRIBUNAL DE CONTAS DO ESTADO DE GOIÁS • 2026/2027', ed='EDITAL Nº 01/2026 • FCC', lomb=['TCE-GO', 'TÉCNICO', 'FCC • 2027'],
   completa=('TCE-GO', 'CONTROLE EXTERNO', ['Fundação Carlos Chagas • 1.234 páginas • 2.010 questões comentadas', 'Português • Matemática e RLM • Legislação do TCE-GO e de Goiás', 'Controle Externo • AFO e LRF • Contabilidade Pública • Administração']),
   simulados=['2 simulados de 70 questões • 5 alternativas • formato FCC', '25 gerais (peso 1) + 45 específicas (peso 2)', 'gabarito comentado questão a questão'],
   terceiro=('LEGISLAÇÃO', ['Constituição de Goiás e Lei Orgânica do TCE-GO (16.168/2007)', 'Regimento Interno • Lei 15.122/2005 • Estatuto (Lei 20.756/2020)', 'Leis estaduais 13.800/2001 e 18.025/2013, texto vigente'])),
 'conhecimentos-pedagogicos-professor': dict(sim_t1='SIMULADOS', sigla='PEDAGOGIA', cobre='CONCURSOS DE PROFESSOR • PEDAGOGO • COORDENADOR • DIRETOR', ed='LEGISLAÇÃO VIGENTE • NOVO PNE', lomb=['CONHECIMENTOS', 'PEDAGÓGICOS', 'PROFESSOR'],
   completa=('CONHECIMENTOS', 'PEDAGÓGICOS', ['706 páginas • 1.519 questões comentadas • lei vigente', 'LDB • ECA • Constituição • novo PNE • BNCC • Fundeb', 'teóricos • didática • avaliação • alfabetização • inclusão • casos']),
   simulados=['2 simulados de 40 questões com gabarito comentado', 'múltipla escolha e itens de Certo ou Errado', '1.519 questões em 13 módulos de treino'],
   terceiro=('LEGISLAÇÃO', ['LDB (Lei nº 9.394/1996) na íntegra, redação vigente', 'Constituição, arts. 205 a 214 • ECA: educação e Conselho Tutelar', 'Lei Brasileira de Inclusão • Lei do Bullying (13.185/2015)'])),
}

# Produtos avulsos de simulados: UMA capa no mesmo molde (capa-<slug>-3d.png), com os números do próprio produto.
AVULSO = {
 'simulados-aparecida-de-goiania-pe1-pedagogia-2026': dict(t1='5 SIMULADOS', t2='PE-I', cobre='PREFEITURA DE APARECIDA DE GOIÂNIA • 2026',
   caixa='CADERNO DE SIMULADOS — INSTITUTO VERBENA/UFG',
   linhas=['5 provas completas e inéditas • 50 questões cada • 250 questões', 'distribuição e pesos do edital • cartão-resposta para marcar', 'gabarito rápido e resolução comentada de cada questão'],
   lomb='SIMULADOS • PE-I', lomb3=['APARECIDA', 'DE GOIÂNIA', 'PE-I • 2026']),
}

def main(slugs):
    out = ROOT / 'public/assets'
    for slug in slugs:
        if slug in AVULSO:
            a = AVULSO[slug]
            gerar(a['t1'], a['t2'], a['cobre'], a['caixa'], a['linhas'], a['lomb'], a['lomb3'], out / f'capa-{slug}-3d.png')
            continue
        s = SPEC[slug]
        if s['completa']:
            t1, t2, ln = s['completa']
            gerar(t1, t2, s['cobre'], 'EDIÇÃO COMPLETA — ' + s['ed'], ln, f"{t1} • {t2}" if len(f"{t1} • {t2}") < 26 else t1, s['lomb'], out / f'capa-{slug}-completa-3d.png')
        st = s.get('sim_t1', 'SIMULADOS')
        gerar(st, s['sigla'], s['cobre'], f'CADERNO DE {st} — ' + s['ed'], s['simulados'], f'{st} • ' + s['sigla'], s['lomb'], out / f'capa-{slug}-simulados-3d.png')
        t3, ln3 = s['terceiro']
        gerar(t3, s['sigla'], s['cobre'], f'CADERNO DE {t3} — ' + s['ed'], ln3, f'{t3} • ' + s['sigla'], s['lomb'], out / f'capa-{slug}-terceiro-3d.png')

if __name__ == '__main__':
    main(sys.argv[1:] or list(SPEC) + list(AVULSO))
