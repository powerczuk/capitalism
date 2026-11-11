# Rozbudowa gry

Gra składa się z wtyczek. Wtyczka to obiekt z identyfikatorem i funkcją
`install(content)`, która dopisuje definicje do **rejestrów**:

```js
// src/mods/moj-mod.js
export const myMod = {
  id: 'my-mod',
  install(content) {
    // content.products.register({...}), content.recipes.register({...}) …
  },
};
```

Dopisz ją do listy w `src/mods/index.js` — i gotowe. Gra bazowa jest zbudowana
tak samo (`src/content/index.js`, `src/sim/index.js`, `src/ai/index.js`),
więc każdy jej plik jest jednocześnie przykładem. Kompletny, mały mod:
`src/mods/coffee.js`.

Po złożeniu wszystkich wtyczek `content.finalize()` wylicza brakujące liczby
i **sprawdza powiązania** — literówka w identyfikatorze kończy się czytelnym
błędem przy starcie, a nie dziwnym zachowaniem w trakcie gry.

| Rejestr | Co zawiera |
| --- | --- |
| `content.categories` | kategorie towarów konsumpcyjnych |
| `content.products` | surowce, półprodukty, towary |
| `content.recipes` | co i z czego produkuje linia |
| `content.buildingTypes`, `content.districts` | typy budynków i dzielnice |
| `content.cityArchetypes` | rodzaje miast dla generatora mapy |
| `content.worldEvents` | wydarzenia losowe |
| `content.goals` | cele rozgrywki |
| `content.companyTemplates` | nazwy spółek AI |
| `content.systems`, `content.commands` | zasady symulacji |
| `content.difficulties`, `content.personalities`, `content.aiModules` | komputerowi gracze |
| `content.views` | widoki interfejsu |

Każdy rejestr ma `register(def)`, `get(id)`, `find(id)`, `all()`,
`extend(id, patch)` i `remove(id)`. Podwójna rejestracja tego samego `id` jest
błędem, chyba że podasz `{ override: true }`.

## Produkt i receptura

```js
content.products.register({
  id: 'pasta',
  type: 'consumer',            // 'raw' | 'intermediate' | 'consumer'
  category: 'food',            // w jakich sklepach się sprzedaje
  icon: '🍝',
  name: { pl: 'Makaron', en: 'Pasta' },
  spend: 20,                   // wydatki: $ na 1000 mieszkańców dziennie
  weights: { price: 0.5, quality: 0.35, brand: 0.15 }, // czym kierują się klienci
  necessity: 0.9,              // 1 = pierwsza potrzeba, 0 = luksus
  techShare: 0.3,              // ile jakości daje technologia (reszta: surowce)
  weight: 0.5,                 // waga w transporcie
});

content.recipes.register({
  id: 'pasta',
  building: 'factory',         // typ budynku, który to produkuje
  output: 'pasta',
  inputs: { flour: 0.5 },      // ile czego na sztukę wyrobu
  cost: 0.3,                   // koszt przetworzenia sztuki przy średnich płacach
});
```

- **Koszt hurtowy** (`cost`) i **cena detaliczna** (`price`) są wyliczane
  z receptury i narzutu kategorii; możesz je też podać wprost.
- Produkt bez receptury jest dostępny **tylko z importu** i musi mieć podany
  `cost`.
- Receptura bez wejść (`inputs: {}`) to wydobycie lub uprawa **surowca**
  (`type: 'raw'`) i wymaga złoża. Gdzie ono występuje, mówi pole `occurs`
  surowca: `{ farmland: [szansa, jakośćMin, jakośćMax], '*': [...] }`
  (klucze to archetypy miast, `'*'` = pozostałe).
- `rate` (sztuk dziennie z linii) domyślnie wynika z wartości wyrobu
  (`balance.production.lineValue`).

Sprawdź ekonomię nowego produktu poleceniem `npm run check`.

## Budynek, dzielnica, miasto

```js
content.buildingTypes.register({
  id: 'drugstore',
  kind: 'retail',              // 'retail' | 'producer' | 'research'
  icon: '💊',
  name: { pl: 'Drogeria', en: 'Drugstore' },
  desc: { pl: 'Sprzedaje chemię i kosmetyki.', en: 'Sells household goods.' },
  cost: 3_500_000,             // przy średnich cenach działek
  upkeep: 70_000,              // miesięcznie przy średnich płacach
  buildDays: 30,
  slots: 3,                    // półki (retail) / lines (producer) / labs (research)
  capacity: 12_000,            // retail: $ sprzedaży na półkę dziennie
  categories: ['household'],   // retail: co wolno sprzedawać
  districts: ['center', 'residential'],
});
```

Budynek produkcyjny uruchamia te receptury, które mają `building` równe jego
`id`. Nowa dzielnica to wpis w `content.districts` (`traffic`, `cost`,
`upkeep`, `plots: { base, per }`), nowy rodzaj miasta — w
`content.cityArchetypes` (strefa na mapie, zakres ludności, zamożność,
przyrost, `port`). Gra bierze pierwsze N archetypów z rejestru.

