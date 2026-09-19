// Ставки таможенных платежей для ФИЗЛИЦ, ввоз для личного пользования.
// Единственный источник цифр для калькулятора. Меняется закон — правим только здесь.
// Сверено 19.09.2026: calcus.ru/rastamozhka-auto, customs.gov.ru (правила ввоза ТС),
// утильсбор — ПП РФ № 1291 в ред. ПП № 1713 от 01.11.2025 (порог 117,68 кВт = 160 л.с. включительно).
var RATES = {
  checkedAt: '19.09.2026',

  // Авто до 3 лет: % от стоимости, но не менее €/см³ — по стоимости авто в евро.
  under3: [
    { maxEur: 8500, pct: 0.54, minPerCc: 2.5 },
    { maxEur: 16700, pct: 0.48, minPerCc: 3.5 },
    { maxEur: 42300, pct: 0.48, minPerCc: 5.5 },
    { maxEur: 84500, pct: 0.48, minPerCc: 7.5 },
    { maxEur: 169000, pct: 0.48, minPerCc: 15 },
    { maxEur: Infinity, pct: 0.48, minPerCc: 20 }
  ],

  // Авто 3–5 лет и старше 5 лет: €/см³ по объёму двигателя.
  by3to5: [
    { maxCc: 1000, perCc: 1.5 }, { maxCc: 1500, perCc: 1.7 }, { maxCc: 1800, perCc: 2.5 },
    { maxCc: 2300, perCc: 2.7 }, { maxCc: 3000, perCc: 3.0 }, { maxCc: Infinity, perCc: 3.6 }
  ],
  over5: [
    { maxCc: 1000, perCc: 3.0 }, { maxCc: 1500, perCc: 3.2 }, { maxCc: 1800, perCc: 3.5 },
    { maxCc: 2300, perCc: 4.8 }, { maxCc: 3000, perCc: 5.0 }, { maxCc: Infinity, perCc: 5.7 }
  ],

  // Сбор за таможенное оформление, ₽ — по таможенной стоимости в рублях.
  clearance: [
    { maxRub: 200000, fee: 1231 }, { maxRub: 450000, fee: 2462 },
    { maxRub: 1200000, fee: 4924 }, { maxRub: 2700000, fee: 13541 },
    { maxRub: 4200000, fee: 18465 }, { maxRub: 5500000, fee: 21344 },
    { maxRub: 10000000, fee: 49240 }, { maxRub: Infinity, fee: 73860 }
  ],

  // Утильсбор физлица для себя: база 20 000 ₽ × 0,17 (до 3 лет) / × 0,26 (старше).
  // Льгота только если мощность ≤ 160 л.с. И объём ≤ 3000 см³ И не больше одной машины в год.
  util: { under3: 3400, over3: 5200, maxHp: 160, maxCc: 3000 },

  // Коммерческий утильсбор (мощнее 160 л.с.), ₽: [до 3 лет, старше 3 лет] по годам.
  // ПП РФ № 1713 от 01.11.2025 (коэффициент × 20 000), сверено с Дромом и Коммерсантом.
  // С 1 января каждого года до 2030 — +10 %. Вне таблицы (объём < 1 л или > 3 л, мощность выше последней
  // ступени) калькулятор честно отправляет на ручной расчёт.
  utilCommercial: {
    '1000-2000': [
      { maxHp: 190, 2026: [900000, 1492800], 2027: [990000, 1642000] },
      { maxHp: 220, 2026: [952800, 1584000], 2027: [1048000, 1742400] },
      { maxHp: 250, 2026: [1010400, 1677600], 2027: [1111400, 1845400] },
      { maxHp: 280, 2026: [1142400, 1838400], 2027: [1256600, 2022200] },
      { maxHp: 310, 2026: [1291200, 2011200], 2027: [1420400, 2212400] }
    ],
    '2000-3000': [
      { maxHp: 190, 2026: [2306800, 3456000], 2027: [2537400, 3801600] },
      { maxHp: 220, 2026: [2364000, 3501600], 2027: [2600400, 3851800] },
      { maxHp: 250, 2026: [2402400, 3552000], 2027: [2642600, 3907200] },
      { maxHp: 280, 2026: [2520000, 3660000], 2027: [2772000, 4026000] }
    ]
  },

  // Курс по умолчанию, если ЦБ недоступен (на странице всегда пробуем живой курс).
  fallbackFx: { EUR: 95, CNY: 11.5, KRW: 0.06, JPY: 0.56, USD: 82 }
};

// Возвращает разбивку платежей в рублях или { manual: причина }, если честно посчитать нельзя.
function calcCustoms(p, fx) {
  // p: { price, currency, age: 'under3'|'3to5'|'over5', cc, hp, engine: 'ice'|'hybrid'|'ev' }
  var eur = fx.EUR;
  var priceRub = p.price * (p.currency === 'RUB' ? 1 : fx[p.currency]);
  var priceEur = priceRub / eur;

  if (p.engine !== 'ice') {
    return { manual: p.engine === 'ev'
      ? 'У электромобиля льготный утильсбор — только если 30-минутная мощность моторов не больше 80 л.с.; мощнее — коммерческая ставка, в 2026 году от 991 200 ₽. Пошлина, акциз и НДС тоже считаются по своим правилам. Это считают вручную под конкретную версию.'
      : 'У гибрида для утильсбора складывают мощность ДВС и 30-минутную мощность электромоторов — многие гибриды из-за этого выходят за 160 л.с. Последовательные гибриды считают как электромобили. Это считают вручную под конкретную версию.' };
  }

  var duty;
  if (p.age === 'under3') {
    var r = RATES.under3.find(function (x) { return priceEur <= x.maxEur; });
    duty = Math.max(priceEur * r.pct, p.cc * r.minPerCc) * eur;
  } else {
    var table = p.age === '3to5' ? RATES.by3to5 : RATES.over5;
    var r2 = table.find(function (x) { return p.cc <= x.maxCc; });
    duty = p.cc * r2.perCc * eur;
  }

  var fee = RATES.clearance.find(function (x) { return priceRub <= x.maxRub; }).fee;

  var preferential = p.hp <= RATES.util.maxHp && p.cc <= RATES.util.maxCc;
  var util = preferential ? (p.age === 'under3' ? RATES.util.under3 : RATES.util.over3) : null;
  var utilYear = null;
  if (!preferential) {
    var year = (p.now || new Date()).getFullYear();
    var band = p.cc > 1000 && p.cc <= 2000 ? '1000-2000' : p.cc > 2000 && p.cc <= 3000 ? '2000-3000' : null;
    var step = band && RATES.utilCommercial[band].find(function (x) { return p.hp <= x.maxHp; });
    if (step && step[year]) { util = step[year][p.age === 'under3' ? 0 : 1]; utilYear = year; }
  }

  return {
    priceRub: Math.round(priceRub),
    duty: Math.round(duty),
    fee: fee,
    util: util,               // null = коммерческая ставка вне таблицы, её считают вручную
    utilYear: utilYear,       // год коммерческой ставки, если посчитана
    preferential: preferential,
    total: Math.round(duty + fee + (util || 0))
  };
}

if (typeof module !== 'undefined') module.exports = { RATES: RATES, calcCustoms: calcCustoms };
