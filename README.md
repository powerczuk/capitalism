# Wielka Hossa

Przeglądarkowa gra ekonomiczna: zakładasz spółkę, otwierasz sklepy, budujesz
fabryki, farmy i kopalnie, rozwijasz marki i technologie, grasz na giełdzie —
a komputerowi rywale robią to samo, na czterech poziomach trudności.

Gra jest napisana w czystym JavaScripcie (moduły ES), **bez frameworka i bez
kroku budowania**. Cała symulacja działa także poza przeglądarką, więc można ją
testować i balansować z linii poleceń.

## Szybki start

```bash
npm start            # http://localhost:5173
```

Wystarczy dowolny serwer plików statycznych (np. `python3 -m http.server`) —
`npm start` uruchamia tylko mały serwer z `scripts/serve.mjs`. Gra nie ma
zależności uruchomieniowych; `npm install` jest potrzebne wyłącznie do
opcjonalnej wersji jednoplikowej.

```bash
npm test             # testy silnika, symulacji, giełdy i AI (node:test)
npm run sim          # symulacja AI kontra AI — stanowisko do balansu
npm run check        # tabela ekonomii produktów (koszty, ceny, marże)
npm run build        # dist/wielka-hossa.html — cała gra w jednym pliku
npm run test:e2e     # test w przeglądarce (wymaga Playwrighta, patrz niżej)
```

Wersję z `npm run build` można otworzyć prosto z dysku, wysłać mailem albo
wrzucić na dowolny hosting.

**Hosting:** repozytorium jest gotową stroną statyczną — wystarczy opublikować
jego katalog główny (GitHub Pages, Vercel, Netlify, zwykły serwer WWW).
Niczego nie trzeba budować ani konfigurować.

## Jak się gra

1. Na **mapie** wybierz miasto i zbuduj sklep (supermarket, dom towarowy albo
   salon elektroniki) w jednej z dzielnic.
2. Postaw towar na **półkach** — na początek z importu — i uruchom czas
   (przyciski tempa u góry, spacja, klawisze 1–4).
3. Gdy sklepy zarabiają, zbuduj **fabrykę**, potem **farmy i kopalnie**:
   własny łańcuch dostaw obniża koszty i podnosi jakość.
4. **Reklama** buduje markę, **centrum badawcze** podnosi technologię.
5. Na **giełdzie** kupujesz akcje rywali, emitujesz lub skupujesz własne;
   kto zbierze ponad połowę akcji spółki, może ją przejąć.

Pełniejszy opis mechanik jest w grze, w widoku **Poradnik**.

### Rywale

| Poziom | Jak gra |
| --- | --- |
| Nowicjusz | Powoli otwiera sklepy, handluje importem po stałej marży. |
| Przedsiębiorca | Dopasowuje ceny do rynku, stawia pierwsze fabryki, trochę reklamuje. |
| Rekin biznesu | Optymalizuje ceny, buduje pełne łańcuchy dostaw, bada, reklamuje, bierze kredyt. |
| Magnat | Wszystko powyższe szybciej i precyzyjniej, do tego wrogie przejęcia na giełdzie. |

Niezależnie od poziomu każdy rywal ma **charakter** (Kupiec, Przemysłowiec,
Innowator, Dyskonter, Kreator marek, Finansista), który decyduje o tym, w co
lubi inwestować. AI **nie oszukuje**: wydaje polecenia przez dokładnie ten sam
interfejs co gracz i płaci te same ceny.

Poziom i charakter każdego rywala (do siedmiu) wybierasz w formularzu nowej
gry. Opcja **Tylko obserwuj** uruchamia rozgrywkę bez własnej spółki — dobry
sposób, żeby zobaczyć, jak różne poziomy radzą sobie ze sobą.

## Struktura projektu

```
index.html              punkt wejścia (ładuje src/main.js)
src/
  engine/               jądro niezależne od tematu gry
    game.js             stan świata, pętla dnia, polecenia, zapis/odczyt
    content.js          rejestry treści + wyprowadzanie i walidacja danych
    registry.js rng.js events.js calendar.js util.js
  sim/                  zasady symulacji (systemy + polecenia)
    market.js           model popytu — czyste funkcje
    retail.js supply.js production.js construction.js
    finance.js accounting.js stocks.js brand.js research.js
    economy.js world.js worldEvents.js goals.js company.js
    diagnostics.js stats.js balance.js
  content/              dane gry: produkty, receptury, budynki, miasta,
                        wydarzenia, cele, nazwy spółek
  ai/                   komputerowi gracze
    difficulty.js       poziomy trudności
    personalities.js    charaktery
    controller.js       tura AI i kontekst decyzyjny
    analysis.js         wspólna „matematyka biznesowa”
    modules/            moduły zachowań (ceny, półki, zaopatrzenie,
                        inwestycje, fabryki, marketing, badania, giełda…)
  ui/                   interfejs: powłoka, widoki, wykresy, tłumaczenia
  i18n/                 teksty interfejsu (pl, en)
  mods/                 mody ładowane z grą (przykład: coffee.js)
  styles/               arkusze stylów
  setup.js              składa treść + zasady + AI + mody w jedną całość
scripts/                serwer, symulator, tabela ekonomii, build, test e2e
tests/                  testy node:test
docs/MODDING.md         jak rozbudowywać grę
```

