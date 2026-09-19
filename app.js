// Калькулятор растаможки + квиз заявки. Работает на любой странице, где есть #calc и/или #quiz.
(function () {
  var fx = Object.assign({}, RATES.fallbackFx);
  var fxLive = false;
  var fmt = function (n) { return Math.round(n).toLocaleString('ru-RU') + ' ₽'; };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  // Живой курс ЦБ. KRW котируется за 1000, JPY за 100 — делим на Nominal.
  fetch('https://www.cbr-xml-daily.ru/daily_json.js')
    .then(function (r) { return r.json(); })
    .then(function (d) {
      ['EUR', 'CNY', 'KRW', 'JPY', 'USD'].forEach(function (c) {
        var v = d.Valute[c]; if (v) fx[c] = v.Value / v.Nominal;
      });
      fxLive = true;
      var el = $('#fx-note'); if (el) el.textContent = 'Курс ЦБ на ' + new Date(d.Date).toLocaleDateString('ru-RU') + ': € ' + fx.EUR.toFixed(2) + ' ₽';
      if ($('#calc-result') && !$('#calc-result').hidden) runCalc();
    })
    .catch(function () {});

  // ---------- Калькулятор ----------
  var calc = $('#calc');
  function readCalc() {
    var f = calc.elements;
    return {
      country: f.country.value, price: +f.price.value, currency: f.currency.value,
      age: f.age.value, cc: +f.cc.value, hp: +f.hp.value, engine: f.engine.value
    };
  }
  function runCalc() {
    var p = readCalc();
    var out = $('#calc-result');
    if (!p.price || (p.engine === 'ice' && (!p.cc || !p.hp))) {
      out.hidden = false;
      out.innerHTML = '<p class="warn">Заполните цену, объём и мощность — без них расчёт будет неточным.</p>';
      return;
    }
    var r = calcCustoms(p, fx);
    out.hidden = false;
    if (r.manual) {
      out.innerHTML = '<p class="warn">' + r.manual + '</p>' + ctaHtml('Получить расчёт под вашу версию');
    } else {
      out.innerHTML =
        '<table class="breakdown">' +
        '<tr><td>Цена авто в рублях</td><td>' + fmt(r.priceRub) + '</td></tr>' +
        '<tr><td>Таможенная пошлина</td><td>' + fmt(r.duty) + '</td></tr>' +
        '<tr><td>Сбор за оформление</td><td>' + fmt(r.fee) + '</td></tr>' +
        '<tr><td>Утильсбор' + (r.preferential ? '' : ' <b class="bad">коммерческий</b>') + '</td><td>' + (r.util != null ? fmt(r.util) : '<b class="bad">считается вручную</b>') + '</td></tr>' +
        '<tr class="sum"><td>Таможня итого</td><td>' + fmt(r.total) + (r.util != null ? '' : ' + утильсбор') + '</td></tr>' +
        '</table>' +
        (r.preferential
          ? '<p class="ok">Машина проходит по льготе: до ' + RATES.util.maxHp + ' л.с. и до 3 л. Утильсбор для себя — ' + fmt(r.util) + '.</p>'
          : '<p class="bad-box">Мощность больше ' + RATES.util.maxHp + ' л.с. или объём больше 3 л — льготный утильсбор не действует' +
            (r.util != null
              ? ': вместо ' + fmt(p.age === 'under3' ? RATES.util.under3 : RATES.util.over3) + ' — ' + fmt(r.util) + ' по ставке ' + r.utilYear + ' года.' + (r.utilYear < 2030 ? ' С 1 января ставка вырастет ещё на 10 %.' : '')
              : '. Для такого объёма и мощности сумму считают вручную.') +
            ' Часто выгоднее найти версию той же модели до 160 л.с. — спросите у специалиста.</p>') +
        '<p class="muted">Не входит: доставка до России, услуги компании, СБКТС и ЭПТС, доставка до вашего города. Их называют компании в ответ на заявку.</p>' +
        ctaHtml('Получить точный расчёт под ключ');
    }
    track('calc_done');
    var btn = $('.to-quiz', out);
    if (btn) btn.addEventListener('click', function () { openQuiz(p); });
  }
  function ctaHtml(text) {
    return '<button type="button" class="btn btn-accent to-quiz">' + text + ' →</button>' +
      '<p class="muted small">Бесплатно. Перезвонят с вариантами и полной ценой до вашего города.</p>';
  }
  if (calc) {
    calc.addEventListener('submit', function (e) { e.preventDefault(); runCalc(); });
    var eng = calc.elements.engine;
    eng && eng.addEventListener('change', function () {
      calc.classList.toggle('no-ice', eng.value !== 'ice');
    });
  }

  // ---------- Квиз ----------
  var quiz = $('#quiz');
  var step = 0;
  var steps = quiz ? quiz.querySelectorAll('.step') : [];
  function show(i) {
    step = i;
    steps.forEach(function (s, k) { s.hidden = k !== i; });
    var bar = $('#quiz-progress'); if (bar) bar.style.width = ((i + 1) / steps.length * 100) + '%';
    var n = $('#quiz-step-n'); if (n) n.textContent = (i + 1) + ' из ' + steps.length;
  }
  function openQuiz(p) {
    if (!quiz) return;
    if (p && quiz.elements.country) {
      quiz.elements.country.value = p.country;
      if (quiz.elements.calc) quiz.elements.calc.value = JSON.stringify(p);
    }
    quiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
    track('quiz_open');
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open-quiz]');
    if (t) { e.preventDefault(); openQuiz(t.dataset.country ? { country: t.dataset.country } : null); }
  });

  if (quiz) {
    show(0);
    quiz.addEventListener('click', function (e) {
      if (e.target.matches('.next')) {
        var cur = steps[step];
        var inputs = cur.querySelectorAll('input,select,textarea');
        for (var i = 0; i < inputs.length; i++) if (!inputs[i].reportValidity()) return;
        show(step + 1); track('quiz_step_' + (step + 1));
      }
      if (e.target.matches('.prev')) show(step - 1);
    });
    // Радио-кнопки на шагах без других полей — сразу дальше.
    quiz.addEventListener('change', function (e) {
      if (e.target.type === 'radio' && e.target.closest('.step').dataset.auto === '1') {
        setTimeout(function () { show(Math.min(step + 1, steps.length - 1)); }, 180);
      }
    });

    var phone = quiz.elements.phone;
    phone.addEventListener('input', function () {
      var d = phone.value.replace(/\D/g, '').replace(/^8/, '7');
      if (d && d[0] !== '7') d = '7' + d;
      d = d.slice(0, 11);
      var m = '+7';
      if (d.length > 1) m += ' (' + d.slice(1, 4);
      if (d.length >= 4) m += ') ' + d.slice(4, 7);
      if (d.length >= 7) m += '-' + d.slice(7, 9);
      if (d.length >= 9) m += '-' + d.slice(9, 11);
      phone.value = d ? m : '';
    });

    quiz.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = quiz.elements;
      var digits = f.phone.value.replace(/\D/g, '');
      if (digits.length !== 11) { f.phone.setCustomValidity('Введите номер полностью'); f.phone.reportValidity(); f.phone.setCustomValidity(''); return; }
      if (f.website.value) return; // ловушка для ботов

      var data = {
        country: f.country.value, car: f.car.value, budget: f.budget.value,
        city: f.city.value, timing: f.timing.value, payment: f.payment.value, name: f.name.value, phone: '+' + digits,
        calc: f.calc.value || null,
        consent_pd: f.consent_pd.checked, consent_transfer: f.consent_transfer.checked,
        consent_ads: f.consent_ads.checked, consent_version: SITE.consentVersion,
        page: location.pathname, referrer: document.referrer || null, utm: utm()
      };
      var btn = quiz.querySelector('[type=submit]');
      btn.disabled = true; btn.textContent = 'Отправляем…';

      if (!SITE.leadEndpoint) {
        console.warn('leadEndpoint не задан — заявка не отправлена', data);
        showError('Форма ещё настраивается. Попробуйте позже.');
        btn.disabled = false; btn.textContent = 'Получить расчёт';
        return;
      }
      fetch(SITE.leadEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function () { track('lead'); location.href = SITE.base + 'spasibo/'; })
        .catch(function () {
          showError('Не получилось отправить. Проверьте интернет и попробуйте ещё раз.');
          btn.disabled = false; btn.textContent = 'Получить расчёт';
        });
    });
  }
  function showError(msg) { var el = $('#quiz-error'); el.textContent = msg; el.hidden = false; }

  // ---------- UTM и цели ----------
  function utm() {
    var q = new URLSearchParams(location.search), o = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'yclid'].forEach(function (k) { if (q.get(k)) o[k] = q.get(k); });
    try {
      if (Object.keys(o).length) localStorage.setItem('utm', JSON.stringify(o));
      else o = JSON.parse(localStorage.getItem('utm') || '{}');
    } catch (e) {}
    return o;
  }
  utm();
  function track(goal) {
    if (window.ym && SITE.metrikaId) try { ym(SITE.metrikaId, 'reachGoal', goal); } catch (e) {}
  }
})();

// Видео машины: при «уменьшить движение» — стоп на первом кадре (кадр-обложка остаётся).
(function () {
  var v = document.querySelector('video.car-media');
  if (v && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { v.removeAttribute('autoplay'); v.pause(); }
})();
