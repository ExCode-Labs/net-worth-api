# NetWorth API - NestJS Setup

## Project Overview

This is a NestJS backend API for the NetWorth personal finance management app.

**Tech Stack:**
- **Framework:** NestJS with TypeScript
- **Database:** Neon PostgreSQL (Phase 1) / Local PostgreSQL for dev
- **Authentication:** Clerk JWT verification (Phase 2)
- **ORM:** TypeORM or Prisma (to be configured)
- **API Documentation:** Swagger/OpenAPI
- **Queue:** BullMQ + Redis (Phase 2)
- **Testing:** Jest

## Project Structure

```
api/
├── src/
│   ├── main.ts                   # Application entry point
│   ├── app.module.ts             # Root module
│   ├── app.controller.ts          # Root controller (health check)
│   ├── app.service.ts             # Root service
│   │
│   ├── modules/                  # Feature modules (organized by domain)
│   │   ├── auth/                 # Authentication (Phase 1)
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── strategies/
│   │   │
│   │   ├── users/                # User management
│   │   │   ├── users.module.ts
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   └── entities/
│   │   │
│   │   ├── accounts/             # Bank accounts
│   │   │   ├── accounts.module.ts
│   │   │   ├── accounts.controller.ts
│   │   │   ├── accounts.service.ts
│   │   │   └── entities/
│   │   │
│   │   ├── cards/                # Credit cards
│   │   │   ├── cards.module.ts
│   │   │   ├── cards.controller.ts
│   │   │   ├── cards.service.ts
│   │   │   └── entities/
│   │   │
│   │   ├── assets/               # Assets (investments, property, etc.)
│   │   │   ├── assets.module.ts
│   │   │   ├── assets.controller.ts
│   │   │   ├── assets.service.ts
│   │   │   └── entities/
│   │   │
│   │   ├── liabilities/          # Loans, EMIs, credit card debt
│   │   │   ├── liabilities.module.ts
│   │   │   ├── liabilities.controller.ts
│   │   │   ├── liabilities.service.ts
│   │   │   └── entities/
│   │   │
│   │   ├── transactions/         # Income/Expense tracking
│   │   │   ├── transactions.module.ts
│   │   │   ├── transactions.controller.ts
│   │   │   ├── transactions.service.ts
│   │   │   └── entities/
│   │   │
│   │   ├── networth/             # Net-worth calculations & snapshots
│   │   │   ├── networth.module.ts
│   │   │   ├── networth.controller.ts
│   │   │   ├── networth.service.ts
│   │   │   └── entities/
│   │   │
│   │   └── analytics/            # Analytics & reports
│   │       ├── analytics.module.ts
│   │       ├── analytics.controller.ts
│   │       └── analytics.service.ts
│   │
│   ├── common/                   # Shared utilities
│   │   ├── filters/              # Exception filters
│   │   ├── guards/               # Auth guards, custom guards
│   │   ├── interceptors/         # Response interceptors
│   │   ├── pipes/                # Validation pipes
│   │   ├── decorators/           # Custom decorators
│   │   └── constants/            # App constants
│   │
│   ├── database/                 # Database configuration
│   │   ├── database.module.ts
│   │   ├── typeorm.config.ts     # TypeORM config
│   │   └── migrations/           # Database migrations
│   │
│   └── config/                   # Configuration management
│       ├── app.config.ts
│       ├── database.config.ts
│       ├── jwt.config.ts
│       └── env.ts                # Environment variables validation
│
├── test/                         # End-to-end tests
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
│
├── .env.example                  # Environment variables template
├── .env                          # Local environment variables (git-ignored)
├── nest-cli.json                 # NestJS CLI configuration
├── tsconfig.json                 # TypeScript configuration
├── package.json                  # Dependencies
├── SETUP.md                      # This file
└── README.md                     # Generated README
```

## Installation & Setup

### Prerequisites
- Node.js (v18+)
- npm or yarn
- PostgreSQL locally (dev) or Neon account (production)
- Redis (Phase 2, for BullMQ)

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

