# Branch Protection 設定（項目 2）

CI workflow 合併進 repo 後，請在 GitHub 上為 **main**（或 **master**）分支啟用保護規則，讓 CI 通過才能 merge。

## 設定步驟

1. 開啟 repo：**Settings → Branches → Branch protection rules → Add rule**
2. **Branch name pattern**：填 `main`（若預設分支是 `master` 則填 `master`）
3. 建議勾選：
   - **Require a pull request before merging**（可選，依團隊流程）
   - **Require status checks to pass before merging**
   - **Require branches to be up to date before merging**
4. 在 **Status checks that are required** 搜尋並勾選：
   - `Lint, test & build`
   - `Docker build`
5. 儲存規則

## 注意

- 第一次 push workflow 到 GitHub 後，status check 名稱才會出現在清單中；若找不到，先 merge 或 push 一次讓 Actions 跑完再回來設定。
- 需要 **repo admin** 權限才能修改 Branch protection。
- 本設定無法透過 repo 內的 YAML 自動完成，必須在 GitHub 網頁或由 admin 透過 API 設定。
