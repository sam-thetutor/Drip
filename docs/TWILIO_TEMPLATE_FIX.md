# Twilio Template Button Configuration Fix

## Issue
The error "Website URL is required. Only one variable can be added to the end of a URL" appears when configuring the button.

## Solution

### Option 1: Use Variable at End of URL (Recommended)

In the **Website URL** field, use the variable at the **end** of the URL:

```
{{1}}
```

**Important:** The variable must be the entire URL or at the very end. Do NOT use:
- ❌ `https://example.com/{{1}}` (variable in middle)
- ❌ `{{1}}/path` (variable at start)
- ✅ `{{1}}` (variable is entire URL - CORRECT)

### Option 2: Use Full URL with Variable at End

If you need a base URL, format it like this:

```
https://your-domain.com/verify?link={{1}}
```

The variable `{{1}}` must be at the **end** of the URL.

## Template Configuration

### Button Settings:
- **Type of action**: Visit Website
- **Button Text**: "Start Verification" (max 20 chars for faster approval)
- **Website URL**: `{{1}}` (just the variable, or full URL with variable at end)

### Variable Mapping

Our code uses variable `{{1}}` for the verification link. Make sure your template uses `{{1}}` (not `{{3}}`).

If you want to use `{{3}}` instead, you'll need to update the code to use `'3'` instead of `'1'` in `contentVariables`.

## Current Code Configuration

The code currently sends:
```typescript
contentVariables: JSON.stringify({
  '1': verificationLink, // Maps to {{1}} in template
})
```

So your template should use `{{1}}` in the Website URL field.

## Steps to Fix

1. **In Twilio Console:**
   - Change Website URL from `{{3}}` to `{{1}}`
   - OR keep `{{3}}` and we'll update the code

2. **If using {{1}} (Recommended):**
   - Website URL: `{{1}}`
   - No code changes needed

3. **If using {{3}}:**
   - Website URL: `{{3}}`
   - We'll need to update the code to use `'3'` instead of `'1'`

## Recommendation

Use `{{1}}` in your template - it's simpler and matches the current code. Just change the Website URL field to:
```
{{1}}
```

This will work immediately without any code changes!

