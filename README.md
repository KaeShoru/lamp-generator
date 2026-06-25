# 🏮 Lamp Shade Generator / Генератор плафонов

**A browser-based parametric lamp shade generator for 3D printing with Telegram order forwarding.**
All geometry is computed locally in the browser via a Web Worker; orders are sent through a tiny
Node.js backend that forwards the STL file to your Telegram chat.

**Браузерный параметрический генератор плафонов для 3D-печати с отправкой заказов в Telegram.**
Вся геометрия считается локально в браузере через Web Worker; заказы идут через небольшой
Node.js-бэкенд, который пересылает STL-файл в ваш Telegram-чат.

---

## 🇬🇧 English

### Features

- **Parametric profile** — height, top diameter, wall thickness
  - Base diameter is **fixed at 150 mm** (standard pendant-kit dimension)
  - Maximum diameter anywhere is hard-capped at **250 mm** (printer build volume)
- **Bulge & waist** — Gaussian bumps and pinches along the profile
- **Twist** — linear, ease-in-out, or sine twist profiles
- **Surface patterns:** rectangular ribs, waves, accordion (triangle), round grooves,
  T-grooves (fins perpendicular to surface), mirror mode, edge fade
- **Spiral veins** — thick braids spiraling around the lamp
- **Bottom plug** — solid base with follow-shape or circular disc, plus a
  **fixed 40 mm central wiring hole**
- **Smooth base-blend filter** — the bottom ~12% smoothly blends to BASE_RADIUS
  so the plug seals watertight
- **Order submission** — instead of a "Download" button, the customer fills in
  their name and order title, and the STL is sent straight to your Telegram chat
  (with max quality + max smoothing, regardless of preview settings)
- **Presets** — save/load parameter sets as JSON files
- **Automated tests** — Vitest suite validates all physical constraints
- **Bilingual UI** — Russian and English

### Architecture

```
┌─────────────────────── Browser ───────────────────────┐
│  React + react-three-fiber + Leva                     │
│  ─────────────────────────────────────────────────    │
│  • Parametric UI (Leva panel)                         │
│  • 3D preview via Web Worker (low quality, live)      │
│  • On "Send order": rebuild geometry at MAX quality   │
│    + 4 smoothing passes → binary STL                  │
└────────────────────────┬──────────────────────────────┘
                         │ multipart/form-data
                         │ (STL + name + title)
                         ▼
┌──────────────────── Backend (Node.js) ───────────────┐
│  Express + Multer + express-rate-limit               │
│  ─────────────────────────────────────────────────    │
│  • Auth: Bearer token (PUBLIC_API_KEY)                │
│  • Rate limit: 5 orders / minute / IP                 │
│  • CORS allowlist                                     │
│  • Forwards file via Telegram Bot API sendDocument    │
└────────────────────────┬──────────────────────────────┘
                         │ HTTPS
                         ▼
                  ┌─────────────┐
                  │  Telegram   │ → you receive the STL
                  └─────────────┘
```

### Physical Constraints

| Parameter | Value | Reason |
|---|---|---|
| Base diameter | **150 mm** (fixed) | Standard pendant kit |
| Max diameter anywhere | **250 mm** (hard cap) | 3D-printer build volume |
| Central plug hole | **40 mm** (fixed, always present) | Wiring pass-through |
| Minimum wall thickness | **0.6 mm** (hard floor) | Print strength + translucency |
| T-ridge width | **1.2 mm** (fixed arc length) | Consistent fin printing |

Encoded in [`src/shade/constants.ts`](src/shade/constants.ts) and enforced by
[`src/shade/buildShadeGeometry.test.ts`](src/shade/buildShadeGeometry.test.ts).

### Project Structure

