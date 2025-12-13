# OfferLens

> A privacy-first job offer analysis platform that helps candidates evaluate their offer letters, detect red flags, and negotiate better compensation.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

## 🌟 Features

- **🔒 Privacy-First**: Your offer letter data is never stored - analyzed in real-time and immediately discarded
- **🚩 Red Flag Detection**: Identifies problematic clauses like training bonds, non-compete agreements, and more
- **💰 Salary Benchmarking**: Compare your offer against market standards across 12 roles and 11 cities
- **💡 Negotiation Suggestions**: Get personalized tips to improve your offer
- **📄 OCR Support**: Upload PDF or image files - text extraction powered by OCR
- **📊 Take-Home Calculator**: Estimate your actual take-home salary after taxes
- **🎯 Feature Requests**: Request new roles, features, or report issues
- **📱 Responsive Design**: Works seamlessly on desktop, tablet, and mobile

## 🏗️ Architecture

OfferLens is built with a modern, scalable architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Vercel)                   │
│  - Vite + TypeScript                                        │
│  - Shadcn/ui + TailwindCSS                                  │
│  - React Router                                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS/REST API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                Express Backend (Railway)                     │
│  - Node.js 20 + TypeScript                                  │
│  - Prisma ORM                                               │
│  - Redis Caching                                            │
│  - JWT Authentication                                       │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
        ┌──────────────┐        ┌──────────────┐
        │ PostgreSQL   │        │    Redis     │
        │  Database    │        │    Cache     │
        └──────────────┘        └──────────────┘
```

**Key Design Decisions:**
- **Privacy-First**: Zero persistence of user offer data
- **Stateless API**: Enables horizontal scaling
- **Caching**: Redis for performance (80-90% cache hit rate)
- **Modern Stack**: TypeScript across the entire stack

📖 **Read more**: [Architecture Decision Records](./ARCHITECTURE_DECISIONS.md)

## 🚀 Quick Start

### Prerequisites

- **Node.js 20+** and **npm 10+**
- **Docker Desktop** (recommended) or PostgreSQL 15+ and Redis 7+
- **Git**

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/offerlens.git
   cd offerlens
   ```

2. **Backend Setup**
   ```bash
   cd offerlens-backend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm run db:init          # Start PostgreSQL and Redis with Docker
   npm run prisma:migrate   # Run database migrations
   npm run prisma:seed      # Seed initial data
   npm run dev              # Start backend at http://localhost:3001
   ```

3. **Frontend Setup** (in a new terminal)
   ```bash
   cd offerlens-frontend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm run dev              # Start frontend at http://localhost:5173
   ```

4. **Verify Setup**
   - Backend health check: `curl http://localhost:3001/api/v1/health`
   - Frontend: Open `http://localhost:5173` in your browser

📖 **Detailed guide**: [Local Development Setup](./LOCAL_DEVELOPMENT.md)

## 📚 Documentation

### Getting Started
- [Local Development Setup](./LOCAL_DEVELOPMENT.md) - Complete setup guide with troubleshooting
- [Frontend-Backend Integration](./FRONTEND_BACKEND_INTEGRATION.md) - API integration guide

### Deployment
- [Cloud Deployment Guide](./CLOUD_DEPLOYMENT_GUIDE.md) - Railway + Vercel deployment (recommended)
- [CI/CD Pipeline](./offerlens-backend/CI_CD.md) - Automated deployment setup

### Architecture & Design
- [Architecture Decision Records](./ARCHITECTURE_DECISIONS.md) - Key architectural decisions
- [API Documentation](./API_DOCUMENTATION.md) - Complete API reference

### Operations
- [Database Management](./DATABASE_MANAGEMENT.md) - Migrations, backups, scaling
- [Security Configuration](./SECURITY_CONFIGURATION.md) - Security best practices

### Component Documentation
- [Backend README](./offerlens-backend/README.md) - Backend-specific documentation
- [Frontend README](./offerlens-frontend/README.md) - Frontend-specific documentation

## 🛠️ Technology Stack

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS + Shadcn/ui
- **Routing**: React Router
- **HTTP Client**: Axios
- **State Management**: React Context + TanStack Query

### Backend
- **Runtime**: Node.js 20+
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma
- **Validation**: Zod
- **Logging**: Winston
- **Authentication**: JWT

### Database & Caching
- **Database**: PostgreSQL 15+
- **Cache**: Redis 7+
- **Migrations**: Prisma Migrate

