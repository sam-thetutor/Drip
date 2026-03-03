# UBI Tracking Setup - Next Steps

## ✅ Completed
1. ✅ Installed @supabase/supabase-js
2. ✅ Created Supabase client configuration
3. ✅ Updated all API endpoints to use Supabase instead of Prisma:
   - `/api/gooddollar/claim/log` - Log UBI claims
   - `/api/gooddollar/metrics` - Get overall metrics
   - `/api/gooddollar/metrics/daily` - Get daily breakdown for charts
   - `/api/gooddollar/claims` - Get paginated claims list
4. ✅ Created Supabase SQL migration

## 🔧 Required Actions

### 1. Get Supabase Service Role Key
1. Go to your Supabase dashboard: https://app.supabase.com/project/iiziygnlpanfuopqrkux/settings/api
2. Under "Project API keys", copy the **service_role** key (NOT the anon key)
3. Add it to your `.env.local` file:

```bash
SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"
```

⚠️ **IMPORTANT**: The service role key bypasses Row Level Security. Keep it secret and NEVER expose it in client-side code!

### 2. Run Database Migration
1. Go to Supabase SQL Editor: https://app.supabase.com/project/iiziygnlpanfuopqrkux/sql/new
2. Copy the contents of `prisma/migrations/supabase_ubi_tracking.sql`
3. Paste and run the SQL
4. This will create:
   - `UbiClaim` table (tracks individual claims)
   - `UserStats` table (if doesn't exist) with UBI fields
   - Indexes for performance
   - Row Level Security policies

### 3. Test the Integration
After completing steps 1 and 2:

1. **Test UBI Claim**:
   - Visit your app
   - Connect wallet: `0xDb3A14F438eBF7A982c4372c8A17985B05F3A1Ec` or any address
   - Claim UBI from GoodDollar
   - Check browser console for successful POST to `/api/gooddollar/claim/log`

2. **Test Admin Dashboard**:
   - Connect admin wallet: `0xDb3A14F438eBF7A982c4372c8A17985B05F3A1Ec`
   - Visit: `/admin/ubi`
   - You should see:
     - Total claims metrics
     - 30-day trend chart
     - Top claimers list
     - Recent claims table

### 4. Verify Database
Check Supabase Table Editor to verify data is being saved:
- UbiClaim table: https://app.supabase.com/project/iiziygnlpanfuopqrkux/editor/public/UbiClaim
- UserStats table: https://app.supabase.com/project/iiziygnlpanfuopqrkux/editor/public/UserStats

## 📁 File Changes Summary

### New Files Created:
- `src/lib/supabase/client.ts` - Supabase client configuration
- `prisma/migrations/supabase_ubi_tracking.sql` - Database migration

### Modified Files:
- `src/app/api/gooddollar/claim/log/route.ts` - Uses Supabase client
- `src/app/api/gooddollar/metrics/route.ts` - Uses Supabase client
- `src/app/api/gooddollar/metrics/daily/route.ts` - Uses Supabase client
- `src/app/api/gooddollar/claims/route.ts` - Uses Supabase client

### Already Created (From Previous Session):
- `src/app/admin/ubi/page.tsx` - Admin dashboard UI
- `src/components/admin/ubi-metrics-cards.tsx` - Metrics display
- `src/components/admin/ubi-claims-chart.tsx` - Line chart
- `src/components/admin/recent-claims-table.tsx` - Claims table
- `src/lib/admin/auth.ts` - Admin authentication
- `src/components/gooddollar/ubi-claim-card.tsx` - Integrated claim logging

## 🔍 Environment Variables Checklist

Your `.env.local` should have:
```bash
# Supabase Configuration
SUPABASE_URL="https://iiziygnlpanfuopqrkux.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<YOUR_SERVICE_ROLE_KEY_HERE>"

# Public keys (already set)
NEXT_PUBLIC_SUPABASE_URL="https://iiziygnlpanfuopqrkux.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## 🎯 Admin Access
Admin whitelist address: `0xDb3A14F438eBF7A982c4372c8A17985B05F3A1Ec`

## 📊 API Endpoints Reference

### Log a Claim
```bash
POST /api/gooddollar/claim/log
Body: {
  "address": "0x...",
  "amount": "1.5",
  "amountWei": "1500000000000000000",
  "transactionHash": "0x...",
  "chainId": 42220
}
```

### Get Overall Metrics
```bash
GET /api/gooddollar/metrics
```

### Get Daily Breakdown
```bash
GET /api/gooddollar/metrics/daily?days=30
```

### Get Recent Claims
```bash
GET /api/gooddollar/claims?page=1&limit=50
```

## 🐛 Troubleshooting

### "Supabase not configured" Error
- Check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are in `.env.local`
- Restart dev server after adding environment variables

### No Data in Dashboard
- Verify SQL migration ran successfully
- Check browser console for API errors
- Check Supabase logs: https://app.supabase.com/project/iiziygnlpanfuopqrkux/logs/explorer

### Claims Not Being Logged
- Open browser DevTools → Network tab
- Make a UBI claim
- Look for POST to `/api/gooddollar/claim/log`
- Check response status and body

## 🚀 Next Enhancement Ideas
- Add claim streaks tracking
- Implement leaderboard with points system
- Add email notifications for admin
- Export claims data to CSV
- Add date range filters to dashboard
- Implement real-time updates with Supabase subscriptions
