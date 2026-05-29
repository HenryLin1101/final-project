# CD：Deploy to GKE

合併至 `main` 後，[`.github/workflows/ci.yml`](workflows/ci.yml) 跑完且**全部通過**時，[`.github/workflows/deploy-gke.yml`](workflows/deploy-gke.yml) 才會自動建置映像並部署 API + Web 到 GKE（`workflow_run` 觸發，CI 失敗則不部署）。

也可在 GitHub **Actions → Deploy to GKE → Run workflow** 手動觸發（略過 CI gate，請謹慎使用）。

> **Prisma migrate 不在 CD 內執行**。首次部署或 schema 變更時，請依下方 §「手動 migrate」自行跑一次。

## 前置（一次性）

### 1. GKE 叢集與 Artifact Registry

依 [`infra/k8s/gcp/README.md`](../infra/k8s/gcp/README.md) 建立 GKE、Artifact Registry repo（預設 `safety-api`）。

### 2. K8s Secret `app-env`

在叢集內建立（**勿 commit 真值**）；API Pod 執行時仍需要：

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

Supabase：`DIRECT_URL` 請用 **Session pooler `:5432`**（見 `apps/api/.env.example`）。

### 3. 手動 migrate（首次 / schema 變更時）

在 **repo 根目錄**，先 build & push 與 CD 相同 tag 的 API 映像，或沿用已 push 的映像：

```bash
export GCP_REGION=asia-northeast1
export GCP_PROJECT="$(gcloud config get-value project)"
export AR_REPO=safety-api
export IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/safety-api:YOUR_TAG"

kubectl delete job prisma-migrate -n safety-demo --ignore-not-found
sed "s|__IMAGE__|$IMAGE|g" infra/k8s/gcp/migrate-job.yaml | kubectl apply -f -
kubectl wait --for=condition=complete job/prisma-migrate -n safety-demo --timeout=300s
kubectl logs job/prisma-migrate -n safety-demo --tail=50
```

種子資料（登入帳號）需另在本機對同一 DB 執行：

```bash
pnpm --filter api exec prisma db seed
```

### 4. GCP Service Account（給 GitHub Actions）

建立具下列權限的 SA，並下載 JSON key：

- Artifact Registry Writer
- Kubernetes Engine Developer（或 Cluster Admin）
- Service Account User

### 5. GitHub Secrets

在 repo **Settings → Secrets and variables → Actions** 新增：

| Secret | 說明 | 範例 |
|--------|------|------|
| `GCP_PROJECT_ID` | GCP 專案 ID | `my-project-123` |
| `GCP_SA_KEY` | SA JSON 金鑰全文 | `{ "type": "service_account", ... }` |
| `GKE_CLUSTER_NAME` | GKE 叢集名稱 | `safety-gke` |
| `GCP_REGION` | 選填，預設 `asia-northeast1` | `asia-northeast1` |
| `GCP_AR_REPO` | 選填，Artifact Registry repo 名 | `safety-api` |

### 6. GitHub Environment（建議）

建立 **production** environment（Settings → Environments），可加上 required reviewers；workflow 已綁定 `environment: production`。

## 部署流程（CD 自動）

1. `main` push → CI workflow 完成且成功 → 觸發 Deploy to GKE  
2. Build & push `safety-api:<commit-sha>` 至 Artifact Registry  
3. Rolling update API Deployment + LoadBalancer Service  
4. 取得 API 外部 IP → build Web（`NEXT_PUBLIC_API_URL` 指向 API LB）  
5. Deploy Web Deployment + LoadBalancer Service  

## 故障排除

- **kubectl `gke-gcloud-auth-plugin not found`**：workflow 已安裝 `gke-gcloud-auth-plugin` 並設定 `USE_GKE_GCLOUD_AUTH_PLUGIN=True`
- **Missing secret**：依上方表格補齊 GitHub Secrets  
- **API Pod CrashLoop / 登入失敗**：確認 K8s `app-env` 已建、已手動 migrate + seed  
- **Image pull 失敗**：確認 GKE 節點 SA 或 Workload Identity 可讀 Artifact Registry  
- **Web 502**：確認 Web build 時的 `NEXT_PUBLIC_API_URL` 與 API LB IP 一致  