## Wydarzenie losowe

```js
import { addModifier } from '../sim/world.js';

content.worldEvents.register({
  id: 'heatwave',
  weight: 2,                   // względna częstość
  cooldown: 720,               // dni przerwy między wystąpieniami
  when: (game) => game.state.economy.phase !== 'recession', // opcjonalnie
  fire(game) {
    addModifier(game, { kind: 'demand', key: 'juice', factor: 1.5, days: 90, source: 'heatwave' });
    game.news('news.event.heatwave', {}, { tone: 'good' });
  },
});
content.translate('pl', { 'news.event.heatwave': 'Fala upałów: soki schodzą na pniu.' });
content.translate('en', { 'news.event.heatwave': 'Heatwave: juice flies off the shelves.' });
```

Rodzaje modyfikatorów rozumiane przez symulację:

| `kind` | `key` | Działa na |
| --- | --- | --- |
| `demand` | id produktu | popyt konsumentów |
| `importPrice` | id produktu lub `'*'` | ceny importu |
| `yield` | id miasta | wydajność farm, kopalń i lasów |
| `wage` | id miasta lub `'*'` | płace (utrzymanie, koszt przetwarzania) |
| `procCost` | `'*'` | koszt przetwarzania na wszystkich liniach |

## Cel gry

```js
content.goals.register({
  id: 'tenStores',
  name: { pl: 'Dziesięć sklepów', en: 'Ten stores' },
  desc: { pl: 'Otwórz dziesięć sklepów.', en: 'Open ten stores.' },
  check(game, company) {
    const n = game.buildingsOf(company.id).filter((b) => b.kind === 'retail').length;
    return { progress: Math.min(1, n / 10), done: n >= 10 /*, failed: … */ };
  },
});
```

Cele liczone od majątku mierz funkcją `earnedWorthOf(game, company)`
z `src/sim/accounting.js`, a nie `equityOf` — pomija ona pieniądze z emisji
akcji, więc celu nie da się „wydrukować”. Pole `measure: 'worth'` przy
definicji sprawia, że interfejs pokaże graczowi, ile kapitału się nie liczy.

## Balans

```js
content.tune({ retail: { exponent: 3 }, tax: { rate: 0.12 } });
```

`tune` scala podane liczby z `content.balance` (domyślne wartości i ich opis:
`src/sim/balance.js`).

## Nowa zasada: system i polecenie

**System** to obiekt z dowolnymi z haków `setup`, `onLoad`, `daily`,
`monthly`, `yearly`. Kolejność w ciągu dnia wyznacza `order` (rozpiska
w `src/sim/index.js`).

```js
import { dateOf } from '../engine/calendar.js';
import { addModifier } from '../sim/world.js';

content.systems.register({
  id: 'seasons',
  order: 12,
  daily(game) {
    const d = dateOf(game.state.day);
    if (d.month === 11 && d.dom === 1) {
      addModifier(game, { kind: 'demand', key: 'toys', factor: 1.6, days: 30, source: 'seasons' });
    }
  },
});
```

**Polecenie** to jedyny sposób, w jaki gracz i AI zmieniają świat:

```js
import { fail } from '../engine/game.js';

content.commands.register({
  id: 'donate',
  check(game, company, { amount }) {
    if (!Number.isFinite(amount) || amount <= 0) return fail('err.badValue');
    if (company.cash < amount) return fail('err.noCash', { need: amount });
    return null;                       // null = wolno
  },
  run(game, company, { amount }) {
    company.cash -= amount;
    company.m.other -= amount;         // księgowanie w rachunku wyników
    return {};                         // dowolne dane zwrotne
  },
});
// wywołanie: game.exec(companyId, 'donate', { amount: 100_000 })
```

Zasady, których trzeba się trzymać:

- stan (`game.state`) musi pozostać **czystym JSON-em** — żadnych klas,
  funkcji, `Map`/`Set` — bo jest jednocześnie zapisem gry,
- losowość tylko przez `game.rng` (inaczej znika powtarzalność),
- po dodaniu, usunięciu lub zmianie właściciela budynku wywołaj
  `game.invalidate()`,
- **parametry polecenia przychodzą z zewnątrz** — `check` ma odrzucić
  wszystko, czego `run` nie udźwignie. Identyfikatory sprawdzaj przez
  `own(mapa, id)`, pozycje w tablicach przez `isIndex(tablica, i)` (oba
  z `src/engine/util.js`), liczby przez `Number.isFinite`. Zwykłe `mapa[id]`
  znajdzie też `"constructor"`, a `tablica["length"]` nie jest półką,
- dostawcę półki albo surowca ustawiaj przez
  `agreeSource(game, company, ref, productId, src)` z `src/sim/supply.js` —
  zapamiętuje cenę uzgodnioną z obcym dostawcą, powyżej której (plus
  `balance.wholesale.tolerance`) kupujący przestaje płacić,
