# OfferLens Next.js Frontend

Modern Next.js 16 + React 19 frontend for OfferLens, featuring server-side rendering, optimized performance, and enhanced user experience.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **React**: React 19
- **TypeScript**: Full type safety
- **Styling**: Tailwind CSS 4
- **State Management**: TanStack Query (React Query)
- **HTTP Client**: Axios
- **Animations**: Framer Motion
- **Testing**: Jest + React Testing Library + fast-check (Property-Based Testing)
- **Code Quality**: ESLint + Prettier

## Getting Started

### Prerequisites

- Node.js 18+ or 20+
- pnpm (recommended) or npm

### Installation

1. Install dependencies:

```bash
pnpm install
# or
npm install
```

2. Set up environment variables:

```bash
cp .env.example .env.local
```

Edit `.env.local` and update the values:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_ENABLE_ANALYTICS=false
```

### Development

Run the development server:

```bash
pnpm dev
# or
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Building for Production

```bash
pnpm build
pnpm start
```

## Project Structure

```
offerlens-frontend(new)/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Home page
│   ├── upload/            # Upload page
│   ├── results/           # Results page
│   ├── forum/             # Forum page
│   └── feature-request/   # Feature request page
├── components/            # React components
│   ├── animations/        # Framer Motion components
│   ├── ui/               # Shared UI components
│   └── ...               # Feature-specific components
├── lib/                   # Utilities and services
│   ├── api/              # API client and endpoints
│   ├── services/         # Business logic services
│   └── utils.ts          # Utility functions
├── hooks/                 # Custom React hooks
├── __tests__/            # Test files
│   ├── unit/             # Unit tests
│   └── properties/       # Property-based tests
└── public/               # Static assets
```

## Testing

### Run all tests:

```bash
pnpm test
```

### Run tests in watch mode:

```bash
pnpm test:watch
```

### Run tests with coverage:

```bash
pnpm test:coverage
```

### Property-Based Testing

This project uses `fast-check` for property-based testing. Property tests verify that universal properties hold across all inputs, complementing traditional unit tests.

Example property test:

```typescript
import fc from "fast-check";

test("API requests always use configured base URL", () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1 }), (endpoint) => {
      const fullUrl = buildUrl(endpoint);
      expect(fullUrl).toStartWith(process.env.NEXT_PUBLIC_API_URL);
    }),
    { numRuns: 100 }
  );
});
```

## Code Quality

### Linting

```bash
pnpm lint
pnpm lint:fix
```

### Formatting

```bash
pnpm format
pnpm format:check
```

## Environment Variables

### Development (.env.local)

- `NEXT_PUBLIC_API_URL`: Backend API URL (default: http://localhost:3001/api/v1)
- `NEXT_PUBLIC_ENABLE_ANALYTICS`: Enable analytics (default: false)

### Production (.env.production)

Set these in Vercel:

- `NEXT_PUBLIC_API_URL`: Production backend URL
- `NEXT_PUBLIC_VERCEL_ANALYTICS_ID`: Vercel Analytics ID
- `NEXT_PUBLIC_ENABLE_ANALYTICS`: Enable analytics (true)

## Deployment

This project is optimized for deployment on Vercel with automatic deployments, preview environments, and production-ready configuration.

### Quick Deploy to Vercel

1. **Push to GitHub**
   ```bash
   git push origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your repository
   - Vercel auto-detects Next.js configuration

3. **Configure Environment Variables**
   
   In Vercel dashboard (Settings → Environment Variables):
   
   **Production:**
   ```env
   NEXT_PUBLIC_API_URL=https://api.offerlens.com
   NEXT_PUBLIC_APP_URL=https://offerlens.com
   NEXT_PUBLIC_ENABLE_ANALYTICS=true
   ```
   
   **Preview:**
   ```env
   NEXT_PUBLIC_API_URL=https://offerlens-backend-staging.railway.app
   NEXT_PUBLIC_APP_URL=https://offerlens-staging.vercel.app
   NEXT_PUBLIC_ENABLE_ANALYTICS=false
   ```

4. **Deploy**
   - Click "Deploy"
   - Wait for build (~2-3 minutes)
   - Get your deployment URL

### Automatic Deployments

- **Production**: Automatic on push to `main` branch
- **Preview**: Automatic for all pull requests
- **Rollback**: One-click rollback to any previous deployment

### Custom Domain

1. Add domain in Vercel: Settings → Domains
2. Configure DNS records at your registrar
3. Vercel automatically provisions SSL certificate
4. Update backend CORS to allow your domain

### Monitoring

Vercel provides built-in monitoring:
- **Analytics**: Traffic, visitors, page views
- **Speed Insights**: Core Web Vitals, performance metrics
- **Logs**: Real-time application logs
- **Errors**: Automatic error tracking

### Documentation

For detailed deployment instructions, see:
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Complete deployment guide
- [MONITORING.md](./MONITORING.md) - Monitoring and alerts setup
- [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) - Pre-deployment checklist
- [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) - Environment variables reference

### Performance Targets

- **Lighthouse Score**: > 90 (Performance, Accessibility, Best Practices, SEO)
- **Core Web Vitals**:
  - LCP (Largest Contentful Paint): < 2.5s
  - FID (First Input Delay): < 100ms
  - CLS (Cumulative Layout Shift): < 0.1

Run performance audit:
```bash
npm run lighthouse        # Local audit
npm run lighthouse:prod   # Production audit
```

## Features

- ✅ Server-Side Rendering (SSR) for SEO
- ✅ Static Site Generation (SSG) for marketing pages
- ✅ Client-Side Rendering (CSR) for interactive features
- ✅ Optimized image loading with Next.js Image
- ✅ API caching with TanStack Query
- ✅ Smooth animations with Framer Motion
- ✅ Dark/Light theme support
- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Accessibility (WCAG 2.1 AA)
- ✅ Property-based testing for correctness
- ✅ Type-safe API client with retry logic

## Migration from Vite

This is a migration from the Vite + React SPA to Next.js. Key improvements:

- **Better SEO**: Server-side rendering for search engines
- **Faster Load Times**: Optimized code splitting and prefetching
- **Improved UX**: Smooth page transitions and loading states
- **Modern Stack**: React 19, Next.js 16, TypeScript 5
- **Better DX**: Fast refresh, better error messages, integrated tooling

## Contributing

1. Follow the existing code style (enforced by ESLint + Prettier)
2. Write tests for new features
3. Update documentation as needed
4. Ensure all tests pass before submitting PR

## License

Proprietary - OfferLens
