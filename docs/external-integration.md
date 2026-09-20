# PAPERHOOD 外部接入

本说明取代旧的内置 paper-run 接入说明：游戏 ID、入口和密钥全部来自后台登记，不再区分管理端与 Web 的游戏 ID。

1. 后台「游戏管理 → 登记外部游戏」，名称 PAPERHOOD，入口填写部署 URL。本地可填 `http://127.0.0.1:5190/`，外网使用独立 HTTPS origin。
2. 计分校验规则选择 `paper-run-practice-v5`。规则在登记时确定，后续轮换密钥不能改变它；只选通信测试的记录不能用于计分活动。
3. 保存并下载 ZIP，将其中 `p2l-config.js` 放到本游戏 `public/`。游戏已导入 SDK，不要额外加载 p2l-bridge.js。开发服务直接读取该文件；生产重新构建部署。
4. 下载配置中的 `parent_origin` 是管理端准确 origin（localhost 与 127.0.0.1 不等价）。生产构建 `VITE_P2L_PARENT_ORIGINS` 还需包含玩家 Web 的 origin，不要信任 URL 参数来扩充白名单。
5. 后台点击「通信测试」检查随机挑战与密钥，再做「完整试玩测试」。两者均不写正式榜单。轮换后需重新部署新配置，旧密钥的签名无法通过新公钥校验。
6. 新建活动选该外部游戏。Web 自动从 `/campaigns/:slug/game` 获取入口；不再配置 VITE_PAPERHOOD_GAME_URL。正式局次 game_key 就是登记的 gx ID。

不带 mode=platform 时仍是外发体验版；平台模式缺少配置会明确报错，不会回退为内置 ID。通信密钥是公开客户端测试密钥，不证明游戏分数可信；计分另由服务器规则检查。

iframe 测试要求管理端和游戏不同源。生产均使用 HTTPS，CSP frame-ancestors 允许管理端与 Web；不要使用阻止嵌入的 X-Frame-Options。通信测试使用 allow-scripts / allow-same-origin 沙箱，按准确 origin 和窗口来源验证消息，不传账号凭证。
