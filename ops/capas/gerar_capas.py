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
   completa=('REDAÇÃO', 'NÍVEL FUNDAMENTAL', ['dissertação, argumentação, narração e relato', 'carta, e-mail e textos funcionais', 'checklist de revisão • como a banca corrige']),
   simulados=['10 questões de fixação + 5 propostas de produção', 'gabarito comentado e modelos de resposta', 'treino guiado para escrever na prova'],
   terceiro=('MODELOS', ['redações-modelo explicadas passo a passo', 'estrutura de introdução, desenvolvimento e conclusão', 'erros comuns que tiram ponto'])),
}

def main(slugs):
    out = ROOT / 'public/assets'
    for slug in slugs:
        s = SPEC[slug]
        if s['completa']:
            t1, t2, ln = s['completa']
            gerar(t1, t2, s['cobre'], 'EDIÇÃO COMPLETA — ' + s['ed'], ln, f"{t1} • {t2}" if len(f"{t1} • {t2}") < 26 else t1, s['lomb'], out / f'capa-{slug}-completa-3d.png')
        st = s.get('sim_t1', 'SIMULADOS')
        gerar(st, s['sigla'], s['cobre'], f'CADERNO DE {st} — ' + s['ed'], s['simulados'], f'{st} • ' + s['sigla'], s['lomb'], out / f'capa-{slug}-simulados-3d.png')
        t3, ln3 = s['terceiro']
        gerar(t3, s['sigla'], s['cobre'], f'CADERNO DE {t3} — ' + s['ed'], ln3, f'{t3} • ' + s['sigla'], s['lomb'], out / f'capa-{slug}-terceiro-3d.png')

if __name__ == '__main__':
    main(sys.argv[1:] or list(SPEC))