**`.env` template:**
```env
# App
NODE_ENV=development
PORT=3000
API_PREFIX=api/v1

# Database (Local PostgreSQL for dev)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=networth_dev

# Or use Neon PostgreSQL
DATABASE_URL=postgresql://user:password@region.neon.tech/dbname

# JWT (Phase 2 - Clerk)
JWT_SECRET=your_secret_key
JWT_EXPIRATION=24h

# Clerk (Phase 2)
CLERK_FRONTEND_API=your_clerk_api
CLERK_API_KEY=your_clerk_key

# Redis (Phase 2)
REDIS_URL=redis://localhost:6379

# Email (Phase 2)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email
SMTP_PASS=your_password

# Logging
LOG_LEVEL=debug
```

### 3. Database Setup

```bash
# Create local PostgreSQL database (if using local)
createdb networth_dev

# Run migrations (when available)
npm run migration:run

# Seed initial data (optional)
npm run seed
```

### 4. Start Development Server

```bash
npm run start:dev
```

Server runs on `http://localhost:3000`

API documentation: `http://localhost:3000/api` (Swagger)

## API Endpoints (Phase 1)

### Authentication (Phase 2)
```
POST /api/v1/auth/register     - Register new user
POST /api/v1/auth/login        - Login user
POST /api/v1/auth/guest        - Guest login
POST /api/v1/auth/refresh      - Refresh token
```

### Users
```
GET  /api/v1/users/me          - Get current user
PATCH /api/v1/users/:id        - Update user
DELETE /api/v1/users/:id       - Delete user account
```

### Accounts
```
GET    /api/v1/accounts        - List all accounts
POST   /api/v1/accounts        - Create account
GET    /api/v1/accounts/:id    - Get account details
PUT    /api/v1/accounts/:id    - Update account
DELETE /api/v1/accounts/:id    - Delete account
POST   /api/v1/accounts/:id/merge - Merge duplicate accounts
GET    /api/v1/accounts/:id/snapshots - Balance history
```

### Cards
```
GET    /api/v1/cards           - List all cards
POST   /api/v1/cards           - Create card
GET    /api/v1/cards/:id       - Get card details
PUT    /api/v1/cards/:id       - Update card
DELETE /api/v1/cards/:id       - Delete card
```

### Assets
```
GET    /api/v1/assets          - List all assets
POST   /api/v1/assets          - Create asset
GET    /api/v1/assets/:id      - Get asset details
PUT    /api/v1/assets/:id      - Update asset
DELETE /api/v1/assets/:id      - Delete asset
POST   /api/v1/assets/:id/valuations - Add asset valuation
GET    /api/v1/assets/:id/valuations - Get valuation history
```

### Liabilities
```
GET    /api/v1/liabilities     - List all liabilities
POST   /api/v1/liabilities     - Create liability
GET    /api/v1/liabilities/:id - Get liability details
PUT    /api/v1/liabilities/:id - Update liability
DELETE /api/v1/liabilities/:id - Delete liability
GET    /api/v1/liabilities/:id/schedule - Due schedule
```

### Transactions
```
GET    /api/v1/transactions    - List transactions (with filters)
POST   /api/v1/transactions    - Create transaction
GET    /api/v1/transactions/:id - Get transaction details
PUT    /api/v1/transactions/:id - Update transaction
DELETE /api/v1/transactions/:id - Delete transaction
POST   /api/v1/transactions/bulk - Bulk import
POST   /api/v1/transactions/:id/categorize - Categorize
GET    /api/v1/transactions/review - Review inbox
```

### Net Worth
```
GET    /api/v1/networth/current - Get current net worth
GET    /api/v1/networth/history - Historical snapshots
GET    /api/v1/networth/allocation - Asset/liability breakdown
```

### Analytics
```
GET    /api/v1/analytics/summary - Dashboard summary
GET    /api/v1/analytics/spend - Spending analytics
GET    /api/v1/analytics/income - Income analytics
GET    /api/v1/analytics/comparisons - Period comparisons
GET    /api/v1/analytics/insights - AI-generated insights
```

## Response Format

All API responses follow a consistent format:

**Success (200):**
```json
{
  "statusCode": 200,
  "message": "Success",
  "data": { ... }
}
```

