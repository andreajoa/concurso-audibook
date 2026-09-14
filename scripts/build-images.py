#!/usr/bin/env python3
"""
Recorta e publica as imagens do portal.

As fotos originais não moram no repositório: são PNGs de ~1,6 MB cada e o que o
site serve são recortes de 40–90 kB. Guardar as duas coisas dobraria o peso do
clone para nada. Este script é o registro de como cada arquivo de
public/assets/portal/ foi feito — a partir de qual original, com qual recorte —
para que um dia seja possível refazer o conjunto inteiro sem adivinhar.

    python3 scripts/build-images.py --origem /caminho/das/fotos

Três larguras por imagem, e não uma redimensionada pelo navegador, porque o
recorte do celular não é o mesmo do desktop: a faixa larga que funciona num
monitor vira uma tira sem assunto num telefone em pé. Cada tamanho tem a sua
própria proporção.

Nada aqui vira Base64. A saída é sempre um arquivo binário, e cada um é reaberto
e conferido antes do script terminar.
"""

import argparse
import pathlib
import sys

from PIL import Image

# Três recortes por foto. O celular recebe um enquadramento mais alto porque a
# tela é alta: o mesmo corte panorâmico do desktop deixaria o assunto do
# tamanho de uma unha.
# A faixa do portal nunca passa de 1320 px de conteúdo, então 1440 já cobre
# telas grandes com folga; 1600 só engordava o arquivo para pixels que ninguém
# vê. A qualidade é baixa de propósito: a foto entra sob um degradê escuro que
# come metade do detalhe, e a diferença entre 76 e 82 não aparece na tela — só
# na conta de quem abre o site com internet ruim.
TAMANHOS = [
    ("desk", 1440, 540, 76),
    ("tab", 1000, 520, 78),
    ("mob", 720, 560, 78),
]

# slot -> (arquivo de origem, foco vertical 0..1, foco horizontal 0..1, zoom)
#
# O foco existe porque o centro geométrico quase nunca é o centro do assunto.
# Numa foto de escrivaninha o que importa está embaixo; num horizonte de cidade,
# em cima. Cortar pelo meio decapita os dois.
#
# Sobre geografia: uma página de cidade do litoral não pode abrir com a foto de
# outra cidade. Por isso "baixada" e "cidade-litoral" saem da mesma praia, em
# enquadramentos diferentes — é a mesma região, e dizer a verdade duas vezes
# vale mais que ilustrar Santos com o Rio de Janeiro. O foco horizontal existe
# exatamente para isso: tirar duas imagens distintas de uma foto só.
MAPA = {
    "concursos":        ("3.png", 0.50, 0.50, 1.00),  # prédio da prefeitura com as bandeiras
    "concursos-sp":     ("1.png", 0.50, 0.50, 1.00),  # ponte estaiada, skyline de São Paulo
    "baixada":          ("2.png",  0.30, 0.50, 1.00),  # a orla inteira, vista de cima
    "cidade-litoral":   ("2.png",  0.62, 0.80, 0.46),  # a mesma praia, de perto: prédios e calçadão
    "cidade-interior":  ("4.png", 0.45, 0.50, 1.00),  # praça histórica, igreja e chafariz
    "apostilas":        ("9.png", 0.50, 0.50, 1.00),  # livros, fones e telefone sobre a mesa
    "apostila-detalhe": ("18.png", 0.50, 0.50, 1.00),  # apostilas da marca e alguém escrevendo
    "ferramentas":      ("20.png", 0.50, 0.50, 1.00),  # notebook com o painel da marca
    "edital":           ("5.png", 0.50, 0.50, 1.00),  # pastas de legislação e marca-texto
    "calculadora":      ("6.png", 0.50, 0.50, 1.00),  # mesa de estudo com calculadora
    "cronograma":       ("7.png", 0.50, 0.50, 1.00),  # planner e telefone sobre a mesa
    "caderno":          ("8.png", 0.50, 0.50, 1.00),  # gabarito e lápis
    "materias":         ("17.png", 0.50, 0.50, 1.00),  # notebook aberto num portal de notícias
    "artigo":           ("16.png", 0.45, 0.50, 1.00),  # Congresso Nacional e a bandeira
    "comecar":          ("10.png", 0.40, 0.50, 1.00),  # pessoa de mochila diante da cidade
    "atendimento":      ("21.png", 0.45, 0.50, 1.00),  # prédio público moderno e bandeira
    "marca":            ("19.png", 0.40, 0.50, 1.00),  # horizonte ao fim da tarde, sem lugar declarado
}

DESTINO = pathlib.Path("public/assets/portal")
LOGO_ORIGEM = pathlib.Path.home() / "Downloads" / "trilha-aprova-logo-removebg-preview.png"


def recortar(img, largura, altura, foco, foco_x=0.5, zoom=1.0):
    """Recorte que preenche a caixa sem esticar a foto e sem cortar pelo meio."""
    if zoom < 1.0:
        # Aproximar antes de enquadrar. Numa faixa larga o ajuste corta em cima e
        # embaixo, então mexer só no eixo horizontal não muda nada do que se vê;
        # é a aproximação que transforma o mesmo original em outra fotografia.
        jan_w = int(round(img.width * zoom))
        jan_h = int(round(img.height * zoom))
        x = int(round((img.width - jan_w) * foco_x))
        y = int(round((img.height - jan_h) * foco))
        img = img.crop((x, y, x + jan_w, y + jan_h))
    alvo = largura / altura
    origem = img.width / img.height
    if origem > alvo:
        # A foto é mais larga que a caixa: sobra nas laterais.
        nova = int(round(img.height * alvo))
        x = int(round((img.width - nova) * foco_x))
        x = max(0, min(x, img.width - nova))
        caixa = (x, 0, x + nova, img.height)
    else:
        # A foto é mais alta: sobra em cima e embaixo, e é aqui que o foco manda.
        nova = int(round(img.width / alvo))
        y = int(round((img.height - nova) * foco))
        y = max(0, min(y, img.height - nova))
        caixa = (0, y, img.width, y + nova)
    return img.crop(caixa).resize((largura, altura), Image.LANCZOS)


