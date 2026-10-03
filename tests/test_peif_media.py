import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('peif_media', Path(__file__).resolve().parents[1] / 'scripts/publish_peif_media.py')
media = importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)


class Page:
    def __init__(self, number):
        self.number = number

    def extract_text(self):
        return f'PAGE_{self.number} ' + 'conteúdo explicado para estudo. ' * 150


class PeifSourceCoverageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.pdf = Path(self.tmp.name) / 'source.pdf'
        self.pdf.write_bytes(b'controlled PDF fixture')
        self.source = {'pdfSha256': media.digest(self.pdf.read_bytes()), 'pageCount': 16,
                       'chapters': [[p, p + 1] for p in range(1, 17, 2)]}
        self.product = {'assets': {'chapters': [{'id': f'c{i}', 'title': f'Chapter {i}', 'key': f'test/audio/{i}.mp3'} for i in range(1, 9)]}}

    def prepare(self):
        reader = type('Reader', (), {'pages': [Page(n) for n in range(1, 17)]})()
        with patch.object(media, 'configuration', return_value=(self.source, self.product)), patch.object(media, 'PdfReader', return_value=reader):
            return media.prepare_texts(self.pdf)

    def test_all_original_pages_are_narrated_exactly_once(self):
        tracks = self.prepare()
        self.assertEqual(len(tracks), 8)
        words = ' '.join(t['text'] for t in tracks).split()
        for number in range(1, 17):
            self.assertEqual(words.count(f'PAGE_{number}'), 1)

    def test_gap_in_source_page_coverage_is_rejected(self):
        self.source['chapters'][3][0] += 1
        with self.assertRaisesRegex(RuntimeError, 'every source page once'):
            self.prepare()

    def test_duplicate_page_is_rejected(self):
        self.source['chapters'][3][0] -= 1
        with self.assertRaisesRegex(RuntimeError, 'every source page once'):
            self.prepare()

    def test_modified_original_pdf_is_rejected(self):
        self.pdf.write_bytes(b'different PDF')
        with self.assertRaisesRegex(RuntimeError, 'supplied original'):
            self.prepare()

    def test_page_count_change_is_rejected(self):
        self.source['pageCount'] += 1
        with self.assertRaisesRegex(RuntimeError, 'page count'):
            self.prepare()

    def test_layout_is_removed_but_pre_edital_warning_and_answers_remain(self):
        text = 'TRILHA APROVA | SME-SP 2026 | PEIF | CURSO NO PAPEL\nCurso Preparatório Completo no Papel • PEIF • Edição Pré-edital 01/10/2026 | 25\nEsta é uma edição pré-edital; confirme as regras futuras.\nE) inclusão escolar'
        cleaned = media.clean(text)
        self.assertNotIn('CURSO NO PAPEL', cleaned)
        self.assertIn('confirme as regras futuras', cleaned)
        self.assertIn('Alternativa E: inclusão escolar', cleaned)

    def test_standardized_running_identity_is_not_narrated(self):
        text = 'Conteúdo da aula preservado.\nTRILHA APROVA CONCURSOS SME-SP PEIF - Edição pré-edital 2026\nTRILHA APROVA CONCURSOS SME-SP PEIF - PRÉ-EDITAL 2026 202 / 220'
        self.assertEqual(media.clean(text), 'Conteúdo da aula preservado.')


if __name__ == '__main__':
    unittest.main()