### Infrastructure
- **Backend Hosting**: Railway (recommended)
- **Frontend Hosting**: Vercel (recommended)
- **CI/CD**: Railway + Vercel auto-deploy
- **Containerization**: Docker (optional)

## 📊 Project Structure

```
offerlens/
├── offerlens-backend/          # Backend API service
│   ├── src/
│   │   ├── controllers/        # HTTP request handlers
│   │   ├── services/           # Business logic
│   │   ├── middleware/         # Express middleware
│   │   ├── routes/             # API routes
│   │   ├── utils/              # Utility functions
│   │   └── config/             # Configuration
│   ├── prisma/                 # Database schema & migrations
│   ├── tests/                  # Test files
│   └── package.json
│
├── offerlens-frontend/         # Frontend React application
│   ├── src/
│   │   ├── components/         # React components
│   │   ├── pages/              # Page components
│   │   ├── lib/                # Utilities & helpers
│   │   ├── context/            # React context
│   │   └── hooks/              # Custom hooks
│   ├── public/                 # Static assets
│   └── package.json
│
├── .github/                    # GitHub Actions workflows (optional)
├── docs/                       # Additional documentation
└── README.md                   # This file
```

## 🧪 Testing

### Backend Tests
```bash
cd offerlens-backend
npm test                    # Run all tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

### Frontend Tests
```bash
cd offerlens-frontend
npm test                    # Run all tests
npm run test:watch          # Watch mode
```

## 🚢 Deployment

### Quick Deploy (Railway + Vercel)

**Backend (Railway):**
1. Sign up at [Railway](https://railway.app)
2. Create new project from GitHub repo
3. Add PostgreSQL and Redis plugins
4. Set environment variables
5. Deploy automatically on push to `main`

**Frontend (Vercel):**
1. Sign up at [Vercel](https://vercel.com)
2. Import GitHub repository
3. Set `VITE_API_URL` environment variable
4. Deploy automatically on push to `main`

📖 **Detailed guide**: [Cloud Deployment Guide](./CLOUD_DEPLOYMENT_GUIDE.md)

## 🔐 Security

- **Privacy-First**: No storage of user offer data
- **HTTPS Only**: All communication encrypted
- **Input Validation**: Zod schemas for all inputs
- **Rate Limiting**: Prevents API abuse
- **CORS**: Whitelist-based origin control
- **SQL Injection Prevention**: Parameterized queries via Prisma
- **XSS Prevention**: Input sanitization

📖 **Read more**: [Security Configuration](./SECURITY_CONFIGURATION.md)

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**
4. **Run tests**: `npm test`
5. **Commit your changes**: `git commit -m 'Add amazing feature'`
6. **Push to the branch**: `git push origin feature/amazing-feature`
7. **Open a Pull Request**

### Development Guidelines

- Follow the existing code style
- Write tests for new features
- Update documentation as needed
- Keep commits atomic and well-described
- Ensure all tests pass before submitting PR

📖 **Read more**: [Contributing Guidelines](./CONTRIBUTING.md) (coming soon)

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- **Salary Data**: Aggregated from public sources and industry reports
- **Red Flag Rules**: Compiled from employment law resources and community feedback
- **UI Components**: Built with [Shadcn/ui](https://ui.shadcn.com/)
- **Icons**: [Lucide Icons](https://lucide.dev/)

## 📧 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/offerlens/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/offerlens/discussions)
- **Email**: support@offerlens.com

## 🗺️ Roadmap

### Phase 1: MVP (Current)
- [x] Basic offer analysis
- [x] Red flag detection
- [x] Salary comparison
- [x] Feature request system
- [x] OCR support

### Phase 2: Enhanced Features
- [ ] AI-powered analysis (LLM integration)
- [ ] Multi-language support
- [ ] Offer comparison tool
- [ ] Email reports
- [ ] Mobile app

### Phase 3: Community
- [ ] Public feedback forum
- [ ] User accounts (optional)
- [ ] Saved analyses
- [ ] Community-contributed rules

## 📈 Stats

- **12 Roles**: Software Engineer, Data Scientist, Product Manager, and more
- **11 Cities**: Bangalore, Mumbai, Delhi, Hyderabad, and more
- **5 Experience Levels**: 0-1, 1-3, 3-5, 5-10, 10+ years
- **8 Red Flag Categories**: Training bonds, non-compete, notice periods, and more
- **660 Salary Benchmarks**: Comprehensive market data

---

**Built with ❤️ for job seekers everywhere**

*Making job offers transparent, one analysis at a time.*
