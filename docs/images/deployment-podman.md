
# On-call Scheduler – Deployment with Podman (RHEL)

This guide documents how to:

1. Build and push Docker images from **dev machine** (Windows).
2. Deploy and run the app on a **RHEL VM using Podman + podman-compose**.
3. Update to a **new version** later.

---

````markdown
## 1. Build & Push Images (Dev Machine – Windows)

You’ll do this where Docker / Rancher Desktop is installed.

### 1.1 Log in to Docker Hub

```bash
docker login
# username:  laith********
# password:  your Docker Hub password or access token
````

### 1.2 Clone / update the repo

```bash
git clone https://github.com/laithse1/oncall-scheduler.git
cd oncall-scheduler
# or, if already cloned:
# cd oncall-scheduler
# git pull
```

### 1.3 Build & push backend image (Linux/amd64)

From the repo root:

```bash
docker buildx build \
  --platform linux/amd64 \
  -t docker.io/laithse1234/oncall-backend:latest \
  -f backend/Dockerfile \
  --push \
  .
```

Key points:

* `--platform linux/amd64` ensures compatibility with RHEL VMs.
* `-f backend/Dockerfile` points at the backend Dockerfile.
* `--push` sends the image directly to Docker Hub.

### 1.4 Build & push frontend image (Linux/amd64)

```bash
docker buildx build \
  --platform linux/amd64 \
  -t docker.io/laithse1234/oncall-frontend:latest \
  -f frontend/Dockerfile \
  --push \
  .
```

### 1.5 Optional: Versioned tags

For proper releases, tag with a version (in addition to `latest`):

```bash
VERSION=v0.1.0

docker buildx build --platform linux/amd64 \
  -t docker.io/laithse1234/oncall-backend:$VERSION \
  -t docker.io/laithse1234/oncall-backend:latest \
  -f backend/Dockerfile \
  --push .

docker buildx build --platform linux/amd64 \
  -t docker.io/laithse1234/oncall-frontend:$VERSION \
  -t docker.io/laithse1234/oncall-frontend:latest \
  -f frontend/Dockerfile \
  --push .
```

Later, the compose file can be pointed at either the version tag or `latest`.

---

## 2. Deploy & Run on RHEL (Podman + podman-compose)

The following assumes a RHEL VM such as `rofomv901a`.

### 2.1 Log in to the VM and Docker Hub

```bash
ssh wa07705@rofomv901a

podman login docker.io
# username:  laith******
# password/token:  ...
```

### 2.2 Clone the repo on the VM

```bash
cd /apps/home/wa0*****
git clone https://github.com/laithse1/oncall-scheduler.git
cd oncall-scheduler
```

Directory should contain:

* `backend/`
* `frontend/`
* `docs/`
* `docker-compose.yml`
* `README.md`
* etc.

### 2.3 `docker-compose.yml` for Podman

The project includes a compose file compatible with `podman-compose`:

```yaml
version: "3.9"

services:
  db:
    image: docker.io/library/postgres:16-alpine
    container_name: oncall-db
    environment:
      POSTGRES_USER: oncall
      POSTGRES_PASSWORD: oncall
      POSTGRES_DB: oncall
    ports:
      - "5432:5432"
    volumes:
      - db_data:/var/lib/postgresql/data
    restart: unless-stopped

  backend:
    image: docker.io/laithse1234/oncall-backend:latest
    container_name: oncall-backend
    environment:
      POSTGRES_USER: oncall
      POSTGRES_PASSWORD: oncall
      POSTGRES_DB: oncall
      POSTGRES_HOST: db
      POSTGRES_PORT: 5432
    depends_on:
      - db
    ports:
      - "8000:8000"
    restart: unless-stopped

  frontend:
    image: docker.io/laithse1234/oncall-frontend:latest
    container_name: oncall-frontend
    environment:
      # IMPORTANT: This is how the *browser* reaches the backend.
      # If users browse via http://, use:
      NEXT_PUBLIC_API_BASE: "http://"
      # If users browse via raw IP (example): http://10.10.10.50:4000
      # then set: NEXT_PUBLIC_API_BASE="http://10.10.10.50:8000"
    depends_on:
      - backend
    ports:
      - "4000:3000"
    restart: unless-stopped

volumes:
  db_data:
```

> Adjust `NEXT_PUBLIC_API_BASE` if the hostname or port changes.

### 2.4 Start the stack

From the repo root:

```bash
podman-compose up -d
```

This will:

* Create a network `oncall-scheduler_default`
* Create a volume `oncall-scheduler_db_data`
* Start:

  * `oncall-db` (Postgres on 5432)
  * `oncall-backend` (FastAPI on 8000)
  * `oncall-frontend` (Next.js on 4000)

Verify:

```bash
podman ps
```

You should see ports mapped:

* `0.0.0.0:5432->5432/tcp` (db)
* `0.0.0.0:8000->8000/tcp` (backend)
* `0.0.0.0:4000->3000/tcp` (frontend)

### 2.5 Test from inside the VM

```bash
curl http://localhost:8000/docs     # FastAPI Swagger
curl http://localhost:4000          # Next.js HTML
```

If both return HTML, containers and internal networking are OK.

### 2.6 Open ports to the network (firewalld + SELinux)

> This step requires **root**. Ask a Linux admin if you don’t have sudo.

With firewalld:

```bash
sudo firewall-cmd --zone=mayo --add-port=4000/tcp --permanent
sudo firewall-cmd --zone=mayo --add-port=8000/tcp --permanent
sudo firewall-cmd --reload
```

If SELinux blocks the ports, label them as HTTP ports:

```bash
sudo semanage port -a -t http_port_t -p tcp 4000 || \
  sudo semanage port -m -t http_port_t -p tcp 4000

sudo semanage port -a -t http_port_t -p tcp 8000 || \
  sudo semanage port -m -t http_port_t -p tcp 8000
```

From your workstation (Windows), you should then be able to access:

* App UI: `http://:4000`
* API docs: `http://:8000/docs`

---

## 3. Updating to a New Version

When you change code and want to deploy an update:

### 3.1 On dev machine – rebuild & push

Example using a new version tag:

```bash
cd oncall-scheduler

VERSION=v0.1.1

docker buildx build --platform linux/amd64 \
  -t docker.io/laithse1234/oncall-backend:$VERSION \
  -t docker.io/laithse1234/oncall-backend:latest \
  -f backend/Dockerfile \
  --push .

docker buildx build --platform linux/amd64 \
  -t docker.io/laithse1234/oncall-frontend:$VERSION \
  -t docker.io/laithse1234/oncall-frontend:latest \
  -f frontend/Dockerfile \
  --push .
```

Optionally update `docker-compose.yml` on the VM to use `$VERSION` instead of `latest`.

### 3.2 On the RHEL VM – pull & restart

```bash
ssh wa*****@rofo******
cd /apps/home/wa******/oncall-scheduler

# (Optional) update repo:
git pull

# Pull new images
podman pull docker.io/laithse1234/oncall-backend:latest
podman pull docker.io/laithse1234/oncall-frontend:latest

# Restart the stack
podman-compose down
podman-compose up -d

podman ps
curl http://localhost:4000
curl http://localhost:8000/docs
```

If using versioned tags in `docker-compose.yml`, simply edit the tags and run:

```bash
podman-compose up -d
```

`podman-compose` will recreate the services using the new images.

---

## 4. Operations Cheat Sheet

**View logs:**

```bash
podman logs -f oncall-backend
podman logs -f oncall-frontend
podman logs -f oncall-db
```

**Restart a single container:**

```bash
podman restart oncall-backend
```

**Stop the whole stack:**

```bash
cd /apps/home/wa*****/oncall-scheduler
podman-compose down
```

**Remove DB volume (DESTROYS DATA):**

```bash
podman volume rm oncall-scheduler_db_data
```

---

## 5. Troubleshooting

* **Frontend works on `localhost:4000` but not from your workstation**
  → Likely firewalld/SELinux or network firewall. Confirm with:

  ```bash
  sudo firewall-cmd --zone=mayo --list-ports
  ```

  Ensure `4000/tcp` (and `8000/tcp` if needed) are present.

* **Frontend loads but API calls fail (CORS / 500 / network errors)**
  → Check `NEXT_PUBLIC_API_BASE` in `docker-compose.yml` points to how **the browser** reaches the backend (hostname + 8000), not `http://backend:8000`.

* **Containers won’t start**
  → Check logs:

  ```bash
  podman logs oncall-backend
  podman logs oncall-db
  ```

This runbook should cover the full lifecycle: build → push → deploy → update for the On-call Scheduler on Podman/RHEL.


