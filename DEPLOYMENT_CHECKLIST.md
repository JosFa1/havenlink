# HavenLink Deployment Checklist - Quick Reference

## Pre-Deployment Tasks ✓ COMPLETED

- [x] Updated routing in `src/app.ts`:
  - `/home` serves index.html
  - `/team` serves team.html  
  - `/` redirects to `/home`
  - `/*` fallback for SPA compatibility

- [x] Updated PORT configuration for AWS Amplify (`process.env.PORT`)

- [x] Created `amplify.yml` build configuration

- [x] Verified TypeScript build works (`npm run build`)

- [x] Verified `.gitignore` includes `node_modules/` and `dist/`

---

## AWS Amplify Setup Checklist

### Step 1: Create Amplify App
- [ ] Log in to AWS Amplify Console
- [ ] Click "New app" → "Host web app"
- [ ] Select "GitHub" as repository service
- [ ] Authorize AWS Amplify to access GitHub
- [ ] Select repository: `acid701/havenlink`
- [ ] Select branch: `main` (or `prod`)

### Step 2: Configure Build Settings
- [ ] Verify build image: Node 18+ (auto-selected)
- [ ] Build command: `npm run build` ✓ (in amplify.yml)
- [ ] Build output directory: `dist/` ✓ (in amplify.yml)

### Step 3: Add Environment Variables
Go to **App settings** → **Environment variables**:

| Variable | Value | Required |
|----------|-------|----------|
| `NODE_ENV` | `production` | Optional |
| `PORT` | `3000` | Optional |

### Step 4: Deploy
- [ ] Click "Save and deploy"
- [ ] Wait for build to complete (~2-5 minutes)
- [ ] Verify deployment successful in "Deployments" tab

### Step 5: Test Endpoints
- [ ] Homepage: `https://[your-domain]/home`
- [ ] Team page: `https://[your-domain]/team`
- [ ] Adoption pages: `https://[your-domain]/adopt/`
- [ ] Static assets load correctly (images, CSS, JS)

### Step 6: Configure Custom Domain (Optional)
- [ ] Go to **App settings** → **Domain management**
- [ ] Click "Add domain"
- [ ] Enter your domain (e.g., `havenlink.com`)
- [ ] Update DNS CNAME record at your domain registrar
- [ ] Wait for SSL certificate provisioning (24-48 hours)

---

## File Changes Summary

### Modified Files
1. **src/app.ts** - Updated routing and PORT configuration
2. **package.json** - No changes needed (already has correct scripts)
3. **.gitignore** - No changes needed (already properly configured)

### New Files Created
1. **amplify.yml** - AWS Amplify build configuration
2. **.env.example** - Environment variables template
3. **AWS_AMPLIFY_DEPLOYMENT.md** - Complete deployment guide
4. **DEPLOYMENT_CHECKLIST.md** - This file

### Files Still Required
- GitHub repository access with `main` or `prod` branch pushed

---

## Environment Variables Reference

### For AWS Amplify Console

**Optional Variables:**

```
NODE_ENV=production
PORT=3000
```

These are already configured in the code to use defaults if not set.

---

## GitHub Branch Setup

Your `prod` branch should be set to track `main`:

```bash
# Verify current setup
git branch -vv

# If prod doesn't exist or is outdated
git checkout main
git push origin main
```

**Amplify will deploy from: `main` branch**

---

## Post-Deployment Verification

After first deployment succeeds:

1. **Test URLs**
   ```
   GET /home → loads index.html ✓
   GET /team → loads team.html ✓
   GET /adopt/* → serves adopt pages ✓
   GET / → redirects to /home ✓
   GET /unknown-route → serves index.html (SPA fallback) ✓
   ```

2. **Check Logs**
   - Amplify console → Deployments → View logs

3. **Verify Static Files**
   - Images load (aaravgupta.png, etc.)
   - Stylesheets apply (styles.css)
   - Scripts execute (script.js)

4. **Monitor Performance**
   - Amplify console → Monitoring
   - Set up CloudWatch alerts (optional)

---

## Important Configuration Details

### Build Process
```
1. Amplify detects push to main
2. Runs: npm install
3. Runs: npm run build (TypeScript → JavaScript)
4. Deploys: /dist folder content
5. Result: Live at Amplify URL
```

### Port Handling
- Development: `npm run dev` → PORT 3000
- Production: AWS Amplify assigns port automatically
- App reads from `process.env.PORT` (flexible)

### Static Files
- All files in `/public/` are served via Express
- Express `__dirname` correctly points to dist in production
- Relative paths: `../public` works in both dev and prod

---

## Rollback Plan

If deployment has issues:

1. **Revert in GitHub**
   ```bash
   git revert HEAD
   git push origin main
   ```

2. **Amplify Auto-Rollback**
   - Detects new push
   - Builds from previous commit
   - Usually takes 2-5 minutes

3. **Manual Rollback**
   - Amplify console → Deployments
   - Select previous good deployment
   - Click "Redeploy" 

---

## Support Resources

- [AWS Amplify Docs](https://docs.amplify.aws/)
- [Amplify Hosting Guide](https://aws.amazon.com/amplify/hosting/)
- [Express.js Deployment](https://expressjs.com/en/advanced/best-practice-performance.html)
- [TypeScript Compilation](https://www.typescriptlang.org/docs/handbook/compiler-options.html)

---

## Next Steps

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Prepare for AWS Amplify deployment"
   git push origin main
   ```

2. **Create Amplify App** ([Follow Step 1 above](#step-1-create-amplify-app))

3. **Monitor First Deployment** (Check build logs for any errors)

4. **Test Live URLs** (Verify all routes work)

5. **Optional: Add Custom Domain** (Configure DNS)

---

**Last Updated:** May 26, 2026
**Status:** Ready for AWS Amplify Deployment
