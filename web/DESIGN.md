# My King 管理后台设计系统

本文件约束 `web/` 中用户可见的登录后管理后台。认证页由
`hermes_cli/dashboard_auth/` 复用同一品牌材料，但认证协议、Cookie、PKCE、
API、网关和后端内核不属于视觉层，任何样式改造不得改变这些边界。

## 1. 设计方向与用户

- 方向：浅色 macOS 26 Liquid Glass。工作区保持清晰、偏实色；导航、工具栏、
  控件、弹层和状态反馈使用有边缘高光、折射层次和轻微彩色环境光的玻璃材料。
- 记忆点：左侧悬浮玻璃导航坞与顶部连续玻璃工具栏共同包围浅色工作平面，
  My King 蓝只用于动作、选中和键盘焦点。
- 核心用户：使用中文的员工、后台管理员、在窄屏临时排障的移动用户，以及需要
  键盘、高对比度、减少透明度或减少动画的用户。
- 视觉参考：项目现有桌面端 Liquid Glass 合同、已锁定的 My King 品牌资产，
  以及 Apple 的中性底色、SF 字体、分级圆角与克制蓝色动作语义。

## 2. 颜色与材料令牌

所有页面通过 `my-king-dashboard.css` 中的 `--mk-web-*` 令牌取值；组件不得新增
未登记的色值。

| 角色 | 令牌 | 目标 |
| --- | --- | --- |
| 画布 | `--mk-web-canvas` | `#f4f7fc` |
| 深层画布 | `--mk-web-canvas-deep` | `#eaf0fb` |
| 主文字 | `--mk-web-ink` | `#1d1d1f` |
| 次级文字 | `--mk-web-secondary` | `#5e6573` |
| 主动作/焦点 | `--mk-web-blue` | `#2457e6` |
| 深动作 | `--mk-web-blue-deep` | `#1742c4` |
| 环境紫/青 | `--mk-web-purple`, `--mk-web-cyan` | 仅用于背景光与数据系列 |
| 玻璃面 | `--mk-web-glass`, `--mk-web-glass-strong` | 透明白色叠层 |
| 发丝线 | `--mk-web-stroke`, `--mk-web-stroke-strong` | 冷灰蓝透明边界 |
| 状态 | `--mk-web-success`, `--mk-web-warning`, `--mk-web-danger` | 状态信息，不作装饰 |

材料由四层组成：半透明底、左上内高光、右下微弱内阴影、冷色环境投影。
禁止用单一 `backdrop-filter` 冒充玻璃，也禁止把每一个内容块都做成独立卡片。

## 3. 字体与信息层级

- 正文与控件：`-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`,
  `PingFang SC`, `Microsoft YaHei`, `Segoe UI`, sans-serif。
- 标题：同一系统栈，优先 `SF Pro Display`；不加载外部网络字体。
- 代码、路径、令牌和固定宽度数据才使用 `SF Mono`/系统等宽字体。
- 页面标题 22–26px / 650；分区标题 16–18px / 620；正文 14–16px；
  辅助文字 13px。中文导航与按钮使用正常句式，不强制大写、不使用夸张字距。
- 段落使用 `text-wrap: pretty`；短标题使用 `text-wrap: balance`，避免中文末行
  出现单字、助词或标点孤行。

## 4. 尺寸、圆角与空间

- 基础空间单位 4px；常用间距 8、12、16、20、24、32px。
- 图标按钮最小 36px；普通按钮、输入框、选择框最小 44px；侧栏导航行 44px。
- 输入/小控件圆角 12–14px；操作胶囊 14px；内容区 18px；侧栏与弹层 24px。
- 桌面侧栏以悬浮导航坞呈现，内容工作区只有一个纵向滚动拥有者；
  `min-height: 0`、`min-width: 0` 不得移除。

## 5. 可复用原语与状态

- **Dashboard shell**：全屏固定侧栏 + 单一主滚动区；背景环境光不接收指针事件。
- **Navigation dock**：My King 标识、44px 导航镜片、系统状态和身份区共用一块
  玻璃材料。默认透明；hover 为浅折射；active 为蓝色内染；focus 为独立外环。
- **Page toolbar**：连续玻璃平面，承载页面标题和既有动作，不增加新导航或处理器。
- **Surface section**：用于统计、表格、配置组和空状态的 18px 玻璃分区；相邻内容
  以间距或单根发丝线分组，禁止卡片套卡片。
- **Control**：按钮、输入、选择器、分段控件共享 44px 高度、14px 圆角与字体。
  primary 使用 My King 蓝；secondary 使用浅玻璃；destructive 仅用于破坏性动作。
- **Dialog / popover**：24px 浮动玻璃，带遮罩、内高光和明确关闭/取消路径。
- **Status**：成功、警告、错误同时使用颜色、图标或文字，不依赖单一颜色。
- **Empty / loading / error**：保持同一页面结构；加载不可闪回旧主题；错误必须给出
  中文说明和原有重试/恢复动作。

## 6. 动效

- 只为真实状态变化服务：hover 120ms，按压 90ms，侧栏/弹层 180–240ms。
- 只动画 `transform`、`opacity`、`filter`；禁止动画布局尺寸和位置。
- 按压可使用 `translateY(1px)` 或 `scale(.985)`，但不得导致文本跳动。
- `prefers-reduced-motion` 下接近零时长；加载、错误和连接状态仍必须可识别。

## 7. 响应式与内容压力

- 375px：侧栏成为抽屉；主内容单列；按钮可换行但保持 44px；无横向滚动。
- 768px：保持移动工具栏，列表与表单按容器宽度重排。
- 1280px：显示悬浮侧栏坞和完整页面工具栏；内容最大可读宽度由各页面负责。
- 必测：空列表、长中文标签、无空格 URL/令牌、错误提示、弹层、菜单、键盘焦点，
  以及 200% 缩放。表格或终端可拥有明确命名的内部横向滚动，页面本身不可横溢。

## 8. 可访问性、升级边界与已接受债务

- 文字和控件满足 WCAG AA；键盘焦点与选中态分离；触控目标不小于 44px。
- 支持 `prefers-reduced-transparency`、`prefers-contrast`、
  `prefers-reduced-motion`，并保留语义 HTML、标签、ARIA 和 DOM 顺序。
- 样式覆盖集中在 `web/src/styles/my-king-dashboard.css`，不删除上游组件、主题数据
  或路由；升级时只需重新验证这一覆盖层和少量展示属性。
- 员工版仅投影钉钉、微信、企业微信和飞书的消息平台；底层适配器和数据不删除。
  更新权限继续由服务器 `can_update_hermes` 决定，前端不得绕过。
- 已接受债务：插件、模型和 MCP 目录中的第三方专有名称及其原始描述可保持原文；
  My King 自有导航、状态、动作和说明必须默认简体中文。
