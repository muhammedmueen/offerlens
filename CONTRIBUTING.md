# Contributing to OfferLens

Thank you for your interest in contributing to OfferLens! We welcome contributions from the community and are grateful for your support.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Guidelines](#coding-guidelines)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to support@offerlens.com.

## How Can I Contribute?

### 1. Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- **Screenshots** (if applicable)
- **Environment details** (OS, browser, Node.js version)
- **Error messages** or logs

**Use the bug report template:**

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
- OS: [e.g., Windows 11, macOS 13]
- Browser: [e.g., Chrome 120, Firefox 121]
- Node.js: [e.g., 20.10.0]
- Version: [e.g., 1.0.0]

**Additional context**
Any other relevant information.
```

### 2. Suggesting Features

We love feature suggestions! Before creating a feature request:

- Check if the feature already exists
- Check if someone else has suggested it
- Consider if it aligns with the project's goals

**Use the feature request template:**

```markdown
**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution you'd like**
A clear description of what you want to happen.

**Describe alternatives you've considered**
Alternative solutions or features you've considered.

**Additional context**
Any other context, mockups, or examples.
```

### 3. Contributing Code

We welcome code contributions! Here's how:

1. **Fork the repository**
2. **Create a feature branch** from `main`
3. **Make your changes**
4. **Write or update tests**
5. **Update documentation**
6. **Submit a pull request**

## Development Setup

### Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (recommended)
- Git

### Setup Steps

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/offerlens.git
   cd offerlens
   ```

2. **Set up the backend**
   ```bash
   cd offerlens-backend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm run db:init
   npm run prisma:migrate
   npm run prisma:seed
   npm run dev
   ```

3. **Set up the frontend** (in a new terminal)
   ```bash
   cd offerlens-frontend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm run dev
   ```

4. **Verify setup**
   - Backend: `curl http://localhost:3001/api/v1/health`
   - Frontend: Open `http://localhost:5173`

📖 **Detailed guide**: [Local Development Setup](./LOCAL_DEVELOPMENT.md)

## Coding Guidelines

### General Principles

- **Keep it simple**: Write clear, readable code
- **Follow existing patterns**: Match the style of existing code
- **Write tests**: All new features should have tests
- **Document your code**: Add comments for complex logic
- **Think about privacy**: Never log or store sensitive user data

### TypeScript

- Use TypeScript for all new code
- Define proper types (avoid `any`)
- Use interfaces for object shapes
- Use enums for fixed sets of values

```typescript
// Good
interface AnalysisRequest {
  offerText: string;
  role: string;
  experience: string;
  ctc: number;
  city: string;
}

// Bad
function analyze(data: any) { ... }
```

### React Components

- Use functional components with hooks
- Keep components small and focused
- Extract reusable logic into custom hooks
- Use TypeScript for props

```typescript
// Good
interface SalaryMeterProps {
  offered: number;
  min: number;
  avg: number;
  max: number;
  comparison: 'below' | 'aligned' | 'above';
}

export function SalaryMeter({ offered, min, avg, max, comparison }: SalaryMeterProps) {
  // Component logic
}
```

### Backend Code

- Keep controllers thin (5-10 lines per action)
- Put business logic in services
- Use Prisma for database access
- Validate all inputs with Zod

```typescript
// Good - Thin controller
export async function analyzeOffer(req: Request, res: Response) {
  const data = AnalysisRequestSchema.parse(req.body);
  const result = await analysisService.analyze(data);
  res.json(result);
}

// Good - Business logic in service
class AnalysisService {
  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    const redFlags = await this.detectRedFlags(request.offerText);
    const salary = await this.compareSalary(request);
    return { redFlags, salaryComparison: salary };
  }
}
```

### Naming Conventions

- **Files**: kebab-case (`analysis-service.ts`)
- **Components**: PascalCase (`SalaryMeter.tsx`)
- **Functions**: camelCase (`detectRedFlags`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_FILE_SIZE`)
- **Interfaces**: PascalCase with `I` prefix optional (`AnalysisRequest`)

### Code Style

We use ESLint and Prettier for code formatting:

```bash
# Backend
cd offerlens-backend
npm run lint
npm run format

# Frontend
cd offerlens-frontend
npm run lint
npm run format
```

**Run before committing!**

## Commit Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, no logic change)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
feat(analysis): add support for equity compensation

Add ability to analyze equity grants including RSUs and stock options.
Includes salary comparison adjustments for total compensation.

Closes #123

---

fix(upload): handle corrupted PDF files gracefully

Previously, corrupted PDFs would crash the server. Now we catch the
error and return a user-friendly message.

Fixes #456

---

docs(readme): update deployment instructions

Add Railway deployment steps and troubleshooting section.

---

test(analysis): add property-based tests for red flag detection

Add fast-check tests to verify red flag detection across random inputs.
```

### Commit Message Rules

- Use present tense ("add feature" not "added feature")
- Use imperative mood ("move cursor to..." not "moves cursor to...")
- First line should be 50 characters or less
- Reference issues and pull requests when relevant
- Explain *what* and *why*, not *how*

## Pull Request Process

### Before Submitting

1. **Update your branch**
   ```bash
   git checkout main
   git pull upstream main
   git checkout your-feature-branch
   git rebase main
   ```

2. **Run tests**
   ```bash
   # Backend
   cd offerlens-backend
   npm test
   npm run lint
   npm run type-check

   # Frontend
   cd offerlens-frontend
   npm test
   npm run lint
   npm run type-check
   ```

3. **Update documentation**
   - Update README if needed
   - Add/update code comments
   - Update API documentation if applicable

4. **Test manually**
   - Test your changes in the browser
   - Test edge cases
   - Test error scenarios

### Submitting the PR

1. **Push your branch**
   ```bash
   git push origin your-feature-branch
   ```

2. **Create pull request on GitHub**
   - Use a clear, descriptive title
   - Fill out the PR template
   - Link related issues
   - Add screenshots for UI changes

3. **PR template**
   ```markdown
   ## Description
   Brief description of changes.

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## How Has This Been Tested?
   Describe the tests you ran.

   ## Checklist
   - [ ] My code follows the project's style guidelines
   - [ ] I have performed a self-review
   - [ ] I have commented my code where necessary
   - [ ] I have updated the documentation
   - [ ] My changes generate no new warnings
   - [ ] I have added tests that prove my fix/feature works
   - [ ] New and existing tests pass locally
   - [ ] Any dependent changes have been merged

   ## Screenshots (if applicable)
   Add screenshots here.

   ## Related Issues
   Closes #123
   ```

### Review Process

1. **Automated checks** run (linting, tests, build)
2. **Maintainers review** your code
3. **Address feedback** if requested
4. **Approval** from at least one maintainer
5. **Merge** by maintainer

### After Merge

- Delete your feature branch
- Update your local repository
- Celebrate! 🎉

## Testing Guidelines

### Unit Tests

Write unit tests for:
- Business logic functions
- Utility functions
- Service methods
- Complex calculations

```typescript
describe('detectRedFlags', () => {
  it('should detect training bond clause', () => {
    const text = 'You must serve for 2 years or pay Rs. 2,00,000';
    const flags = detectRedFlags(text);
    expect(flags).toContainEqual(expect.objectContaining({
      id: 'training-bond',
      severity: 'high'
    }));
  });
});
```

### Integration Tests

Write integration tests for:
- API endpoints
- Database operations
- External service integrations

```typescript
describe('POST /api/v1/analyze', () => {
  it('should return analysis results', async () => {
    const response = await request(app)
      .post('/api/v1/analyze')
      .send(validAnalysisRequest)
      .expect(200);
    
    expect(response.body).toHaveProperty('redFlags');
    expect(response.body).toHaveProperty('salaryComparison');
  });
});
```

### Test Coverage

- Aim for 80%+ code coverage
- Focus on critical paths
- Test edge cases
- Test error scenarios

## Documentation

### Code Comments

```typescript
/**
 * Detects red flags in offer letter text.
 * 
 * @param offerText - The full text of the offer letter
 * @param rules - Array of red flag detection rules
 * @returns Array of detected red flags with severity and excerpts
 */
function detectRedFlags(offerText: string, rules: RedFlagRule[]): DetectedRedFlag[] {
  // Implementation
}
```

### README Updates

Update README when:
- Adding new features
- Changing setup process
- Adding new dependencies
- Changing configuration

### API Documentation

Update API docs when:
- Adding new endpoints
- Changing request/response formats
- Adding new parameters
- Changing authentication

## Getting Help

- **Questions**: [GitHub Discussions](https://github.com/yourusername/offerlens/discussions)
- **Chat**: [Discord Server](https://discord.gg/offerlens) (if available)
- **Email**: support@offerlens.com

## Recognition

Contributors will be:
- Listed in the project README
- Mentioned in release notes
- Given credit in commit history

Thank you for contributing to OfferLens! 🙏

---

**Happy coding!** 🚀
