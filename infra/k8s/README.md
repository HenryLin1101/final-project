# Kubernetes 最小上手（先只跑 API）

目標：在本機 **kind**（或 minikube）起一個叢集，把 **API 映像**載入叢集，用 **Secret** 注入環境變數，跑 **migrate Job**，再 **Deployment** 對外測試。

---

## 0. 安裝工具

- [Docker](https://docs.docker.com/get-docker/)（或相容的 container runtime）
- [kubectl](https://kubernetes.io/docs/tasks/tools/)
- 本機叢集擇一：
  - [kind](https://kind.sigs.k8s.io/docs/user/quick-start/)（建議，輕量）
  - [minikube](https://minikube.sigs.k8s.io/docs/start/)

---

## 1. 建立本機叢集（kind 範例）

```bash
kind create cluster --name safety
kubectl cluster-info
kubectl get nodes
```

---

## 2. 建 API 映像（在 repo 根目錄）

```bash
docker build -f apps/api/Dockerfile -t local/safety-api:dev .
```

`api-deployment.yaml` / `migrate-job.yaml` 預設使用 `local/safety-api:dev`。

---

## 3. 把映像載進 kind 叢集

```bash
kind load docker-image local/safety-api:dev --name safety
```

若用 **minikube**：`minikube image load local/safety-api:dev`（或 `eval $(minikube docker-env)` 後在同一 daemon build）。

若映像已 push 到 **GHCR / Docker Hub**：把 YAML 裡的 `image:` 改成你的位址，並把 `imagePullPolicy` 改為 `Always`（或依需求），叢集需能拉得到 registry。

---

## 4. 建立命名空間與 Secret

命名空間：

```bash
kubectl apply -f infra/k8s/namespace.yaml
```

**不要**把真實連線字串 commit 進 git。用指令建立 Secret（請替換成你的值）：

```bash
kubectl create secret generic app-env -n safety-demo \
  --from-literal=DATABASE_URL='postgresql://...' \
  --from-literal=DIRECT_URL='postgresql://...' \
  --from-literal=JWT_SECRET='請換成夠長的隨機字串' \
  --from-literal=JWT_EXPIRES_SEC='28800' \
  --from-literal=PORT='3000' \
  --from-literal=REDIS_URL='redis://...'
```

- **Supabase**：`DATABASE_URL` / `DIRECT_URL` 與本機 `.env` 相同概念（pooler、`pgbouncer=true` 等見 `apps/api/.env.example`）。
- **本機暫不跑 Redis**：可省略 `REDIS_URL`；`/health/ready` 仍會通過（Redis 為 SKIPPED）。

更新 Secret：`kubectl delete secret app-env -n safety-demo` 後再 `create` 一次。

---

## 5. 跑資料庫 migration（一次性 Job）

```bash
kubectl apply -f infra/k8s/migrate-job.yaml
kubectl wait --for=condition=complete job/prisma-migrate -n safety-demo --timeout=120s
kubectl logs job/prisma-migrate -n safety-demo
```

失敗時看 Job / Pod 日誌，多半是 `DATABASE_URL` / `DIRECT_URL` 或網路無法連到雲端 DB。

---

## 6. 部署 API 與 Service

```bash
kubectl apply -f infra/k8s/api-deployment.yaml
kubectl apply -f infra/k8s/api-service.yaml
kubectl rollout status deployment/api -n safety-demo
kubectl get pods,svc -n safety-demo
```

---

## 6.5 啟用 HPA（Horizontal Pod Autoscaler）

HPA 需要 **metrics-server** 已安裝（GKE 預設有；kind/minikube 需手動啟用）。

**kind 啟用 metrics-server：**
```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
# kind 需要額外加 --kubelet-insecure-tls 旗標：
kubectl patch deployment metrics-server -n kube-system \
  --type='json' \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
```

**套用 HPA：**
```bash
kubectl apply -f infra/k8s/hpa.yaml
kubectl get hpa -n safety-demo          # 確認 HPA 狀態
kubectl describe hpa api-hpa -n safety-demo  # 查看擴縮容事件
```

`TARGETS` 欄位顯示 `<unknown>` 屬正常，約 60 秒後 metrics-server 有資料才會變成百分比。

---

## 7. 從筆電連到叢集內 API

```bash
kubectl port-forward -n safety-demo svc/api 3000:3000
```

另開終端機：

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:3000/health/ready
```

登入測試：

```bash
curl -s -X POST http://127.0.0.1:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.com","password":"Password123!"}'
```

（雲端 DB 需已 migrate + 必要時已 seed。）

---

## 下一步（第二階段）

1. **Next.js web**：再一個 `Deployment` + `Service`；`NEXT_PUBLIC_API_URL` 在 **build image 時**帶入（`docker build --build-arg`），或改為經 **Ingress** 同源 `/api`。
2. **Ingress**：用 ingress-nginx / 雲端 LB 取代 `kubectl port-forward`。
3. **叢集內 Redis**（可選）：Helm `bitnami/redis` 或雲端 Memorystore，再把 `REDIS_URL` 寫進 Secret。

更完整的對照表見 repo 根目錄 `README.md` 的「Kubernetes（之後擴展）」一節。

---

## 雲端託管 Kubernetes（給 demo／報告通常比較好）

**為什麼很多人最後仍選雲端叢集**：可以有 **固定對外網址**（Ingress + 網域或雲端給的 hostname）、助教／同學不用連你筆電、也比較像「真的上線」的流程。本機 **kind** 仍適合先除錯；確認 YAML 沒問題後，再套到雲端即可。

### 你要多準備的三件事

1. **一個託管叢集**（擇一即可；依學校帳號／免費額度／課程指定）  
   例如：GKE、EKS、AKS，或較輕量的 **DigitalOcean Kubernetes、Linode LKE、Civo** 等。建立叢集後，用雲端主控台或 CLI 把 **`kubeconfig`** 下載到本機，`kubectl config use-context …` 指到該叢集。

2. **容器映像 registry**（叢集要能 `pull`）  
   常見：**GitHub Container Registry (ghcr.io)**、**Docker Hub**。在本機 build 後 `docker tag` + `docker push`。把 `api-deployment.yaml` 與 `migrate-job.yaml` 裡的 `image:` 改成你 push 的完整名稱，並把 `imagePullPolicy` 改成 `Always`（或依 registry 說明調整）。若 registry **私有**，需在叢集建立 **imagePullSecrets** 並在 Pod 的 `spec.imagePullSecrets` 引用（各雲文件都有範例）。

3. **對外流量**（取代 `port-forward`）  
   - 最快：**`Service` 型別改為 `LoadBalancer`**（雲端會配一個外部 IP／hostname；依供應商計費）。  
   - 較標準：**`Ingress` + Ingress Controller**（例如 nginx、或雲端 Application Gateway／ALB），適合之後 Web + API 同網域。

其餘步驟與本機相同：**`namespace` → `Secret` → `migrate-job` → `api-deployment` → `api-service`**；差別只在「映像從 registry 拉」與「用 LB 或 Ingress 對外」。

### 費用與習慣

- 用完或交件前：**縮小節點數、刪叢集或關掉節點池**，避免忘記關而一直計費。  
- **Secret** 仍只用 `kubectl create` 或雲端 Secret Manager／External Secrets，不要寫進 Git。  
- **Supabase** 仍可當 DB；叢集在雲上時，確認 **Supabase 連線**允許你叢集**出口 IP**（若有 IP allowlist 再開或改用 pooler）。

若你已確定要用哪一家（例如學校只給 GCP），可再對照該家的「建立 GKE / 設定 Artifact Registry / 對外 Service」文件，把同一組 manifest 套上去即可。

**GCP 逐步指令（本 repo）**：請直接跟著 [`gcp/README.md`](gcp/README.md) 從 `gcloud auth login` 做到取得 LoadBalancer IP。
