// Ставки таможенных платежей для ФИЗЛИЦ, ввоз для личного пользования.
// Единственный источник цифр для калькулятора. Меняется закон — правим только здесь.
// Сверено 19.09.2026: calcus.ru/rastamozhka-auto, customs.gov.ru (правила ввоза ТС),
// утильсбор — ПП РФ о утилизационном сборе в ред. с 01.12.2025 (порог 160 л.с.).
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
      ? 'Для электромобиля пошлина 15 %, плюс акциз и НДС, а утильсбор зависит от мощности. Это считают вручную под конкретную версию.'
      : 'Гибрид считается по особым правилам (последовательный или параллельный, мощность ДВС и электромотора). Это считают вручную под конкретную версию.' };
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

  return {
    priceRub: Math.round(priceRub),
    duty: Math.round(duty),
    fee: fee,
    util: util,               // null = коммерческая ставка, её считают вручную
    preferential: preferential,
    total: Math.round(duty + fee + (util || 0))
  };
}

if (typeof module !== 'undefined') module.exports = { RATES: RATES, calcCustoms: calcCustoms };
