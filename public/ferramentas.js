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

  /* ---------------------------------------------------------------- */

  var INIT = { edital: initEdital, cronograma: initCronograma, acertos: initAcertos };

  // Node não tem DOM. A exportação existe para os testes: a aritmética das
  // ferramentas precisa ser verificável sem abrir navegador.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { parseEdital: parseEdital, computeCronograma: computeCronograma, computeAcertos: computeAcertos, hhmm: hhmm };
    return;
  }

  document.querySelectorAll('[data-tool]').forEach(function (root) {
    var fn = INIT[root.dataset.tool];
    if (fn) fn(root);
  });
})();
