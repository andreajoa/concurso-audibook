#!/usr/bin/env python3
"""Apply the current Trilha Aprova print identity without reflowing study content.

The original is never modified. Each interior page keeps its tables, questions,
answer keys and embedded fonts. Text is compared page by page before saving.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re

import pymupdf as fitz

ORIGINAL_SHA = 'fe3cc142ac8db53b3cd5cde938fa3bdf41a0e00f8cb44178ddd8edb8162e27ab'
NAVY = (11 / 255, 45 / 255, 70 / 255)
COPPER = (182 / 255, 94 / 255, 60 / 255)
TEAL = (46 / 255, 111 / 255, 109 / 255)
GRAY = (92 / 255, 107 / 255, 120 / 255)


def interior_text(page):
    lines = page.get_text().splitlines()
    kept = []
    for line in lines:
        text = line.strip()
        if text.startswith(('TRILHA APROVA', 'Curso Preparatório Completo no Papel')):
            continue
        if text.startswith('SME-SP PEIF -'):
            continue
        if re.fullmatch(r'\d+\s*/\s*220', text) or text == str(page.number + 1):
            continue
        kept.append(text)
    return Counter(re.findall(r'\S+', '\n'.join(kept)))


def clean_stream(data):
    # The supplied LibreOffice PDF places only running headers/footers at these
    # two baselines. Remove their text operators, not overlapping body glyphs.
    def text_object(match):
        positions = re.findall(rb'([-\d.]+)\s+([-\d.]+)\s+Td', match.group())
        if positions and all(abs(float(y) - 799.289) < 0.01 or abs(float(y) - 37.889) < 0.01 for _, y in positions):
            return b''
        return match.group()
    data = re.sub(rb'BT\b.*?\bET', text_object, data, flags=re.S)
    palette = {
        (11, 31, 58): NAVY,
        (31, 107, 104): TEAL,
        (182, 144, 82): COPPER,
        (32, 42, 53): (34 / 255, 43 / 255, 51 / 255),
    }
    def color(match):
        rgb = tuple(round(float(match[i]) * 255) for i in (1, 2, 3))
        replacement = palette.get(rgb)
        return (' '.join(f'{v:.8f}' for v in replacement).encode() + b' ' + match[4]) if replacement else match.group()
    return re.sub(rb'([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(rg|RG)\b', color, data)


def textbox(page, rect, text, size, color=NAVY, bold=False, align=0):
    result = page.insert_textbox(fitz.Rect(rect), text.replace('•', '·'), fontsize=size,
                               fontname='hebo' if bold else 'helv', color=color, align=align)
    if result < 0:
        raise RuntimeError(f'Text does not fit on page {page.number + 1}')


def cover(page):
    textbox(page, (56, 116, 539, 139), 'CURSO PREPARATÓRIO NO PAPEL', 12, COPPER, True, 1)
    textbox(page, (56, 151, 539, 242), 'SME-SP 2026\nPEIF', 27, NAVY, True, 1)
    textbox(page, (56, 250, 539, 296), 'PROFESSOR DE EDUCAÇÃO INFANTIL\nE ENSINO FUNDAMENTAL I', 12, COPPER, True, 1)
    box = fitz.Rect(56, 310, 539, 391)
    page.draw_rect(box, color=COPPER, fill=(0.96, 0.92, 0.89), width=0.5)
    textbox(page, (64, 320, 531, 382),
            'EDIÇÃO PRÉ-EDITAL • 01/10/2026\n220 páginas • 89 aulas • 14 módulos\nTeoria do zero • exemplos de sala de aula • legislação • Currículo da Cidade • autores • inclusão • prova prática • simulado e gabarito comentado',
            9, (34 / 255, 43 / 255, 51 / 255))
    textbox(page, (56, 425, 539, 448), 'TRILHA APROVA CONCURSOS', 12, COPPER, True, 1)
    textbox(page, (62, 470, 533, 519),
            'Material independente de preparação. Edição pré-edital: conteúdo organizado com referências históricas. Não possui vínculo ou chancela da SME-SP nem de banca organizadora. Confira as regras e o programa do futuro edital oficial.',
            8, GRAY)
    textbox(page, (62, 547, 533, 584),
            'Edição pré-edital: 1º de outubro de 2026.\nCurso completo para leitura, prática e revisão.', 8, GRAY)


def running_identity(page, number, total):
    textbox(page, (50, 25, 254, 38), 'TRILHA APROVA CONCURSOS', 6.5, NAVY, True)
    textbox(page, (270, 25, 545, 38), 'SME-SP PEIF - Edição pré-edital 2026', 6.5, GRAY, align=2)
    page.draw_line((50, 40), (545, 40), color=(0.84, 0.87, 0.89), width=0.4)
    page.draw_line((50, 808), (545, 808), color=(0.84, 0.87, 0.89), width=0.4)
    textbox(page, (50, 813, 221, 828), 'TRILHA APROVA CONCURSOS', 6.2, NAVY)
    textbox(page, (195, 813, 449, 828), 'SME-SP PEIF - PRÉ-EDITAL 2026', 6.2, GRAY, align=1)
    textbox(page, (468, 813, 545, 828), f'{number} / {total}', 6.2, GRAY, align=2)


def standardize(source, target):
    if source.resolve() == target.resolve():
        raise RuntimeError('The original must not be overwritten')
    if hashlib.sha256(source.read_bytes()).hexdigest() != ORIGINAL_SHA:
        raise RuntimeError('Unexpected original PDF')
    original = fitz.open(source)
    if len(original) != 220:
        raise RuntimeError('Unexpected source page count')
    before = [interior_text(p) for p in original]
    source_copy = fitz.open(stream=source.read_bytes(), filetype='pdf')
    for page in source_copy:
        if page.number:
            for xref in page.get_contents():
                source_copy.update_stream(xref, clean_stream(source_copy.xref_stream(xref)))
    result = fitz.open()
    for index in range(220):
        page = result.new_page(width=595.28, height=841.89)
        if index == 0:
            cover(page)
        else:
            # Preserve whole content, including the lowest answer-table rows.
            page.show_pdf_page(fitz.Rect(50, 61, 545, 787), source_copy, index,
                               clip=fitz.Rect(41, 44, 554.3, 796), keep_proportion=True)
            running_identity(page, index + 1, 220)
            if interior_text(page) != before[index]:
                lost = before[index] - interior_text(page)
                added = interior_text(page) - before[index]
                raise RuntimeError(f'Content changed on page {index + 1}: {sum(lost.values())} removed / {sum(added.values())} added tokens')
    result.set_metadata({'title': 'SME-SP 2026 PEIF - Curso Preparatório no Papel - Pré-edital',
                         'author': 'Trilha Aprova', 'subject': 'Edição pré-edital 01/10/2026; identidade editorial padronizada',
                         'creator': 'Trilha Aprova editorial', 'creationDate': 'D:20261003000000Z'})
    result.set_toc(original.get_toc())
    result.save(target, garbage=4, deflate=True, no_new_id=True)
    reopened = fitz.open(target)
    if len(reopened) != 220 or any(interior_text(p) != before[p.number] for p in list(reopened)[1:]):
        raise RuntimeError('Saved PDF failed page-by-page text verification')
    return {'pages': len(reopened), 'originalSha256': ORIGINAL_SHA,
            'publishedSha256': hashlib.sha256(target.read_bytes()).hexdigest(),
            'verifiedInteriorPages': 219, 'preservedContent': True, 'coverReplaced': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('target', type=Path)
    args = parser.parse_args()
    print(json.dumps(standardize(args.source, args.target), indent=2))
