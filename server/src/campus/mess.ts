import { prisma } from '../db.js';
import type { MealType, MessMealDTO, UpdateMessMealInput } from '@kamand/shared';

export const ALL_CAMPUS_MESSES = [
  'Pine Mess',
  'Oak Mess',
  'Cedar Mess',
  'Alder Mess',
  'Maple Mess',
  'Peepal Mess',
] as const;

export type CampusMessName = (typeof ALL_CAMPUS_MESSES)[number];

export function determineCurrentMealType(hour = new Date().getHours()): MealType {
  if (hour >= 6 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 19) return 'snacks';
  return 'dinner';
}

export function getCurrentDayName(date = new Date()): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()]!;
}

// Comprehensive realistic fallback menus for all 6 IIT Mandi Mess Halls across South & North Campuses
const DEFAULT_FALLBACK_MENUS: Record<
  string,
  Record<MealType, { items: string[]; dietaryNote: string }>
> = {
  'Pine Mess': {
    breakfast: {
      items: ['Aloo Paratha with Curd', 'Boiled Sprouts', 'Bread & Jam', 'Poha with Sev', 'Tea & Coffee'],
      dietaryNote: '100% Pure Vegetarian · South Campus',
    },
    lunch: {
      items: ['Paneer Butter Masala', 'Yellow Dal Tadka', 'Jeera Rice', 'Tawa Chapatis', 'Boondi Raita', 'Green Salad'],
      dietaryNote: 'Pure Vegetarian · Jain options available on counter',
    },
    snacks: {
      items: ['Veg Cutlets with Mint Chutney', 'Biscuits', 'Hot Ginger Chai'],
      dietaryNote: 'Evening Snacks',
    },
    dinner: {
      items: ['Mix Veg Korma', 'Dal Makhani', 'Steamed Rice', 'Butter Roti', 'Gulab Jamun', 'Warm Cardamom Milk'],
      dietaryNote: 'Pure Vegetarian Special Feast',
    },
  },
  'Oak Mess': {
    breakfast: {
      items: ['Masala Dosa with Sambar & Coconut Chutney', 'Boiled Eggs', 'Bread Omelette', 'Banana', 'Tea/Coffee'],
      dietaryNote: 'Multi-Cuisine · South Campus',
    },
    lunch: {
      items: ['Kadai Chicken / Kadai Paneer', 'Rajma Masala', 'Steamed Rice', 'Phulkas', 'Cucumber Salad', 'Ice Cream'],
      dietaryNote: 'Non-Veg counter separate from Veg preparations',
    },
    snacks: {
      items: ['Samosa with Saunth Chutney', 'Elaichi Chai'],
      dietaryNote: 'Evening Snacks',
    },
    dinner: {
      items: ['Egg Curry / Shahi Paneer', 'Moong Dal Fry', 'Jeera Pulao', 'Roti', 'Fruit Custard'],
      dietaryNote: 'South Campus Dining Hall',
    },
  },
  'Cedar Mess': {
    breakfast: {
      items: ['Idli Vada Combo', 'Sambar & Tomato Chutney', 'Cornflakes with Milk', 'Filter Coffee'],
      dietaryNote: 'South Campus · Cedar Block',
    },
    lunch: {
      items: ['Chole Bhature / Chole Kulche', 'Veg Biryani', 'Boondi Raita', 'Pickle & Onion Rings'],
      dietaryNote: 'Special North-Indian Lunch',
    },
    snacks: {
      items: ['Pav Bhaji', 'Masala Tea'],
      dietaryNote: 'Snacks Counter',
    },
    dinner: {
      items: ['Dum Aloo Kashmiri', 'Dal Palak', 'Steamed Rice', 'Butter Naan', 'Rasgulla'],
      dietaryNote: 'Cedar Dining Complex',
    },
  },
  'Alder Mess': {
    breakfast: {
      items: ['Methi Thepla with Pickle', 'Upma with Coconut Chutney', 'Boiled Eggs', 'Tea & Coffee'],
      dietaryNote: 'North Campus · Alder Hostels',
    },
    lunch: {
      items: ['Chicken Biryani / Veg Hyderabadi Biryani', 'Mirchi Ka Salan', 'Onion Raita', 'Papad'],
      dietaryNote: 'North Campus Dining',
    },
    snacks: {
      items: ['Pani Puri & Bhel Puri', 'Cold Coffee / Hot Tea'],
      dietaryNote: 'Chaat Counter',
    },
    dinner: {
      items: ['Matar Paneer', 'Chana Dal Fry', 'Jeera Rice', 'Tawa Roti', 'Moong Dal Halwa'],
      dietaryNote: 'Warm Mountain Dining',
    },
  },
  'Maple Mess': {
    breakfast: {
      items: ['Stuffed Gobhi Paratha with Butter', 'Oatmeal Porridge', 'Fresh Seasonal Fruits', 'Adrak Chai'],
      dietaryNote: 'North Campus · Main Dining Complex D1/D2',
    },
    lunch: {
      items: ['Butter Chicken / Butter Paneer', 'Dal Maharani', 'Basmati Rice', 'Garlic Roti', 'Pineapple Raita', 'Papad'],
      dietaryNote: 'D1/D2 Central Mess Complex',
    },
    snacks: {
      items: ['Veg Momos with Spicy Dip', 'Mountain Herbal Tea'],
      dietaryNote: 'Himachali Special Snacks',
    },
    dinner: {
      items: ['Mushroom Do Pyaza', 'Dal Tadka', 'Peas Pulao', 'Chapatis', 'Hot Jalebi with Rabri'],
      dietaryNote: 'North Campus Special Dinner',
    },
  },
  'Peepal Mess': {
    breakfast: {
      items: ['Uttapam with Sambar', 'Bread Toast & Butter', 'Boiled Sprouts', 'Hot Chocolate / Coffee'],
      dietaryNote: 'North Campus · Peepal Block',
    },
    lunch: {
      items: ['Fish Curry / Malai Kofta', 'Arhar Dal', 'Steamed Rice', 'Tandoori Roti', 'Mint Raita'],
      dietaryNote: 'North Campus Peepal Dining',
    },
    snacks: {
      items: ['Aloo Tikki Chaat', 'Hot Lemon Tea'],
      dietaryNote: 'Snack Station',
    },
    dinner: {
      items: ['Baingan Bharta', 'Panchmel Dal', 'Jeera Rice', 'Fulka', 'Kheer with Nuts'],
      dietaryNote: 'Homestyle Comfort Dinner',
    },
  },
};

