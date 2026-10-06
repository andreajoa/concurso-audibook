#!/usr/bin/env python3
"""Apply the current Trilha Aprova print identity to the DETRAN-SP 2026 course without reflowing study content.

Same method as standardize_peif_pdf.py: the original is never modified; every interior page keeps its
tables, questions, answer keys and embedded fonts; text is compared page by page before saving.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re

import pymupdf as fitz

ORIGINAL_SHA = '049e7faa5dc11cdd64ef1e63eb3346ce59fcba1d4503e782f87bdf91de19f8eb'
PAGES = 49
NAVY = (11 / 255, 45 / 255, 70 / 255)
COPPER = (182 / 255, 94 / 255, 60 / 255)
TEAL = (46 / 255, 111 / 255, 109 / 255)
GRAY = (92 / 255, 107 / 255, 120 / 255)
INK = (34 / 255, 43 / 255, 51 / 255)
HEADER_Y, FOOTER_Y = 22.939, 815.339   # baselines of the supplied running header/footer


def interior_text(page):
    kept = []
    for line in page.get_text().splitlines():
        text = line.strip()
        if text.startswith(('TRILHA APROVA', 'Curso no papel •', 'AGENTE ESTADUAL DE TRÂNSITO - DETRAN', 'DETRAN-SP 2026 - Agente Estadual')):
            continue
        if re.fullmatch(r'\d+\s*/\s*49', text):
            continue
        kept.append(text)
    return Counter(re.findall(r'\S+', '\n'.join(kept)))


def near(rgb, target, tol=2):
    return all(abs(a - b) <= tol for a, b in zip(rgb, target))


def clean_stream(data):
    # Remove only the text objects drawn at the running header/footer baselines.
    def text_object(match):
        positions = re.findall(rb'([-\d.]+)\s+([-\d.]+)\s+Td', match.group())
        if positions and all(abs(float(y) - HEADER_Y) < 0.01 or abs(float(y) - FOOTER_Y) < 0.01 for _, y in positions):
            return b''
        return match.group()
    data = re.sub(rb'BT\b.*?\bET', text_object, data, flags=re.S)
    palette = [((9, 39, 75), NAVY), ((10, 38, 74), NAVY), ((31, 110, 115), TEAL), ((35, 108, 112), TEAL),
               ((176, 138, 74), COPPER), ((183, 145, 82), COPPER), ((30, 39, 50), INK)]

    def color(match):
        rgb = tuple(round(float(match[i]) * 255) for i in (1, 2, 3))
        for src, dst in palette:
            if near(rgb, src):
                return ' '.join(f'{v:.8f}' for v in dst).encode() + b' ' + match[4]
        return match.group()
    return re.sub(rb'([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(rg|RG)\b', color, data)


def textbox(page, rect, text, size, color=NAVY, bold=False, align=0):
    result = page.insert_textbox(fitz.Rect(rect), text.replace('•', '·'), fontsize=size,
                                 fontname='hebo' if bold else 'helv', color=color, align=align)
    if result < 0:
        raise RuntimeError(f'Text does not fit on page {page.number + 1}')


def cover(page):
    textbox(page, (56, 116, 539, 139), 'CURSO PREPARATÓRIO NO PAPEL', 12, COPPER, True, 1)
    textbox(page, (56, 151, 539, 242), 'AGENTE ESTADUAL\nDE TRÂNSITO', 27, NAVY, True, 1)
    textbox(page, (56, 250, 539, 276), 'DETRAN-SP • INSTITUTO AVALIA • 2026', 12, COPPER, True, 1)
    box = fitz.Rect(56, 290, 539, 371)
    page.draw_rect(box, color=COPPER, fill=(0.96, 0.92, 0.89), width=0.5)
    textbox(page, (64, 300, 531, 362),
            'EDIÇÃO REVISADA • 01/10/2026 • PÓS-EDITAL\nEdital nº 1/2026 • corte legal: alterações até 08/09/2026\n'
            '9 aulas • CTB • 20 Resoluções CONTRAN • legislação paulista • redação • plano de 30 dias • simulado de 60 questões e gabarito comentado',
            9, INK)
    textbox(page, (56, 405, 539, 428), 'TRILHA APROVA CONCURSOS', 12, COPPER, True, 1)
    textbox(page, (62, 450, 533, 499),
            'Material independente de preparação. Não possui vínculo ou chancela do DETRAN-SP nem do Instituto Avalia. '
            'Questões autorais para treinamento. Confira sempre os comunicados oficiais do concurso.',
            8, GRAY)
    textbox(page, (62, 527, 533, 564),
            'Edição revisada: 1º de outubro de 2026.\nCurso completo para leitura, prática e revisão.', 8, GRAY)


def running_identity(page, number, total):
    textbox(page, (50, 25, 254, 38), 'TRILHA APROVA CONCURSOS', 6.5, NAVY, True)
    textbox(page, (270, 25, 545, 38), 'DETRAN-SP 2026 - Agente Estadual de Trânsito', 6.5, GRAY, align=2)
    page.draw_line((50, 40), (545, 40), color=(0.84, 0.87, 0.89), width=0.4)
    page.draw_line((50, 808), (545, 808), color=(0.84, 0.87, 0.89), width=0.4)
    textbox(page, (50, 813, 221, 828), 'TRILHA APROVA CONCURSOS', 6.2, NAVY)
    textbox(page, (195, 813, 449, 828), 'AGENTE ESTADUAL DE TRÂNSITO - DETRAN-SP 2026', 6.2, GRAY, align=1)
    textbox(page, (468, 813, 545, 828), f'{number} / {total}', 6.2, GRAY, align=2)


def standardize(source, target):
    if source.resolve() == target.resolve():
        raise RuntimeError('The original must not be overwritten')
    if hashlib.sha256(source.read_bytes()).hexdigest() != ORIGINAL_SHA:
        raise RuntimeError('Unexpected original PDF')
    original = fitz.open(source)
    if len(original) != PAGES:
        raise RuntimeError('Unexpected source page count')
    before = [interior_text(p) for p in original]
    source_copy = fitz.open(stream=source.read_bytes(), filetype='pdf')
    for page in source_copy:
        if page.number:
            for xref in page.get_contents():
                source_copy.update_stream(xref, clean_stream(source_copy.xref_stream(xref)))
    result = fitz.open()
    for index in range(PAGES):
        page = result.new_page(width=595.28, height=841.89)
        if index == 0:
            cover(page)
        else:
            # Whole body area of the supplied page (y 44–792), scaled slightly to clear the new running elements.
            page.show_pdf_page(fitz.Rect(50, 52, 545, 800), source_copy, index,
                               clip=fitz.Rect(40, 40, 556, 796), keep_proportion=True)
            running_identity(page, index + 1, PAGES)
            if interior_text(page) != before[index]:
                lost = before[index] - interior_text(page)
                added = interior_text(page) - before[index]
                raise RuntimeError(f'Content changed on page {index + 1}: {sum(lost.values())} removed / '
                                   f'{sum(added.values())} added tokens: {list(lost)[:5]} {list(added)[:5]}')
    result.set_metadata({'title': 'DETRAN-SP 2026 - Agente Estadual de Trânsito - Curso Preparatório no Papel',
                         'author': 'Trilha Aprova', 'subject': 'Edição revisada 01/10/2026; identidade editorial padronizada',
                         'creator': 'Trilha Aprova editorial', 'creationDate': 'D:20261005000000Z'})
    result.set_toc(original.get_toc())
    result.save(target, garbage=4, deflate=True, no_new_id=True)
    reopened = fitz.open(target)
    if len(reopened) != PAGES or any(interior_text(p) != before[p.number] for p in list(reopened)[1:]):
        raise RuntimeError('Saved PDF failed page-by-page text verification')
    return {'pages': len(reopened), 'originalSha256': ORIGINAL_SHA,
            'publishedSha256': hashlib.sha256(target.read_bytes()).hexdigest(),
            'verifiedInteriorPages': PAGES - 1, 'preservedContent': True, 'coverReplaced': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('target', type=Path)
    args = parser.parse_args()
    print(json.dumps(standardize(args.source, args.target), indent=2))