def gerar_fotos(origem):
    feitos = []
    for slot, (arquivo, foco, foco_x, zoom) in sorted(MAPA.items()):
        caminho = origem / arquivo
        if not caminho.exists():
            sys.exit(f"origem ausente: {caminho}")
        with Image.open(caminho) as img:
            img = img.convert("RGB")
            for sufixo, largura, altura, qualidade in TAMANHOS:
                saida = DESTINO / f"hero-{slot}-{sufixo}.webp"
                recortar(img, largura, altura, foco, foco_x, zoom).save(
                    saida, "WEBP", quality=qualidade, method=6
                )
                feitos.append(saida)
    return feitos


def gerar_logo():
    """
    Duas logos, porque o site tem fundo claro e fundo escuro.

    A logo que o Andre mandou é azul-marinho sobre transparente: some por
    completo no cabeçalho navy e no rodapé. A versão clara troca a tinta azul
    por creme e mantém a seta dourada, que já contrasta nos dois fundos. As duas
    saem do mesmo desenho, então não há risco de divergirem.
    """
    import numpy as np

    if not LOGO_ORIGEM.exists():
        print(f"aviso: logo original ausente em {LOGO_ORIGEM}; mantendo a publicada")
        return []

    with Image.open(LOGO_ORIGEM) as src:
        src = src.convert("RGBA")
        # A margem transparente do arquivo original vira espaço morto dentro da
        # caixa do cabeçalho: recortada, a mesma altura de caixa mostra uma logo
        # visivelmente maior.
        escura = src.crop(src.getchannel("A").getbbox())

    px = np.array(escura).astype(np.float32)
    rgb, alfa = px[..., :3], px[..., 3]
    # A tinta azul tem mais azul que vermelho; a seta dourada, o contrário. É a
    # separação mais simples que funciona, inclusive nos pixels da borda.
    azul = (rgb[..., 2] > rgb[..., 0] + 8) & (alfa > 0)
    dourado = (~azul) & (alfa > 0)
    invertida = rgb.copy()
    invertida[azul] = (243, 234, 217)
    invertida[dourado] = (228, 201, 130)
    clara = Image.fromarray(
        np.dstack([invertida, alfa]).astype(np.uint8), "RGBA"
    )

    destino = pathlib.Path("public/assets")
    feitos = []
    for img, nome in ((escura, "trilha-aprova-logo"), (clara, "trilha-aprova-logo-claro")):
        # A logo nunca aparece com mais de 100 px de altura. 230 é 2,3x disso:
        # nítida em tela retina e ainda assim um arquivo pequeno. O original tem
        # 150 px de altura, então isto é uma ampliação leve, não uma invenção de
        # detalhe que não existe.
        escala = 230 / img.height
        alvo = img.resize((round(img.width * escala), 230), Image.LANCZOS)
        for ext, opcoes in ((".webp", {"quality": 86, "method": 6}), (".png", {"optimize": True})):
            saida = destino / (nome + ext)
            alvo.save(saida, **opcoes)
            feitos.append(saida)
    return feitos


def conferir(arquivos):
    """
    Reabre tudo o que foi escrito.

    Um arquivo truncado ou meio escrito continua sendo um arquivo: o `ls` mostra
    tamanho, o git aceita o commit e a quebra só aparece no navegador de quem
    visita. Reabrir e forçar a decodificação é o que separa "existe" de "é uma
    imagem".
    """
    problemas = []
    for caminho in arquivos:
        try:
            with Image.open(caminho) as img:
                formato, tamanho = img.format, img.size
                img.load()  # decodifica de fato; um arquivo cortado estoura aqui
            if formato not in ("WEBP", "PNG"):
                problemas.append(f"{caminho}: formato inesperado {formato}")
            elif min(tamanho) < 16:
                problemas.append(f"{caminho}: dimensão degenerada {tamanho}")
            elif caminho.stat().st_size < 1024:
                problemas.append(f"{caminho}: {caminho.stat().st_size} bytes, pequeno demais para ser real")
        except Exception as erro:  # noqa: BLE001 - qualquer falha aqui reprova o arquivo
            problemas.append(f"{caminho}: não abre como imagem ({erro})")
    return problemas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--origem", default="/tmp/_img_in/imagem", type=pathlib.Path)
    args = ap.parse_args()

    DESTINO.mkdir(parents=True, exist_ok=True)
    feitos = gerar_fotos(args.origem) + gerar_logo()

    problemas = conferir(feitos)
    if problemas:
        for p in problemas:
            print("FALHA", p, file=sys.stderr)
        sys.exit(1)

    total = sum(c.stat().st_size for c in feitos)
    print(f"{len(feitos)} imagens conferidas, {total // 1024} kB no total.")


if __name__ == "__main__":
    main()
