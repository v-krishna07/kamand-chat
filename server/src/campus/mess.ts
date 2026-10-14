import type { MessHallId } from '@kamand/shared';

export interface MessMealSlot {
  slot: 'Breakfast' | 'Lunch' | 'Snacks' | 'Dinner';
  timing: string;
  items: string[];
  isActiveNow: boolean;
}

export interface MessHallSchedule {
  messId: MessHallId;
  campusZone: 'South Campus' | 'North Campus';
  specialty: string;
  meals: MessMealSlot[];
}

export const ALL_MESS_HALL_IDS: MessHallId[] = [
  'Pine Mess',
  'Oak Mess',
  'Cedar Mess',
  'Alder Mess',
  'Maple Mess',
  'Peepal Mess',
];

const MESS_CATALOG: Record<
  MessHallId,
  {
    campusZone: 'South Campus' | 'North Campus';
    specialty: string;
    breakfast: string[];
    lunch: string[];
    snacks: string[];
    dinner: string[];
  }
> = {
  'Pine Mess': {
    campusZone: 'South Campus',
    specialty: 'Pure Vegetarian · Himachali Dham & North Indian Favorites',
    breakfast: ['Aloo Paratha with Curd', 'Sprouted Moong Salad', 'Masala Chai & Milk'],
    lunch: ['Paneer Butter Masala', 'Moong Dal Tadka', 'Jeera Rice', 'Hot Phulka', 'Boondi Raita'],
    snacks: ['Samosa Chaat', 'Mint Chutney', 'Adrak Chai & Filter Coffee'],
    dinner: ['Mix Veg Kadhai', 'Dal Makhani', 'Steamed Basmati Rice', 'Gulab Jamun'],
  },
  'Oak Mess': {
    campusZone: 'South Campus',
    specialty: 'Multi-Cuisine · South & North Indian Rotation',
    breakfast: ['Masala Dosa', 'Coconut Chutney & Sambar', 'Boiled Eggs / Banana', 'Coffee'],
    lunch: ['Rajma Raseela', 'Aloo Gobhi Masala', 'Veg Pulao', 'Chapati', 'Fresh Green Salad'],
    snacks: ['Vada Pav', 'Fried Green Chillies', 'Lemon Iced Tea & Masala Chai'],
    dinner: ['Kadhai Paneer / Egg Curry', 'Yellow Dal Fry', 'Jeera Rice', 'Fruit Custard'],
  },
  'Cedar Mess': {
    campusZone: 'North Campus',
    specialty: 'North & South Indian Student Dining · Near B-19',
    breakfast: ['Poha with Sev & Peanuts', 'Jalebi', 'Toast & Butter', 'Hot Cocoa / Tea'],
    lunch: ['Chole Bhature', 'Kulcha & Phulka', 'Onion Mint Salad', 'Sweet Lassi'],
    snacks: ['Veg Puff Pastry', 'Tomato Ketchup', 'Cardamom Tea'],
    dinner: ['Malai Kofta', 'Arhar Dal Tadka', 'Steamed Rice', 'Chapati', 'Rice Kheer'],
  },
  'Alder Mess': {
    campusZone: 'North Campus',
    specialty: 'Central North Campus Dining Hall · High-Protein & Balanced Menu',
    breakfast: ['Idli & Medu Vada', 'Spicy Sambar', 'Peanut Chutney', 'Roasted Chana'],
    lunch: ['Palak Paneer', 'Kala Chana Masala', 'Lemon Rice', 'Roti', 'Cucumber Raita'],
    snacks: ['Masala Maggi Noodles', 'Sweet Corn Cup', 'Hot Coffee'],
    dinner: ['Mushroom Matar Masala', 'Dal Panchmel', 'Jeera Rice', 'Chapati', 'Moong Dal Halwa'],
  },
  'Maple Mess': {
    campusZone: 'North Campus',
    specialty: 'D1 / D2 Cluster · Bakery Specials & Fresh Salad Bar',
    breakfast: ['Stuffed Paneer Paratha', 'Homemade White Butter', 'Pickle', 'Masala Tea'],
    lunch: ['Veg Biryani with Mirchi Ka Salan', 'Soyabean Curry', 'Chapati', 'Veg Raita'],
    snacks: ['Grilled Veg Sandwich', 'Potato Wedges', 'Cold Coffee'],
    dinner: ['Shahi Paneer', 'Dal Tadka', 'Steamed Rice', 'Phulka', 'Warm Brownie'],
  },
  'Peepal Mess': {
    campusZone: 'North Campus',
    specialty: 'North Complex · Hygienic Multi-Counter Dining',
    breakfast: ['Uttapam with Mixed Veg', 'Tomato & Coconut Chutney', 'Fruit Bowl', 'Tea'],
    lunch: ['Bhindi Do Pyaza', 'Chana Dal Fry', 'Steamed Rice', 'Chapati', 'Buttermilk (Chaas)'],
    snacks: ['Bhel Puri', 'Roasted Peanuts', 'Ginger Tea'],
    dinner: ['Paneer Lababdar', 'Black Dal', 'Peas Pulao', 'Roti', 'Seviyan Kheer'],
  },
};

export function getActiveMealSlotName(now = new Date()): 'Breakfast' | 'Lunch' | 'Snacks' | 'Dinner' {
  const mins = now.getHours() * 60 + now.getMinutes();
  if (mins < 10 * 60 + 30) return 'Breakfast';
  if (mins < 15 * 60) return 'Lunch';
  if (mins < 18 * 60 + 30) return 'Snacks';
  return 'Dinner';
}

export function getMessSchedule(messName?: string, now = new Date()): MessHallSchedule {
  const normalized =
    ALL_MESS_HALL_IDS.find((m) => m.toLowerCase() === (messName || '').trim().toLowerCase()) ??
    'Pine Mess';

  const spec = MESS_CATALOG[normalized];
  const activeSlot = getActiveMealSlotName(now);

  return {
    messId: normalized,
    campusZone: spec.campusZone,
    specialty: spec.specialty,
    meals: [
      {
        slot: 'Breakfast',
        timing: '07:30 – 09:30',
        items: spec.breakfast,
        isActiveNow: activeSlot === 'Breakfast',
      },
      {
        slot: 'Lunch',
        timing: '12:15 – 14:15',
        items: spec.lunch,
        isActiveNow: activeSlot === 'Lunch',
      },
      {
        slot: 'Snacks',
        timing: '16:45 – 18:00',
        items: spec.snacks,
        isActiveNow: activeSlot === 'Snacks',
      },
      {
        slot: 'Dinner',
        timing: '19:30 – 21:30',
        items: spec.dinner,
        isActiveNow: activeSlot === 'Dinner',
      },
    ],
  };
}

export function getAllMessSchedules(now = new Date()): MessHallSchedule[] {
  return ALL_MESS_HALL_IDS.map((id) => getMessSchedule(id, now));
}

export const messService = {
  getCurrentMeal: async (messName?: string) => {
    const sched = getMessSchedule(messName);
    const active = sched.meals.find((m) => m.isActiveNow) || sched.meals[0]!;
    return {
      meal: active.slot,
      hostel: sched.messId,
      items: active.items,
      timing: active.timing,
      isVegetarian: sched.messId === 'Pine Mess',
    };
  },
  getWeeklyMenu: async (messName?: string) => {
    const sched = getMessSchedule(messName);
    return sched.meals.map((m) => ({
      slot: m.slot,
      timing: m.timing,
      items: m.items,
    }));
  },
  updateMessMeal: async (data: unknown) => {
    return data;
  },
};
