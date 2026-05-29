# Employee Safety & Response

企業緊急事件安全回報系統：讓員工在事件期間快速回報安全狀態，主管掌握轄下回報進度，管理員建立事件、維護使用者並檢視全公司報表。專案採 **Monorepo**（pnpm workspaces）、**Next.js 14** 前端、**NestJS** REST API、**PostgreSQL + Prisma**、**Docker Compose** 編排（含 **Redis**、**Nginx**、**Prometheus**、**Grafana**），展示雲原生常見的可觀測性、健康檢查與多容器部署。前端支援**繁體中文 / English 雙語切換**（next-intl，URL-based locale routing）。API 已實作 **Redis-backed Rate Limiting**（全域 60 req/min，登入 5 req/min，安全回報 10 req/min）與**讀取快取**（事件列表 30s TTL、部門列表 300s TTL），Redis 不可用時自動 graceful degradation。

前端經過完整 UI/UX 改版：**語意色彩系統**（ACTIVE 藍、DRAFT 橘、SAFE 綠、NEED_HELP 紅）、**Dashboard 摘要統計卡**、**緊急回報大型選擇卡**、**麵包屑導覽**、Header active 狀態、通知空狀態引導，並修正全站 Hydration error。頁面切換有**淡入滑動過渡動畫**；**語言切換器**改為 Globe 圖示 + 文字切換，視覺更簡潔。

## 架構總覽

```mermaid
flowchart LR
  Browser[Browser]
  Nginx[Nginx:80]
  Web[Next.js_web]
  Api[NestJS_api]
  PG[(PostgreSQL)]
  Redis[(Redis)]
  Prom[Prometheus]
  Graf[Grafana]
  Browser --> Nginx
  Nginx --> Web
  Nginx --> Api
  Api --> PG
  Api --> Redis
  Prom --> Api
  Graf --> Prom
```

- **入口**：瀏覽器只打 `http://localhost`（Nginx），`/api/*` 轉發至 API，`/` 轉發至前端。
- **監控**：Prometheus 抓取 `http://api:3000/metrics`（不需 JWT）；Grafana 預設資料源指向 Prometheus（`http://localhost:3002`，帳密 `admin` / `admin`）。

## 角色與 User Story 對照（摘要）

| 角色               | 代表需求                                                                            |
| ------------------ | ----------------------------------------------------------------------------------- |
| **EMPLOYEE** | 查看進行中事件、提交/更新自己的安全回報、查看自己的回報與個人統計、讀取通知         |
| **MANAGER**  | 查看事件、轄下/部門回報列表、部門範圍統計、接收未回報提醒通知                       |
| **ADMIN**    | 建立/更新事件、全公司回報與統計、使用者與部門維護、手動觸發未回報提醒、稽核紀錄唯讀 |

## 雲原生與資料層：本機 vs 雲端

應用程式**跑在你電腦或 VM／K8s 上**，與**資料庫放在哪裡**是分開的。預設文件寫「本機 Postgres」是為了 **開發與期末 demo 不必先辦帳號**；**雲原生課程交件或報告**很適合改成 **雲端託管 PostgreSQL**，做法只有一步：**把 `DATABASE_URL` 換成雲端主機給你的 `postgresql://…` 連線字串**，其餘（Prisma migrate、Nest API、Docker 裡的 api 容器）都不必改程式。

常見選擇（皆有免費或試用額度，請自行查官網最新方案）：