**Paginated:**
```json
{
  "statusCode": 200,
  "message": "Success",
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

**Error (400/500):**
```json
{
  "statusCode": 400,
  "message": "Validation error",
  "code": "VALIDATION_ERROR",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email"
    }
  ]
}
```

## Authentication (Phase 2)

### Clerk Integration
- JWT verification via Clerk
- Automatic user creation on first login
- Built-in refresh token handling
- Session management

### Implementation
1. Install Clerk: `npm install @clerk/backend`
2. Create `jwt.strategy.ts` for Clerk JWT verification
3. Add `@UseGuards(JwtAuthGuard)` to protected routes
4. Clerk user ID automatically scoped to queries

## Database Design

### Key Tables
- `users` - User accounts
- `accounts` - Bank accounts
- `account_balance_snapshots` - Balance history
- `cards` - Credit cards
- `assets` - Investments, property, etc.
- `asset_valuations` - Asset valuation history
- `liabilities` - Loans, EMIs, credit card debt
- `liability_schedules` - Due dates
- `transactions` - Income/Expense entries
- `net_worth_snapshots` - Daily net-worth records

See `PRODUCT_PLAN.md` section 8 for full database schema.

## Development Workflow

### Create New Module

```bash
nest g module modules/feature-name
nest g service modules/feature-name
nest g controller modules/feature-name
```

### Create Entity

```bash
nest g class modules/feature-name/entities/feature-name.entity
```

### Generate Migration

```bash
npm run typeorm migration:generate -- -n CreateFeatureTable
npm run migration:run
```

### Running Tests

```bash
npm run test              # Unit tests
npm run test:watch       # Watch mode
npm run test:cov         # Coverage
npm run test:e2e         # E2E tests
```

## Logging & Monitoring

### Built-in Logging
```typescript
private readonly logger = new Logger(SomeService.name);

this.logger.log('Message');
this.logger.warn('Warning');
this.logger.error('Error', error);
this.logger.debug('Debug');
```

### Structured Logging (Phase 2)
- Winston for structured logs
- Log to console + file + external service

## Error Handling

### Standard HTTP Exceptions

```typescript
// 400 Bad Request
throw new BadRequestException('Invalid input');

// 401 Unauthorized
throw new UnauthorizedException('Invalid credentials');

// 403 Forbidden
throw new ForbiddenException('Access denied');

// 404 Not Found
throw new NotFoundException('Resource not found');

// 409 Conflict
throw new ConflictException('Resource already exists');

// 500 Internal Server Error
throw new InternalServerErrorException('Server error');
```

### Custom Exceptions
Create custom exception classes in `common/exceptions/`

## Next Steps (Phase 2)

- [ ] Set up TypeORM with PostgreSQL
- [ ] Create database migrations
- [ ] Implement Clerk authentication
- [ ] Add JWT guards and decorators
- [ ] Implement all CRUD endpoints
- [ ] Add request/response DTOs
- [ ] Add validation pipes
- [ ] Set up Swagger documentation
- [ ] Implement net-worth engine
- [ ] Add analytics computations
- [ ] Set up BullMQ job queues
- [ ] Add email notifications (Nodemailer)
- [ ] Implement SMS parsing (Phase 2)
- [ ] Add file upload handling
- [ ] Set up error tracking (Sentry)

## Deployment

### Local Development
```bash
npm run start:dev
```

### Production Build
```bash
npm run build
npm run start:prod
```

### Docker Deployment
See `Dockerfile` (to be created)

```bash
docker build -t networth-api .
docker run -p 3000:3000 --env-file .env networth-api
```

## Package Scripts

```bash
npm run start              # Run server
npm run start:dev         # Dev server (auto-reload)
npm run build             # Build for production
npm run lint              # Run ESLint
npm run format            # Format code with Prettier
npm run test              # Run unit tests
npm run test:watch       # Test watch mode
npm run test:cov         # Test coverage
npm run test:e2e         # E2E tests
npm run migration:run    # Run migrations
npm run migration:create # Create migration
npm run seed             # Seed database
```

## API Documentation

Swagger documentation available at `/api` after server starts.

To generate Swagger docs:
```typescript
// main.ts
const config = new DocumentBuilder()
  .setTitle('NetWorth API')
  .setDescription('Personal Finance Management API')
  .setVersion('1.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api', app, document);
```

## Troubleshooting

### Port Already in Use
```bash
# Change PORT in .env or
npm run start:dev -- --port 3001
```

### Database Connection Error
- Check `DATABASE_URL` in `.env`
- Ensure PostgreSQL is running
- Check credentials

### TypeORM Migrations Not Running
```bash
npm run typeorm migration:show
npm run migration:revert
npm run migration:run
```

## Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [TypeORM Documentation](https://typeorm.io)
- [Clerk Documentation](https://clerk.com/docs)
- [BullMQ Documentation](https://docs.bullmq.io)

## License

MIT
