# HavenLink AWS Amplify Deployment Guide

## Overview
This guide provides step-by-step instructions for deploying HavenLink to AWS Amplify Hosting.

---

## Prerequisites
- AWS Account with appropriate permissions
- GitHub account with the HavenLink repository
- AWS Amplify console access

---

## Step 1: Prepare Your GitHub Repository

### Verify Branch Setup
Your repository should have:
- **main** branch: Contains production-ready code
- **prod** branch: Points to main (or is an alias)
- Code is committed and pushed to GitHub

**Command to verify:**
```bash
git branch -a
```

---

## Step 2: Create an AWS Amplify App

### Using AWS Amplify Console

1. Go to [AWS Amplify Console](https://console.aws.amazon.com/amplify)
2. Click **"New app"** → **"Host web app"**
3. Select **GitHub** as your repository service
4. Authorize AWS Amplify to access your GitHub account
5. Select the **acid701/havenlink** repository
6. Choose branch to deploy: **main** (or **prod** if you prefer)
7. Click **"Save and deploy"**

---

## Step 3: Build Settings

### Review Build Configuration

The `amplify.yml` file is already configured in your repository with these settings:

**Location:** `/amplify.yml`

**Key configurations:**
```yaml
preBuild:
  - npm install       # Install dependencies
build:
  - npm run build     # Compile TypeScript to JavaScript
artifacts:
  baseDirectory: dist # Serve compiled files from dist/
```

The build will automatically:
1. Install npm dependencies
2. Compile TypeScript code to JavaScript (using `npm run build`)
3. Deploy the compiled files from the `/dist` directory

---

## Step 4: Environment Variables

### Variables to Add in AWS Amplify Console

Go to **App settings** → **Environment variables** and add:

| Variable Name | Value | Purpose |
|---|---|---|
| `PORT` | `3000` | Application port (optional - Amplify assigns port) |
| `NODE_ENV` | `production` | Node environment mode |

**Optional variables for future use:**
- `API_URL`: Backend API endpoint (if needed)
- `LOG_LEVEL`: Logging level (`info`, `debug`, etc.)

### How to Add in Console:
1. Open your Amplify app
2. Go to **App settings** → **Environment variables**
3. Click **"Manage variables"**
4. Add each variable name and value
5. Click **"Save**

---

## Step 5: Build Hooks (Optional)

If you need custom build steps, edit in **App settings** → **Build settings**:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm install
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: dist
    files:
      - '**/*'
```

---

## Step 6: Domain Configuration

### Custom Domain Setup

1. Go to **App settings** → **Domain management**
2. Click **"Add domain"**
3. Enter your domain name (e.g., `havenlink.com`)
4. Follow DNS provider instructions to add CNAME record:
   - **CNAME:** `_abc123.havenlink.com` → `d123.amplifyapp.com`
5. Amplify will automatically provision SSL/TLS certificate

### Default Domain
Amplify auto-generates a domain: `https://main.d123abc.amplifyapp.com`

---

## Step 7: Redirects & Rewrites

### Current Routing in app.ts

The application is configured with the following routes:

- `/` → Redirects to `/home`
- `/home` → Serves `index.html`
- `/team` → Serves `team.html`
- `/*` → Fallback to `index.html` (for SPA compatibility)
- `/public/*` → Static files (images, CSS, JS)
- `/adopt/*` → Adoption page resources

No additional Amplify redirect rules needed - routing is handled in Express.

---

## Step 8: Deploy & Monitor

### Automatic Deployments
- Every push to the **main** (or **prod**) branch triggers automatic deployment
- Builds take ~2-5 minutes
- Check progress in **Deployments** tab

### Deploy Manually
1. Open your Amplify app
2. Click the branch
3. Click **"Deploy"** (if needed)

### Monitor Build Logs
1. Click on deployment
2. View real-time logs under **Build logs**
3. Check for errors in **Test logs**

---

## Step 9: Troubleshooting

### Common Issues & Solutions

| Issue | Solution |
|---|---|
| Build fails with "npm not found" | Ensure Node.js 16+ is selected in build image settings |
| Static files not loading | Verify `baseDirectory: dist` in amplify.yml |
| Routes not working | Check Express routing in `src/app.ts` |
| Slow builds | Enable build caching (amplify.yml has this enabled) |
| SSL certificate not provisioning | Wait 24-48 hours or contact AWS support |

### View Logs
```bash
# In Amplify console:
1. Deployments tab → Click deployment
2. Build logs → View full build output
3. Test logs → View runtime logs
```

---

## Step 10: CI/CD Setup (Optional)

### GitHub Actions (For Local Testing Before Deploy)

Create `.github/workflows/test.yml`:

```yaml
name: Test Build

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
```

This will test builds on every push before Amplify deployment.

---

## Development Workflow

### Local Development
```bash
# Start dev server with auto-reload
npm run dev

# Visit http://localhost:3000
```

### Production Build (Test Locally)
```bash
# Build TypeScript to JavaScript
npm run build

# Run compiled version
npm start

# Visit http://localhost:3000
```

### Deploy to Production
```bash
# Commit and push to main/prod branch
git add .
git commit -m "Your changes"
git push origin main  # or prod
```

Amplify automatically deploys!

---

## Important Notes

### File Path Changes
- Old: `/index.html` → New: `/home`
- Old: `/team.html` → New: `/team`
- Update any internal links in HTML files accordingly

### Port Assignment
- AWS Amplify assigns the port automatically
- The app uses `process.env.PORT` for flexibility
- Default: `3000` in development

### Buildtime Limits
- Standard build timeout: 15 minutes
- Large builds may timeout (optimize dependencies if needed)

### Cost Considerations
- Amplify Hosting: $0.015/GB-month for outbound data transfer
- Free tier: 15 GB/month outbound data (sufficient for most projects)
- Custom domain: ~$13/month (through Route 53 or registrar)

---

## Post-Deployment Checklist

- [ ] Amplify app created and linked to GitHub
- [ ] Branch configured (main or prod)
- [ ] First build completed successfully
- [ ] All routes working (`/home`, `/team`, `/adopt/*`)
- [ ] Static files loading correctly
- [ ] Environment variables set
- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active
- [ ] Monitoring alerts set up (optional)
- [ ] Team has deployment access

---

## Support & Resources

- **AWS Amplify Docs:** https://docs.amplify.aws/
- **Amplify Hosting:** https://aws.amazon.com/amplify/hosting/
- **Node.js on Amplify:** https://docs.amplify.aws/gen1/javascript/build-a-backend/hosted-web-hosting/
- **GitHub Integration:** https://docs.amplify.aws/gen1/javascript/build-a-backend/hosted-web-hosting/github/

---

## Questions?

For deployment issues, check:
1. Build logs in Amplify console
2. GitHub Actions logs (if using CI/CD)
3. AWS CloudWatch logs
4. Verify `amplify.yml` is in repository root
