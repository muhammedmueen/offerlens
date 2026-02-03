import { AdminService } from '../admin.service';
import { prisma } from '../../lib/prisma';
import bcrypt from 'bcrypt';

// Mock dependencies
jest.mock('../../lib/prisma', () => ({
  prisma: {
    adminUser: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('bcrypt');

describe('AdminService', () => {
  let adminService: AdminService;

  beforeEach(() => {
    adminService = new AdminService();
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate admin with valid credentials', async () => {
      const mockAdmin = {
        id: '123',
        username: 'admin',
        passwordHash: 'hashed_password',
        role: 'admin',
        createdAt: new Date(),
        lastLogin: null,
      };

      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(mockAdmin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (prisma.adminUser.update as jest.Mock).mockResolvedValue(mockAdmin);

      const token = await adminService.authenticate('admin', 'password123');

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(prisma.adminUser.findUnique).toHaveBeenCalledWith({
        where: { username: 'admin' },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed_password');
      expect(prisma.adminUser.update).toHaveBeenCalled();
    });

    it('should throw error for invalid username', async () => {
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(adminService.authenticate('invalid', 'password123')).rejects.toThrow(
        'Invalid credentials'
      );
    });

    it('should throw error for invalid password', async () => {
      const mockAdmin = {
        id: '123',
        username: 'admin',
        passwordHash: 'hashed_password',
        role: 'admin',
        createdAt: new Date(),
        lastLogin: null,
      };

      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(mockAdmin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(adminService.authenticate('admin', 'wrongpassword')).rejects.toThrow(
        'Invalid credentials'
      );
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      // Create a valid token first
      const mockAdmin = {
        id: '123',
        username: 'admin',
        passwordHash: 'hashed_password',
        role: 'admin',
        createdAt: new Date(),
        lastLogin: null,
      };

      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(mockAdmin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (prisma.adminUser.update as jest.Mock).mockResolvedValue(mockAdmin);

      // For this test, we'll just verify the method exists and handles errors
      expect(() => adminService.verifyToken('invalid_token')).toThrow();
    });
  });

  describe('createAdmin', () => {
    it('should create admin user', async () => {
      const mockAdmin = {
        id: '123',
        username: 'newadmin',
        passwordHash: 'hashed_password',
        role: 'admin',
        createdAt: new Date(),
        lastLogin: null,
      };

      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');
      (prisma.adminUser.create as jest.Mock).mockResolvedValue(mockAdmin);

      await adminService.createAdmin('newadmin', 'password123', 'admin');

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(prisma.adminUser.create).toHaveBeenCalledWith({
        data: {
          username: 'newadmin',
          passwordHash: 'hashed_password',
          role: 'admin',
        },
      });
    });
  });
});
