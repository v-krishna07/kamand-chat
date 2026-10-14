import { prisma } from '../db.js';
import type { CampusServiceDTO, CreateCampusServiceInput } from '@kamand/shared';

export class CampusDirectoryService {
  public async getServices(category?: string): Promise<CampusServiceDTO[]> {
    const whereClause: { category?: string } = {};
    if (category) {
      whereClause.category = category;
    }

    const services = await prisma.campusService.findMany({
      where: whereClause,
      orderBy: [{ priorityOrder: 'asc' }, { title: 'asc' }],
    });

    return services.map((s) => ({
      id: s.id,
      title: s.title,
      category: s.category as CampusServiceDTO['category'],
      phone: s.phone,
      alternatePhone: s.alternatePhone,
      email: s.email,
      location: s.location,
      operatingHours: s.operatingHours,
      description: s.description,
    }));
  }

  public async getQuickEmergencyContacts(): Promise<CampusServiceDTO[]> {
    const emergencyList = await prisma.campusService.findMany({
      where: {
        category: { in: ['emergency', 'medical'] },
      },
      orderBy: { priorityOrder: 'asc' },
      take: 4,
    });

    return emergencyList.map((s) => ({
      id: s.id,
      title: s.title,
      category: s.category as CampusServiceDTO['category'],
      phone: s.phone,
      alternatePhone: s.alternatePhone,
      email: s.email,
      location: s.location,
      operatingHours: s.operatingHours,
      description: s.description,
    }));
  }

  public async createService(input: CreateCampusServiceInput): Promise<CampusServiceDTO> {
    const created = await prisma.campusService.create({
      data: {
        title: input.title,
        category: input.category,
        phone: input.phone,
        alternatePhone: input.alternatePhone,
        email: input.email,
        location: input.location,
        operatingHours: input.operatingHours,
        description: input.description,
      },
    });

    return {
      id: created.id,
      title: created.title,
      category: created.category as CampusServiceDTO['category'],
      phone: created.phone,
      alternatePhone: created.alternatePhone,
      email: created.email,
      location: created.location,
      operatingHours: created.operatingHours,
      description: created.description,
    };
  }

  public async deleteService(serviceId: string): Promise<boolean> {
    await prisma.campusService.delete({ where: { id: serviceId } });
    return true;
  }
}

export const campusDirectoryService = new CampusDirectoryService();
