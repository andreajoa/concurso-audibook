// Correção de Redação Trilha Aprova — envia foto/arquivo/texto para /api/corretor e mostra a correção.
(function () {
  var qs = new URLSearchParams(location.search);
  var sid = qs.get('session_id') || '';
  try { if (sid) localStorage.setItem('ta_corretor_sid', sid); else sid = localStorage.getItem('ta_corretor_sid') || ''; } catch (e) {}
  if (sid) document.getElementById('voltar-area').href = '/acesso?session_id=' + encodeURIComponent(sid) + '&slug=curso-redacao-concursos-2026';
  var form = document.getElementById('cr-form'), msg = form.querySelector('.cr-msg'), go = form.querySelector('.cr-go');
  var file = document.getElementById('cr-file'), prev = document.getElementById('cr-prev'), dropTxt = document.getElementById('cr-drop-txt');
  var modo = 'foto', payload = null, ultimo = null;

  document.querySelectorAll('.cr-tabs button').forEach(function (b) {
    b.onclick = function () {
      modo = b.dataset.modo;
      document.querySelectorAll('.cr-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
      document.querySelectorAll('.cr-modo').forEach(function (p) { p.hidden = p.dataset.painel !== modo; });
    };
  });

  function erro(t) { msg.className = 'cr-msg err'; msg.textContent = t; }
  // Foto: reduz para no máximo 2000 px e JPEG ~0,85 (leve para enviar pelo celular, legível na correção).
  function prepararImagem(f) {
    return new Promise(function (ok, no) {
      var url = URL.createObjectURL(f), img = new Image();
      img.onload = function () {
        var max = 2000, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var d = c.toDataURL('image/jpeg', 0.85); URL.revokeObjectURL(url);
        ok({ mime: 'image/jpeg', data: d.split(',')[1], preview: d });
      };
      img.onerror = function () { no(new Error('Não consegui abrir essa imagem. Se for HEIC, tire a foto em JPG ou envie um PDF.')); };
      img.src = url;
    });
  }
  function lerArquivo(f) {
    return new Promise(function (ok, no) {
      var r = new FileReader();
      r.onload = function () { ok({ mime: f.type || 'application/pdf', data: String(r.result).split(',')[1] }); };
      r.onerror = function () { no(new Error('Não consegui ler o arquivo.')); };
      r.readAsDataURL(f);
    });
  }
  file.onchange = function () {
    var f = file.files[0]; payload = null; msg.textContent = '';
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) return erro('Arquivo muito grande. Envie até 15 MB.');
    var p = /^image\//.test(f.type) ? prepararImagem(f) : (/pdf|text\/plain/.test(f.type) || /\.(pdf|txt)$/i.test(f.name)) ? lerArquivo(f) : Promise.reject(new Error('Envie uma foto, um PDF ou um arquivo .txt.'));
    p.then(function (x) {
      if (/\.txt$/i.test(f.name)) x.mime = 'text/plain';
      if (/\.pdf$/i.test(f.name)) x.mime = 'application/pdf';
      payload = x;
      if (x.preview) { prev.src = x.preview; prev.hidden = false; } else { prev.hidden = true; }
      dropTxt.innerHTML = '<b>' + f.name.replace(/[<>&]/g, '') + '</b><small>Pronto. Toque para trocar o arquivo.</small>';
    }).catch(function (e) { erro(e.message); });
  };

  form.onsubmit = function (ev) {
    ev.preventDefault();
    var fd = new FormData(form), body = { session_id: sid, tema: fd.get('tema'), banca: fd.get('banca'), genero: fd.get('genero') };
    if (modo === 'texto') {
      var t = String(fd.get('texto') || '').trim();
      if (t.split(/\s+/).length < 40) return erro('Cole a redação inteira (mínimo de 40 palavras).');
      body.texto = t;
    } else {
      if (!payload) return erro('Escolha a foto ou o arquivo da sua redação.');
      body.mime = payload.mime; body.data = payload.data;
    }
    go.disabled = true; msg.className = 'cr-msg'; msg.innerHTML = '<span class="cr-spin"></span>Lendo e corrigindo a sua redação… (até 1 minuto)';
    fetch('/api/corretor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) {
        go.disabled = false;
        if (!x.j.ok) return erro(x.j.error || 'Não foi possível corrigir agora.');
        var r = x.j.resultado;
        if (r.legivel === false) return erro(r.aviso || 'Não conseguimos ler a redação. Tire outra foto com mais luz e a folha inteira.');
        msg.textContent = ''; ultimo = r; mostrar(r, x.j.restantes);
      })
      .catch(function () { go.disabled = false; erro('Falha de conexão. Tente de novo.'); });
  };

  var NOMES = { tema_genero: 'Tema e gênero', estrutura: 'Estrutura', argumentacao: 'Argumentação', coesao: 'Coesão e coerência', norma_padrao: 'Norma-padrão' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mostrar(r, restantes) {
    document.getElementById('o-total').textContent = r.nota_total;
    document.getElementById('o-resumo').textContent = r.resumo || '';
    document.getElementById('o-restam').textContent = (r.aviso ? r.aviso + ' ' : '') + (restantes != null ? 'Correções restantes no seu curso: ' + restantes + '.' : '');
    document.getElementById('o-criterios').innerHTML = Object.keys(NOMES).map(function (k) {
      var n = (r.notas || {})[k] || 0;
      return '<div class="c"><b>' + NOMES[k] + '</b><div class="bar"><i style="width:' + (n * 5) + '%"></i></div><span>' + n + '/20</span><p>' + esc((r.comentarios_criterio || {})[k]) + '</p></div>';
    }).join('');
    var fortes = r.pontos_fortes || [];
    document.getElementById('o-fortes-card').hidden = !fortes.length;
    document.getElementById('o-fortes').innerHTML = fortes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    document.getElementById('o-erros').innerHTML = (r.erros || []).map(function (e) {
      return '<div class="cr-erro"><span class="t">' + esc(e.tipo) + '</span><p><del>' + esc(e.trecho) + '</del> → <ins>' + esc(e.correcao) + '</ins></p><p>' + esc(e.explicacao) + '</p></div>';
    }).join('') || '<p>Nenhum erro relevante encontrado.</p>';
    document.getElementById('o-dicas').innerHTML = (r.dicas || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    document.getElementById('o-trans').textContent = r.transcricao || '';
    document.getElementById('o-rees').textContent = r.versao_reescrita || '';
    document.getElementById('form-card').hidden = true;
    var out = document.getElementById('cr-out'); out.hidden = false; out.scrollIntoView({ behavior: 'smooth' });
  }
  function baixar(nome, tipo, conteudo) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  document.getElementById('dl-txt').onclick = function () { if (ultimo) baixar('redacao-reescrita-trilha-aprova.txt', 'text/plain;charset=utf-8', ultimo.versao_reescrita || ''); };
  document.getElementById('dl-print').onclick = function () { window.print(); };
  document.getElementById('dl-doc').onclick = function () {
    if (!ultimo) return; var r = ultimo, p = function (t) { return esc(t).split(/\n\s*\n/).map(function (x) { return '<p>' + x.replace(/\n/g, '<br>') + '</p>'; }).join(''); };
    var h = '<html><head><meta charset="utf-8"><title>Correção</title></head><body style="font-family:Georgia,serif">' +
      '<h1>Correção da redação — Trilha Aprova</h1><p><b>Nota estimada: ' + r.nota_total + '/100</b></p><p>' + esc(r.resumo) + '</p>' +
      '<h2>Nota por critério</h2><ul>' + Object.keys(NOMES).map(function (k) { return '<li><b>' + NOMES[k] + ': ' + ((r.notas || {})[k] || 0) + '/20</b> — ' + esc((r.comentarios_criterio || {})[k]) + '</li>'; }).join('') + '</ul>' +
      '<h2>Erros e correções</h2><ol>' + (r.erros || []).map(function (e) { return '<li><b>' + esc(e.tipo) + ':</b> "' + esc(e.trecho) + '" → "' + esc(e.correcao) + '". ' + esc(e.explicacao) + '</li>'; }).join('') + '</ol>' +
      '<h2>Dicas</h2><ol>' + (r.dicas || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
      '<h2>Seu texto</h2>' + p(r.transcricao) + '<h2>Versão reescrita</h2>' + p(r.versao_reescrita) +
      '<p style="color:#777;font-size:11px">Nota estimada para treino. A correção oficial é feita pela banca, com a grade do edital.</p></body></html>';
    baixar('correcao-redacao-trilha-aprova.doc', 'application/msword', '﻿' + h);
  };
  document.getElementById('nova').onclick = function () { document.getElementById('cr-out').hidden = true; document.getElementById('form-card').hidden = false; window.scrollTo({ top: 0, behavior: 'smooth' }); };
})();