| 服務                                                    | 說明                                                     |
| ------------------------------------------------------- | -------------------------------------------------------- |
| [Neon](https://neon.tech)                                  | Serverless Postgres，連線字串常需加 `?sslmode=require` |
| [Supabase](https://supabase.com)                           | Postgres + 儀表，專案設定裡複製 Database URL             |
| [Railway](https://railway.app) / [Render](https://render.com) | 一鍵 Postgres，適合小專題                                |
| AWS RDS / GCP Cloud SQL / Azure Database for PostgreSQL | 典型企業雲，報告可寫 SLA、備份、多 AZ                    |

**Redis** 同理：本機或 Compose 的 `redis` 可換成 [Upstash](https://upstash.com) 等雲端 Redis，只要把 `REDIS_URL` 改成雲端提供的 URL；未設定時專案仍會跑，只是提醒 idempotency 等進階行為會略過。

**Docker Compose**：`postgres` / `redis` 服務代表的是「可替換的依賴」；上雲部署時常改為 **只跑 app + nginx（或交給託管平台）**，資料庫與快取改連 **受管服務**——這正是雲原生裡常見的「狀態外置、無狀態應用水平擴展」敘事。

## 本機開發

**前置**：Node 20+、pnpm，以及下列**擇一**：

- **本機／容器**：Docker Compose 內建 Postgres，或本機安裝的 PostgreSQL。
- **雲端 Postgres**：在 `apps/api/.env` 設定 `DATABASE_URL` 與 **`DIRECT_URL`**（見 `apps/api/.env.example`）。Supabase 若直連 `db.*.supabase.co:5432` 出現 **P1001**，多為網路/IPv4 限制，請改 Dashboard **Connect** 裡的 **Session pooler**（`*.pooler.supabase.com:5432`），兩個變數可先填同一條 URI。

1. 複製環境變數並依需求修改：

   ```bash
   cp .env.example .env
   cp apps/api/.env.example apps/api/.env   # API 專用；migrate 需 postgresql:// 不可 prisma+postgres://
   cp apps/web/.env.example apps/web/.env.local   # Next 會讀 apps/web/.env.local，讓登入打到 Nest 而非 Next 自己
   ```
2. 安裝依賴：

   ```bash
   pnpm install
   ```
3. 資料庫遷移與種子（在 `apps/api` 目錄下，需有效 `DATABASE_URL`）：

   ```bash
   cd apps/api
   pnpm exec prisma migrate deploy
   pnpm exec prisma db seed
   ```
4. 啟動 API 與 Web：

   ```bash
   # 專案根目錄：一次開 API + 前端（推薦）
   pnpm dev
   ```

   或分兩個終端機：在**根目錄**執行 `pnpm dev:api` 與 `pnpm dev:web`。若你人在 **`apps/api` 目錄**，沒有 `dev:api` 這個指令，請用 **`pnpm dev`** 或 **`pnpm start:dev`**（同一件事）。

   **注意**：Nest 啟動時會先印出「Mapped route」日誌；**若尚未開 Postgres**，先前版本會在這之後因 Prisma 連線失敗而整支程式結束（其實沒有在 listen）。目前改為 **延遲連線**，API 會先成功 `listen`，`GET /health` 可通；**登入、事件等需 DB 的 API** 仍要在 Postgres 起來並跑過 migrate/seed 後才會正常。
5. 瀏覽器：**前端** `http://localhost:3001`（`pnpm dev:web` 固定使用 3001，避免與 API 搶埠），**API** `http://localhost:3000`。請在 `apps/web/.env.local`（或環境變數）設定 `NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1`，否則登入請求會誤打到 Next 本身而出現 **404**。   登入種子帳號（密碼皆為 `Password123!`）：

   | 角色 | Email | 說明 |
   |------|-------|------|
   | ADMIN | `admin@demo.com` | 系統管理員 |
   | MANAGER（總部） | `ceo@demo.com` | 執行長，直屬管理各部門主管 |
   | MANAGER | `manager@demo.com` | 研發主管 |
   | MANAGER | `rnd-a.manager@demo.com` | 研發A主管 |
   | MANAGER | `rnd-b.manager@demo.com` | 研發B主管 |
   | MANAGER | `sales.manager@demo.com` | 業務主管 |
   | MANAGER | `hr.manager@demo.com` | 人資主管 |
   | MANAGER | `finance.manager@demo.com` | 財務主管 |
   | MANAGER | `marketing.manager@demo.com` | 行銷主管 |
   | EMPLOYEE | `employee1@demo.com` / `employee2@demo.com` | 研發A員工 |
   | EMPLOYEE | `rnd-b.emp1@demo.com` / `rnd-b.emp2@demo.com` | 研發B員工 |
   | EMPLOYEE | `employee3@demo.com` / `sales.emp2@demo.com` | 業務部員工 |
   | EMPLOYEE | `hr.emp1@demo.com` / `hr.emp2@demo.com` | 人資部員工 |
   | EMPLOYEE | `finance.emp1@demo.com` / `finance.emp2@demo.com` | 財務部員工 |
   | EMPLOYEE | `marketing.emp1@demo.com` / `marketing.emp2@demo.com` | 行銷部員工 |

   **Supabase 既有 DB 擴充**：
   - 總部組織：[`infra/sql/supabase-hq-org-seed.sql`](infra/sql/supabase-hq-org-seed.sql)
   - 研發子團隊（研發A / 研發B）：[`infra/sql/supabase-rnd-teams-seed.sql`](infra/sql/supabase-rnd-teams-seed.sql)（會將 `employee1` / `employee2` 移至研發A）

   兩份 SQL 皆可重複執行，不會清掉既有事件／回報。

## Docker Compose（完整堆疊）

```bash
docker compose up --build
```

- 應用入口：**http://localhost**（Nginx）
- 前端建置參數 `NEXT_PUBLIC_API_URL` 預設為 `http://localhost/api/v1`（瀏覽器經由同一網域呼叫 API）。
- Prometheus：**http://localhost:9090**
- Grafana：**http://localhost:3002**（admin / admin）
- Postgres / Redis 埠對外映射見 `docker-compose.yml`。

API 容器啟動時會執行 `prisma migrate deploy` 再啟動 `node dist/src/main.js`。

## CI（GitHub Actions）

每次 push 至 `main` / `master` 或開 PR 時，[`.github/workflows/ci.yml`](.github/workflows/ci.yml) 會自動執行：

| Job | 內容 |
|-----|------|
| **Lint, test & build** | `pnpm install --frozen-lockfile` → `prisma generate` → lint → 單元測試（含 coverage 報告 artifact）→ E2E → build |
| **Docker build** | 驗證 `apps/api`、`apps/web` 的 Dockerfile 能成功建置 |

本機可跑相同檢查：

```bash
pnpm install --frozen-lockfile
pnpm --filter api exec prisma generate
pnpm lint && pnpm test:cov && pnpm test:e2e && pnpm build
docker build -f apps/api/Dockerfile -t safety-api:ci .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_URL=http://localhost/api/v1 -t safety-web:ci .
```

**Branch protection**：請 repo admin 依 [`.github/BRANCH_PROTECTION.md`](.github/BRANCH_PROTECTION.md) 設定 main 必須通過上述 CI 才能 merge。

**環境變數 / Secret 對照**：[`.github/env-and-secrets.md`](.github/env-and-secrets.md)

## CD（Deploy to GKE）

合併至 `main` 後，先跑 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)；**CI 全部通過**後，[`.github/workflows/deploy-gke.yml`](.github/workflows/deploy-gke.yml) 才會自動：

1. Build & push API / Web 映像至 GCP Artifact Registry  
2. Rolling update API + Web Deployment（GKE LoadBalancer）

CI 失敗時不會觸發部署。也可在 Actions 手動 Run workflow（略過 CI gate）。

**Prisma migrate 不在 CD 內執行**；首次部署或 schema 變更時請依 [`.github/CD.md`](.github/CD.md) 手動跑 migrate（與 seed）。

**一次性設定**：GKE 叢集、K8s `app-env` Secret、GitHub Actions Secrets。詳見 [`.github/CD.md`](.github/CD.md)。

## 測試

### 快速執行

```bash
# 0. 第一次使用前：產生 Prisma Client（僅需執行一次）
pnpm db:generate

# 1. API 單元測試（70 個測試案例，不需 DB/Redis）
pnpm --filter api test

# 2. API 單元測試 + 覆蓋率報告（輸出至 apps/api/coverage/；CI 亦會上傳 artifact）
pnpm --filter api test:cov

# 3. API E2E 整合測試（13 個案例，Prisma/Redis 皆以 test double 取代，不需啟動任何服務）
pnpm --filter api test:e2e

# 4. k6 負載測試（需先 docker compose up）
BASE_URL=http://localhost k6 run infra/k6/business.js

# 5. 前端 Playwright E2E（需先啟動完整 stack）
PLAYWRIGHT_BASE_URL=http://localhost pnpm --filter web test:e2e
```

---

### 測試架構分層

| 層次 | 工具 | 範圍 | 執行條件 |
|------|------|------|---------|
| **Layer 1：單元測試** | Jest / `*.spec.ts` | Service 邏輯、快取、限流 | 無需任何服務 |
| **Layer 2：E2E 整合** | Supertest + AppModule | HTTP 路由、Auth guard、RBAC | 無需任何服務（mock DB） |
| **Layer 3：負載測試** | k6 | 登入 / 事件列表 / 回報提交 / 通知 | 需完整 stack |
| **Layer 4：前端 E2E** | Playwright | 登入頁、回報頁、存取控制 | 需完整 stack |

---

### 單元測試涵蓋範圍（Layer 1）

| 測試檔案 | 測試對象 | 主要案例 |
|----------|----------|---------|
| `auth/auth.service.spec.ts` | `AuthService` | 登入成功、錯誤密碼 → 401 + 稽核、帳號不存在 → 401、`me()` 去除 `passwordHash` |
| `safety-reports/safety-reports.service.spec.ts` | `SafetyReportsService` | ADMIN 回報 → 403、非 ACTIVE 事件 → 400、EMPLOYEE 成功 upsert + 稽核、RBAC `listTeam`/`listAll`、`stats` 範圍 |
| `reminders/reminders.service.spec.ts` | `RemindersService` | 事件不存在 → 拋錯、idempotency key 已存在 → 跳過、送出 EMPLOYEE/MANAGER 通知、Redis 未啟用時仍可執行 |
| `scope/scope.service.spec.ts` | `ScopeService` | 部門樹遞迴、ADMIN 全公司、MANAGER 部門+直屬下屬 union、EMPLOYEE 僅自己 |
| `events/events.service.spec.ts` | `EventsService` | Redis 快取命中/未命中、write-through invalidate（已有） |
| `departments/departments.service.spec.ts` | `DepartmentsService` | 快取策略（已有） |
| `health/health.controller.spec.ts` | `HealthController` | liveness payload（已有） |
| `common/throttler/redis-throttler.storage.spec.ts` | `RedisThrottlerStorage` | graceful degradation（已有） |
| `users/users.service.spec.ts` | `UsersService` | findAll 去除 passwordHash、create 重複 Email → 409、update 找不到 → 404、remove 成功 |
| `notifications/notifications.service.spec.ts` | `NotificationsService` | list 依 actor 篩選、markRead 成功、markRead 不屬於 actor → 404 |
| `audit-logs/audit-logs.service.spec.ts` | `AuditLogsService` | 分頁查詢、limit 最大 100 夾限、skip 計算正確 |
| `audit/audit.service.spec.ts` | `AuditService` | 寫入稽核紀錄、null actorId/resourceId 轉 undefined、`REPORT_SUBMIT` |

---

### E2E 整合測試案例（Layer 2）

| 端點 | 場景 | 預期結果 |
|------|------|---------|
| `GET /health` | 基本 | 200 `{ status: "ok" }` |
| `GET /health/ready` | mock DB | 200 `{ status: "ready", postgres: true }` |
| `POST /api/v1/auth/login` | 錯誤密碼 | 401 |
| `POST /api/v1/auth/login` | 帳號不存在 | 401 |
| `POST /api/v1/auth/login` | 缺少 email 欄位 | 400（ValidationPipe） |
| `POST /api/v1/auth/login` | 正確帳密 | 201 + `access_token` + user（無 passwordHash） |
| `GET /api/v1/events` | 無 token | 401 |
| `GET /api/v1/events` | ADMIN token | 200 + 陣列 |
| `POST /api/v1/events` | EMPLOYEE token | 403（`@Roles(ADMIN)` 限制） |
| `GET /api/v1/events/:id/reports` | EMPLOYEE token | 403（僅 ADMIN 可查全公司） |
| `POST /api/v1/events/:id/reports` | ADMIN token | 403（ADMIN 不能提交回報） |
| `GET /api/v1/events/:id/reports/team` | EMPLOYEE token | 403（僅 MANAGER） |
| `POST /api/v1/events/:id/reports` | EMPLOYEE token + ACTIVE 事件 | 202 + `{ status: "accepted", jobId, eventId, submitted }`（背景由 BullMQ worker 寫入 DB） |

---

### k6 負載測試情境（Layer 3）

**`business.js`**（日常混合負載，10 VU）：

```
Stage 1：0 → 10 VU，暖機 30s
Stage 2：10 VU  穩定負載 1 分鐘
Stage 3：10 → 0 VU  冷卻 10s
```

登入在 `setup()` 各執行一次（admin / manager / employee），避免觸發登入 rate limit（5 req/min/IP）。

| 情境 | 對應前端 | 主要 API |
|------|----------|----------|
| `health_check` | — | `GET /health` |
| `admin_workflow` | `/admin/events` → `/events/:id` | `me`、events、stats、**全公司 reports**（ADMIN 不回報） |
| `manager_workflow` | `/events/:id` | `me`、events、stats、**reports/me**、**reports/team**（直屬下屬） |
| `employee_workflow` | `/events/:id` | `me`、events、**reports/me**（低機率抽樣 POST → 202） |
| `notifications` | `/dashboard`、通知頁 | `GET /notifications` |

**`safety-report-burst.js`**：緊急事件大量回報（高併發 POST → 202 / BullMQ），與 business 互補。

**Threshold（business.js）**：

| 指標 | 門檻 |
|------|------|
| `http_req_failed{load:read}` | < 1%（讀取為主） |
| `http_req_duration` p(95) | < 800ms |
| `report_submit_duration` p(95) | < 1000ms |
| `login_error_rate` | < 1% |
| `reports_accepted_202` | ≥ 1（抽樣至少一筆 202） |

---

### 前端 Playwright E2E（Layer 4）

| 測試檔案 | 案例 |
|----------|------|
| `e2e/login.spec.ts` | 表單渲染、錯誤密碼顯示 `role=alert`、帳號不存在顯示錯誤、成功登入跳轉 `/dashboard` |
| `e2e/report.spec.ts` | 導覽至事件列表、回報頁顯示「安全」/「需要協助」大卡片、選安全並送出後跳回事件詳情、未登入直接訪問回報頁跳轉 `/login`、ADMIN 不顯示「安全回報」按鈕 |

## 負載測試（k6）

需本機安裝 [k6](https://k6.io/)。對 Nginx 健康檢查做輕量壓測：

```bash
BASE_URL=http://localhost k6 run infra/k6/health.js
```

## 專案結構（精簡）

```
final-project/
├── apps/
│   ├── api/                 # NestJS + Prisma
│   └── web/                 # Next.js 14 + shadcn/ui + TanStack Query
│       ├── app/[locale]/    # i18n 路由（/zh-TW/*、/en/*）
│       ├── i18n/            # next-intl routing / request / navigation 設定
│       ├── messages/        # zh-TW.json、en.json 翻譯檔
│       └── middleware.ts    # locale 偵測與導向
├── infra/
│   ├── nginx/               # 反向代理設定
│   ├── prometheus/
│   │   ├── prometheus.yml   # scrape 設定（15s interval）
│   │   └── rules/
│   │       └── api-alerts.yml  # HighErrorRate / HighLatency / PodDown
│   ├── grafana/provisioning/
│   │   ├── datasources/     # Prometheus 資料源（uid: prometheus）
│   │   └── dashboards/      # API Overview dashboard（自動載入）
│   ├── k8s/                 # kind / minikube 用 manifest
│   │   └── hpa.yaml         # HPA（minReplicas:2, maxReplicas:10）
│   │   └── gcp/             # GKE 用 manifest（LoadBalancer service）
│   └── k6/                  # 健康檢查負載測試
├── docker-compose.yml
├── pnpm-workspace.yaml
├── .env.example
└── README.md
```

## Kubernetes

本 repo 的 **Docker Compose** 可視為「單節點上的多容器預演」；`infra/k8s/` 已包含 HPA 等 manifest，遷到 **K8s** 時通常這樣對應：

| Compose 概念                 | Kubernetes 常見做法                                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api` 服務                 | `Deployment`（多副本）+ `Service`（ClusterIP）；水平擴展用 **HPA**（CPU / RPS）                                                                |
| `web` 服務                 | 同上；`NEXT_PUBLIC_*` 在 **build 時** 決定，CI 裡用 `docker build --build-arg` 或改為 **runtime 設定**（例如只打同源 `/api`）          |
| `nginx`                    | 多數用**`Ingress`**（如 ingress-nginx、Gateway API）取代叢集內自建 Nginx Pod；或保留 **Ingress Controller + 單一 Nginx**                   |
| `postgres`                 | 課程／生產建議**叢集外受管 DB**（RDS、Cloud SQL、Neon）；在 K8s 內用 **`Secret` 存 `DATABASE_URL`**，不要用無持久化保障的單 Pod Postgres |
| `redis`                    | **ElastiCache / Memorystore / Upstash**，或叢集內 **Helm bitnami/redis**（StatefulSet）；連線字串放 `Secret`                               |
| `prometheus` / `grafana` | 可用**kube-prometheus-stack** 等 Helm；或交給託管監控（Datadog、GCP Monitoring）                                                                   |

**健康檢查（已內建）**：在 Pod 的 `livenessProbe` 設 `GET /health`，`readinessProbe` 設 `GET /health/ready`（會查 Postgres；若 DB 尚未就緒可調整延遲或暫時只對 API 就緒）。

**Prisma migrate**：常見做法是 **`Job` 執行一次** `prisma migrate deploy`（或 CI/CD pipeline 在部署前跑），再滾動更新 `Deployment`，避免每個 Pod 同時 migrate。

**機密**：`JWT_SECRET`、`DATABASE_URL`、`REDIS_URL` 一律走 **`Secret`**（必要時搭配 External Secrets / 雲端 Secret Manager），不要進 image。

`infra/k8s/hpa.yaml`（及 `gcp/hpa.yaml`）已實作 `autoscaling/v2` HPA，CPU 60% / 記憶體 70% 觸發擴縮，最少 2 個 replica 確保滾動更新期間不中斷。套用方式：

```bash
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/hpa.yaml
kubectl get hpa -n safety-demo
```

**Zero-Downtime Rolling Update**：兩份 Deployment manifest（`infra/k8s/api-deployment.yaml`、`infra/k8s/gcp/api-deployment.yaml`）均已設定明確的滾動更新策略：

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0   # 更新過程中不允許任何 Pod 不可用
    maxSurge: 1         # 先啟動 1 個新 Pod，readinessProbe 通過後才終止舊 Pod
```

配合 `readinessProbe → GET /health/ready` 與 HPA `minReplicas: 2`，確保任何時刻都有至少 2 個可用 Pod 在服務。觸發更新後可用以下指令觀察：

```bash
kubectl rollout status deployment/api -n safety-demo
kubectl get pods -n safety-demo -w
```

## 進階與限制（報告可撰寫方向）

- **UI/UX（已實作）**：語意色彩系統（CSS 變數 `--success`/`--warning`/`--info`，含深色模式）；`StatusBadge` 元件統一全站狀態顯示；`Breadcrumb` 元件套用於所有二、三層頁面；Dashboard 摘要卡（進行中事件數、未讀通知數）；緊急回報頁改為大型卡片選擇器；Header 導覽 active 狀態與觸控目標強化；通知頁空狀態引導；Admin 欄位、角色 badge、稽核 action badge 分色；全站日期格式統一（`2026/05/17`）；修正所有頁面 SSR/Client hydration mismatch；**頁面淡入滑動過渡動畫**（`@keyframes page-fade-in`，0.22s ease-out，套用於 AppShell `<main>`）；**語言切換器重設計**（Globe 圖示 + `中文 · EN` 文字切換，移除邊框 segmented control）。
- **i18n**：前端已實作繁體中文 / English 雙語（`next-intl` v4，URL-based locale routing，Header 語言切換器）。後端錯誤訊息與通知內文可進一步改為 i18n template key。
- **高流量防護（三層防禦，已實作）**：
  1. **入口層 — 速率限制**：`@nestjs/throttler` + Redis-backed storage——全域 60 req/60s、登入 5 req/60s、安全回報 10 req/60s；`/health`、`/metrics`、`/admin/queues` 排除限流。Lua script 確保 INCR + PEXPIRE 原子性。Redis 不可用時 graceful degradation（允許所有請求，不拋 500）。
  2. **接收層 — 訊息佇列**：`POST /events/:id/reports` 透過 **BullMQ (Redis-backed)** 異步化——API 在 50ms 內回 `202 Accepted`（含 `jobId`），DB 寫入與稽核交給 worker。員工體感「回報成功」與底層寫入解耦；retry 3 次（exponential backoff），完成保留 100 筆、失敗保留 500 筆便於除錯。
  3. **處理層 — Worker**：`@Processor(SAFETY_REPORTS_QUEUE)` 與 API 同 Pod 啟動，HPA 觸發擴容時 worker 也跟著擴展（未來可拆獨立 Deployment 達成完全獨立的水平擴展與故障隔離）。
- **佇列儀表板**：`/admin/queues`（HTTP Basic Auth，帳號 `admin`，密碼來自 `QUEUE_DASHBOARD_PASSWORD`，預設亦為 `admin`）由 [`@bull-board/express`](https://github.com/felixmosh/bull-board) 以 Express middleware 形式掛在 Nest 之上，bypass `api/v1` 前綴，可即時觀察 `safety-reports` queue 的 waiting / active / completed / failed / delayed 數量。
- **負載測試（k6）**：[`infra/k6/safety-report-burst.js`](infra/k6/safety-report-burst.js) 模擬事件爆發，ramping VUs 0 → 500 → 0，驗證 `202` 回應率與 p95 < 800ms：
  ```bash
  BASE_URL=http://34.146.138.147 EVENT_ID=<active-evt-id> TOKEN=<jwt> \
    k6 run infra/k6/safety-report-burst.js
  ```
- **讀取快取（已實作）**：`GET /events` 依角色分為三組 key（`cache:events:list:ADMIN/MANAGER/EMPLOYEE`，TTL 30s）；`GET /departments` 單一 key（TTL 300s）。寫入時（create/update/delete）立即 invalidate，確保 Admin 狀態變更即時可見。
- **可靠性 / SPOF**：Compose 為單節點展示；生產環境可改 **多 API 副本 + Nginx upstream**、**DB 主從**、**Redis Sentinel**、**K8s readiness/liveness**（對應本專案 `/health`、`/health/ready`）。
- **認證**：示範使用 `localStorage` 存 JWT；生產建議 **HttpOnly Cookie** 或 **BFF**。

## 授權

本專案為課程期末專案示範用程式碼。
