import request from 'supertest';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import bcrypt from 'bcrypt';

const app = createApp();

describe('Admin Controller Integration Tests', () => {
  let adminToken: string;
  let testAdminId: string;

  beforeAll(async () => {
    // Create a test admin user
    const passwordHash = await bcrypt.hash('testpassword', 10);
    const admin = await prisma.adminUser.create({
      data: {
        username: 'testadmin',
        passwordHash,
        role: 'super_admin',
      },
    });
    testAdminId = admin.id;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.adminUser.delete({ where: { id: testAdminId } }).catch(() => {});
    await prisma.$disconnect();
  });

  describe('POST /api/v1/admin/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/admin/login')
        .send({
          username: 'testadmin',
          password: 'testpassword',
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('expiresIn', '7d');
      expect(typeof response.body.token).toBe('string');

      // Save token for subsequent tests
      adminToken = response.body.token;
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/admin/login')
        .send({
          username: 'testadmin',
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('should reject missing credentials', async () => {
      const response = await request(app)
        .post('/api/v1/admin/login')
        .send({
          username: 'testadmin',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/admin/salary-benchmarks', () => {
    it('should create salary benchmark with valid token', async () => {
      const response = await request(app)
        .post('/api/v1/admin/salary-benchmarks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'Test Engineer',
          experienceLevel: '1-3 years',
          city: 'Test City',
          minSalary: 5,
          avgSalary: 8,
          maxSalary: 12,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.role).toBe('Test Engineer');

      // Clean up
      await prisma.salaryBenchmark.delete({ where: { id: response.body.id } });
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .post('/api/v1/admin/salary-benchmarks')
        .send({
          role: 'Test Engineer',
          experienceLevel: '1-3 years',
          city: 'Test City',
          minSalary: 5,
          avgSalary: 8,
          maxSalary: 12,
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject invalid data', async () => {
      const response = await request(app)
        .post('/api/v1/admin/salary-benchmarks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'Test Engineer',
          // Missing required fields
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/admin/red-flag-rules', () => {
    it('should create red flag rule with valid token', async () => {
      const response = await request(app)
        .post('/api/v1/admin/red-flag-rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          ruleId: 'test-rule',
          severity: 'medium',
          title: 'Test Rule',
          description: 'This is a test rule',
          keywords: ['test', 'rule'],
          active: true,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.ruleId).toBe('test-rule');

      // Clean up
      await prisma.redFlagRule.delete({ where: { id: response.body.id } });
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .post('/api/v1/admin/red-flag-rules')
        .send({
          ruleId: 'test-rule-2',
          severity: 'high',
          title: 'Test Rule 2',
          description: 'This is another test rule',
          keywords: ['test'],
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/v1/admin/salary-benchmarks/import', () => {
    it('should bulk import salary benchmarks', async () => {
      const response = await request(app)
        .post('/api/v1/admin/salary-benchmarks/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          data: [
            {
              role: 'Bulk Test 1',
              experienceLevel: '0-1 years',
              city: 'Test City',
              minSalary: 3,
              avgSalary: 5,
              maxSalary: 7,
            },
            {
              role: 'Bulk Test 2',
              experienceLevel: '1-3 years',
              city: 'Test City',
              minSalary: 5,
              avgSalary: 8,
              maxSalary: 11,
            },
          ],
        })
        .expect(201);

      expect(response.body).toHaveProperty('imported', 2);
      expect(response.body).toHaveProperty('message');

      // Clean up
      await prisma.salaryBenchmark.deleteMany({
        where: {
          role: { in: ['Bulk Test 1', 'Bulk Test 2'] },
        },
      });
    });

    it('should reject invalid bulk data', async () => {
      const response = await request(app)
        .post('/api/v1/admin/salary-benchmarks/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          data: 'not an array',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/v1/admin/feature-requests/:id/status', () => {
    let testFeatureRequestId: string;

    beforeAll(async () => {
      // Create a test feature request
      const featureRequest = await prisma.featureRequest.create({
        data: {
          type: 'feature',
          title: 'Test Feature',
          description: 'Test description',
          status: 'submitted',
        },
      });
      testFeatureRequestId = featureRequest.id;
    });

    afterAll(async () => {
      await prisma.featureRequest.delete({ where: { id: testFeatureRequestId } }).catch(() => {});
    });

    it('should update feature request status', async () => {
      const response = await request(app)
        .put(`/api/v1/admin/feature-requests/${testFeatureRequestId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'in_progress',
          adminNote: 'Working on this',
        })
        .expect(200);

      expect(response.body.status).toBe('in_progress');
      expect(response.body.adminNote).toBe('Working on this');
    });

    it('should reject invalid status', async () => {
      const response = await request(app)
        .put(`/api/v1/admin/feature-requests/${testFeatureRequestId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'invalid_status',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});