## Architektura w pigułce

- **Stan gry to zwykły obiekt JSON** (`game.state`). Zapis gry to jego kopia,
  a generator liczb losowych trzyma swój stan w tym samym obiekcie — to samo
  ziarno i te same polecenia zawsze dają tę samą rozgrywkę.
- **Systemy** (`content.systems`) przesuwają świat o jeden dzień:
  gospodarka → wydarzenia → budowa → produkcja → zaopatrzenie → handel →
  marka → badania → finanse → giełda → AI → cele.
- **Polecenia** (`content.commands`) to jedyna droga zmiany stanu przez
  gracza i przez AI: `game.exec(companyId, 'build', {...})`. Każde ma
  walidację (`check`) i wykonanie (`run`).
- **Treść jest danymi** w rejestrach: produkty, receptury, typy budynków,
  dzielnice, archetypy miast, wydarzenia, cele, poziomy i charaktery AI,
  moduły AI, widoki interfejsu. Gra bazowa sama jest zestawem takich
  wtyczek.
- **Interfejs** renderuje widoki jako HTML i nakłada zmiany na żywy DOM
  (`ui/dom.js`), bez frameworka. Nie przechowuje własnej kopii stanu gry.

## Rozbudowa

Wszystko, co da się dodać, dodaje się przez wtyczkę — obiekt
`{ id, install(content) }` dopisany do listy w `src/mods/index.js`:

```js
export const myMod = {
  id: 'my-mod',
  install(content) {
    content.products.register({
      id: 'pasta', type: 'consumer', category: 'food', icon: '🍝',
      spend: 20, weights: { price: 0.5, quality: 0.35, brand: 0.15 },
      name: { pl: 'Makaron', en: 'Pasta' },
    });
    content.recipes.register({ id: 'pasta', building: 'factory', output: 'pasta', inputs: { flour: 0.5 }, cost: 0.3 });
    content.tune({ retail: { exponent: 3 } }); // zmiana balansu
  },
};
```

Przewodnik z przykładami (nowe produkty i łańcuchy, budynki, wydarzenia,
cele, systemy, polecenia, poziomy i moduły AI, widoki interfejsu) jest w
[docs/MODDING.md](docs/MODDING.md). Działający przykład: `src/mods/coffee.js`.

## Balans

Liczby strojące grę są w dwóch miejscach:

- `src/sim/balance.js` — reguły (elastyczność popytu, marże importu, kredyt,
  giełda, reklama, badania…),
- `src/content/*.js` — dane (ceny i zapotrzebowanie produktów, koszty
  budynków, rozmiary miast).

Po zmianie warto uruchomić:

```bash
npm run check                       # czy marże mają sens
npm run sim -- --runs 8 --years 10  # czy drabinka poziomów AI się trzyma
npm test
```

Opcje symulatora są opisane na początku pliku `scripts/simulate.mjs`
(`--years`, `--seed`, `--levels`, `--personas`, `--cities`, `--runs`, `--pnl`,
`--log`, `--no-takeovers`).

## Test w przeglądarce

`npm run test:e2e` przechodzi ścieżkę nowego gracza i wszystkie widoki
w bezgłowym Chromium. Playwright celowo nie jest zależnością projektu:

```bash
npm i -D playwright && npx playwright install chromium
npm run test:e2e -- --phone
```

## Zapis gry

Gra zapisuje się automatycznie co miesiąc i przy każdym opuszczeniu strony
(także gdy karta w telefonie trafia w tło) w `localStorage` przeglądarki;
z menu można też zapisać ręcznie oraz wyeksportować i zaimportować zapis jako
tekst (np. żeby przenieść grę na inne urządzenie).

Wczytywany zapis jest sprawdzany: plik uszkodzony albo zrobiony z modem,
którego w grze nie ma, zostaje odrzucony z komunikatem i nie rusza ani
trwającej rozgrywki, ani autozapisu. Gdyby w trakcie gry zawiodła któraś
z zasad, zegar się zatrzymuje, a ostatni dobry autozapis zostaje nietknięty.

## Czcionki

Big Shoulders Display, IBM Plex Sans i IBM Plex Mono (SIL Open Font License)
są serwowane z repozytorium — gra nie wysyła żądań do zewnętrznych serwerów.
Szczegóły: `assets/fonts/LICENSE.md`.