```
├── src/
│   ├── App.tsx                # Main UI (Leva, Canvas, send-order)
│   ├── App.css                # Styles
│   ├── api.ts                 # Frontend API client (XHR + progress)
│   ├── main.tsx               # Entry point
│   └── shade/
│       ├── types.ts           # ShadeParams, PatternType, …
│       ├── constants.ts       # Hard physical constraints
│       ├── buildShadeGeometry.ts  # Core geometry builder
│       ├── buildShadeGeometry.test.ts  # Vitest tests
│       └── worker.ts          # Web Worker for async computation
├── server/                    # Backend (Express)
│   ├── index.js               # /api/send-order → Telegram
│   └── package.json
├── scripts/
│   └── obfuscate.mjs          # Post-build JS obfuscation
├── Dockerfile                 # Multi-stage production image
├── docker-compose.yml         # Local Docker testing
├── railway.json               # Railway.app deploy config
├── .railwayignore             # Files excluded from `railway up` upload
└── .env.example               # Template for secrets
```

### Quick Start (Development)

```bash
# 1. Clone & install
git clone https://github.com/KaeShoru/lamp-generator.git
cd lamp-generator
npm install
cd server && npm install && cd ..

# 2. Copy env template and fill in real values
cp .env.example .env
#   — set TELEGRAM_BOT_TOKEN (from @BotFather)
#   — set TELEGRAM_CHAT_ID   (from @userinfobot)
#   — set PUBLIC_API_KEY      (any random string, e.g. `openssl rand -hex 32`)
#   — set VITE_PUBLIC_API_KEY in .env to the SAME value (so the frontend can auth)

# 3. Run frontend + backend in parallel terminals
npm run dev                 # Vite frontend on http://localhost:5173
cd server && npm run dev    # Backend on http://localhost:3000
```

