# Webhook 404 Error Fix

## Problem
You're seeing `404 Not Found` errors in ngrok because Twilio is calling `/webhook` but the route is at `/api/whatsapp/webhook`.

## Solution

### Step 1: Update Twilio Console

1. Go to [Twilio Console](https://console.twilio.com/)
2. Navigate to **Messaging** → **Settings** → **WhatsApp Sandbox**
3. Find the **"When a message comes in"** field
4. Update the webhook URL to:
   ```
   https://your-ngrok-url.ngrok.io/api/whatsapp/webhook
   ```
   **Important:** Make sure it includes `/api/whatsapp/webhook` at the end!

5. Click **Save**

### Step 2: Update .env.local

Update `TWILIO_WEBHOOK_URL` in `apps/web/.env.local`:

```env
TWILIO_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/api/whatsapp/webhook
```

Replace `your-ngrok-url.ngrok.io` with your actual ngrok URL.

### Step 3: Verify Route Exists

The route should be at:
- File: `apps/web/src/app/api/whatsapp/webhook/route.ts`
- URL: `/api/whatsapp/webhook`

### Step 4: Test Locally

Test the route directly:

```bash
curl -X POST http://localhost:3000/api/whatsapp/webhook \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "Body=test&From=whatsapp:+1234567890"
```

Should return TwiML XML response.

### Step 5: Restart Next.js Server

After updating `.env.local`, restart your Next.js server:

```bash
# Stop the server (Ctrl+C)
# Then restart:
cd apps/web
pnpm dev
```

## Verification

After fixing:
1. ✅ ngrok should show `200 OK` instead of `404 Not Found`
2. ✅ You should see logs in your Next.js server
3. ✅ WhatsApp messages should be processed

## Common Mistakes

❌ **Wrong:** `https://abc123.ngrok.io/webhook`
✅ **Correct:** `https://abc123.ngrok.io/api/whatsapp/webhook`

❌ **Wrong:** `https://abc123.ngrok.io/api/webhook`
✅ **Correct:** `https://abc123.ngrok.io/api/whatsapp/webhook`

The full path must be: `/api/whatsapp/webhook`

