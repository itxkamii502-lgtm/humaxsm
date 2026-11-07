# Complete Step-by-Step Guide: GitHub Upload se VPS Launch tak

Yeh guide bilkul asan aur simple lafzon mein likhi gayi hai taake agar aapko pehle VPS ya GitHub ka ziyada pata na bhi ho, tab bhi aap asaani se step-by-step follow kar sakein.

---

## ─── Hissa 1: Project ko GitHub par Upload Karna ───

### Step 1: GitHub par Account aur New Repository Banayein
1. [GitHub.com](https://github.com) par login karein (ya account banayein).
2. Upar right corner par **`+`** icon par click karein aur **New repository** choose karein.
3. **Repository name** likhein (maslan: `alpha-sms`).
4. Isko **Private** select karein (kyunke isme aapka telecom aur panel business logic hai).
5. Kisi checkbox ("Add README", etc.) ko tick **mat** karein.
6. **Create repository** green button par click karein.
7. Ab aapko ek link milega, jaise:  
   `https://github.com/aapka-username/alpha-sms.git`  
   (Is link ko copy kar lein).

---

### Step 2: Apne Computer par Git Open Karein
1. Apne computer par project ka folder open karein jahan saari files hain.
2. Us folder ke andar right-click karke **Open in Terminal** ya **Git Bash** open karein.
3. Yeh 5 commands bari bari copy paste karein:

```bash
# 1. Git shuru karein
git init

# 2. Tamam files add karein (node_modules aur secret files auto-skip hongi)
git add .

# 3. Pehla commit save karein
git commit -m "First production ready commit"

# 4. Main branch set karein
git branch -M main

# 5. Apni GitHub repository ka link connect karein (apna link replace karein)
git remote add origin https://github.com/aapka-username/alpha-sms.git

# 6. GitHub par code bhej dein
git push -u origin main
```
*(Agar GitHub login credentials maange toh apna GitHub Username aur Personal Access Token / Password enter kar dein).*

Ab aapka poora project GitHub par successfully save ho gaya hai!

---

## ─── Hissa 2: VPS Server Setup Karna ───

Aap kisi bhi provider se VPS le sakte hain (jaise Hetzner, DigitalOcean, Contabo, Linode, ya Vultr).  
- **OS:** Ubuntu 22.04 LTS ya 24.04 LTS select karein.
- VPS khareedne ke baad aapko email mein VPS ki **IP Address** aur **root password** mil jayega.

---

### Step 3: VPS mein Login Karein (Terminal / PuTTY)
- **Windows:** PowerShell ya Command Prompt open karein.
- **Mac / Linux:** Terminal open karein.

Command chalayein:
```bash
ssh root@AAPKI_VPS_IP
```
*(Example: `ssh root@123.45.67.89`)*  
- Jab `Are you sure you want to continue connecting (yes/no)?` pooche toh `yes` likh kar Enter dabayein.
- Password enter karein (likhte waqt screen par dikhega nahi, bus paste karke Enter dabayein).

---

### Step 4: VPS ke Software Install Karein (Node.js, Git, Nginx, PM2)
VPS login hone ke baad yeh command ek dafa chala dein:

```bash
# 1. Server update karein
sudo apt update && sudo apt upgrade -y

# 2. Zaroori tools aur Nginx web server install karein
sudo apt install -y curl git ufw nginx certbot python3-certbot-nginx

# 3. Node.js 20 LTS install karein
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 4. PM2 install karein (yeh app ko 24/7 background mein chalata hai)
sudo npm install -g pm2
```

---

## ─── Hissa 3: GitHub se Code VPS par Lana aur Run Karna ───

### Step 5: Code Clone Karein
```bash
# 1. Directory mein jayein
cd /var/www

# 2. GitHub se project clone karein (apna link dalein)
git clone https://github.com/aapka-username/alpha-sms.git alphasms

# 3. Folder ke andar jayein
cd alphasms

# 4. Packages install karein
npm install
```

---

### Step 6: Environment Variables (.env) Banayein
```bash
# Sample file se .env copy karein
cp .env.example .env

# File ko open karein
nano .env
```
Yahan aap `SMPP_SECRET` ko kisi lambe random password se badal sakte hain.  
File save karne ke liye:  
`Ctrl + O`, phir `Enter`, phir `Ctrl + X` dabayein.

---

### Step 7: Application ko PM2 ke sath 24/7 Start Karein
```bash
# Project start karein
pm2 start ecosystem.config.cjs

# Status check karein
pm2 status

# Server restart hone par auto-start setting:
pm2 startup
# (Terminal par jo command likhi aaye usko copy karke enter karein, agar pooche toh)
pm2 save
```

Ab aap browser mein `http://AAPKI_VPS_IP:3000` kholein ge toh aapka panel live chal raha hoga!

---

## ─── Hissa 4: Domain aur Free SSL (HTTPS) Lagana ───

Aapne agar domain khareeda hua hai (maslan `mysmspanel.com` ya `sms.mydomain.com`):

### Step 8: Domain ki DNS Setting
Apne domain provider (Cloudflare, Namecheap, GoDaddy etc.) mein ja kar:
- **Type:** `A`
- **Name:** `@` (ya `sms`)
- **Value / Target:** Apne VPS ki IP address daal dein.

---

### Step 9: Nginx Reverse Proxy Configure Karein
```bash
sudo nano /etc/nginx/sites-available/alphasms
```
Neeche wala code paste karein (apna domain replace karein):

```nginx
server {
    server_name sms.yourdomain.com;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # WebSocket support (Live SMS feed aur notifications ke liye zaroori hai)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```
Save karein (`Ctrl + O`, `Enter`, `Ctrl + X`).

Ab Nginx ko activate karein:
```bash
sudo ln -s /etc/nginx/sites-available/alphasms /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

### Step 10: Free SSL Certificate (HTTPS) Lagayein
```bash
sudo certbot --nginx -d sms.yourdomain.com
```
Aap se email poochega, email likh kar Enter karein, Terms ke liye `Y` karein.  
Certbot automatic SSL install kar dega! Ab aapka panel `https://sms.yourdomain.com` par safe aur lock icon ke sath chalega.

---

### Step 11: Firewall Security (Port 2775 for SMPP)
```bash
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 2775/tcp    # Carriers ke SMPP bind ke liye
sudo ufw enable
```

---

## ─── Hissa 5: Future Updates (Jab bhi code update karein) ───

Jab bhi aap apne computer par koi change karke GitHub par bhejenge:
```bash
# Apne computer par:
git add .
git commit -m "update changes"
git push
```

VPS par update karne ke liye sirf yeh 3 commands deni hongi:
```bash
# VPS terminal par:
cd /var/www/alphasms
git pull
pm2 restart alpha-sms
```
Bus! New update foran VPS par live ho jayegi bina kisi data loss ke.
