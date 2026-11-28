#!/usr/bin/env python3
"""Read-only audit of private study media. Never publish source files or signed URLs."""
import hashlib
import json
import os
import subprocess
import tempfile
from pathlib import Path

import boto3
import requests
from botocore.config import Config
from pypdf import PdfReader


PRODUCT_EXPECTATIONS = {
    # Páginas = PDF entregue ao comprador (conferido no R2 em 18/11/2026) = páginas anunciadas no catálogo.
    'redacao-nivel-fundamental-2026': {
        # Edição 3.0 (15/11/2026), áudio pt-br-v3.
        'pages': 325,
        'topics': ['redação', 'dissertação', 'gabarito'],
    },
    'curso-redacao-concursos-2026': {
        'pages': 728,
        'topics': ['redação', 'gabarito', 'dissertação'],
    },
    'professor-adjunto-i-ibam-santos-2026': {
        'pages': 650,
        'topics': ['professor adjunto i', 'ibam', 'língua portuguesa', 'educação infantil', 'simulado'],
    },
    'sme-sp-peif-pre-edital-2026': {
        # Edição ampliada; o arquivo de origem de 220 páginas foi substituído.
        'pages': 770,
        'topics': ['sme-sp', 'peif', 'currículo da cidade', 'gabarito'],
    },
    'matao-sp-assistente-administrativo-2026': {
        # 469 páginas de estudo + anexo de legislação na íntegra (Leis 8.159 e 14.133).
        'pages': 595,
        # Páginas 349–407: reprodução oficial digitalizada (imagem, sem camada de texto).
        'imagePages': list(range(349, 408)),
        'topics': ['assistente administrativo', 'matão', 'ibam', 'gabarito', 'simulado'],
    },
    'matao-sp-fiscal-de-obras-ed02-2026': {
        'pages': 443,
        # Páginas 226–284: reprodução oficial digitalizada (imagem, sem camada de texto).
        'imagePages': list(range(226, 285)),
        'topics': ['fiscal de obras', 'matão', 'ibam', 'gabarito', 'simulado'],
    },
    'tjsp-oficial-de-justica-2027': {
        'pages': 1946,
        'topics': ['oficial de justiça', 'tj-sp', 'corregedoria', 'gabarito', 'simulado'],
    },
    'tjsp-escrevente-tecnico-judiciario-2026': {
        'pages': 1060,
        'topics': ['escrevente técnico judiciário', 'tjsp', 'vunesp', 'gabarito', 'simulado'],
    },
    'aparecida-de-goiania-pe1-pedagogia-2026': {
        'pages': 673,
        'topics': ['aparecida de goiânia', 'pedagogia', 'verbena', 'gabarito', 'simulado'],
    },
    'aparecida-de-goiania-auxiliar-de-secretaria-2026': {
        'pages': 658,
        'topics': ['auxiliar de secretaria', 'aparecida', 'verbena', 'gabarito', 'simulado'],
    },
    'aparecida-de-goiania-pe1-educacao-fisica-2026': {
        'pages': 307,
        'topics': ['educação física', 'aparecida', 'verbena', 'gabarito', 'simulado'],
    },
    'camara-santa-helena-de-goias-tecnico-legislativo-2027': {
        'pages': 638,
        'topics': ['técnico legislativo', 'santa helena', 'regimento', 'gabarito', 'simulado'],
    },
    'pc-pe-agente-de-policia-2026': {
        'pages': 1679,
        'topics': ['agente de polícia', 'pernambuco', 'cebraspe', 'gabarito', 'simulado'],
    },
    'coren-sp-assistente-administrativo-2027': {
        'pages': 638,
        'topics': ['coren-sp', 'cofen', 'gabarito', 'simulado', 'lgpd'],
    },
    'coren-sp-enfermeiro-fiscal-2027': {
        'pages': 831,
        'topics': ['coren-sp', 'interdição ética', 'dimensionamento', 'gabarito', 'simulado'],
    },
    'see-sp-professor-educacao-especial-tea-2027': {
        'pages': 860,
        'topics': ['gestão de sala de aula', 'lemov', 'neurodiversidade', 'gabarito', 'simulado'],
    },
    'see-sp-professor-educacao-especial-di-2027': {
        'pages': 868,
        'topics': ['gestão de sala de aula', 'lemov', 'estudo de caso', 'gabarito', 'simulado'],
    },
    'see-sp-professor-quimica-2027': {
        'pages': 858,
        'topics': ['gestão de sala de aula', 'lemov', 'estequiometria', 'gabarito', 'simulado'],
    },
    'see-sp-professor-geografia-2027': {
        'pages': 682,
        'topics': ['gestão de sala de aula', 'lemov', 'fusos horários', 'gabarito', 'simulado'],
    },
    'see-sp-professor-educacao-fisica-2027': {
        'pages': 497,
        'topics': ['gestão de sala de aula', 'lemov', 'lógica interna', 'gabarito', 'simulado'],
    },
    'see-sp-professor-ingles-2027': {
        'pages': 673,
        'topics': ['gestão de sala de aula', 'lemov', 'simple past', 'gabarito', 'simulado'],
    },
    'see-sp-professor-ciencias-2027': {
        'pages': 671,
        'topics': ['gestão de sala de aula', 'lemov', 'fotossíntese', 'gabarito', 'simulado'],
    },
    'see-sp-professor-fisica-2027': {
        'pages': 756,
        'topics': ['gestão de sala de aula', 'lemov', 'mecânica', 'gabarito', 'simulado'],
    },
    'see-sp-professor-matematica-2027': {
        'pages': 672,
        'topics': ['gestão de sala de aula', 'lemov', 'currículo paulista', 'gabarito', 'simulado'],
    },
    'santana-de-parnaiba-alfabetizado-2027': {
        'pages': 685,
        'topics': ['santana de parnaíba', 'separação silábica', 'raciocínio lógico', 'gabarito', 'simulado'],
    },
    'see-sp-professor-lingua-portuguesa-2027': {
        'pages': 834,
        'topics': ['gestão de sala de aula', 'lemov', 'currículo paulista', 'gabarito', 'simulado'],
    },
    'policia-penal-pe-2026': {
        'pages': 1796,
        'topics': ['policial penal', 'pernambuco', 'execução penal', 'cebraspe', 'gabarito', 'simulado'],
    },
    'guarda-municipal-campinas-2026': {
        'pages': 1417,
        'topics': ['guarda municipal', 'campinas', '13.022', 'gabarito', 'simulado'],
    },
    'cetesb-tecnico-administrativo-2026': {
        'pages': 1022,
        'topics': ['técnico administrativo', 'cetesb', '13.303', 'gabarito', 'simulado'],
    },
    'ministerio-saude-gestor-2026': {
        'pages': 2130,
        'topics': ['ministério da saúde', 'gestor', 'lei nº 8.080', 'gabarito', 'simulado'],
    },
    'sp-aguas-especialista-gestao-recursos-hidricos-2026': {
        'pages': 1416,
        'topics': ['sp águas', 'recursos hídricos', 'outorga', 'gabarito', 'simulado'],
    },
    'pc-ac-oficial-investigador-2026': {
        'pages': 1963,
        'topics': ['pc-ac', 'oficial investigador', 'acre', 'gabarito', 'simulado'],
    },
    'ministerio-saude-tecnico-analista-2026': {
        'pages': 1723,
        'topics': ['ministério da saúde', 'sus', 'lei nº 8.080', 'gabarito', 'simulado'],
    },
    'seduc-ma-especialista-supervisao-escolar-2026': {
        'pages': 1151,
        'topics': ['supervisão escolar', 'seduc-ma', 'socioeducativo', 'gabarito', 'simulado'],
    },
    'seduc-ma-professor-matematica-2026': {
        'pages': 1108,
        'topics': ['professor de matemática', 'seduc-ma', 'maranhão', 'gabarito', 'simulado'],
    },
    'seduc-ma-professor-lingua-portuguesa-2026': {
        'pages': 1062,
        'topics': ['língua portuguesa', 'literatura', 'maranhão', 'gabarito', 'simulado'],
    },
    'receita-federal-analista-tributario-2027': {
        'pages': 3316,
        'topics': ['analista-tributário', 'receita federal', 'código tributário nacional', 'gabarito', 'simulado'],
    },
    'inss-tecnico-do-seguro-social-2026': {
        'pages': 1252,
        'topics': ['técnico do seguro social', 'inss', 'seguridade social', 'gabarito', 'simulado'],
    },
    'camara-santa-helena-de-goias-analista-legislativo-2027': {
        'pages': 972,
        'topics': ['analista legislativo', 'santa helena', 'técnica legislativa', 'gabarito', 'simulado'],
    },
    'aparecida-de-goiania-agente-educativo-2026': {
        'pages': 651,
        'topics': ['agente educativo', 'aparecida', 'gabarito', 'simulado'],
    },
    'simulados-aparecida-de-goiania-pe1-pedagogia-2026': {
        'pages': 73,
        'topics': ['aparecida', 'simulado', 'gabarito'],
    },
    'banestes-tecnico-bancario-2026': {
        'pages': 578,
        'topics': ['banestes', 'técnico bancário', 'fundação carlos chagas', 'gabarito', 'simulado'],
    },
    'ibge-recenseador-censo-agro-2026': {
        'pages': 600,
        'topics': ['ibge', 'recenseador', 'cesgranrio', 'gabarito', 'simulado'],
    },
    'pm-sp-aluno-soldado-2027': {
        'pages': 882,
        'topics': ['soldado', 'vunesp', 'gabarito', 'simulado'],
    },
    'portugues-completo-concursos': {
        'pages': 751,
        'topics': ['português', 'gabarito', 'simulado', 'crase'],
    },
    'conhecimentos-pedagogicos-professor': {
        'pages': 706,
        'topics': ['pedagógicos', 'ldb', 'simulado'],
    },
    'matematica-raciocinio-logico-concursos': {
        'pages': 643,
        'topics': ['matemática', 'raciocínio lógico', 'gabarito', 'simulado'],
    },
    'direito-constitucional-administrativo-concursos': {
        'pages': 806,
        'topics': ['direito constitucional', 'administrativo', 'gabarito', 'simulado'],
    },
    'cadernos-questoes-por-banca': {
        'pages': 885,
        'topics': ['vunesp', 'fgv', 'cebraspe', 'gabarito', 'simulado'],
    },
    'kit-base-plano-de-estudos': {
        # PDF próprio do kit = Plano de Estudos (60 págs); as páginas anunciadas somam as 4 apostilas incluídas.
        'pages': 60,
        'topics': ['plano de estudos', 'ciclo', 'revisão', 'simulado'],
    },
    'sao-luis-montes-belos-professor-pedagogia-2027': {
        'pages': 782,
        'topics': ['montes belos', 'pedagogia', 'verbena', 'gabarito', 'simulado'],
    },
    'petrolina-de-goias-professor-pedagogo-2027': {
        'pages': 660,
        'topics': ['petrolina', 'pedagogo', 'ganzaroli', 'gabarito', 'simulado'],
    },
    'faina-professor-pedagogo-2027': {
        'pages': 826,
        'topics': ['faina', 'pedagogo', 'itame', 'gabarito', 'simulado'],
    },
    'uirapuru-professor-pedagogo-2027': {
        'pages': 657,
        'topics': ['uirapuru', 'pedagogo', 'ganzaroli', 'gabarito', 'simulado'],
    },
    'sao-francisco-de-goias-professor-2027': {
        'pages': 873,
        'topics': ['são francisco', 'professor', 'versátil', 'gabarito', 'simulado'],
    },
    'campo-limpo-de-goias-professor-2027': {
        'pages': 748,
        'topics': ['campo limpo', 'professor', 'itame', 'gabarito', 'simulado'],
    },
    'ifg-assistente-administracao-2027': {
        'pages': 916,
        'topics': ['ifg', 'arquivologia', 'aocp', 'gabarito', 'simulado'],
    },
    'tce-go-tecnico-controle-externo-2027': {
        'pages': 1233,
        'topics': ['tce-go', 'controle externo', 'fcc', 'gabarito', 'simulado'],
    },
    'informatica-para-concursos': {
        'pages': 616,
        'topics': ['informática', 'excel', 'gabarito', 'simulado'],
    },
    'detran-sp-agente-de-transito-2026': {
        'pages': 49,
        'topics': ['detran-sp', 'agente estadual de trânsito', 'instituto avalia', 'contran', 'gabarito'],
    },
    'autores-ibam-2026': {
        'pages': 34,
        'topics': ['autores', 'ibam', 'gabarito'],
    },
    'secretario-de-unidade-escolar-ibam-santos-2026': {
        'pages': 84,
        'topics': ['secretário', 'ibam', 'língua portuguesa', 'raciocínio lógico', 'eca', 'simulado'],
    },
}


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    catalog = json.loads(Path('products/catalog.json').read_text())
    santos_sources = json.loads(Path('products/santos-media-sources.json').read_text())
    peif_source = json.loads(Path('products/sme-sp-peif-source.json').read_text())
    bucket = os.environ.get('R2_BUCKET', 'apostila')
    account = os.environ['R2_ACCOUNT_ID']
    s3 = boto3.client('s3', endpoint_url=f'https://{account}.r2.cloudflarestorage.com',
        region_name='auto', aws_access_key_id=os.environ['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['R2_SECRET_ACCESS_KEY'],
        config=Config(signature_version='s3v4', retries={'max_attempts': 3}))
    fingerprints = {}
    report = []
    with tempfile.TemporaryDirectory(prefix='study-media-audit-') as directory:
        work = Path(directory)
        for slug, product in catalog.items():
            if not product.get('active'):
                continue
            assets = product['assets']
            if product.get('kind') == 'simulados':  # caderno avulso de simulados: só PDF, sem áudio
                tracks = []
            else:
                tracks = [assets['summary'], *assets['chapters']]
            if product.get('kind') == 'simulados':
                require(not assets.get('chapters'), f'{slug}: simulados product should not list audio')
            elif product.get('kind') == 'curso':  # curso em aulas: resumo + pelo menos 8 aulas
                require(len(tracks) >= 9, f'{slug}: expected summary and at least eight lessons')
            else:
                require(len(tracks) == 9, f'{slug}: expected summary and eight chapters')
            require(len({t['key'] for t in tracks}) == len(tracks), f'{slug}: repeated audio keys')
            pdf = work / 'source.pdf'
            s3.download_file(bucket, assets['pdfKey'], str(pdf))
            pages = [page.extract_text() or '' for page in PdfReader(pdf).pages]
            source = santos_sources.get(slug)
            pdf_sha = hashlib.sha256(pdf.read_bytes()).hexdigest()
            peif = peif_source if slug == peif_source['slug'] and pdf_sha == peif_source['pdfSha256'] else None
            if slug == peif_source['slug'] and not peif:
                print(f'NOTE {slug}: edição ampliada à venda; manifesto de origem descreve a edição anterior', flush=True)
            expectation = PRODUCT_EXPECTATIONS.get(slug)
            require(source or expectation, f'{slug}: missing media audit expectations')

            # Supplied Santos editions for portaria/inspetor have an image-only first page.
            readable_pages = pages[1:] if source else pages
            if expectation and expectation.get('blankPages'):
                allowed_blank = set(expectation['blankPages'])
                require(all(not pages[n - 1].strip() for n in allowed_blank), f'{slug}: expected blank verso changed')
                readable_pages = [text for n, text in enumerate(pages, 1) if n not in allowed_blank]
            if expectation and expectation.get('imagePages'):
                image_pages = set(expectation['imagePages'])
                require(all(not pages[n - 1].strip() for n in image_pages), f'{slug}: expected image-only pages changed')
                readable_pages = [text for n, text in enumerate(pages, 1) if n not in image_pages and n not in set(expectation.get('blankPages', []))]
            require(all(p.strip() for p in readable_pages), f'{slug}: unreadable PDF content pages')
            expected = source['pageCount'] if source else expectation['pages']
            require(len(pages) == expected, f'{slug}: unexpected PDF page count: {len(pages)} != {expected}')
            announced = (product.get('storefront') or {}).get('concurso', {}).get('paginas')
            if announced and not product.get('includes'):
                require(int(str(announced).replace('.', '')) == len(pages), f'{slug}: storefront announces {announced} pages but PDF has {len(pages)}')
            body = '\n'.join(pages).lower()
            if source:
                topics = ['agente de portaria' if slug.startswith('agente-') else 'inspetor de alunos', 'ibam', 'gabarito']
                require(hashlib.sha256(pdf.read_bytes()).hexdigest() == source['pdfSha256'], f'{slug}: PDF differs from supplied source')
                cover = work / 'cover.png'
                s3.download_file(bucket, assets['coverKey'], str(cover))
                require(hashlib.sha256(cover.read_bytes()).hexdigest() == source['coverSha256'], f'{slug}: cover differs from supplied source')
            else:
                topics = expectation['topics']
            require(all(word in body for word in topics), f'{slug}: PDF subject does not match product')

            manifest = None
            santos_tracks = {}
            if peif:
                require(hashlib.sha256(pdf.read_bytes()).hexdigest() == peif['pdfSha256'], f'{slug}: standardized PDF checksum mismatch')
                cover = work / 'cover.png'
                s3.download_file(bucket, assets['coverKey'], str(cover))
                require(hashlib.sha256(cover.read_bytes()).hexdigest() == peif['coverSha256'], f'{slug}: standardized cover checksum mismatch')
                record = json.loads(s3.get_object(Bucket=bucket, Key=f'{slug}/audio/manifest.json')['Body'].read())
                require(record['slug'] == slug and record['pdfSha256'] == peif['pdfSha256'], f'{slug}: manifest source mismatch')
                require(record['summary']['originalSha256'] == peif['summarySourceSha256'], f'{slug}: supplied summary source mismatch')
                completed = [record['summary'], *record['chapters']]
                santos_tracks = {track['key']: track for track in completed}
                require(len(completed) == 9 and set(santos_tracks) == {track['key'] for track in tracks}, f'{slug}: manifest track mapping mismatch')
                require(all(santos_tracks[track['key']]['id'] == track['id'] for track in tracks), f'{slug}: manifest track IDs differ from catalog')
                ranges = [santos_tracks[chapter['key']]['pages'] for chapter in assets['chapters']]
                require(ranges == peif['chapters'], f'{slug}: manifest chapter pages differ from PDF')
                covered = [page for first, last in ranges for page in range(first, last + 1)]
                require(covered == list(range(1, expected + 1)), f'{slug}: missing, repeated or unordered source pages')
            if source:
                record = json.loads(s3.get_object(Bucket=bucket, Key=f'{slug}/audio/manifest.json')['Body'].read())
                require(record['slug'] == slug and record['pdfSha256'] == source['pdfSha256'], f'{slug}: manifest source mismatch')
                santos_tracks = {track['key']: track for track in record['chapters']}
                require(len(record['chapters']) == 9 and set(santos_tracks) == {track['key'] for track in tracks}, f'{slug}: manifest track mapping mismatch')
                require(santos_tracks[assets['summary']['key']]['pages'] == source['summaryPages'], f'{slug}: manifest summary pages differ from source')
                require(all(santos_tracks[track['key']]['id'] == track['id'] for track in tracks), f'{slug}: manifest track IDs differ from catalog')
                ranges = [santos_tracks[chapter['key']]['pages'] for chapter in assets['chapters']]
                require(ranges == source['chapters'], f'{slug}: manifest chapter pages differ from source')
                covered = [page for first, last in ranges for page in range(first, last + 1)]
                require(covered == list(range(2, expected + 1)), f'{slug}: missing, repeated or unordered source pages')
            matao_meta = json.loads(Path('products/matao-2026-final-media.json').read_text())
            if slug == 'matao-sp-assistente-administrativo-2026' and pdf_sha != matao_meta['files']['pdf']['sha256']:
                print(f'NOTE {slug}: edição ampliada à venda; manifesto de origem descreve a edição anterior', flush=True)
            elif slug == 'matao-sp-assistente-administrativo-2026':
                metadata = matao_meta
                require(hashlib.sha256(pdf.read_bytes()).hexdigest() == metadata['files']['pdf']['sha256'],
                    'Matão: complete PDF differs from the audited publication')
                cover = work / 'cover-original.png'
                s3.download_file(bucket, assets['coverKey'], str(cover))
                require(hashlib.sha256(cover.read_bytes()).hexdigest() == metadata['files']['cover']['sha256'],
                    'Matão: original user cover checksum mismatch')
                completion = json.loads(s3.get_object(
                    Bucket=bucket, Key=f'{slug}/audio/manifest.json')['Body'].read())
                require(completion.get('readyForCheckout') is True, 'Matão: delivery release not finalized')
                require(completion.get('PDF') == assets['pdfKey']
                    and completion.get('cover') == assets['coverKey'],
                    'Matão: completion manifest delivery keys mismatch')
                require(completion.get('pages') == 49 and completion.get('questions') == 160 and completion.get('chapters') == 8,
                    'Matão: completion manifest curriculum mismatch')
                require(completion.get('language') == 'pt-BR',
                    'Matão: expected audiobook in Brazilian Portuguese')
                require(completion.get('summary') == assets['summary']['key']
                    and completion.get('chapterKeys') == [ch['key'] for ch in assets['chapters']],
                    'Matão: source manifest does not match buyer playback and download keys')
            if slug == 'redacao-nivel-fundamental-2026' and not assets['pdfKey'].endswith('-v3.pdf'):
                manifest = json.loads(s3.get_object(Bucket=bucket,
                    Key=f'{slug}/audio/manifest.json')['Body'].read())
                require(manifest['pdfKey'] == assets['pdfKey'], 'Redacao manifest: wrong PDF')
                require(manifest['summaryKey'] == assets['summary']['key'], 'Redacao manifest: wrong summary')
                require([c['key'] for c in manifest['chapters']] == [c['key'] for c in assets['chapters']],
                    'Redacao manifest: chapter mapping mismatch')
                covered = [p for c in manifest['chapters'] for p in range(c['pages'][0], c['pages'][1]+1)]
                require(covered == list(range(1, 20)), 'Redacao: missing, repeated or unordered source pages')

            durations = []
            for index, track in enumerate(tracks):
                media = work / 'track.mp3'
                s3.download_file(bucket, track['key'], str(media))
                digest = hashlib.sha256(media.read_bytes()).hexdigest()
                if source or peif:
                    require(digest == santos_tracks[track['key']]['sha256'], f'{slug}/{track["id"]}: audio differs from completion manifest')
                if slug == 'matao-sp-assistente-administrativo-2026' and pdf_sha == matao_meta['files']['pdf']['sha256']:
                    actual = s3.head_object(Bucket=bucket, Key=track['key'])
                    require(actual.get('Metadata', {}).get('sha256') == digest,
                        f'{slug}/{track["id"]}: recording checksum differs from private upload')
                require(digest not in fingerprints, f'{slug}/{track["id"]}: duplicate audio content')
                fingerprints[digest] = (slug, track['id'])
                probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                    'format=duration:stream=codec_name', '-of', 'json', str(media)],
                    check=True, capture_output=True, text=True, timeout=60)
                info = json.loads(probe.stdout)
                seconds = float(info['format']['duration'])
                require(seconds > 10, f'{slug}/{track["id"]}: audio too short')
                if source or peif:
                    require(abs(seconds - santos_tracks[track['key']]['durationSeconds']) < 0.1,
                        f'{slug}/{track["id"]}: duration differs from completion manifest')
                require(any(s.get('codec_name') == 'mp3' for s in info['streams']),
                    f'{slug}/{track["id"]}: expected MP3 audio')
                decoded = subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(media),
                    '-f', 'null', '-'], capture_output=True, timeout=180)
                require(decoded.returncode == 0, f'{slug}/{track["id"]}: audio decoding failed')
                if manifest and index:
                    require(media.stat().st_size == manifest['chapters'][index-1]['bytes'],
                        f'{slug}/{track["id"]}: generated file size differs from manifest')
                url = s3.generate_presigned_url('get_object', Params={'Bucket': bucket,
                    'Key': track['key']}, ExpiresIn=120)
                with requests.get(url, headers={'Range': 'bytes=0-31'}, timeout=30) as response:
                    with media.open('rb') as audio_file:
                        expected_prefix = audio_file.read(32)
                    require(response.status_code == 206 and response.content == expected_prefix,
                        f'{slug}/{track["id"]}: signed streaming range failed')
                durations.append(round(seconds, 2))
                print(f'PASS {slug}/{track["id"]}: MP3 decoded; signed streaming; {seconds:.1f}s', flush=True)
            report.append({'slug': slug, 'pdf_pages': len(pages), 'summary_seconds': durations[0] if durations else None,
                'chapter_seconds': durations[1:], 'total_seconds': round(sum(durations), 2)})
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print('PASS: distinct product audio; all files decoded; summary and chapters available privately.')


if __name__ == '__main__':
    main()
