# GCP（GKE）部署 API — 具體步驟

> **注意**：`Job` 名稱為 `prisma-migrate`，若曾用本機 `infra/k8s/migrate-job.yaml` 在同一 namespace 建立過，請先執行  
> `kubectl delete job prisma-migrate -n safety-demo --ignore-not-found` 再套用本目錄的 Job。

以下假設你已安裝 **Google Cloud CLI**（`gcloud`）、`kubectl`、Docker，且 GCP 專案已**啟用計費**（GKE 需要）。

---

## 0. 安裝 `gcloud`（若出現 `command not found: gcloud`）

### macOS（Homebrew，建議）

```bash
brew install --cask gcloud-cli
```

安裝完成後，依 `brew` 結尾提示把 SDK 的 `bin` 加進 **PATH**（擇一或兩行都試，看檔案是否存在）：

```bash
# Apple Silicon 常見
export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
# Intel / 部分安裝路徑
export PATH="/usr/local/share/google-cloud-sdk/bin:$PATH"
```

可寫入 `~/.zshrc` 後 **重開終端機**，再執行：

```bash
gcloud version
```

### 官方安裝包

不打算用 Homebrew 時：[Install the Google Cloud CLI](https://cloud.google.com/sdk/docs/install-sdk) 依 macOS 圖形或指令安裝即可。

---

## 1. 登入並設定專案

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

把 `YOUR_PROJECT_ID` 換成 Console 裡的專案 ID（不是顯示名稱）。

---

## 2. 連結計費帳戶（必做）

若直接跑 §3 的 `gcloud services enable` 出現：

`Billing account for project '...' is not found` / `UREQ_PROJECT_BILLING_NOT_FOUND`

代表此 GCP **專案尚未綁定有效的計費帳戶**（GKE、Artifact Registry、Compute 等 API 都必須先開計費）。

**作法（擇一）**

1. **Console（最直覺）**  
   開 [Billing](https://console.cloud.google.com/billing) → 建立或選擇計費帳戶 → [專案列表](https://console.cloud.google.com/billing/linkedaccount) → **關聯**你的專案與該計費帳戶。

2. **CLI（已有計費帳戶 ID 時）**  
   列出計費帳戶：

   ```bash
   gcloud billing accounts list
   ```

   將專案綁到某個 `ACCOUNT_ID`（長得像 `01XXXX-XXXXXX-XXXXXX`）：

   ```bash
   gcloud billing projects link YOUR_PROJECT_ID --billing-account=ACCOUNT_ID
   ```

綁定成功後再執行下一節的 `gcloud services enable`。

> 教育帳號／學校專案：有時需由管理員在組織層開通計費或發給你可用的計費帳戶，再請他們把專案關聯上去。

### GKE「免費方案」抵免額（Console 常見說明）

Google 會寫：**每個計費帳戶每月約 $74.40 美元的抵免額**，約等於 **一個 Autopilot 叢集，或一個「可用區（zonal）」Standard 叢集**在符合條件下的叢集相關費用折抵。

請特別注意官方同一段常會補充：

- 抵免額**主要針對符合條件的叢集費用類型**；**不是**整張帳單都免費。  
- **運算（工作節點 VM）**、**Persistent Disk**、**Load Balancer**、**網路流量** 等，多半仍會照一般價計費（這些才是 demo 常見的實際支出）。  
- **區域（regional）**叢集若不在抵免範圍內，可能無法套用（以 Console 與 [定價說明](https://cloud.google.com/kubernetes-engine/pricing) 為準）。  
- 未用完的額度**不會累積到下個月**。

因此：**仍要綁計費帳戶**，只是有機會在符合條件下折抵一大塊「叢集管理／對應 SKU」費用；整體花費仍建議設 **Budget 告警**，並以 [Pricing Calculator](https://cloud.google.com/products/calculator) 估算「節點 + 磁碟 + LB」。

---

## 3. 啟用必要 API

```bash
gcloud services enable container.googleapis.com artifactregistry.googleapis.com
```

---

## 4. 建立 Artifact Registry（放 Docker 映像）

選一個區域，例如 `asia-east1`（台灣鄰近）：

```bash
export GCP_REGION=asia-east1
export AR_REPO=safety-api

gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$GCP_REGION" \
  --description="Employee safety API"
```

---

## 5. 建立 GKE 叢集（擇一）

### 選項 A：Autopilot（省事，由 Google 管節點）

```bash
gcloud container clusters create-auto safety-gke \
  --region="$GCP_REGION" \
  --release-channel=regular
```

### 選項 B：Standard 單節點（較好預估成本，適合作業）

```bash
export GCP_ZONE=asia-east1-a

gcloud container clusters create safety-gke \
  --zone="$GCP_ZONE" \
  --num-nodes=1 \
  --machine-type=e2-medium \
  --disk-size=30
```

---

## 6. 取得 kubectl 憑證

若建立叢集時出現 **`gke-gcloud-auth-plugin` was not found**（CRITICAL），請先安裝外掛再使用 `kubectl`：

```bash
gcloud components install gke-gcloud-auth-plugin
```

（之後新開終端機若仍有問題，可加上 `export USE_GKE_GCLOUD_AUTH_PLUGIN=True` 再試。）

Autopilot：

```bash
gcloud container clusters get-credentials safety-gke --region="$GCP_REGION"
```

Standard（若用 `--zone`）：

```bash
gcloud container clusters get-credentials safety-gke --zone="$GCP_ZONE"
```

確認：

```bash
kubectl get nodes
```

**Autopilot 特別說明**：新叢集在**尚未部署任何會排程到節點上的工作負載**時，Autopilot 可能維持 **0 個可排程節點**（官方文件寫「建立後先從零節點開始，等有 workload 才佈建」）。此時 `kubectl get nodes` 會顯示 **`No resources found`**，**不一定是壞掉**。可先檢查控制面是否正常：

```bash
kubectl get pods -A
kubectl cluster-info
```

接著部署任一實際 workload（例如本 README 後段的 **API `Deployment`**），或暫時套用內附範例（Autopilot 需有 **CPU/記憶體 requests**）：

```bash
kubectl apply -f infra/k8s/gcp/demo-workload.yaml
kubectl rollout status deployment/demo-nginx --timeout=120s
kubectl get nodes
```

驗證完若要刪除測試：`kubectl delete deployment demo-nginx`。

---

## 7. 設定 Docker 推送到 Artifact Registry

```bash
gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev"
```

---

## 8. 建映像並推送

在 **repo 根目錄**（`final-project/`）執行：

```bash
export GCP_PROJECT="$(gcloud config get-value project)"
export IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/safety-api:v1"

docker build -f apps/api/Dockerfile -t "$IMAGE" .
docker push "$IMAGE"
```

之後改程式要再上線：把 `v1` 改成 `v2` 等，重新 build / push，再 `kubectl set image deployment/api api="$IMAGE" -n safety-demo` 或重新 apply 下面渲染過的 YAML。

---

## 9. K8s 資源：命名空間

在 **repo 根目錄**：

```bash
kubectl apply -f infra/k8s/namespace.yaml
```

---

## 10. 建立 Secret（勿 commit 真值）

把下列連線字串改成你的 **Supabase**（或實際 DB），`JWT_SECRET` 請用夠長的隨機字串：

```bash
kubectl create secret generic app-env -n safety-demo \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=DIRECT_URL='postgresql://...' \
  --from-literal=JWT_SECRET='...' \
  --from-literal=JWT_EXPIRES_SEC='28800' \
  --from-literal=PORT='3000' \
  --from-literal=REDIS_URL='redis://...'
```

暫時沒有 Redis 可省略最後一行 `REDIS_URL`（與本機 README 明相同）。

---

## 11. 跑 Prisma migrate（一次性 Job）

在 **repo 根目錄**（確保已 `export IMAGE=...`）：

```bash
sed "s|__IMAGE__|$IMAGE|g" infra/k8s/gcp/migrate-job.yaml | kubectl apply -f -
kubectl wait --for=condition=complete job/prisma-migrate -n safety-demo --timeout=300s
kubectl logs job/prisma-migrate -n safety-demo --tail=50
```

失敗時常見原因：`DATABASE_URL` / `DIRECT_URL` 錯誤、或叢集出口無法連到 Supabase（較少見）。

若 Job 曾失敗過，需先刪除再重跑：

```bash
kubectl delete job prisma-migrate -n safety-demo --ignore-not-found
```

---

## 12. 部署 API + LoadBalancer

在 **repo 根目錄**：

```bash
sed "s|__IMAGE__|$IMAGE|g" infra/k8s/gcp/api-deployment.yaml | kubectl apply -f -
kubectl apply -f infra/k8s/gcp/api-service-loadbalancer.yaml
kubectl rollout status deployment/api -n safety-demo
```

取得對外 IP 或 hostname（約 1～3 分鐘；按 `Ctrl+C` 結束 watch）：

```bash
kubectl get svc api -n safety-demo -w
```

`EXTERNAL-IP` 有值後（有些區域會是 **hostname** 而非 IP，請以 Console 或 `kubectl get svc` 顯示為準），測試：

```bash
export LB_HOST="$(kubectl get svc api -n safety-demo -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"
# 若 IP 為空，改用 hostname：
[ -z "$LB_HOST" ] && export LB_HOST="$(kubectl get svc api -n safety-demo -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')"

curl -s "http://${LB_HOST}/health"
curl -s -X POST "http://${LB_HOST}/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Password123!"}'
```

> Service 對外使用 **port 80 → Pod 3000**；若你改成 HTTPS Ingress，再另裝 Managed Cert 與 Ingress。

---

## 14. 部署 Web（Next.js，期末展示用）

前端 **不必自訂網域**；會再拿到一個 **LoadBalancer 外部 IP**（與 API 不同 IP）。  
`NEXT_PUBLIC_API_URL` 必須在 **docker build 時**寫入（Next 會 bake 進 bundle），請指到 **§12 的 API 外部 IP**。

在 **repo 根目錄**：

```bash
export GCP_REGION=asia-northeast1
export GCP_PROJECT="$(gcloud config get-value project)"
export AR_REPO=safety-api
export USE_GKE_GCLOUD_AUTH_PLUGIN=True

export API_LB_IP="$(kubectl get svc api -n safety-demo -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"
echo "API_LB_IP=$API_LB_IP"

export WEB_IMAGE="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT}/${AR_REPO}/safety-web:v1"

docker buildx build --platform linux/amd64 \
  -f apps/web/Dockerfile \
  --build-arg "NEXT_PUBLIC_API_URL=http://${API_LB_IP}/api/v1" \
  -t "$WEB_IMAGE" \
  --push .

sed "s|__IMAGE__|$WEB_IMAGE|g" infra/k8s/gcp/web-deployment.yaml | kubectl apply -f -
kubectl apply -f infra/k8s/gcp/web-service-loadbalancer.yaml
kubectl rollout status deployment/web -n safety-demo --timeout=600s
kubectl get svc web -n safety-demo
```

`web` 的 **EXTERNAL-IP** 出來後，用瀏覽器開（本專案 i18n 預設路徑帶語系）：

```text
http://<WEB_EXTERNAL-IP>/zh-TW/login
```

登入帳號與 seed 相同（例如 `admin@demo.com` / `Password123!`）。

**架構摘要**

| 元件 | 對外 |
|------|------|
| Web（Next） | `http://<WEB_IP>/zh-TW/...` |
| API（Nest） | `http://<API_LB_IP>/api/v1/...`（build 時已寫進前端） |
| DB | Supabase（叢集外） |

若 Web Pod 啟動較慢，第一次 `rollout` 可能接近 5～10 分鐘，屬 Next 冷啟動正常現象。

---

## 13. 更新或下線

- **更新映像**：build/push 新 tag → `kubectl set image deployment/api api=NEW_IMAGE -n safety-demo`（Web 同理 `deployment/web`）
- **刪叢集（停止計費）**：
  - Autopilot：`gcloud container clusters delete safety-gke --region="$GCP_REGION"`
  - Standard：`gcloud container clusters delete safety-gke --zone="$GCP_ZONE"`

---

## 與本機 kind 的差異整理

| 項目 | kind | GCP |
|------|------|-----|
| 映像 | `kind load docker-image` | `docker push` 到 Artifact Registry |
| YAML | `infra/k8s/api-deployment.yaml`（local 映像） | 本目錄 `api-deployment.yaml`（`__IMAGE__` + `Always`） |
| 對外 | `kubectl port-forward` | `LoadBalancer` Service → 外部 IP |

更通用的說明仍見上一層 [`../README.md`](../README.md)。
