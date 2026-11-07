# ALPHA SMS — Complete VPS Production Deployment Guide

Yeh guide Alpha SMS softswitch platform ko Kisi bhi Linux VPS (Ubuntu 20.04 / 22.04 / 24.04 ya Debian) par deploy karne ke liye step-by-step instructions provide karti hai.

---

## 1. System Requirements
- **OS:** Ubuntu 22.04 LTS ya 24.04 LTS (Recommended)
- **RAM:** Minimum 2 GB (4 GB recommended for high MPS traffic)
- **CPU:** 1-2 vCPU
- **Disk:** 20 GB+ SSD
- **Open Ports:**
  - `80` (HTTP - Let's Encrypt)
  - `443` (HTTPS Web Panel & REST API)
  - `2775` (SMPP Server - Carriers / SMSC)
  - `22` (SSH)

---

## 2. Step 1: Server Update & Node.js 20 LTS Install

VPS par SSH login karke yeh commands run karein:

```bash
# System Update
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx ufw certbot python3-certbot-nginx

# Node.js 20 LTS install karein
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Node aur NPM version verify karein
node -v   # v20.x.x
npm -v    # 10.x.x

# PM2 globally install karein (process manager)
sudo npm install -g pm2
```

---

## 3. Step 2: Project Upload / Setup

```bash
# Application directory banayein
sudo mkdir -p /var/www/alphasms
sudo chown -R $USER:$USER /var/www/alphasms
cd /var/www/alphasms

# Files yahan upload karein (via SCP, Git, ya SFTP)
# Then dependencies install karein:
npm install
```

---

## 4. Step 3: Environment Setup (.env)

```bash
cp .env.example .env
nano .env
```
Apni zaroorat ke mutabiq values set karein (e.g. `SMPP_SECRET`, `PORT=3000`, `TRUST_PROXY=1`).

---

## 5. Step 4: Verification & Test Suite Check

Deploy karne se pehle ensure karein ke sabhi logic tests pass ho rahe hain:

```bash
npm test
```
*(All 185 logic rules, payterm rules, SMPP self-test, aur UI wiring tests green pass hone chahiye).*

---

## 6. Step 5: Start with PM2

Production mein background process chalane ke liye:

```bash
# PM2 se app start karein
pm2 start ecosystem.config.cjs

# Check status
pm2 status
pm2 logs alpha-sms

# Server restart par auto-start enable karein:
pm2 startup
pm2 save
```

---

## 7. Step 6: Nginx Reverse Proxy with WebSocket & SSL

Create Nginx site configuration:

```bash
sudo nano /etc/nginx/sites-available/alphasms
```

Paste this configuration (apna domain name replace karein, e.g. `sms.yourdomain.com`):

```nginx
server {
    server_name sms.yourdomain.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket support for Live SMS Feed & Realtime Notifications
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Real Client IP forwarding
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Enable site aur Nginx reload karein:

```bash
sudo ln -s /etc/nginx/sites-available/alphasms /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Free SSL Certificate (Let's Encrypt):
```bash
sudo certbot --nginx -d sms.yourdomain.com
```

---

## 8. Step 7: Firewall Security (UFW)

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 2775/tcp   # SMPP Server port for carrier binds
sudo ufw enable
```

---

## 9. Useful Maintenance Commands

```bash
# View live logs
pm2 logs alpha-sms

# Restart application
pm2 restart alpha-sms

# Reset Owner Password if ever locked out:
node reset-owner-password.js

# Manual Database Backup:
# Backups auto-generate in backups/ directory, ya manually:
tar -czvf backup-$(date +%F).tar.gz "Alpha SMS/data"
```
