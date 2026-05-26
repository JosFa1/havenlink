# HavenLink - AWS Amplify Deployment Ready ✓

## Status: Project Prepared for AWS Amplify Deployment

---

## What's Been Completed ✓

### 1. **Routing Architecture Updated**
   - `GET /home` → serves `index.html`
   - `GET /team` → serves `team.html`
   - `GET /` → redirects to `/home`
   - `GET /*` → fallback to `index.html` (SPA compatibility)
   - Port configured to use `process.env.PORT` for AWS Amplify flexibility

**File:** [src/app.ts](src/app.ts)

### 2. **All HTML Internal Links Updated**
   - ✓ **index.html** - Team link now points to `/team`
   - ✓ **team.html** - All links updated to use `/home` and `/team` routes
   - ✓ **adopt/agency-profiles.html** - Navigation and footer links updated
   - ✓ **adopt/home-study.html** - Navigation and footer links updated
   - ✓ **adopt/intake-form.html** - Navigation and footer links updated
   - ✓ **adopt/matching.html** - Navigation and footer links updated

### 3. **Deployment Configuration Created**

| File | Purpose |
|------|---------|
| [amplify.yml](amplify.yml) | AWS Amplify build configuration |
| [.env.example](.env.example) | Environment variables template |
| [AWS_AMPLIFY_DEPLOYMENT.md](AWS_AMPLIFY_DEPLOYMENT.md) | Complete deployment guide (10 steps) |
| [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) | Quick reference checklist |

### 4. **Build Verified** ✓
   - TypeScript compiles without errors
   - Output directory: `/dist`
   - Ready for production deployment

---

## Next: Deploy to AWS Amplify

### Quick Start (5 Minutes)

```bash
# 1. Commit all changes
git add .
git commit -m "Prepare HavenLink for AWS Amplify deployment"
git push origin main

# 2. Go to AWS Amplify Console
# https://console.aws.amazon.com/amplify

# 3. Click "New app" → "Host web app"
# 4. Select GitHub → Select acid701/havenlink repo
# 5. Select branch: main (or prod)
# 6. Review build settings (pre-configured in amplify.yml)
# 7. Click "Save and deploy"
```

---

## AWS Amplify Environment Variables

Add these in **App settings** → **Environment variables**:

```
NODE_ENV=production
PORT=3000  (optional - Amplify assigns automatically)
```

---

## Post-Deployment Testing

Test these URLs after deployment completes:

```
✓ https://your-domain/home
✓ https://your-domain/team
✓ https://your-domain/adopt/home-study.html
✓ https://your-domain/adopt/agency-profiles.html
✓ https://your-domain/adopt/intake-form.html
✓ https://your-domain/adopt/matching.html
✓ https://your-domain/  (should redirect to /home)
```

---

## File Structure

```
havenlink/
├── src/
│   └── app.ts                          ← Updated routing & PORT config
├── public/
│   ├── index.html                       ← Updated links
│   ├── team.html                        ← Updated links
│   ├── adopt/
│   │   ├── home-study.html             ← Updated links
│   │   ├── intake-form.html            ← Updated links
│   │   ├── agency-profiles.html        ← Updated links
│   │   └── matching.html               ← Updated links
│   ├── styles.css
│   ├── script.js
│   ├── logo.png
│   └── [other assets]
├── dist/                                ← Build output (auto-generated)
│   └── app.js
├── amplify.yml                          ← NEW: Deployment config
├── .env.example                         ← NEW: Environment template
├── package.json                         ← No changes needed
├── tsconfig.json                        ← No changes needed
├── .gitignore                           ← Already correct
├── AWS_AMPLIFY_DEPLOYMENT.md            ← NEW: Full guide
└── DEPLOYMENT_CHECKLIST.md              ← NEW: Quick reference
```

---

## GitHub & Deployment

### Branch Configuration
- **Repository:** acid701/havenlink
- **Current Branch:** main
- **Amplify Will Deploy From:** main (or prod if you prefer)

### Deployment Flow
```
1. Push to main/prod branch
   ↓
2. GitHub notifies AWS Amplify
   ↓
3. Amplify runs build (amplify.yml):
   - npm install
   - npm run build
   - Minifies and deploys /dist
   ↓
4. App live at Amplify URL
   ↓
5. (Optional) Route custom domain to Amplify
```

---

## Important Notes for Deployment

### Port Assignment
- AWS Amplify automatically assigns the port
- App reads from `process.env.PORT` (defaults to 3000 if not set)
- No hardcoded port means flexible deployment

### Build Process
- Build time: ~2-5 minutes
- Uses Node 18+ (auto-selected)
- Deploys TypeScript-compiled JavaScript from `/dist`

### Static Files
- All `/public` files served by Express middleware
- Relative paths in HTML work because of Express static serving
- Absolute paths (`/home`, `/team`) work because of Express routing

### Routing
- Root `/` redirects to `/home` (friendly landing page)
- Catchall `/*` serves `index.html` for SPA-style navigation
- Specific routes (`/home`, `/team`) serve corresponding pages

---

## Troubleshooting Guide

### Build Fails
**Check:** Amplify console → Deployments → Build logs
**Common cause:** Missing dependencies (should be resolved by `npm install`)

### Routes Not Working
**Check:** Express routing in `src/app.ts`
**Verify:** 
- `/home` serves index.html ✓
- `/team` serves team.html ✓
- `/*` fallback works ✓

### Static Files Not Loading
**Check:** Images, CSS, JS paths in HTML files
**Verify:** Files in `/public` are accessible
**Ensure:** `amplify.yml` has `baseDirectory: dist`

### Slow Builds
**Tip:** Enable build caching (already configured in amplify.yml)
**Check:** Node module sizes and dependencies

---

## Cost Estimate (AWS Amplify Hosting)

| Item | Cost |
|------|------|
| Outbound data (first 15GB/month) | Free |
| Additional outbound data | $0.15/GB |
| Custom domain (optional) | ~$13/month |
| **Base deployment** | **FREE** |

---

## Next Steps Checklist

- [ ] Review [AWS_AMPLIFY_DEPLOYMENT.md](AWS_AMPLIFY_DEPLOYMENT.md) for full guide
- [ ] Review [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) for quick reference
- [ ] Commit and push changes: `git push origin main`
- [ ] Create AWS Amplify app in console
- [ ] Configure environment variables
- [ ] Deploy and test all routes
- [ ] (Optional) Add custom domain
- [ ] (Optional) Set up monitoring/alerts

---

## Support & Resources

- **AWS Amplify:** https://console.aws.amazon.com/amplify
- **Docs:** https://docs.amplify.aws/
- **GitHub Repo:** https://github.com/acid701/havenlink
- **Express.js:** https://expressjs.com/
- **TypeScript:** https://www.typescriptlang.org/

---

## Summary

**Your HavenLink project is fully prepared for AWS Amplify deployment!**

All routing has been updated from file paths to clean URLs:
- ✓ `/index.html` → `/home`
- ✓ `/team.html` → `/team`
- ✓ Port configured for Amplify
- ✓ Build configuration ready
- ✓ All links updated throughout the site

**Ready to deploy! Follow the [AWS Amplify Deployment Guide](AWS_AMPLIFY_DEPLOYMENT.md) to go live.**

---

**Last Updated:** May 26, 2026  
**Status:** ✓ Deployment Ready
