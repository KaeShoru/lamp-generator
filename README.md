# 🏮 Lamp Shade Generator / Генератор плафонов

**A browser-based parametric lamp shade generator for 3D printing.**  
All geometry is computed locally in your browser using a Web Worker — no server required.

**Браузерный параметрический генератор плафонов для 3D-печати.**  
Вся геометрия считается локально в браузере через Web Worker — сервер не нужен.

---

## 🇬🇧 English

### Features

- **Parametric profile** — height, base/top diameters, wall thickness
- **Bulge & waist** — Gaussian bumps and pinches along the profile
- **Twist** — linear, ease-in-out, or sine twist profiles
- **Surface patterns:**
  - Rectangular ribs
  - Waves
  - Accordion (triangle wave)
  - Round grooves
  - T-grooves (wall fins protruding perpendicular to surface)
  - Mirror mode (cross-hatch grid)
  - Edge fade (smooth transition at top/bottom to prevent elephant foot)
- **Spiral veins** — thick braids spiraling around the lamp (count, amplitude, turns, tilt, width, valley depth)
- **Bottom plug** — solid base with optional:
  - Follow lamp shape or circular disc
  - Central hole for wiring
  - Configurable thickness
- **Overhang control** — limits per-layer radius change for 3D printability
- **STL export** — binary STL with configurable quality multiplier (1x–4x) and smooth export
- **Presets** — save/load parameter sets as JSON files
- **Bilingual UI** — Russian and English

### Requirements

- **Node.js** ≥ 18
- **npm** ≥ 8 (comes with Node.js)
- A modern browser (Chrome, Firefox, Edge, Safari)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/lamp-generator.git
cd lamp-generator

# Install dependencies
npm install
```

### Running in Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building for Production

```bash
npm run build
```

The output will be in the `dist/` folder. You can preview it with:

```bash
npm run preview
```

### Usage

1. Adjust parameters in the **Leva panel** on the right side of the screen
2. The 3D preview updates automatically (computation runs in a Web Worker)
3. **Mouse controls:** rotate (left click + drag), zoom (scroll wheel), pan (right click + drag)
4. Click **"Download STL"** to export the model for 3D printing
5. Use **"Save preset"** / **"Load"** to save and share parameter sets

### Project Structure

```
src/
├── App.tsx                    # Main UI component (Leva controls, Canvas, export)
├── App.css                    # Styles
├── main.tsx                   # Entry point
├── shade/
│   ├── types.ts               # TypeScript types (ShadeParams, PatternType, etc.)
│   ├── buildShadeGeometry.ts  # Core geometry builder (generates triangle mesh)
│   └── worker.ts              # Web Worker for async geometry computation
public/
├── favicon.svg
├── icons.svg
```

---

## 🇷🇺 Русский

### Возможности

- **Параметрический профиль** — высота, диаметры основания и верха, толщина стенки
- **Выпуклость и талия** — гауссовы бугры и сужения вдоль профиля
- **Скручивание** — линейное, плавное (ease-in-out) или синусоидальное
- **Текстуры поверхности:**
  - Прямоугольные рёбра
  - Волны
  - Гармошка (треугольная волна)
  - Круглые канавки
  - Т-образные канавки (ребристые выступы, перпендикулярные поверхности)
  - Зеркальный режим (перекрёстная сетка)
  - Сглаживание краёв (плавный переход у краёв для предотвращения «слоновой стопы»)
- **Спиральные жилы (косички)** — толстые жгуты, обвивающие плафон (количество, амплитуда, витки, наклон, ширина, глубина впадин)
- **Заглушка снизу** — сплошное основание с опциями:
  - По форме дна или круглый диск
  - Центральное отверстие для проводки
  - Настраиваемая толщина
- **Контроль нависания** — ограничивает изменение радиуса по слоям для печати без поддержек
- **Экспорт STL** — бинарный STL с настраиваемым множителем качества (1x–4x) и сглаживанием
- **Пресеты** — сохранение/загрузка наборов параметров в JSON-файлы
- **Двуязычный интерфейс** — русский и английский

### Требования

- **Node.js** ≥ 18
- **npm** ≥ 8 (поставляется с Node.js)
- Современный браузер (Chrome, Firefox, Edge, Safari)

### Установка

```bash
# Клонируйте репозиторий
git clone https://github.com/YOUR_USERNAME/lamp-generator.git
cd lamp-generator

# Установите зависимости
npm install
```

### Запуск в режиме разработки

```bash
npm run dev
```

Откройте [http://localhost:5173](http://localhost:5173) в браузере.

### Сборка для продакшена

```bash
npm run build
```

Результат будет в папке `dist/`. Предпросмотр:

```bash
npm run preview
```

### Использование

1. Настраивайте параметры в панели **Leva** справа
2. 3D-превью обновляется автоматически (вычисления — в Web Worker)
3. **Управление мышью:** вращать (ЛКМ + перетаскивание), зум (колёсико), панорамирование (ПКМ + перетаскивание)
4. Нажмите **«Скачать STL»** для экспорта модели для 3D-печати
5. Используйте **«Сохранить пресет»** / **«Загрузить»** для сохранения и обмена наборами параметров

### Структура проекта

```
src/
├── App.tsx                    # Главный компонент UI (панель Leva, Canvas, экспорт)
├── App.css                    # Стили
├── main.tsx                   # Точка входа
├── shade/
│   ├── types.ts               # TypeScript-типы (ShadeParams, PatternType и др.)
│   ├── buildShadeGeometry.ts  # Ядро генератора (создаёт треугольную сетку)
│   └── worker.ts              # Web Worker для асинхронных вычислений геометрии
public/
├── favicon.svg
├── icons.svg
```

---

## License / Лицензия

MIT