export class MessService {
  public async getWeeklyMenu(hostelName?: string): Promise<MessMealDTO[]> {
    const whereClause: { hostelName?: string } = {};
    if (hostelName) {
      whereClause.hostelName = hostelName;
    }

    const records = await prisma.messMenu.findMany({
      where: whereClause,
      orderBy: [{ hostelName: 'asc' }, { dayOfWeek: 'asc' }],
    });

    const currentMeal = determineCurrentMealType();
    const currentDay = getCurrentDayName();

    if (records.length === 0) {
      // Generate full week from fallback fixtures
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const targetMesses = hostelName ? [hostelName] : ALL_CAMPUS_MESSES;
      const mealTypes: MealType[] = ['breakfast', 'lunch', 'snacks', 'dinner'];
      const synthetic: MessMealDTO[] = [];

      for (const mName of targetMesses) {
        const messDict = DEFAULT_FALLBACK_MENUS[mName] || DEFAULT_FALLBACK_MENUS['Pine Mess']!;
        for (const day of days) {
          for (const mType of mealTypes) {
            const data = messDict[mType];
            synthetic.push({
              id: `fallback-${mName}-${day}-${mType}`,
              hostelName: mName,
              dayOfWeek: day,
              mealType: mType,
              items: data.items,
              dietaryNote: data.dietaryNote,
              isCurrentMeal: day === currentDay && mType === currentMeal,
            });
          }
        }
      }
      return synthetic;
    }

    return records.map((m) => {
      let items: string[] = [];
      try {
        items = JSON.parse(m.items) as string[];
      } catch {
        items = [m.items];
      }

      const isCurrentMeal = m.dayOfWeek === currentDay && m.mealType === currentMeal;

      return {
        id: m.id,
        hostelName: m.hostelName,
        dayOfWeek: m.dayOfWeek,
        mealType: m.mealType as MealType,
        items,
        dietaryNote: m.dietaryNote,
        isCurrentMeal,
      };
    });
  }

  public async getCurrentMeal(hostelName = 'Pine Mess'): Promise<MessMealDTO | null> {
    const currentMealType = determineCurrentMealType();
    const currentDay = getCurrentDayName();

    const record = await prisma.messMenu.findFirst({
      where: {
        hostelName,
        dayOfWeek: currentDay,
        mealType: currentMealType,
      },
    });

    if (!record) {
      const fallbackMess = DEFAULT_FALLBACK_MENUS[hostelName] || DEFAULT_FALLBACK_MENUS['Pine Mess']!;
      const meal = fallbackMess[currentMealType];
      return {
        id: `fallback-${hostelName}-${currentDay}-${currentMealType}`,
        hostelName,
        dayOfWeek: currentDay,
        mealType: currentMealType,
        items: meal.items,
        dietaryNote: meal.dietaryNote,
        isCurrentMeal: true,
      };
    }

    let items: string[] = [];
    try {
      items = JSON.parse(record.items) as string[];
    } catch {
      items = [record.items];
    }

    return {
      id: record.id,
      hostelName: record.hostelName,
      dayOfWeek: record.dayOfWeek,
      mealType: record.mealType as MealType,
      items,
      dietaryNote: record.dietaryNote,
      isCurrentMeal: true,
    };
  }

  public async updateMessMeal(input: UpdateMessMealInput): Promise<MessMealDTO> {
    const updated = await prisma.messMenu.upsert({
      where: {
        hostelName_dayOfWeek_mealType: {
          hostelName: input.hostelName,
          dayOfWeek: input.dayOfWeek,
          mealType: input.mealType,
        },
      },
      update: {
        items: JSON.stringify(input.items),
        dietaryNote: input.dietaryNote,
      },
      create: {
        hostelName: input.hostelName,
        dayOfWeek: input.dayOfWeek,
        mealType: input.mealType,
        items: JSON.stringify(input.items),
        dietaryNote: input.dietaryNote,
      },
    });

    return {
      id: updated.id,
      hostelName: updated.hostelName,
      dayOfWeek: updated.dayOfWeek,
      mealType: updated.mealType as MealType,
      items: input.items,
      dietaryNote: updated.dietaryNote,
    };
  }
}

export const messService = new MessService();
