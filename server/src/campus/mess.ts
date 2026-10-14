import { prisma } from '../db.js';
import type { MealType, MessMealDTO, UpdateMessMealInput } from '@kamand/shared';

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

  public async getCurrentMeal(hostelName = 'Oak Mess'): Promise<MessMealDTO | null> {
    const currentMealType = determineCurrentMealType();
    const currentDay = getCurrentDayName();

    const record = await prisma.messMenu.findFirst({
      where: {
        hostelName,
        dayOfWeek: currentDay,
        mealType: currentMealType,
      },
    });

    if (!record) return null;

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