Open [http://localhost:5173](http://localhost:5173).

### Testing

```bash
npm test            # one-shot
npm run test:watch  # watch mode
npm run test:ui     # browser-like UI
```

### Building for Production

```bash
# Build frontend (TypeScript compile + Vite bundle + JS obfuscation)
npm run build:obfuscated

# Run backend (it serves the frontend from dist/)
cd server && npm start
# → http://localhost:3000
```

### Deploying to Railway

This repo is preconfigured for Railway. The included `railway.json` tells Railway to:

1. Build the Docker image using `Dockerfile` (multi-stage: install → build frontend → runtime).
2. Start `node server/index.js` as the runtime.
3. Hit `/api/health` for health checks.

There are **two ways** to deploy:

#### Option A — One-command deploy via Railway CLI (recommended)

The included `npm run deploy:railway` script automates the entire flow: CLI install
check, login, project link, secret sync from local `.env`, `railway up`, and opens
the deployed URL in your browser.

```bash
# 1. Install Railway CLI (one-time)
npm install -g @railway/cli

# 2. Make sure .env exists locally with real secrets
#    (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ALLOWED_ORIGINS, PUBLIC_API_KEY)
cp .env.example .env
#   …fill in real values…

# 3. Deploy
npm run deploy:railway
```

**What the script does** (see [`scripts/deploy-railway.mjs`](scripts/deploy-railway.mjs)):

| Step | Action |
|------|--------|
| 1 | Verify Railway CLI is installed |
| 2 | `railway login` if not authenticated (opens browser) |
| 3 | `railway link` — pick existing project or `railway init` new one |
| 4 | Push secrets from `.env` to Railway variables (only keys, never values in log) |
| 5 | `railway up --detach` — uploads source, builds via Dockerfile, deploys |
| 6 | `railway domain --random` — provisions a public URL and opens it |

**Useful flags:**

```bash
npm run deploy:railway -- --no-vars    # skip pushing variables (use what's already in Railway)
npm run deploy:railway -- --no-open    # don't auto-open the browser
npm run deploy:railway -- --env prod   # target a specific Railway environment
npm run deploy:railway -- --service api # target a specific service
```

**Other CLI shortcuts** (defined in `package.json`):

```bash
npm run deploy          # shorthand for `railway up`
npm run deploy:logs     # `railway logs` — stream deploy logs
npm run deploy:open     # `railway open` — open Railway dashboard
npm run railway:login   # `railway login`
npm run railway:link    # `railway link` (re-link to different project)
npm run railway:vars    # `railway variables` (list current variables)
```

#### Option B — Dashboard deploy via GitHub

```bash
# 1. Push the repo to GitHub first (if not already)
git push origin main

# 2. Go to https://railway.app → New Project → Deploy from GitHub repo
#    Select this repo. Railway will autodetect railway.json.

# 3. In the Railway service → Variables, set:
TELEGRAM_BOT_TOKEN=123456:your_token_from_botfather
TELEGRAM_CHAT_ID=376791080
PUBLIC_API_KEY=generate_a_random_string_here
ALLOWED_ORIGINS=https://your-app.up.railway.app
PORT=3000

# 4. (Frontend build) Also set, so the bundled JS can authenticate:
VITE_PUBLIC_API_KEY=<SAME value as PUBLIC_API_KEY>

# 5. Railway will build and deploy. The app URL appears at the top of the service.
```

**Note on `ALLOWED_ORIGINS`:** set this to your Railway public URL once it's known
(after the first deploy). On the very first deploy you can leave it blank or set it
to the Railway URL — the backend prints the configured origins in the startup log.

### Local Testing with Docker

```bash
cp .env.example .env
# fill in values, then:
docker compose up --build
# → http://localhost:3000
```

### Security Notes

- **No secrets in the frontend.** The Telegram bot token lives **only** in the backend env.
- The frontend ships with a `PUBLIC_API_KEY` that prevents random strangers from hitting
  `/api/send-order` directly — but it is bundled in the JS, so do **not** treat it as secret.
- The production bundle is **obfuscated** with `javascript-obfuscator` (control-flow flattening,
  string-array encryption, debug protection). This is a deterrent, not a real security boundary.
- Rate limit is 5 orders per minute per IP.
- STL files are capped at 60 MB; Telegram Bot API allows up to 50 MB via `sendDocument`.

### Usage

1. Adjust parameters in the **Leva panel** on the right
2. The 3D preview updates automatically (Web Worker)
3. Mouse: rotate (LMB drag), zoom (wheel), pan (RMB drag)
4. In the **Order** folder, enter your **name** and an **order title**
5. Click **"Send order"** — the STL is generated at max quality and sent to Telegram
6. Use **Save / Load preset** to share parameter sets

---

## 🇷🇺 Русский

### Возможности

- **Параметрический профиль** — высота, диаметр верха, толщина стенки
  - Диаметр основания **фиксирован 150 мм** (стандартный патрон)
  - Максимальный диаметр ограничен **250 мм** (стол 3D-принтера)
- **Выпуклость и талия** — гауссовы бугры и сужения вдоль профиля
- **Скручивание** — линейное, плавное (ease-in-out) или синусоидальное
- **Текстуры поверхности** — рёбра, волны, гармошка, круглые/Т-канавки, зеркало, сглаживание
- **Спиральные жилы** — толстые жгуты, обвивающие плафон
- **Заглушка снизу** — по форме дна или круглый диск + **постоянное отверстие 40 мм** под проводку
- **Плавный фильтр нижнего края** — нижние ~12% плавно сводятся к BASE_RADIUS,
  чтобы заглушка прилегала герметично
- **Отправка заказа** — вместо кнопки «Скачать» клиент вводит имя и название,
  и STL улетает вам в Telegram с максимальным качеством и сглаживанием
  (вне зависимости от настроек превью)
- **Пресеты** — сохранение/загрузка наборов параметров в JSON
- **Автотесты** — Vitest проверяет все физические ограничения
- **Двуязычный интерфейс** — русский и английский

### Архитектура

```
┌─────────────────── Браузер ──────────────────────────┐
│  React + react-three-fiber + Leva                     │
│  ─────────────────────────────────────────────────    │
│  • Параметрический UI (панель Leva)                   │
│  • 3D-превью через Web Worker (низкое качество, live) │
│  • На «Отправить»: перестроить на MAX качестве        │
│    + 4 прохода сглаживания → бинарный STL             │
└────────────────────────┬──────────────────────────────┘
                         │ multipart/form-data
                         │ (STL + имя + название)
                         ▼
┌────────────────── Бэкенд (Node.js) ──────────────────┐
│  Express + Multer + express-rate-limit               │
│  ─────────────────────────────────────────────────    │
│  • Авторизация: Bearer-токен (PUBLIC_API_KEY)         │
│  • Rate limit: 5 заказов / минуту / IP                │
│  • CORS allowlist                                     │
│  • Пересылает файл через Telegram Bot API sendDocument│
└────────────────────────┬──────────────────────────────┘
                         │ HTTPS
                         ▼
                  ┌─────────────┐
                  │  Telegram   │ → вы получаете STL
                  └─────────────┘
```

### Физические ограничения

| Параметр | Значение | Причина |
|---|---|---|
| Диаметр основания | **150 мм** (фиксирован) | Стандартный патрон |
| Макс. диаметр | **250 мм** (жёсткий лимит) | Поле печати 3D-принтера |
| Центральное отверстие | **40 мм** (фиксировано, всегда) | Пропуск проводки патрона |
| Мин. толщина стенки | **0,6 мм** (нижний порог) | Прочность печати + светорассеивание |
| Ширина Т-ребра | **1,2 мм** (фикс. дуга) | Единый профиль ребра |

Захардкожены в [`src/shade/constants.ts`](src/shade/constants.ts), проверяются
автотестами в [`src/shade/buildShadeGeometry.test.ts`](src/shade/buildShadeGeometry.test.ts).

### Быстрый старт (разработка)

```bash
# 1. Клонировать и установить
git clone https://github.com/KaeShoru/lamp-generator.git
cd lamp-generator
npm install
cd server && npm install && cd ..

# 2. Скопировать шаблон env и вписать значения
cp .env.example .env
#   — TELEGRAM_BOT_TOKEN (от @BotFather)
#   — TELEGRAM_CHAT_ID   (от @userinfobot)
#   — PUBLIC_API_KEY      (любая случайная строка, напр. `openssl rand -hex 32`)
#   — VITE_PUBLIC_API_KEY — ТО ЖЕ значение (чтобы фронт мог авторизоваться)

# 3. Запустить фронт и бэк в разных терминалах
npm run dev                 # Vite-фронт на http://localhost:5173
cd server && npm run dev    # Бэкенд на http://localhost:3000
```

Открыть [http://localhost:5173](http://localhost:5173).

### Тесты

```bash
npm test            # однократный запуск
npm run test:watch  # режим наблюдения
npm run test:ui     # браузерный UI
```

### Сборка для продакшена

```bash
# Сборка фронта (TypeScript + Vite + обфускация JS)
npm run build:obfuscated

# Запуск бэкенда (он раздаёт фронт из dist/)
cd server && npm start
# → http://localhost:3000
```

### Деплой на Railway

Репозиторий преднастроен под Railway. `railway.json` говорит Railway:

1. Собрать Docker-образ через `Dockerfile` (multi-stage: install → build → runtime).
2. Запустить `node server/index.js`.
3. Использовать `/api/health` для проверки здоровья.

Доступно **два способа** деплоя:

#### Способ A — Одна команда через Railway CLI (рекомендуется)

Скрипт `npm run deploy:railway` автоматизирует весь флоу: проверка CLI, логин,
привязка проекта, синхронизация секретов из локального `.env`, `railway up`
и открытие готового URL в браузере.

```bash
# 1. Установить Railway CLI (один раз)
npm install -g @railway/cli

# 2. Убедиться, что локально есть .env с реальными секретами
#    (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ALLOWED_ORIGINS, PUBLIC_API_KEY)
cp .env.example .env
#   …заполнить значения…

# 3. Деплой
npm run deploy:railway
```

**Что делает скрипт** (см. [`scripts/deploy-railway.mjs`](scripts/deploy-railway.mjs)):

| Шаг | Действие |
|-----|----------|
| 1 | Проверить, что Railway CLI установлен |
| 2 | `railway login`, если не авторизован (открывает браузер) |
| 3 | `railway link` — выбрать существующий проект или `railway init` новый |
| 4 | Загрузить секреты из `.env` в Railway variables (только ключи, без значений в логе) |
| 5 | `railway up --detach` — загрузить исходник, собрать через Dockerfile, задеплоить |
| 6 | `railway domain --random` — выделить публичный URL и открыть его |

**Полезные флаги:**

```bash
npm run deploy:railway -- --no-vars    # пропустить загрузку переменных (использовать те, что уже в Railway)
npm run deploy:railway -- --no-open    # не открывать браузер автоматически
npm run deploy:railway -- --env prod   # целевое окружение Railway
npm run deploy:railway -- --service api # целевой сервис
```

**Другие шорткаты CLI** (определены в `package.json`):

```bash
npm run deploy          # синоним для `railway up`
npm run deploy:logs     # `railway logs` — поток логов деплоя
npm run deploy:open     # `railway open` — открыть дашборд Railway
npm run railway:login   # `railway login`
npm run railway:link    # `railway link` (перепривязать к другому проекту)
npm run railway:vars    # `railway variables` (список текущих переменных)
```

#### Способ B — Через дашборд Railway по GitHub

```bash
# 1. Залейте репозиторий на GitHub (если ещё не)
git push origin main

# 2. На https://railway.app → New Project → Deploy from GitHub repo
#    Выберите этот репозиторий. Railway подхватит railway.json.

# 3. В Railway service → Variables установите:
TELEGRAM_BOT_TOKEN=123456:ваш_токен_от_botfather
TELEGRAM_CHAT_ID=376791080
PUBLIC_API_KEY=сгенерируйте_случайную_строку
ALLOWED_ORIGINS=https://your-app.up.railway.app
PORT=3000

# 4. (Для сборки фронта) Также установите, чтобы JS мог авторизоваться:
VITE_PUBLIC_API_KEY=<ТО ЖЕ значение, что и PUBLIC_API_KEY>

# 5. Railway соберёт и задеплоит. URL появится вверху сервиса.
```

**Замечание про `ALLOWED_ORIGINS`:** установите публичный URL Railway, как только
он станет известен (после первого деплоя). На самый первый деплой можно поставить
пустую или URL Railway — бэкенд выводит настроенные origins в логе при запуске.

### Локальное тестирование через Docker

```bash
cp .env.example .env
# заполните значения, затем:
docker compose up --build
# → http://localhost:3000
```

### Безопасность

- **Никаких секретов во фронте.** Токен Telegram-бота живёт **только** в env бэкенда.
- Фронт содержит `PUBLIC_API_KEY`, который отсекает прямые запросы случайных людей
  к `/api/send-order` — но он вшит в JS, **не** считайте его секретом.
- Продакшен-бандл **обфусцирован** через `javascript-obfuscator` (control-flow flattening,
  шифрование строк, debug protection). Это препятствие, а не настоящая защита.
- Rate limit — 5 заказов в минуту с одного IP.
- Размер STL ограничен 60 МБ; Telegram Bot API принимает до 50 МБ через `sendDocument`.

### Использование

1. Настраивайте параметры в панели **Leva** справа
2. 3D-превью обновляется автоматически (вычисления — в Web Worker)
3. Управление мышью: вращать (ЛКМ + drag), зум (колёсико), панорамирование (ПКМ + drag)
4. Во вкладке **Заказ** введите **имя** и **название заказа**
5. Нажмите **«Отправить заказ»** — STL пересчитается на максимальном качестве и уйдёт в Telegram
6. Используйте **Сохранить / Загрузить пресет**, чтобы делиться наборами параметров

---

## License / Лицензия

MIT