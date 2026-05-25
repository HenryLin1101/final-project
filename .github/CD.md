# CD：Deploy to GKE

合併至 `main` 後，[`.github/workflows/deploy-gke.yml`](workflows/deploy-gke.yml) 會自動建置映像、跑 migrate、部署 API + Web 到 GKE。

也可在 GitHub **Actions → Deploy to GKE → Run workflow** 手動觸發。

## 前置（一次性）

### 1. GKE 叢集與 Artifact Registry

依 [`infra/k8s/gcp/README.md`](../infra/k8s/gcp/README.md) 建立 GKE、Artifact Registry repo（預設 `safety-api`）。

### 2. K8s Secret `app-env`

在叢集內建立（**勿 commit 真值**）：

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

### 3. GCP Service Account（給 GitHub Actions）

建立具下列權限的 SA，並下載 JSON key：

- Artifact Registry Writer
- Kubernetes Engine Developer（或 Cluster Admin）
- Service Account User

### 4. GitHub Secrets

在 repo **Settings → Secrets and variables → Actions** 新增：

| Secret | 說明 | 範例 |
|--------|------|------|
| `GCP_PROJECT_ID` | GCP 專案 ID | `my-project-123` |
| `GCP_SA_KEY` | SA JSON 金鑰全文 | `{ "type": "service_account", ... }` |
| `GKE_CLUSTER_NAME` | GKE 叢集名稱 | `safety-gke` |
| `GCP_REGION` | 選填，預設 `asia-northeast1` | `asia-northeast1` |
| `GCP_AR_REPO` | 選填，Artifact Registry repo 名 | `safety-api` |

### 5. GitHub Environment（建議）

建立 **production** environment（Settings → Environments），可加上 required reviewers；workflow 已綁定 `environment: production`。

## 部署流程

1. Build & push `safety-api:${{ github.sha }}` 至 Artifact Registry  
2. 刪除舊 migrate Job → 執行 `prisma migrate deploy`  
3. Rolling update API Deployment + LoadBalancer Service  
4. 取得 API 外部 IP → build Web（`NEXT_PUBLIC_API_URL` 指向 API LB）  
5. Deploy Web Deployment + LoadBalancer Service  

## 故障排除

- **Missing secret**：依上方表格補齊 Secrets  
- **migrate Job 失敗**：`kubectl logs job/prisma-migrate -n safety-demo`；檢查 `app-env` 的 `DATABASE_URL`  
- **Image pull 失敗**：確認 GKE 節點 SA 或 Workload Identity 可讀 Artifact Registry  
- **Web 502**：確認 Web build 時的 `NEXT_PUBLIC_API_URL` 與 API LB IP 一致  