- nowe pola w stanie dodawaj tak, by stare zapisy działały (wartości domyślne
  przy odczycie albo hak `onLoad`).

**Zapisy.** Przy wczytywaniu system `integrity` (`src/sim/integrity.js`)
sprawdza budowę zapisu, a potem rozgrywa na próbę jeden miesiąc na jego
kopii. Zapis uszkodzony jest odrzucany jako `save.invalid`, a taki, który
odwołuje się do nieznanego produktu, receptury, budynku czy poziomu AI —
jako `save.content`, z nazwą brakującej rzeczy. Dlatego gry zapisanej
z modem nie da się wczytać bez niego. Własne pola waliduj we własnym haku
`onLoad` (rzuć `new Error('save.invalid')`).

## Komputerowi gracze

**Poziom trudności** — jak dobrze AI gra:

```js
const tycoon = content.difficulties.get('tycoon');
content.difficulties.register({
  ...tycoon,
  id: 'legend',
  rank: 5,
  name: { pl: 'Legenda', en: 'Legend' },
  desc: { pl: 'Magnat bez żadnych błędów.', en: 'A tycoon who never errs.' },
  noise: 0,                    // błąd prognoz
  maxProjects: 4,              // inwestycji na jedną rundę planowania
  cadence: { ...tycoon.cadence, pricing: 3 }, // co ile dni myśli każdy moduł
});
```

Pola poziomu opisuje nagłówek `src/ai/difficulty.js`. Nowy poziom od razu
pojawia się w formularzu nowej gry.

**Charakter** — co AI lubi (`src/ai/personalities.js`): mnożniki apetytu na
handel, przemysł, surowce, badania, reklamę, finanse, nastawienie cenowe,
skłonność do ryzyka i ulubione kategorie.

**Moduł zachowania** — nowa umiejętność:

```js
content.aiModules.register({
  id: 'generous',
  order: 115,
  run(ctx) {
    // ctx.game, ctx.co (spółka), ctx.profile (poziom), ctx.persona (charakter)
    // ctx.act(polecenie, parametry) — jedyna droga do zmiany świata
    if (ctx.freeCash() > ctx.reserve() * 5) ctx.act('setDividend', { ratio: 0.3 });
  },
});
// moduł działa tylko na poziomach, które mają dla niego rytm:
const shark = content.difficulties.get('shark');
content.difficulties.extend('shark', { cadence: { ...shark.cadence, generous: 90 } });
```

Moduł może też (albo zamiast `run`) mieć `propose(ctx, budget)` zwracające
listę projektów inwestycyjnych `{ kind, cost, profitDay, roi, score,
execute(ctx) }` — planista (`modules/invest.js`) porównuje propozycje
wszystkich modułów i finansuje najlepsze. Gotowe narzędzia analityczne
(prognoza sprzedaży półki, koszt produkcji w mieście, zakupy zewnętrzne
spółki) są w `src/ai/analysis.js`.

## Interfejs

```js
import { html } from '../ui/dom.js';
import { registerActions } from '../ui/views/index.js';

content.views.register({
  id: 'charity',
  order: 85,                   // pozycja w menu
  icon: 'info',                // klucz z src/ui/icons.js
  label: 'nav.charity',        // klucz tłumaczenia
  render(app) {
    return html`<div class="view">
      <div class="section-head"><h2>Dobroczynność</h2></div>
      <button class="btn btn-primary" data-act="donate100">Przekaż 100 tys. $</button>
    </div>`;
  },
});
registerActions({
  donate100(app) {
    app.cmd('donate', { amount: 100_000 });   // pokaże powód odmowy, jeśli się nie uda
  },
});
content.translate('pl', { 'nav.charity': 'Dobroczynność' });
content.translate('en', { 'nav.charity': 'Charity' });
```

- Szablon `html` sam zabezpiecza wstawiane wartości (nazwy wpisane przez
  gracza nie staną się kodem).
- Przyciski wskazują akcję atrybutem `data-act`, pola formularzy —
  `data-change`; pozostałe atrybuty `data-*` trafiają do funkcji obsługi.
- Teksty: `t('klucz', { parametry })`, liczba mnoga `tn('n.days', 5)`;
  słowniki w `src/i18n/`. Nazwy przy definicjach (`{ pl, en }`) czyta `L()`.
- Kolory i typografia to zmienne CSS na górze `src/styles/main.css`
  (osobny zestaw dla motywu ciemnego).

## Testowanie moda

```js
import { createContent, Game } from '../src/setup.js';
import { myMod } from '../src/mods/moj-mod.js';

const content = createContent({ mods: [myMod] });
const game = Game.create(content, { seed: 'test', player: { name: 'Ja' }, rivals: [{ level: 'shark' }] });
game.exec(game.human.id, 'donate', { amount: 1000 });
game.run(360);                 // rok symulacji
```

`npm test` sprawdza m.in., czy każdy produkt da się sprzedać i ma sensowną
marżę, czy definicje mają nazwy w obu językach i czy AI radzi sobie z treścią
— uruchom go po każdej zmianie.
