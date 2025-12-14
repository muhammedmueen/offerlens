# OfferLens

> AI-powered job offer analysis platform helping professionals make informed career decisions.

[![Production Status](https://img.shields.io/badge/status-production-green)]()
[![Next.js](https://img.shields.io/badge/Next.js-16-black)]()
[![Node.js](https://img.shields.io/badge/Node.js-20-green)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)]()

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/offerlens.git
cd offerlens

# Backend setup
cd offerlens-backend
npm install
npm run dev

# Frontend setup (in new terminal)
cd offerlens-frontend(new)
npm install
npm run dev
```

Visit `http://localhost:3000` to see the application.

---

## 📚 Documentation

**All documentation has been organized into the [`documentation/`](./documentation/) folder.**

### Quick Links

#### 🎯 Getting Started
- **[Project Overview](./documentation/01-getting-started/README.md)** - Start here!
- **[Local Development Setup](./documentation/01-getting-started/LOCAL_DEVELOPMENT.md)** - Set up your dev environment
- **[Contributing Guidelines](./documentation/01-getting-started/CONTRIBUTING.md)** - How to contribute
- **[Code of Conduct](./documentation/01-getting-started/CODE_OF_CONDUCT.md)** - Community standards

#### 🚀 Deployment
- **[Backend Deployment](./documentation/03-deployment/BACKEND_DEPLOYMENT.md)** - Deploy backend to Railway
- **[Frontend Deployment](./documentation/03-deployment/FRONTEND_DEPLOYMENT.md)** - Deploy frontend to Vercel
- **[Deployment Steps](./documentation/03-deployment/FRONTEND_DEPLOYMENT_STEPS.md)** - Step-by-step guide

#### 💻 Development
- **[AI Code Standards](./documentation/02-development/AGENTS.md)** - AI code generation guidelines
- **[Frontend-Backend Integration](./documentation/02-development/FRONTEND_BACKEND_INTEGRATION.md)** - Integration guide
- **[Database Management](./documentation/02-development/DATABASE_MANAGEMENT.md)** - Database operations

#### 📖 Architecture
- **[API Documentation](./documentation/05-architecture/API_DOCUMENTATION.md)** - API reference
- **[Architecture Decisions](./documentation/05-architecture/ARCHITECTURE_DECISIONS.md)** - Design rationale
- **[Database Schema](./documentation/05-architecture/DATABASE_SCHEMA.md)** - Database design

### Full Documentation Index

Browse the complete documentation structure:

```
documentation/
├── 01-getting-started/    # Essential files to get started
├── 02-development/        # Development guides and standards
├── 03-deployment/         # Deployment guides for both services
├── 04-operations/         # Operational procedures and monitoring
├── 05-architecture/       # System architecture and design
├── 06-backend/           # Backend service documentation
├── 07-frontend/          # Frontend application documentation
├── 08-specs/             # Feature specifications
└── 09-analysis/          # Analysis reports
```

**[📚 View Full Documentation Index →](./documentation/README.md)**

---

## 🏗️ Project Structure

```
offerlens/
├── offerlens-backend/          # Node.js/Express backend
│   ├── src/                    # Source code
│   ├── prisma/                 # Database schema
│   └── package.json
│
├── offerlens-frontend(new)/    # Next.js 16 frontend
│   ├── app/                    # Next.js app router
│   ├── components/             # React components
│   ├── lib/                    # Utilities and API client
│   └── package.json
│
├── offerlens-frontend/         # Legacy Vite frontend (deprecated)
│
└── documentation/              # All project documentation
    ├── 01-getting-started/
    ├── 02-development/
    ├── 03-deployment/
    ├── 04-operations/
    ├── 05-architecture/
    ├── 06-backend/
    ├── 07-frontend/
    ├── 08-specs/
    └── 09-analysis/
```

---

## 🎯 Features

- **📄 Offer Analysis** - Upload and analyze job offer letters
- **🚩 Red Flag Detection** - Identify concerning clauses
- **💰 Salary Comparison** - Compare against market benchmarks
- **💡 Negotiation Tips** - Get personalized negotiation strategies
- **📊 Take-Home Calculator** - Calculate actual take-home salary
- **🌙 Dark Mode** - Beautiful light and dark themes
- **📱 Responsive** - Works on desktop, tablet, and mobile
- **♿ Accessible** - WCAG 2.1 AA compliant

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** Next.js 16 (App Router)
- **UI Library:** React 19
- **Styling:** Tailwind CSS
- **Components:** Radix UI, shadcn/ui
- **Animations:** Framer Motion
- **State:** TanStack Query, React Context
- **Forms:** React Hook Form + Zod
- **Testing:** Jest, React Testing Library

### Backend
- **Runtime:** Node.js 20
- **Framework:** Express.js
- **Database:** PostgreSQL (Prisma ORM)
- **Cache:** Redis
- **Authentication:** JWT
- **Validation:** Zod
- **Testing:** Jest

### Infrastructure
- **Frontend Hosting:** Vercel
- **Backend Hosting:** Railway
- **Database:** Railway PostgreSQL
- **Cache:** Railway Redis
- **CI/CD:** GitHub Actions
- **Monitoring:** Vercel Analytics, Railway Metrics

---

## 📊 Project Status

- ✅ **Backend:** Deployed and operational on Railway
- ✅ **Frontend:** Next.js migration complete, ready for deployment
- ✅ **Database:** PostgreSQL with Prisma ORM
- ✅ **Cache:** Redis configured
- ✅ **Tests:** 63/63 passing
- ✅ **Documentation:** Organized and comprehensive
- 🚀 **Status:** Production ready

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](./documentation/01-getting-started/CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)
- Deployed on [Vercel](https://vercel.com/) and [Railway](https://railway.app/)

---

## 📞 Support

- **Documentation:** [documentation/](./documentation/)
- **Issues:** [GitHub Issues](https://github.com/yourusername/offerlens/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/offerlens/discussions)

---

## 🗺️ Roadmap

- [x] Backend API development
- [x] Frontend migration to Next.js
- [x] Production deployment setup
- [x] Documentation organization
- [ ] Custom domain configuration
- [ ] Advanced analytics
- [ ] Mobile app (React Native)
- [ ] API v2 with GraphQL

---

**Made with ❤️ by the OfferLens Team**

[Documentation](./documentation/) • [Contributing](./documentation/01-getting-started/CONTRIBUTING.md) • [License](./LICENSE)
