/**
 * Ferramentas gratuitas da Trilha Aprova.
 *
 * Tudo roda no navegador: nada é enviado para servidor e nada exige cadastro.
 * O estado fica em localStorage porque é ele que faz a pessoa voltar — o
 * checklist pela metade é o motivo de reabrir a página amanhã.
 */
(function () {
  'use strict';

  var KEY = 'trilha:ferramentas:v1:';

  function load(tool, fallback) {
    try {
      var raw = localStorage.getItem(KEY + tool);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(tool, state) {
    try {
      localStorage.setItem(KEY + tool, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clear(tool) {
    try { localStorage.removeItem(KEY + tool); } catch (e) { /* modo privado */ }
  }

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var num = function (v, fallback) {
    var n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : (fallback || 0);
  };

  function hhmm(hours) {
    var total = Math.round(hours * 60);
    var h = Math.floor(total / 60);
    var m = total % 60;
    if (!h) return m + ' min';
    if (!m) return h + 'h';
    return h + 'h' + (m < 10 ? '0' + m : m);
  }

  function markSaved(root, ok) {
    var el = root.querySelector('[data-saved]');
    if (!el) return;
    el.hidden = !ok;
  }

  /* ---------------------------------------------------------------- *
   * Edital verticalizado
   * ---------------------------------------------------------------- */

  var EDITAL_EXEMPLO =
    'LÍNGUA PORTUGUESA:\n' +
    'Interpretação de texto; Ortografia oficial; Acentuação gráfica; Emprego das classes de palavras; ' +
    'Concordância verbal e nominal; Regência verbal e nominal; Pontuação.\n\n' +
    'RACIOCÍNIO LÓGICO:\n' +
    'Proposições simples e compostas; Tabelas-verdade; Equivalências lógicas; Sequências numéricas; ' +
    'Problemas de contagem.\n\n' +
    'NOÇÕES DE DIREITO ADMINISTRATIVO:\n' +
    'Princípios da administração pública; Atos administrativos: conceito, requisitos e atributos; ' +
    'Poderes administrativos; Improbidade administrativa.';

  /** Um edital brasileiro separa disciplina de tópico por maiúsculas ou dois-pontos. */
  function parseEdital(text) {
    var groups = [];
    var current = null;
    var lines = String(text).split(/\r?\n/);

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;

      var withoutColon = line.replace(/:$/, '').trim();
      var letters = withoutColon.replace(/[^A-Za-zÀ-ÿ]/g, '');
      var isUpper = letters.length > 2 && letters === letters.toUpperCase();
      var isHeader = (line.endsWith(':') || isUpper) && withoutColon.split(/[;.]/).length <= 2;

      if (isHeader) {
        current = { name: withoutColon, items: [] };
        groups.push(current);
        continue;
      }

      if (!current) {
        current = { name: 'Conteúdo programático', items: [] };
        groups.push(current);
      }

      // O ponto final separa tópicos, mas o ponto de "1." e "2.1" é numeração
      // do próprio edital e precisa sobreviver. Por isso só quebramos no ponto
      // quando o caractere anterior não é dígito — e sem lookbehind, que ainda
      // falha em navegador de iPhone antigo.
      var parts = [];
      line.split(';').forEach(function (chunk) {
        chunk.replace(/([^\d])\.(\s|$)/g, '$1\u0001').split('\u0001').forEach(function (piece) {
          parts.push(piece);
        });
      });

      for (var j = 0; j < parts.length; j++) {
        var topic = parts[j].trim().replace(/^[-–•]\s*/, '');
        if (topic.length > 2) current.items.push({ text: topic, done: false });
      }
    }

    return groups.filter(function (g) { return g.items.length; });
  }

  function initEdital(root) {
    var input = root.querySelector('#edital-input');
    var output = root.querySelector('[data-output]');
    var list = root.querySelector('[data-checklist]');
    var bar = root.querySelector('[data-bar]');
    var label = root.querySelector('[data-progress-label]');
    var state = load('edital', null);

    function persist() {
      markSaved(root, save('edital', state));
    }

    function progress() {
      var total = 0;
      var done = 0;
      state.groups.forEach(function (g) {
        g.items.forEach(function (it) { total++; if (it.done) done++; });
      });
      var pct = total ? Math.round((done / total) * 100) : 0;
      bar.style.width = pct + '%';
      bar.parentNode.setAttribute('role', 'progressbar');
      bar.parentNode.setAttribute('aria-valuenow', String(pct));
      bar.parentNode.setAttribute('aria-valuemin', '0');
      bar.parentNode.setAttribute('aria-valuemax', '100');
      label.textContent = done + ' de ' + total + ' tópicos concluídos (' + pct + '%)';
    }

    function render() {
      if (!state || !state.groups || !state.groups.length) {
        output.hidden = true;
        return;
      }
      var html = '';
      state.groups.forEach(function (g, gi) {
        html += '<section class="tool-group"><h3>' + esc(g.name) + '</h3><ul class="tool-check">';
        g.items.forEach(function (it, ii) {
          var id = 'chk-' + gi + '-' + ii;
          html += '<li' + (it.done ? ' class="is-done"' : '') + '>' +
            '<input type="checkbox" id="' + id + '" data-g="' + gi + '" data-i="' + ii + '"' + (it.done ? ' checked' : '') + '>' +
            '<span class="tool-topic" contenteditable="true" data-g="' + gi + '" data-i="' + ii + '">' + esc(it.text) + '</span>' +
            '<button type="button" class="tool-remove" data-g="' + gi + '" data-i="' + ii + '" aria-label="Remover tópico">&times;</button>' +
            '</li>';
        });
        html += '</ul></section>';
      });
      list.innerHTML = html;
      output.hidden = false;
      progress();
    }

    list.addEventListener('change', function (ev) {
      var cb = ev.target;
      if (cb.type !== 'checkbox') return;
      var item = state.groups[+cb.dataset.g].items[+cb.dataset.i];
      item.done = cb.checked;
      cb.closest('li').classList.toggle('is-done', cb.checked);
      progress();
      persist();
    });

    list.addEventListener('input', function (ev) {
      var span = ev.target;
      if (!span.classList || !span.classList.contains('tool-topic')) return;
      state.groups[+span.dataset.g].items[+span.dataset.i].text = span.textContent.trim();
      persist();
    });

    list.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.tool-remove');
      if (!btn) return;
      state.groups[+btn.dataset.g].items.splice(+btn.dataset.i, 1);
      state.groups = state.groups.filter(function (g) { return g.items.length; });
      render();
      persist();
    });

    root.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;

      if (action === 'exemplo') {
        input.value = EDITAL_EXEMPLO;
        action = 'gerar';
      }

      if (action === 'gerar') {
        var groups = parseEdital(input.value);
        if (!groups.length) {
          label.textContent = 'Não consegui separar nenhum tópico. Confira se o texto colado tem ponto e vírgula ou uma linha por tópico.';
          output.hidden = false;
          list.innerHTML = '';
          bar.style.width = '0%';
          return;
        }
        state = { groups: groups, created: new Date().toISOString().slice(0, 10) };
        render();
        persist();
        output.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      if (action === 'imprimir') window.print();

      if (action === 'limpar') {
        state = null;
        clear('edital');
        input.value = '';
        list.innerHTML = '';
        output.hidden = true;
        markSaved(root, false);
      }
    });

    if (state && state.groups) {
      render();
      markSaved(root, true);
    }
  }

  /* ---------------------------------------------------------------- *
   * Linhas de disciplina (cronograma e acertos compartilham a tabela)
   * ---------------------------------------------------------------- */

  function rowHtml(fields, row) {
    var html = '<tr>';
    fields.forEach(function (f) {
      var value = row && row[f.key] != null ? row[f.key] : '';
      if (f.type === 'text') {
        html += '<td><input type="text" data-key="' + f.key + '" value="' + esc(value) + '" placeholder="' + esc(f.placeholder || '') + '"></td>';
      } else if (f.type === 'select') {
        html += '<td><select data-key="' + f.key + '" aria-label="' + esc(f.label || f.key) + '">' +
          f.options.map(function (o) {
            var sel = String(value) === String(o.value) || (value === '' && o.value === f.padrao);
            return '<option value="' + esc(o.value) + '"' + (sel ? ' selected' : '') + '>' + esc(o.label) + '</option>';
          }).join('') + '</select></td>';
      } else {
        html += '<td><input type="number" inputmode="numeric" data-key="' + f.key + '" value="' + esc(value) +
          '" min="0" step="' + (f.step || '1') + '"></td>';
      }
    });
    html += '<td><button type="button" class="tool-remove" data-remove aria-label="Remover disciplina">&times;</button></td></tr>';
    return html;
  }

  function readRows(tbody, fields) {
    return Array.prototype.map.call(tbody.querySelectorAll('tr'), function (tr) {
      var row = {};
      fields.forEach(function (f) {
        var input = tr.querySelector('[data-key="' + f.key + '"]');
        row[f.key] = input ? input.value.trim() : '';
      });
      return row;
    }).filter(function (r) { return r.nome; });
  }

  function mountRows(tbody, fields, rows, blank) {
    var source = rows && rows.length ? rows : blank;
    tbody.innerHTML = source.map(function (r) { return rowHtml(fields, r); }).join('');
  }

  function wireRows(root, tbody, fields) {
    root.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-remove]')) {
        var tr = ev.target.closest('tr');
        if (tbody.querySelectorAll('tr').length > 1) tr.remove();
        return;
      }
      if (ev.target.closest('[data-action="add"]')) {
        tbody.insertAdjacentHTML('beforeend', rowHtml(fields, null));
        var last = tbody.querySelector('tr:last-child input');
        if (last) last.focus();
      }
    });
  }

  /* ---------------------------------------------------------------- *
   * Cronograma por peso do edital
   * ---------------------------------------------------------------- */

  var CRON_FIELDS = [
    { key: 'nome', type: 'text', placeholder: 'Língua Portuguesa' },
    { key: 'questoes', type: 'number' },
    { key: 'peso', type: 'number', step: '0.5' }
  ];

  var CRON_EXEMPLO = [
    { nome: 'Língua Portuguesa', questoes: 20, peso: 2 },
    { nome: 'Raciocínio Lógico', questoes: 10, peso: 1 },
    { nome: 'Direito Administrativo', questoes: 15, peso: 2 },
    { nome: 'Informática', questoes: 5, peso: 1 }
  ];

  /** Puro de propósito: é esta conta que decide o estudo de alguém. */
  function computeCronograma(rows, horas, dias, revisao) {
    var itens = rows.map(function (r) {
      var questoes = num(r.questoes, 0);
      var peso = num(r.peso, 1) || 1;
      return { nome: r.nome, questoes: questoes, peso: peso, real: questoes * peso };
    }).filter(function (i) { return i.real > 0; });

    var total = itens.reduce(function (s, i) { return s + i.real; }, 0);
    if (!total) return null;

    var horasRevisao = horas * (revisao / 100);
    var horasConteudo = horas - horasRevisao;

    itens.forEach(function (i) {
      i.fatia = i.real / total;
      i.horas = horasConteudo * i.fatia;
      i.porDia = i.horas / dias;
    });
    itens.sort(function (a, b) { return b.real - a.real; });

    return { itens: itens, total: total, horas: horas, dias: dias, horasRevisao: horasRevisao, horasConteudo: horasConteudo };
  }

  function initCronograma(root) {
    var tbody = root.querySelector('[data-rows]');
    var output = root.querySelector('[data-output]');
    var target = root.querySelector('[data-resultado]');
    var horasEl = root.querySelector('#cron-horas');
    var diasEl = root.querySelector('#cron-dias');
    var revEl = root.querySelector('#cron-revisao');
    var state = load('cronograma', null);

    var blank = [{ nome: '', questoes: '', peso: 1 }, { nome: '', questoes: '', peso: 1 }, { nome: '', questoes: '', peso: 1 }];
    mountRows(tbody, CRON_FIELDS, state && state.rows, blank);
    if (state) {
      horasEl.value = state.horas;
      diasEl.value = state.dias;
      revEl.value = state.revisao;
    }
    wireRows(root, tbody, CRON_FIELDS);

    function render(r) {
      var linhas = r.itens.map(function (i, idx) {
        return '<tr><td>' + (idx + 1) + '</td><td>' + esc(i.nome) + '</td><td>' + i.questoes + ' × ' + i.peso + ' = <strong>' + i.real + '</strong></td>' +
          '<td>' + Math.round(i.fatia * 100) + '%</td><td><strong>' + hhmm(i.horas) + '</strong></td><td>' + hhmm(i.porDia) + '</td></tr>';
      }).join('');

      target.innerHTML =
        '<h3>Seu cronograma semanal</h3>' +
        '<p class="tool-note">De ' + hhmm(r.horas) + ' por semana, ' + hhmm(r.horasRevisao) + ' ficam reservados para revisão e ' +
        hhmm(r.horasConteudo) + ' são distribuídos entre as disciplinas na proporção de questões × peso.</p>' +
        '<div class="tool-scroll"><table class="tool-table tool-result"><thead><tr><th scope="col">#</th><th scope="col">Disciplina</th>' +
        '<th scope="col">Peso real</th><th scope="col">Fatia</th><th scope="col">Por semana</th><th scope="col">Por dia de estudo</th></tr></thead>' +
        '<tbody>' + linhas + '</tbody></table></div>' +
        '<p class="tool-note"><strong>Leia nesta ordem:</strong> a linha 1 é a disciplina onde cada hora rende mais pontos. ' +
        'Se alguma disciplina do seu edital tiver nota mínima própria, garanta o tempo dela antes de seguir esta proporção — ' +
        'ficar abaixo do mínimo elimina mesmo com boa pontuação total.</p>' +
        '<p class="tool-note">Revisão de ' + hhmm(r.horasRevisao) + ' por semana: refazer questões erradas e ouvir o capítulo em áudio contam. ' +
        'Releitura do mesmo texto costuma render menos.</p>';
      output.hidden = false;
    }

    root.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;

      if (action === 'exemplo') {
        mountRows(tbody, CRON_FIELDS, CRON_EXEMPLO, CRON_EXEMPLO);
        action = 'gerar';
      }

      if (action === 'gerar') {
        var rows = readRows(tbody, CRON_FIELDS);
        var horas = num(horasEl.value, 10);
        var dias = Math.max(1, Math.min(7, num(diasEl.value, 5)));
        var revisao = Math.max(0, Math.min(50, num(revEl.value, 20)));
        var r = computeCronograma(rows, horas, dias, revisao);
        if (!r) {
          target.innerHTML = '<p class="tool-note">Preencha ao menos uma disciplina com nome e número de questões maior que zero.</p>';
          output.hidden = false;
          return;
        }
        render(r);
        markSaved(root, save('cronograma', { rows: rows, horas: horas, dias: dias, revisao: revisao }));
        output.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      if (action === 'imprimir') window.print();

      if (action === 'limpar') {
        clear('cronograma');
        mountRows(tbody, CRON_FIELDS, null, blank);
        horasEl.value = 10;
        diasEl.value = 5;
        revEl.value = 20;
        output.hidden = true;
        markSaved(root, false);
      }
    });

    if (state && state.rows && state.rows.length) markSaved(root, true);
  }

  /* ---------------------------------------------------------------- *
   * Calculadora de acertos
   * ---------------------------------------------------------------- */

  var ACERTO_FIELDS = [
    { key: 'nome', type: 'text', placeholder: 'Língua Portuguesa' },
    { key: 'questoes', type: 'number' },
    { key: 'peso', type: 'number', step: '0.5' },
    { key: 'minimo', type: 'number' },
    { key: 'acertos', type: 'number' }
  ];

  var ACERTO_EXEMPLO = [
    { nome: 'Língua Portuguesa', questoes: 20, peso: 2, minimo: 10, acertos: 13 },
    { nome: 'Raciocínio Lógico', questoes: 10, peso: 1, minimo: 4, acertos: 3 },
    { nome: 'Direito Administrativo', questoes: 15, peso: 2, minimo: '', acertos: 8 },
    { nome: 'Informática', questoes: 5, peso: 1, minimo: '', acertos: 3 }
  ];

  /** Puro de propósito: erro de conta aqui manda alguém estudar a matéria errada. */
  function computeAcertos(rows, alvo) {
    var itens = rows.map(function (r) {
      var questoes = num(r.questoes, 0);
      var peso = num(r.peso, 1) || 1;
      var acertos = Math.min(num(r.acertos, 0), questoes);
      var minimo = String(r.minimo == null ? '' : r.minimo).trim() === '' ? null : num(r.minimo, 0);
      return {
        nome: r.nome, questoes: questoes, peso: peso, acertos: acertos, minimo: minimo,
        pontos: acertos * peso, maximo: questoes * peso,
        restantes: questoes - acertos, potencial: (questoes - acertos) * peso,
        abaixo: minimo != null && acertos < minimo,
        faltamMinimo: minimo != null ? Math.max(0, minimo - acertos) : 0
      };
    }).filter(function (i) { return i.questoes > 0; });

    if (!itens.length) return null;

    var pontos = itens.reduce(function (s, i) { return s + i.pontos; }, 0);
    var maximo = itens.reduce(function (s, i) { return s + i.maximo; }, 0);
    var potencial = itens.reduce(function (s, i) { return s + i.potencial; }, 0);
    var faltam = alvo - pontos;

    // Ordem por quanto vale cada acerto, não por quanto falta na disciplina:
    // é essa ordem que responde "onde a próxima hora rende mais ponto".
    var prioridade = itens.slice().filter(function (i) { return i.restantes > 0; })
      .sort(function (a, b) { return b.peso - a.peso || b.potencial - a.potencial; });

    var rota = [];
    if (faltam > 0 && faltam <= potencial) {
      var restante = faltam;
      for (var k = 0; k < prioridade.length && restante > 0; k++) {
        var i = prioridade[k];
        var precisa = Math.min(i.restantes, Math.ceil(restante / i.peso));
        if (precisa <= 0) continue;
        rota.push({ nome: i.nome, acertos: precisa, pontos: precisa * i.peso, peso: i.peso });
        restante -= precisa * i.peso;
      }
    }

    return {
      itens: itens, pontos: pontos, maximo: maximo, potencial: potencial,
      alvo: alvo, faltam: faltam, prioridade: prioridade, rota: rota,
      alcancavel: faltam <= potencial,
      risco: itens.filter(function (i) { return i.abaixo; })
    };
  }

  function initAcertos(root) {
    var tbody = root.querySelector('[data-rows]');
    var output = root.querySelector('[data-output]');
    var target = root.querySelector('[data-resultado]');
    var alvoEl = root.querySelector('#meta-alvo');
    var state = load('acertos', null);

    var blank = [{ nome: '', questoes: '', peso: 1, minimo: '', acertos: '' },
      { nome: '', questoes: '', peso: 1, minimo: '', acertos: '' },
      { nome: '', questoes: '', peso: 1, minimo: '', acertos: '' }];
    mountRows(tbody, ACERTO_FIELDS, state && state.rows, blank);
    if (state) alvoEl.value = state.alvo;
    wireRows(root, tbody, ACERTO_FIELDS);

    function render(r) {
      var linhas = r.itens.map(function (i) {
        return '<tr' + (i.abaixo ? ' class="is-risk"' : '') + '><td>' + esc(i.nome) + '</td>' +
          '<td>' + i.acertos + ' / ' + i.questoes + '</td>' +
          '<td>' + i.pontos + ' de ' + i.maximo + '</td>' +
          '<td>' + i.peso + ' ponto' + (i.peso === 1 ? '' : 's') + '</td>' +
          '<td>' + (i.minimo == null ? '—' : (i.abaixo ? '<strong>' + (i.faltamMinimo === 1 ? 'falta 1' : 'faltam ' + i.faltamMinimo) + '</strong>' : 'atingido')) + '</td></tr>';
      }).join('');

      var head = r.faltam <= 0
        ? '<p class="tool-verdict is-ok">Com os acertos informados você já soma <strong>' + r.pontos +
          ' pontos</strong>, ' + Math.abs(Math.round(r.faltam * 10) / 10) + ' acima da pontuação-alvo de ' + r.alvo + '.</p>'
        : '<p class="tool-verdict">Você soma <strong>' + r.pontos + ' pontos</strong> e faltam <strong>' +
          (Math.round(r.faltam * 10) / 10) + ' pontos</strong> para a pontuação-alvo de ' + r.alvo + '.</p>';

      var viabilidade = r.faltam > 0 && !r.alcancavel
        ? '<p class="tool-verdict is-risk">Acertando <strong>todas</strong> as questões que ainda restam, você chegaria a ' +
          (r.pontos + r.potencial) + ' pontos — abaixo do alvo. Ou o alvo precisa ser revisto, ou o quadro de provas ' +
          'informado não corresponde ao edital.</p>'
        : '';

      var caminho = '';
      if (r.rota.length) {
        var passos = r.rota.map(function (p) {
          return '<li><strong>' + esc(p.nome) + '</strong>: mais ' + p.acertos + ' acerto' + (p.acertos === 1 ? '' : 's') +
            ' (' + p.pontos + ' pontos, porque cada questão vale ' + p.peso + ')</li>';
        });
        caminho = '<h3>O caminho mais curto até o alvo</h3><ol class="tool-path">' + passos.join('') + '</ol>' +
          '<p class="tool-note">Esta é a rota com menos questões, porque começa onde cada acerto vale mais pontos. ' +
          'Não é ordem de estudo obrigatória — é a conta de onde o esforço rende mais.</p>';
      }

      var alerta = r.risco.length
        ? '<p class="tool-verdict is-risk"><strong>Risco de eliminação.</strong> ' +
          r.risco.map(function (i) {
            return esc(i.nome) + (i.faltamMinimo === 1
              ? ' (falta 1 acerto para o mínimo)'
              : ' (faltam ' + i.faltamMinimo + ' acertos para o mínimo)');
          }).join('; ') +
          '. Ficar abaixo da nota mínima de uma prova costuma desclassificar mesmo com boa pontuação total: resolva isso antes de buscar pontos onde eles rendem mais.</p>'
        : '';

      target.innerHTML =
        '<h3>Sua situação hoje</h3>' + head + alerta + viabilidade +
        '<div class="tool-scroll"><table class="tool-table tool-result"><thead><tr><th scope="col">Disciplina</th>' +
        '<th scope="col">Acertos</th><th scope="col">Pontos</th><th scope="col">Vale cada acerto</th>' +
        '<th scope="col">Nota mínima</th></tr></thead><tbody>' + linhas + '</tbody></table></div>' +
        caminho +
        '<p class="tool-note">A pontuação-alvo de ' + r.alvo + ' foi informada por você. ' +
        'Não publicamos nota de corte de concurso: ela é resultado de uma edição específica e só o documento oficial do órgão ou da banca vale.</p>';
      output.hidden = false;
    }

    root.addEventListener('click', function (ev) {
      var btn = ev.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;

      if (action === 'exemplo') {
        mountRows(tbody, ACERTO_FIELDS, ACERTO_EXEMPLO, ACERTO_EXEMPLO);
        alvoEl.value = 70;
        action = 'gerar';
      }

      if (action === 'gerar') {
        var rows = readRows(tbody, ACERTO_FIELDS);
        var alvo = num(alvoEl.value, 0);
        var r = computeAcertos(rows, alvo);
        if (!r) {
          target.innerHTML = '<p class="tool-note">Preencha ao menos uma disciplina com nome e número de questões maior que zero.</p>';
          output.hidden = false;
          return;
        }
        render(r);
        markSaved(root, save('acertos', { rows: rows, alvo: alvo }));
        output.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      if (action === 'imprimir') window.print();

      if (action === 'limpar') {
        clear('acertos');
        mountRows(tbody, ACERTO_FIELDS, null, blank);
        alvoEl.value = 70;
        output.hidden = true;
        markSaved(root, false);
      }
    });

    if (state && state.rows && state.rows.length) markSaved(root, true);
  }

  /* ---------------------------------------------------------------- *
   * Trilha do dia
   *
   * O cronograma responde a semana. Falta a pergunta que trava a pessoa às
   * oito da noite, cansada, com o edital aberto: o que eu faço AGORA. Esta
   * ferramenta responde só isso — uma sequência de blocos para hoje, com
   * minuto e ação definidos, a partir de três coisas que a pessoa sabe: o
   * peso de cada matéria na prova, o quanto ela se sente travada em cada uma
   * e quanto tempo ela realmente tem hoje.
   *
   * Nada aqui adivinha. A conta é a mesma toda vez, com os mesmos números —
   * um plano que muda sozinho não dá para seguir nem para conferir.
   * ---------------------------------------------------------------- */

  var MIN_BLOCO = 20;

  var SEGURANCA = {
    1: { peso: 3, rotulo: 'travado' },
    2: { peso: 2, rotulo: 'mais ou menos' },
    3: { peso: 1, rotulo: 'seguro' }
  };

  var TRILHA_FIELDS = [
    { key: 'nome', type: 'text', placeholder: 'Língua Portuguesa' },
    { key: 'questoes', type: 'number' },
    {
      key: 'seguranca', type: 'select', label: 'Como você se sente nesta matéria', padrao: '2',
      options: [
        { value: '1', label: 'Travado' },
        { value: '2', label: 'Mais ou menos' },
        { value: '3', label: 'Seguro' }
      ]
    }
  ];

  var TRILHA_EXEMPLO = [
    { nome: 'Língua Portuguesa', questoes: 20, seguranca: '2' },
    { nome: 'Raciocínio Lógico', questoes: 10, seguranca: '1' },
    { nome: 'Direito Administrativo', questoes: 15, seguranca: '1' },
    { nome: 'Informática', questoes: 5, seguranca: '3' }
  ];

  /**
   * A distância até a prova muda o que vale a pena fazer hoje.
   * Faltando uma semana, ler conteúdo novo rende menos que testar o que já
   * foi visto — por isso a fatia de questões cresce conforme a data chega.
   */
  function faseDoEstudo(dias) {
    if (dias == null) {
      return { id: 'sem-data', rotulo: 'Sem data de prova', questoes: 0.40,
        nota: 'Sem a data da prova o plano fica equilibrado entre leitura e questões. Quando o edital marcar a data, informe aqui: ela muda o que vale a pena fazer hoje.' };
    }
    if (dias < 0) {
      return { id: 'passou', rotulo: 'Prova já aplicada', questoes: 0.50,
        nota: 'A data informada já passou. Se você vai prestar outro concurso, troque a data: a proporção entre leitura e questões depende dela.' };
    }
    if (dias <= 7) {
      return { id: 'vespera', rotulo: 'Véspera', questoes: 0.75,
        nota: 'Faltando uma semana, conteúdo novo quase não chega a tempo de virar acerto. O plano de hoje é quase todo questão e revisão do que você já viu.' };
    }
    if (dias <= 30) {
      return { id: 'reta-final', rotulo: 'Reta final', questoes: 0.60,
        nota: 'A menos de um mês, a maior parte do tempo vai para questões: é resolvendo que aparece o que você achava que sabia.' };
    }
    if (dias <= 90) {
      return { id: 'consolidacao', rotulo: 'Consolidação', questoes: 0.45,
        nota: 'Com um a três meses pela frente, leitura e questões dividem o tempo quase pela metade.' };
    }
    return { id: 'base', rotulo: 'Base', questoes: 0.30,
      nota: 'Com mais de três meses, a maior fatia é de leitura: ainda dá tempo de construir base antes de gastar questão boa.' };
  }

  /**
   * Pura de propósito: é esta conta que decide o que alguém vai fazer hoje.
   *
   * `rotacao` é o que impede a lista de morrer. Sem ela, a matéria mais
   * pesada monopolizaria todo dia e as outras nunca seriam abertas.
   */
  function computeTrilha(rows, minutos, diasAteProva, rotacao) {
    var itens = rows.map(function (r) {
      var questoes = num(r.questoes, 0);
      var nivel = num(r.seguranca, 2);
      var conf = SEGURANCA[nivel] || SEGURANCA[2];
      return {
        nome: r.nome, questoes: questoes, nivel: nivel,
        rotulo: conf.rotulo, score: questoes * conf.peso
      };
    }).filter(function (i) { return i.questoes > 0 && i.nome; });

    if (!itens.length || !(minutos >= MIN_BLOCO)) return null;

    var totalQuestoes = itens.reduce(function (s, i) { return s + i.questoes; }, 0);
    itens.sort(function (a, b) {
      return b.score - a.score || String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    });

    var giro = ((Math.round(rotacao || 0) % itens.length) + itens.length) % itens.length;
    var fila = itens.slice(giro).concat(itens.slice(0, giro));

    var fase = faseDoEstudo(diasAteProva);

    // Bloco menor que vinte minutos não vira estudo, vira olhada. Então o
    // número de matérias de hoje é limitado pelo tempo que existe de verdade.
    var cabem = Math.max(1, Math.min(fila.length, Math.floor(minutos / MIN_BLOCO)));
    var hoje = fila.slice(0, cabem);
    var espera = fila.slice(cabem).map(function (i) { return i.nome; });

    // Reparte em unidades de cinco minutos, pelo método do maior resto: a soma
    // dos blocos bate com o tempo informado, sem sobra inventada.
    var unidades = Math.floor(minutos / 5);
    var piso = MIN_BLOCO / 5;
    var restante = unidades - hoje.length * piso;
    var somaScore = hoje.reduce(function (s, i) { return s + i.score; }, 0);

    var ideal = hoje.map(function (i) { return restante * i.score / somaScore; });
    var extra = ideal.map(Math.floor);
    var faltam = restante - extra.reduce(function (s, v) { return s + v; }, 0);
    var ordem = hoje.map(function (_, k) { return k; }).sort(function (a, b) {
      return (ideal[b] - extra[b]) - (ideal[a] - extra[a]) || hoje[b].score - hoje[a].score || a - b;
    });
    for (var k = 0; k < faltam; k++) extra[ordem[k % ordem.length]]++;

    var blocos = hoje.map(function (i, k) {
      var total = (extra[k] + piso) * 5;
      var questoesMin = Math.round(total * fase.questoes / 5) * 5;
      // Nunca só leitura nem só questão: o bloco precisa fechar o ciclo.
      questoesMin = Math.min(Math.max(questoesMin, 5), total - 5);
      return {
        nome: i.nome,
        total: total,
        leitura: total - questoesMin,
        questoes: questoesMin,
        nivel: i.nivel,
        motivo: i.questoes + ' das ' + totalQuestoes + ' questões da prova' + (
          i.nivel === 1 ? ' e você marcou que está travado nela.'
            : i.nivel === 3 ? ', e você já se sente seguro nela.'
              : '.')
      };
    });

    // A pergunta "e se eu só tiver cinco minutos" tem uma resposta só, e ela
    // não é ler: em cinco minutos, testar mostra buraco e ler esconde.
    var alvo = itens[0];
    var micro = {
      nome: alvo.nome,
      texto: 'Responda 3 questões de ' + alvo.nome + ' e confira o gabarito na hora. Não abra a teoria: em cinco minutos, resolver mostra o que falta e ler só dá sensação de progresso.'
    };

    return {
      minutos: blocos.reduce(function (s, b) { return s + b.total; }, 0),
      minutosInformados: minutos,
      dias: diasAteProva,
      fase: fase,
      totalQuestoes: totalQuestoes,
      blocos: blocos,
      espera: espera,
      micro: micro,
      rotacao: giro
    };
  }

  /** Data ISO de hoje no fuso de quem está lendo, sem depender de UTC. */
  function hojeLocalIso() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var dia = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (dia < 10 ? '0' + dia : dia);
  }

  function diasAte(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return null;
    var alvo = Date.parse(iso + 'T00:00:00Z');
    if (isNaN(alvo)) return null;
    var hoje = hojeLocalIso().split('-');
    var base = Date.UTC(+hoje[0], +hoje[1] - 1, +hoje[2]);
    return Math.round((alvo - base) / 86400000);
  }

  function initTrilha(root) {
    var tbody = root.querySelector('[data-rows]');
    var output = root.querySelector('[data-output]');
    var target = root.querySelector('[data-resultado]');
    var minutosEl = root.querySelector('#trilha-minutos');
    var provaEl = root.querySelector('#trilha-prova');
    var state = load('trilha', null);

    var blank = [
      { nome: '', questoes: '', seguranca: '2' },
      { nome: '', questoes: '', seguranca: '2' },
      { nome: '', questoes: '', seguranca: '2' }
    ];
    mountRows(tbody, TRILHA_FIELDS, state && state.rows, blank);
    if (state) {
      if (state.minutos) minutosEl.value = state.minutos;
      if (state.prova) provaEl.value = state.prova;
    }
    wireRows(root, tbody, TRILHA_FIELDS);

    function plural(n, um, muitos) { return n + ' ' + (n === 1 ? um : muitos); }

    function render(r) {
      var faltam = r.dias == null ? null : r.dias;
      var cabecalho = '<div class="trilha-fase"><span class="trilha-fase-tag">' + esc(r.fase.rotulo) + '</span>' +
        (faltam == null ? '' : faltam < 0
          ? '<strong>A data informada já passou.</strong>'
          : faltam === 0
            ? '<strong>A prova é hoje.</strong>'
            : '<strong>' + esc(plural(faltam, 'dia', 'dias')) + ' até a prova.</strong>') +
        '<p>' + esc(r.fase.nota) + '</p></div>';

      var passos = r.blocos.map(function (b, i) {
        return '<li class="trilha-bloco">' +
          '<span class="trilha-bloco-hora">' + (i + 1) + 'º bloco · ' + b.total + ' min</span>' +
          '<strong>' + esc(b.nome) + '</strong>' +
          '<p class="trilha-bloco-acao">' + b.leitura + ' min lendo ou revisando · <b>' + b.questoes + ' min resolvendo questões</b></p>' +
          '<p class="trilha-bloco-motivo">Entrou hoje porque vale ' + esc(b.motivo) + '</p>' +
          '</li>';
      }).join('');

      var html = cabecalho +
        '<p class="trilha-total">Plano de hoje: ' + esc(plural(r.minutos, 'minuto', 'minutos')) +
        ' em ' + esc(plural(r.blocos.length, 'bloco', 'blocos')) + '.</p>' +
        '<ol class="trilha-lista">' + passos + '</ol>' +
        '<div class="trilha-micro"><strong>Se hoje só sobrarem 5 minutos</strong><p>' + esc(r.micro.texto) + '</p></div>' +
        (r.espera.length
          ? '<p class="tool-note">Ficam para os próximos dias: ' + esc(r.espera.join(', ')) +
            '. Amanhã a lista começa por outra matéria — estudar sempre a mesma primeiro é o que faz as outras nunca serem abertas.</p>'
          : '');

      target.innerHTML = html;
      output.hidden = false;
    }

    root.addEventListener('click', function (ev) {
      var botao = ev.target.closest('[data-action]');
      if (!botao) return;
      var action = botao.dataset.action;
      if (action === 'add') return;

      if (action === 'exemplo') {
        mountRows(tbody, TRILHA_FIELDS, TRILHA_EXEMPLO, blank);
        minutosEl.value = 90;
        action = 'gerar';
      }

      if (action === 'gerar') {
        var rows = readRows(tbody, TRILHA_FIELDS);
        var minutos = num(minutosEl.value, 0);
        var salvo = load('trilha', null);
        // A rotação anda uma vez por dia de calendário, não a cada clique:
        // regerar o plano no mesmo dia tem que devolver o mesmo plano.
        var hoje = hojeLocalIso();
        var rotacao = salvo && salvo.dia === hoje ? num(salvo.rotacao, 0) : (salvo ? num(salvo.rotacao, 0) + 1 : 0);

        var r = computeTrilha(rows, minutos, diasAte(provaEl.value), rotacao);
        if (!r) {
          target.innerHTML = '<p class="tool-note">Informe ao menos uma matéria com número de questões maior que zero e pelo menos 20 minutos de estudo — abaixo disso o bloco vira olhada, não estudo.</p>';
          output.hidden = false;
          return;
        }
        render(r);
        markSaved(root, save('trilha', {
          rows: rows, minutos: minutos, prova: provaEl.value, dia: hoje, rotacao: rotacao
        }));
        output.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      if (action === 'imprimir') window.print();

      if (action === 'limpar') {
        clear('trilha');
        mountRows(tbody, TRILHA_FIELDS, null, blank);
        minutosEl.value = '';
        provaEl.value = '';
        output.hidden = true;
        markSaved(root, false);
      }
    });

    if (state && state.rows && state.rows.length) markSaved(root, true);
  }

  /* ---------------------------------------------------------------- *
   * Caderno de erros                                                   *
   *                                                                    *
   * As outras ferramentas organizam o que você pretende fazer. Esta    *
   * guarda o que já aconteceu — e é a única que fica mais útil com o   *
   * tempo, porque o valor dela é o histórico, não o formulário.        *
   *                                                                    *
   * Duas contas sustentam tudo:                                        *
   *   1. quando a questão errada tem de voltar (repetição espaçada);   *
   *   2. por que você erra (o motivo, não a matéria).                  *
   * A segunda é a que muda a rotina de alguém: quem descobre que 60%   *
   * dos erros são "li errado" para de estudar mais conteúdo e começa a *
   * treinar leitura de enunciado.                                      *
   * ---------------------------------------------------------------- */

  /**
   * Os degraus da revisão, em dias. O intervalo cresce porque o que você
   * acabou de acertar precisa voltar logo, e o que você já acertou quatro
   * vezes pode esperar meses sem se perder.
   */
  var ESCADA_REVISAO = [1, 3, 7, 16, 35, 75];

  /**
   * Errar de novo derruba dois degraus, não zera.
   *
   * Zerar é a escolha comum e é a errada: quem já acertou três vezes e
   * escorregou na quarta não voltou ao dia zero, e tratar assim enche a fila
   * de revisões que a pessoa não precisava fazer — até ela abandonar o
   * caderno. Dois degraus devolvem a questão para um intervalo curto sem
   * apagar o que já foi construído.
   */
  var QUEDA_POR_ERRO = 2;

  var MOTIVOS = [
    { id: 'nao-sabia', rotulo: 'Não sabia o conteúdo', curto: 'falta de conteúdo',
      veredito: 'A maior parte dos seus erros é falta de conteúdo mesmo.',
      receita: 'Aqui estudar mais resolve. Volte à teoria desses tópicos antes de gastar mais questões: resolver sem base vira chute com aparência de treino.' },
    { id: 'confundi', rotulo: 'Confundi com um conceito parecido', curto: 'confusão entre conceitos',
      veredito: 'Seus erros são de fronteira: você sabe os dois conceitos, mas troca um pelo outro.',
      receita: 'Ler de novo não separa o que já está embaralhado. Escreva lado a lado o par que você confunde e a diferença entre eles em uma frase — é a comparação que desfaz o nó, não a releitura.' },
    { id: 'li-errado', rotulo: 'Li o enunciado errado', curto: 'leitura de enunciado',
      veredito: 'Seu problema não é conteúdo: é leitura de enunciado.',
      receita: 'Estudar mais matéria não muda esse número. Nas próximas questões, sublinhe o que está sendo pedido antes de olhar as alternativas, e marque as palavras que invertem o sentido: exceto, incorreta, não. É treino de leitura, e rende mais rápido que qualquer capítulo.' },
    { id: 'chutei', rotulo: 'Chutei', curto: 'chute',
      veredito: 'Boa parte do que você registra como erro foi chute.',
      receita: 'Chute não ensina nada porque não deixa rastro. Nas próximas, antes de marcar, anote em uma palavra por que escolheu aquela alternativa — mesmo errando, você passa a ter o que corrigir.' },
    { id: 'desatencao', rotulo: 'Sabia, mas marquei a alternativa errada', curto: 'desatenção',
      veredito: 'Você está perdendo questão que já sabia responder.',
      receita: 'Isso não se resolve estudando: resolve-se no ritmo. Conferir o número da alternativa antes de marcar custa três segundos e devolve pontos que a teoria não devolveria.' }
  ];

  function motivoPorId(id) {
    for (var i = 0; i < MOTIVOS.length; i++) if (MOTIVOS[i].id === id) return MOTIVOS[i];
    return null;
  }

  /** Soma dias a uma data ISO sem passar pelo fuso local. */
  function somaDias(iso, dias) {
    var p = String(iso).split('-');
    var base = Date.UTC(+p[0], +p[1] - 1, +p[2]);
    var d = new Date(base + dias * 86400000);
    var m = d.getUTCMonth() + 1;
    var dia = d.getUTCDate();
    return d.getUTCFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (dia < 10 ? '0' + dia : dia);
  }

  function cadernoVazio() { return { versao: 1, itens: [] }; }

  /**
   * Registra um erro e agenda a primeira revisão.
   *
   * Pura: recebe o caderno e devolve um novo, sem tocar no original. É o que
   * permite testar a escada de revisão sem navegador e sem relógio.
   */
  function registrarErro(caderno, entrada, hoje) {
    var atual = caderno && caderno.itens ? caderno : cadernoVazio();
    var materia = String((entrada && entrada.materia) || '').trim();
    var motivo = motivoPorId(entrada && entrada.motivo);
    if (!materia || !motivo) return null;

    var maior = atual.itens.reduce(function (m, i) { return Math.max(m, i.id); }, 0);
    var item = {
      id: maior + 1,
      materia: materia,
      topico: String((entrada && entrada.topico) || '').trim(),
      motivo: motivo.id,
      anotacao: String((entrada && entrada.anotacao) || '').trim(),
      criadoEm: hoje,
      degrau: 0,
      proxima: somaDias(hoje, ESCADA_REVISAO[0]),
      erros: 1,
      acertosSeguidos: 0,
      dominado: false
    };
    return { versao: 1, itens: atual.itens.concat([item]) };
  }

  /**
   * Marca o resultado de uma revisão. Acertou sobe um degrau; errou desce
   * dois. Quem passa do último degrau sai da fila: já é conteúdo dominado, e
   * manter na fila só rouba o tempo das questões que ainda machucam.
   */
  function registrarRevisao(caderno, id, acertou, hoje) {
    var atual = caderno && caderno.itens ? caderno : cadernoVazio();
    var achou = false;
    var itens = atual.itens.map(function (i) {
      if (i.id !== id) return i;
      achou = true;
      var degrau = acertou ? i.degrau + 1 : Math.max(0, i.degrau - QUEDA_POR_ERRO);
      var dominado = acertou && degrau >= ESCADA_REVISAO.length;
      return {
        id: i.id, materia: i.materia, topico: i.topico, motivo: i.motivo,
        anotacao: i.anotacao, criadoEm: i.criadoEm,
        degrau: dominado ? ESCADA_REVISAO.length : degrau,
        proxima: dominado ? null : somaDias(hoje, ESCADA_REVISAO[Math.min(degrau, ESCADA_REVISAO.length - 1)]),
        erros: i.erros + (acertou ? 0 : 1),
        acertosSeguidos: acertou ? i.acertosSeguidos + 1 : 0,
        dominado: dominado,
        revisadoEm: hoje
      };
    });
    return achou ? { versao: 1, itens: itens } : atual;
  }

  /**
   * O que precisa voltar hoje. Inclui o que venceu antes e ficou para trás —
   * dois dias sem abrir o caderno não podem fazer a questão sumir da fila.
   * O atraso vem junto para que a tela possa dizer, sem julgamento, há quanto
   * tempo aquilo está esperando.
   */
  function revisoesDoDia(caderno, hoje) {
    var atual = caderno && caderno.itens ? caderno : cadernoVazio();
    return atual.itens
      .filter(function (i) { return !i.dominado && i.proxima && i.proxima <= hoje; })
      .map(function (i) {
        var p = i.proxima.split('-');
        var h = String(hoje).split('-');
        var atraso = Math.round((Date.UTC(+h[0], +h[1] - 1, +h[2]) - Date.UTC(+p[0], +p[1] - 1, +p[2])) / 86400000);
        return {
          id: i.id, materia: i.materia, topico: i.topico, motivo: i.motivo,
          anotacao: i.anotacao, degrau: i.degrau, erros: i.erros, atraso: atraso
        };
      })
      .sort(function (a, b) {
        return b.atraso - a.atraso || b.erros - a.erros ||
          String(a.materia).localeCompare(String(b.materia), 'pt-BR') || a.id - b.id;
      });
  }

  /**
   * O diagnóstico: por que você erra.
   *
   * É a resposta que nenhuma apostila dá, porque depende do seu histórico.
   * O veredito só aparece com amostra suficiente — declarar tendência com
   * quatro questões seria adivinhação com cara de dado.
   */
  var MINIMO_DIAGNOSTICO = 8;
  var FATIA_DOMINANTE = 0.35;

  function diagnosticoErros(caderno) {
    var atual = caderno && caderno.itens ? caderno : cadernoVazio();
    var total = atual.itens.length;

    var contagem = MOTIVOS.map(function (m) {
      var q = atual.itens.filter(function (i) { return i.motivo === m.id; }).length;
      return {
        id: m.id, rotulo: m.rotulo, curto: m.curto, quantidade: q,
        percentual: total ? Math.round(q * 100 / total) : 0
      };
    }).sort(function (a, b) { return b.quantidade - a.quantidade || a.rotulo.localeCompare(b.rotulo, 'pt-BR'); });

    // Reincidentes: erradas de novo depois de já terem voltado para revisão.
    // São elas que a pessoa acha que sabe — e são as que derrubam prova.
    var teimosos = atual.itens
      .filter(function (i) { return i.erros >= 2 && !i.dominado; })
      .sort(function (a, b) { return b.erros - a.erros || a.id - b.id; })
      .map(function (i) { return { id: i.id, materia: i.materia, topico: i.topico, erros: i.erros }; });

    var topo = contagem[0];
    var maduro = total >= MINIMO_DIAGNOSTICO && topo.quantidade / total >= FATIA_DOMINANTE;
    var motivo = maduro ? motivoPorId(topo.id) : null;

    return {
      total: total,
      dominados: atual.itens.filter(function (i) { return i.dominado; }).length,
      contagem: contagem,
      teimosos: teimosos,
      dominante: maduro ? topo : null,
      veredito: motivo ? motivo.veredito : null,
      receita: motivo ? motivo.receita : null,
      faltam: maduro ? 0 : Math.max(0, MINIMO_DIAGNOSTICO - total)
    };
  }

  /**
   * Erros por matéria. É esta lista que a Trilha do Dia consome para parar de
   * perguntar "você está travado nesta matéria?" e passar a saber a resposta.
   */
  function resumoPorMateria(caderno) {
    var atual = caderno && caderno.itens ? caderno : cadernoVazio();
    var mapa = {};
    atual.itens.forEach(function (i) {
      var m = mapa[i.materia] || (mapa[i.materia] = {
        materia: i.materia, erros: 0, abertos: 0, dominados: 0, topicos: {}
      });
      m.erros++;
      if (i.dominado) m.dominados++; else m.abertos++;
      if (i.topico) m.topicos[i.topico] = (m.topicos[i.topico] || 0) + 1;
    });

    return Object.keys(mapa).map(function (nome) {
      var m = mapa[nome];
      var topicos = Object.keys(m.topicos)
        .map(function (t) { return { topico: t, erros: m.topicos[t] }; })
        .sort(function (a, b) { return b.erros - a.erros || a.topico.localeCompare(b.topico, 'pt-BR'); });
      return {
        materia: m.materia, erros: m.erros, abertos: m.abertos,
        dominados: m.dominados, topicos: topicos,
        pior: topicos.length ? topicos[0].topico : null
      };
    }).sort(function (a, b) {
      return b.abertos - a.abertos || b.erros - a.erros || a.materia.localeCompare(b.materia, 'pt-BR');
    });
  }

  var CADERNO_EXEMPLO = [
    { materia: 'Português', topico: 'Crase', motivo: 'li-errado', anotacao: 'O enunciado pedia a alternativa INCORRETA' },
    { materia: 'Português', topico: 'Crase', motivo: 'confundi', anotacao: 'Crase antes de palavra masculina' },
    { materia: 'Português', topico: 'Concordância verbal', motivo: 'li-errado', anotacao: '' },
    { materia: 'Direito Administrativo', topico: 'Licitação', motivo: 'li-errado', anotacao: 'Marquei sem ler "salvo"' },
    { materia: 'Direito Administrativo', topico: 'Atos administrativos', motivo: 'nao-sabia', anotacao: '' },
    { materia: 'Direito Administrativo', topico: 'Licitação', motivo: 'li-errado', anotacao: '' },
    { materia: 'Informática', topico: 'Excel', motivo: 'nao-sabia', anotacao: '' },
    { materia: 'Raciocínio Lógico', topico: 'Proposições', motivo: 'chutei', anotacao: '' },
    { materia: 'Português', topico: 'Crase', motivo: 'li-errado', anotacao: '' }
  ];

  function initCaderno(root) {
    var output = root.querySelector('[data-output]');
    var target = root.querySelector('[data-resultado]');
    var motivosEl = root.querySelector('[data-motivos]');
    var materiaEl = root.querySelector('#caderno-materia');
    var topicoEl = root.querySelector('#caderno-topico');
    var anotacaoEl = root.querySelector('#caderno-anotacao');
    var avisoEl = root.querySelector('[data-aviso]');

    // Os motivos são desenhados a partir da mesma lista que o diagnóstico usa:
    // um motivo novo aparece na tela e na conta sem precisar editar os dois.
    motivosEl.innerHTML = MOTIVOS.map(function (m, k) {
      return '<label class="caderno-motivo"><input type="radio" name="caderno-motivo" value="' + m.id + '"' +
        (k === 0 ? ' checked' : '') + '><span>' + esc(m.rotulo) + '</span></label>';
    }).join('');

    var estado = load('caderno', null);

    function aviso(texto) {
      if (!avisoEl) return;
      avisoEl.textContent = texto || '';
      avisoEl.hidden = !texto;
    }

    function motivoEscolhido() {
      var marcado = motivosEl.querySelector('input:checked');
      return marcado ? marcado.value : null;
    }

    function plural(n, um, muitos) { return n + ' ' + (n === 1 ? um : muitos); }

    function rotuloMotivo(id) {
      var m = motivoPorId(id);
      return m ? m.curto : id;
    }

    function filaHtml(fila) {
      if (!fila.length) {
        return '<div class="caderno-bloco"><h3>Nada para revisar hoje</h3>' +
          '<p>A fila está em dia. Quando uma questão registrada vencer o prazo, ela aparece aqui — e é por ela que o estudo de amanhã começa.</p></div>';
      }
      var cartoes = fila.map(function (i) {
        var espera = i.atraso > 0
          ? '<span class="caderno-atraso">esperando há ' + esc(plural(i.atraso, 'dia', 'dias')) + '</span>'
          : '<span class="caderno-hoje">vence hoje</span>';
        return '<li class="caderno-card">' +
          '<span class="caderno-card-topo">' + esc(i.materia) + (i.topico ? ' · ' + esc(i.topico) : '') + ' ' + espera + '</span>' +
          (i.anotacao ? '<p class="caderno-card-nota">' + esc(i.anotacao) + '</p>' : '') +
          '<p class="caderno-card-motivo">Na época o erro foi por ' + esc(rotuloMotivo(i.motivo)) + '.' +
          (i.erros > 1 ? ' <b>Já errou ' + i.erros + ' vezes.</b>' : '') + '</p>' +
          '<span class="caderno-card-acoes">' +
          '<button type="button" class="tool-button" data-action="revisar" data-id="' + i.id + '" data-ok="1">Acertei agora</button>' +
          '<button type="button" class="tool-button tool-button-ghost" data-action="revisar" data-id="' + i.id + '" data-ok="0">Errei de novo</button>' +
          '</span></li>';
      }).join('');

      return '<div class="caderno-bloco"><h3>Para revisar hoje: ' + esc(plural(fila.length, 'questão', 'questões')) + '</h3>' +
        '<p class="caderno-explica">Resolva de novo a questão antes de responder. Acertou, ela volta mais longe; errou, volta logo.</p>' +
        '<ol class="caderno-fila">' + cartoes + '</ol></div>';
    }

    function diagnosticoHtml(d) {
      var barras = d.contagem.filter(function (m) { return m.quantidade > 0; }).map(function (m) {
        return '<li><span class="caderno-barra-rotulo">' + esc(m.rotulo) + '</span>' +
          '<span class="caderno-barra"><i style="width:' + m.percentual + '%"></i></span>' +
          '<span class="caderno-barra-valor">' + m.percentual + '% · ' + esc(plural(m.quantidade, 'erro', 'erros')) + '</span></li>';
      }).join('');

      var veredito = d.veredito
        ? '<p class="caderno-veredito">' + esc(d.veredito) + '</p><p class="caderno-receita">' + esc(d.receita) + '</p>'
        : '<p class="caderno-explica">Com ' + esc(plural(d.faltam, 'erro', 'erros')) + ' a mais registrados, esta página diz por que você erra. ' +
          'Antes disso seria chute com cara de dado: quatro questões não mostram tendência nenhuma.</p>';

      var teimosos = d.teimosos.length
        ? '<p class="caderno-teimosos"><strong>' + esc(plural(d.teimosos.length, 'questão voltou', 'questões voltaram')) +
          ' a ser errada depois de revisada:</strong> ' +
          esc(d.teimosos.slice(0, 5).map(function (t) { return t.materia + (t.topico ? ' (' + t.topico + ')' : ''); }).join(', ')) +
          '. É aqui que mora a diferença entre achar que sabe e saber.</p>'
        : '';

      return '<div class="caderno-bloco"><h3>Por que você erra</h3>' +
        veredito +
        (barras ? '<ul class="caderno-barras">' + barras + '</ul>' : '') +
        teimosos + '</div>';
    }

    function materiasHtml(lista) {
      if (!lista.length) return '';
      var linhas = lista.map(function (m) {
        return '<tr><td>' + esc(m.materia) + '</td>' +
          '<td>' + m.abertos + '</td>' +
          '<td>' + m.dominados + '</td>' +
          '<td>' + (m.pior ? esc(m.pior) : '—') + '</td></tr>';
      }).join('');
      return '<div class="caderno-bloco"><h3>Onde estão os seus erros</h3>' +
        '<table class="tool-table"><thead><tr><th scope="col">Matéria</th>' +
        '<th scope="col">Em aberto</th><th scope="col">Dominados</th>' +
        '<th scope="col">Tópico que mais dói</th></tr></thead><tbody>' + linhas + '</tbody></table>' +
        '<p class="caderno-explica">Em aberto é o que ainda volta para revisão. Dominado é o que você acertou nas seis revisões e saiu da fila.</p></div>';
    }

    function render() {
      var hoje = hojeLocalIso();
      var d = diagnosticoErros(estado);
      if (!d.total) {
        output.hidden = true;
        return;
      }
      target.innerHTML =
        '<p class="caderno-placar"><strong>' + esc(plural(d.total, 'erro registrado', 'erros registrados')) + '</strong>' +
        (d.dominados ? ' · ' + d.dominados + ' já dominado' + (d.dominados === 1 ? '' : 's') : '') + '</p>' +
        filaHtml(revisoesDoDia(estado, hoje)) +
        diagnosticoHtml(d) +
        materiasHtml(resumoPorMateria(estado));
      output.hidden = false;
      markSaved(root, save('caderno', estado));
    }

    root.addEventListener('click', function (ev) {
      var botao = ev.target.closest('[data-action]');
      if (!botao) return;
      var action = botao.dataset.action;

      if (action === 'registrar') {
        var novo = registrarErro(estado, {
          materia: materiaEl.value,
          topico: topicoEl.value,
          motivo: motivoEscolhido(),
          anotacao: anotacaoEl.value
        }, hojeLocalIso());

        if (!novo) {
          aviso('Informe a matéria e escolha por que você errou. Sem o motivo o caderno vira lista, e lista não diagnostica nada.');
          materiaEl.focus();
          return;
        }
        aviso('');
        estado = novo;
        // O tópico costuma se repetir na mesma sessão de questões; a matéria,
        // mais ainda. Limpar tudo obrigaria a redigitar a cada erro.
        anotacaoEl.value = '';
        render();
      }

      if (action === 'revisar') {
        estado = registrarRevisao(estado, Number(botao.dataset.id), botao.dataset.ok === '1', hojeLocalIso());
        render();
      }

      if (action === 'exemplo') {
        estado = CADERNO_EXEMPLO.reduce(function (c, e, k) {
          // Espalhados no passado, senão nada estaria vencido e a fila do dia
          // apareceria vazia — justamente a parte que o exemplo precisa mostrar.
          return registrarErro(c, e, somaDias(hojeLocalIso(), -(CADERNO_EXEMPLO.length - k) * 2));
        }, null);
        aviso('');
        render();
        output.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      if (action === 'imprimir') window.print();

      if (action === 'limpar') {
        clear('caderno');
        estado = null;
        output.hidden = true;
        aviso('');
        markSaved(root, false);
      }
    });

    if (estado && estado.itens && estado.itens.length) {
      render();
      markSaved(root, true);
    }
  }

  /* ---------------------------------------------------------------- */

  var INIT = {
    edital: initEdital, cronograma: initCronograma, acertos: initAcertos,
    trilha: initTrilha, caderno: initCaderno
  };

  // Node não tem DOM. A exportação existe para os testes: a aritmética das
  // ferramentas precisa ser verificável sem abrir navegador.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      parseEdital: parseEdital, computeCronograma: computeCronograma, computeAcertos: computeAcertos,
      computeTrilha: computeTrilha, faseDoEstudo: faseDoEstudo, hhmm: hhmm,
      registrarErro: registrarErro, registrarRevisao: registrarRevisao,
      revisoesDoDia: revisoesDoDia, diagnosticoErros: diagnosticoErros,
      resumoPorMateria: resumoPorMateria, somaDias: somaDias,
      ESCADA_REVISAO: ESCADA_REVISAO, MOTIVOS: MOTIVOS
    };
    return;
  }

  document.querySelectorAll('[data-tool]').forEach(function (root) {
    var fn = INIT[root.dataset.tool];
    if (fn) fn(root);
  });
})();
