# 環境變數與 Secret 對照（項目 6）

本文件整理 **本機開發**、**Docker Compose**、**GitHub Actions CI**、**Kubernetes** 各環境需要的變數。  
**請勿將含真實密碼或連線字串的檔案 commit 進 git。**

## 檔案對照

| 用途 | 範本檔 | 實際使用（gitignore） |
|------|--------|----------------------|
| Monorepo 根目錄（參考） | [`.env.example`](../.env.example) | `.env` |
| NestJS API | [`apps/api/.env.example`](../apps/api/.env.example) | `apps/api/.env` |
| Next.js Web | [`apps/web/.env.example`](../apps/web/.env.example) | `apps/web/.env.local` |
| K8s Secret（kubectl 參考） | [`infra/k8s/app-env.secret.example`](../infra/k8s/app-env.secret.example) | 僅在叢集內 `Secret`，不進 git |

## 變數一覽

| 變數 | 必要 | 使用位置 | 說明 |
|------|------|----------|------|
| `DATABASE_URL` | API / K8s | API、Prisma migrate | PostgreSQL 連線字串；須為 `postgresql://` |
| `DIRECT_URL` | API / K8s | Prisma migrate / introspection | 本機可與 `DATABASE_URL` 相同；Supabase 見 `apps/api/.env.example` |
| `REDIS_URL` | 選填 | API | 未設定時 rate limit / cache 會 graceful degradation |
| `JWT_SECRET` | API / K8s | API 簽發 JWT | 生產環境請用夠長的隨機字串 |
| `JWT_EXPIRES_SEC` | 選填 | API | Token 有效期（秒），預設 `28800` |
| `PORT` | 選填 | API | API 監聽埠，預設 `3000` |
| `NEXT_PUBLIC_API_URL` | Web build | Next.js 前端 | 瀏覽器呼叫 API 的 base URL；Docker build 時以 `--build-arg` 傳入 |

## 各環境說明

### 本機開發（pnpm dev）

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

- API：`http://localhost:3000`
- Web：`http://localhost:3001`
- `NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1`

### Docker Compose

Compose 在 `docker-compose.yml` 內為 `api` / `web` 注入環境變數；web image 建置時 `NEXT_PUBLIC_API_URL` 預設為 `http://localhost/api/v1`（經 Nginx 同源）。

### GitHub Actions CI

CI **不需要**資料庫或 Redis 連線：

- 單元 / E2E 測試使用 mock，無需 `DATABASE_URL`
- `prisma generate` 只驗證 schema，不連線 DB
- 未來 CD workflow 才需要在 GitHub **Secrets** 設定（例如 `GCP_SA_KEY`、`DATABASE_URL`）

### Kubernetes（`app-env` Secret）

在 namespace `safety-demo` 建立 Secret，供 `api-deployment`、`migrate-job` 的 `envFrom.secretRef` 使用：

```bash
kubectl apply -f infra/k8s/namespace.yaml

kubectl create secret generic app-env -n safety-demo \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=DIRECT_URL='postgresql://...' \
  --from-literal=JWT_SECRET='...' \
  --from-literal=JWT_EXPIRES_SEC='28800' \
  --from-literal=PORT='3000' \
  --from-literal=REDIS_URL='redis://...'
```

更新 Secret：先 `kubectl delete secret app-env -n safety-demo`，再重新 `create`。

詳細 K8s 步驟見 [`infra/k8s/README.md`](../infra/k8s/README.md)、[`infra/k8s/gcp/README.md`](../infra/k8s/gcp/README.md)。

## 未來 CD 可能需要的 GitHub Secrets（尚未設定）

| Secret 名稱 | 用途 |
|-------------|------|
| `GCP_SA_KEY` 或 Workload Identity | GKE 部署認證 |
| `DATABASE_URL` / `DIRECT_URL` | 部署前 migrate job |
| `JWT_SECRET` | 與 K8s `app-env` 一致 |
| `REDIS_URL` | 選填，雲端 Redis |
| Registry 認證 | push Docker image 至 GHCR / Artifact Registry |
