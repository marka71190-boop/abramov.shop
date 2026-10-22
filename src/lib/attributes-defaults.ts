/** Без server-only: используется и в сиде */
export type AttrType = "number" | "select" | "text";

/** Стартовый набор для бильярдного магазина — создаётся один раз, дальше владелец правит сам */
export const DEFAULT_ATTRIBUTES: { key: string; name: string; unit: string; type: AttrType; options?: string[]; sortOrder: number }[] = [
  { key: "brand", name: "Бренд", unit: "", type: "select", options: ["Abramov", "Kamui", "Taom", "Predator", "Super Diamond", "Blue Diamond", "Triangle", "JOS", "Aramith", "Longoni", "Чемпион"], sortOrder: 0 },
  { key: "weight", name: "Вес", unit: "г", type: "number", sortOrder: 10 },
  { key: "length", name: "Длина", unit: "см", type: "number", sortOrder: 20 },
  { key: "tip", name: "Диаметр наклейки", unit: "мм", type: "number", sortOrder: 30 },
  { key: "hardness", name: "Жёсткость", unit: "", type: "select", options: ["Мягкая", "Средняя", "Средне-жёсткая", "Жёсткая", "Очень жёсткая"], sortOrder: 40 },
  { key: "construction", name: "Конструкция", unit: "", type: "select", options: ["Цельный", "Разборный 1/2", "Разборный 3/4"], sortOrder: 50 },
  { key: "color", name: "Цвет", unit: "", type: "select", options: ["Синий", "Голубой", "Зелёный", "Серый", "Белый", "Чёрный", "Красный"], sortOrder: 60 },
  { key: "material", name: "Материал", unit: "", type: "text", sortOrder: 70 },
  { key: "country", name: "Страна", unit: "", type: "select", options: ["Россия", "Япония", "США", "Тайвань", "Китай", "Бельгия", "Италия", "Германия"], sortOrder: 80 },
];
