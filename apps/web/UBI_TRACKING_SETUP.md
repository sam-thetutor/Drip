# UBI Tracking Setup Instructions

## 🎯 Overview
The UBI claim tracking system has been implemented! Here's what was created:

### ✅ Completed Implementation

1. **Database Schema** ([prisma/schema.prisma](../prisma/schema.prisma))
   - Added `UbiClaim` model to track individual claims
   - Extended `UserStats` model with UBI tracking fields
   - Added indexes for performance

2. **API Endpoints**
   - `POST /api/gooddollar/claim/log` - Log UBI claims
   - `GET /api/gooddollar/metrics` - Overall metrics
   - `GET /api/gooddollar/metrics/daily` - Daily breakdown
   - `GET /api/gooddollar/claims` - Paginated claims list

3. **Admin Dashboard** ([/admin/ubi](../src/app/admin/ubi/page.tsx))
   - Real-time metrics cards
   - Daily claims trend chart
   - Top claimers leaderboard
   - Recent claims table with pagination
   - Access restricted to admin address: `0xDb3A14F438eBF7A982c4372c8A17985B05F3A1Ec`

4. **Integration**
   - Updated UbiClaimCard to automatically log successful claims
   - Added admin navigation link (visible only to admin)

---

## 🔧 Setup Steps

### Step 1: Get Complete Supabase Credentials

Go to your Supabase project dashboard at https://iiziygnlpanfuopqrkux.supabase.co

**Get these values:**

1. **Project Settings > Database > Connection String**
   - Get the "Connection pooling" string (for pgBouncer)
   - Format: `postgres://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true`

2. **Project Settings > API**
   - `anon` / `public` key (NEXT_PUBLIC_SUPABASE_ANON_KEY)
   - `service_role` key (SUPABASE_SERVICE_ROLE_KEY)

### Step 2: Update .env File

Update your `.env` file with the new Supabase credentials:

```env
# New Supabase Project
NEXT_PUBLIC_SUPABASE_URL="https://iiziygnlpanfuopqrkux.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="[GET FROM SUPABASE DASHBOARD]"
SUPABASE_URL="https://iiziygnlpanfuopqrkux.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="[GET FROM SUPABASE DASHBOARD]"

# Database Connection (Pooler - recommended for Prisma)
DATABASE_URL="postgres://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"

# Alternative: Direct connection (if pooler doesn't work)
# DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.iiziygnlpanfuopqrkux.supabase.co:5432/postgres?sslmode=require"
```

### Step 3: Run Database Migration

**Option A: Using Prisma Migrate (Recommended)**

```bash
cd apps/web
pnpm prisma migrate deploy
```

**Option B: Manual SQL Execution**

1. Go to Supabase Dashboard > SQL Editor
2. Copy the contents of `prisma/migrations/add_ubi_tracking.sql`
3. Paste and execute the SQL

### Step 4: Verify Migration

```bash
cd apps/web
pnpm prisma studio
```

This will open Prisma Studio where you can verify the new tables and columns exist.

### Step 5: Start the Development Server

```bash
cd ../..  # Go to root
pnpm dev
```

---

## 🎨 Features Overview

### Admin Dashboard (`/admin/ubi`)

**Metrics Display:**
- Total claims (all time)
- Unique claimers count
- Total G$ claimed
- Claims today/week/month
- Average claim amount
- Top 10 claimers

**Visualizations:**
- 30-day claims trend chart
- Unique users trend
- Recent claims table with transaction links

**Access Control:**
- Only wallet `0xDb3A14F438eBF7A982c4372c8A17985B05F3A1Ec` can access
- Admin link appears in navbar only for admin
- Non-admin users see "Access Denied" message

### Automatic Claim Tracking

When users claim UBI:
1. Transaction executes on-chain
2. Success triggers automatic API call to `/api/gooddollar/claim/log`
3. Claim stored in database with:
   - User address
   - Amount claimed
   - Transaction hash
   - Timestamp
   - Chain ID

4. UserStats updated:
   - Increment claim count
   - Add to total claimed
   - Update last claim time

---

## 📊 Database Schema

### UbiClaim Table
```sql
- id: String (cuid)
- address: String (wallet address)
- amount: Decimal (formatted G$ amount)
- amountWei: String (precise wei amount)
- transactionHash: String? (tx hash)
- claimedAt: DateTime (timestamp)
- chainId: Int (42220 for Celo mainnet)
```

### UserStats Extensions
```sql
- ubiClaimCount: Int (total claims by user)
- totalUbiClaimed: Decimal (total G$ claimed)
- lastUbiClaim: DateTime? (last claim timestamp)
```

---

## 🔐 Admin Management

### Add More Admins

Edit [src/lib/admin/auth.ts](../src/lib/admin/auth.ts):

```typescript
const ADMIN_ADDRESSES = [
  "0xDb3A14F438eBF7A982c4372c8A17985B05F3A1Ec", // Primary admin
  "0xYourNewAdminAddress...", // Add more here
].map(addr => addr.toLowerCase());
```

---

## 🧪 Testing

### Test the Claim Logging

1. Connect wallet as a whitelisted user
2. Claim UBI from the dashboard
3. Check the admin panel at `/admin/ubi`
4. Verify the claim appears in recent claims table

### Test API Endpoints

```bash
# Get metrics
curl http://localhost:3000/api/gooddollar/metrics

# Get daily data
curl http://localhost:3000/api/gooddollar/metrics/daily?days=7

# Get recent claims
curl http://localhost:3000/api/gooddollar/claims?page=1&limit=10
```

---

## 🚀 Deployment Checklist

Before deploying to production:

1. ✅ Update production DATABASE_URL in Vercel environment variables
2. ✅ Update NEXT_PUBLIC_SUPABASE_URL
3. ✅ Update NEXT_PUBLIC_SUPABASE_ANON_KEY
4. ✅ Update SUPABASE_SERVICE_ROLE_KEY
5. ✅ Run migration on production database
6. ✅ Verify admin address is correct
7. ✅ Test claim logging in production

---

## 🐛 Troubleshooting

### Database Connection Issues

**Error: "Can't reach database server"**
- Verify DATABASE_URL is correct
- Check Supabase project is active
- Ensure password is correct (no special characters that need escaping)

**Error: "Tenant or user not found"**
- Database pooler connection string might be wrong
- Try using direct connection instead

### Migration Issues

**Error: "Table already exists"**
- Some tables might already exist
- Check Prisma Studio to see current schema
- Manually run only the missing parts of the migration

### Admin Access Issues

**Can't see admin link**
- Verify connected wallet matches `0xDb3A14F438eBF7A982c4372c8A17985B05F3A1Ec`
- Check browser console for any errors
- Clear cache and reload

---

## 📝 Notes

- Claims are logged **after** successful on-chain transaction
- Logging failures won't prevent claims from succeeding
- All metrics refresh automatically every few seconds
- Historical data preserved indefinitely
- Export functionality can be added later

---

## 🎉 You're All Set!

Once you've updated the DATABASE_URL and run the migration, the UBI tracking system will be fully operational.

Visit `/admin/ubi` (as the admin wallet) to see the dashboard in action!
