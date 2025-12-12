import { featureRequestService } from '../feature-request.service';
import prisma from '../../lib/prisma';

/**
 * Feature Request Service Tests
 * Requirements: 3.3, 14.2, 14.3
 */

describe('FeatureRequestService', () => {
  // Clean up test data after each test
  afterEach(async () => {
    await prisma.featureRequestVote.deleteMany({});
    await prisma.featureRequest.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('create', () => {
    it('should create a feature request with all fields', async () => {
      const data = {
        type: 'feature' as const,
        title: 'Add dark mode',
        description: 'Please add a dark mode option to the application',
        userEmail: 'user@example.com',
      };

      const result = await featureRequestService.create(data);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.type).toBe(data.type);
      expect(result.title).toBe(data.title);
      expect(result.description).toBe(data.description);
      expect(result.userEmail).toBe(data.userEmail);
      expect(result.status).toBe('submitted');
      expect(result.votes).toBe(0);
    });

    it('should create a feature request without email', async () => {
      const data = {
        type: 'role' as const,
        title: 'Add Data Scientist role',
        description: 'Please add salary data for Data Scientists',
      };

      const result = await featureRequestService.create(data);

      expect(result).toBeDefined();
      expect(result.userEmail).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      // Create test data
      await prisma.featureRequest.createMany({
        data: [
          {
            type: 'feature',
            title: 'Feature 1',
            description: 'Description 1',
            status: 'submitted',
            votes: 5,
          },
          {
            type: 'role',
            title: 'Role 1',
            description: 'Description 2',
            status: 'under_review',
            votes: 10,
          },
          {
            type: 'issue',
            title: 'Issue 1',
            description: 'Description 3',
            status: 'submitted',
            votes: 3,
          },
        ],
      });
    });

    it('should return all feature requests with pagination', async () => {
      const result = await featureRequestService.findAll();

      expect(result.data).toHaveLength(3);
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(20);
    });

    it('should filter by status', async () => {
      const result = await featureRequestService.findAll({ status: 'submitted' });

      expect(result.data).toHaveLength(2);
      expect(result.data.every((fr) => fr.status === 'submitted')).toBe(true);
    });

    it('should filter by type', async () => {
      const result = await featureRequestService.findAll({ type: 'role' });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].type).toBe('role');
    });

    it('should paginate results', async () => {
      const result = await featureRequestService.findAll({ page: 1, limit: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.pagination.totalPages).toBe(2);
    });
  });

  describe('findById', () => {
    it('should return a feature request by ID', async () => {
      const created = await prisma.featureRequest.create({
        data: {
          type: 'feature',
          title: 'Test Feature',
          description: 'Test Description',
        },
      });

      const result = await featureRequestService.findById(created.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(created.id);
      expect(result?.title).toBe(created.title);
    });

    it('should return null for non-existent ID', async () => {
      const result = await featureRequestService.findById('00000000-0000-0000-0000-000000000000');

      expect(result).toBeNull();
    });
  });

  describe('vote', () => {
    let featureRequestId: string;

    beforeEach(async () => {
      const created = await prisma.featureRequest.create({
        data: {
          type: 'feature',
          title: 'Test Feature',
          description: 'Test Description',
        },
      });
      featureRequestId = created.id;
    });

    it('should record a vote and increment count', async () => {
      const result = await featureRequestService.vote(featureRequestId, '192.168.1.1');

      expect(result.success).toBe(true);

      // Verify vote was recorded
      const featureRequest = await prisma.featureRequest.findUnique({
        where: { id: featureRequestId },
      });
      expect(featureRequest?.votes).toBe(1);

      // Verify vote record exists
      const voteRecord = await prisma.featureRequestVote.findUnique({
        where: {
          featureRequestId_ipAddress: {
            featureRequestId,
            ipAddress: '192.168.1.1',
          },
        },
      });
      expect(voteRecord).toBeDefined();
    });

    it('should prevent duplicate votes from same IP', async () => {
      // First vote
      await featureRequestService.vote(featureRequestId, '192.168.1.1');

      // Second vote from same IP
      const result = await featureRequestService.vote(featureRequestId, '192.168.1.1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('already voted');

      // Verify vote count is still 1
      const featureRequest = await prisma.featureRequest.findUnique({
        where: { id: featureRequestId },
      });
      expect(featureRequest?.votes).toBe(1);
    });

    it('should allow votes from different IPs', async () => {
      await featureRequestService.vote(featureRequestId, '192.168.1.1');
      await featureRequestService.vote(featureRequestId, '192.168.1.2');

      const featureRequest = await prisma.featureRequest.findUnique({
        where: { id: featureRequestId },
      });
      expect(featureRequest?.votes).toBe(2);
    });
  });

  describe('updateStatus', () => {
    it('should update feature request status', async () => {
      const created = await prisma.featureRequest.create({
        data: {
          type: 'feature',
          title: 'Test Feature',
          description: 'Test Description',
        },
      });

      const result = await featureRequestService.updateStatus(
        created.id,
        'under_review',
        'We are reviewing this request'
      );

      expect(result.status).toBe('under_review');
      expect(result.adminNote).toBe('We are reviewing this request');
    });
  });
});

