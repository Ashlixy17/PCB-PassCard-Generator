<h1 align="center">PCB-PassCard-Generator</h1>

<p align="center">
  <img alt="Language" src="https://img.shields.io/badge/Language-TypeScript-3178C6?logo=typescript&logoColor=white">
  <img alt="Framework" src="https://img.shields.io/badge/Framework-React-61DAFB?logo=react&logoColor=black">
  <br>
  <img alt="Runtime" src="https://img.shields.io/badge/Runtime-Browser-4285F4?logo=googlechrome&logoColor=white">
  <a href="LICENSE"><img alt="License: MIT for original contributions; third-party terms apply" src="https://img.shields.io/badge/License-MIT%20%2B%20Third--party-D22128"></a>
  <a href="https://github.com/Ashlixy17/PCB-PassCard-Generator/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/Ashlixy17/PCB-PassCard-Generator?style=social"></a>
</p>

<p align="center">
  <strong>PCB-PassCard-Generator</strong> 是一款基于明日方舟通行证模板的 PCB 图片生成工具
  <br>
  选个干员、放上立绘，做一张自己的 PCB 通行证
  <br>
  <strong>支持独立素材分色、2D／3D 预览与分层图纸导出</strong>
<p align="center">
  <a href="https://ashlixy17.github.io/PCB-PassCard-Generator/">点击此处进入网页</a>
</p>

## Web界面&完整功能

![通行证模板设计界面](assets/PCB-PassCard-Generator-preview.png)

<p align="center">通行证模板编辑与 PCB 预览</p>

---

- **角色与模板编辑**：内置干员库，也可自定义姓名、编号、职业和阵营；支持上传完整立绘、透明抠图与自定义 Logo，并进行对齐和裁剪。
- **两种分层模式**：纯灰度三分模式按明暗阈值分层；彩色识别模式按颜色识别金属、阻焊下覆铜和裸基材，支持 ENIG 沉金、HASL 喷锡和 OSP 效果。两种模式分别保存全局与局部参数，重置只影响当前模式。
- **独立素材调参**：人物、阵营 Logo、职业图标、文字、条码和装饰可分别设置材料与显隐，调整亮度、对比度、反相、阈值、边缘加粗和平滑；Logo 可保留内部纹理，正背面的位置与缩放独立调整。
- **正反面与阻焊配色**：正面保留通行证排版，背面以阵营或自定义 Logo 居中显示；两面共用阻焊颜色，支持预设与自定义配色，浅色底板自动搭配深色丝印预览。
- **2D／3D 实时预览**：在平面图和实物模型之间切换，查看外轮廓、贯穿孔槽、板厚与材料光泽；支持旋转、缩放、平移和保存当前 3D 视图 PNG。
- **GPU 后台处理**：分色、平滑、加粗与合成在后台计算，调整时保持 590 × 1180 完整精度，2D 与 3D 同步更新；不支持后台 WebGL2 或上下文丢失时自动回退到 CPU。
- **分层图纸导出**：下载效果 PNG，或将正反面的丝印、铜、阻焊开窗、板形蒙版与处理参数打包为 ZIP；彩色模式还提供金属、覆铜和裸基材区域图。
- **工程保存与恢复**：导出时保留“可编辑工程数据”，再次导入即可恢复上传图片、文字、分层参数与板材尺寸，继续编辑。

## 快速开始

1. 打开 [网页版](https://ashlixy17.github.io/PCB-PassCard-Generator/)，推荐使用 Chrome 或 Edge。
2. 选择干员或切换到自定义录入，上传人物完整图、透明抠图；需要时点击“对齐与裁剪”调整图片。
3. 选择“纯灰度三分分层”或“彩色识别分层”，设置阻焊颜色，并查看正反面效果。
4. 点击“详细调整”，选择要处理的素材，调整材料、明暗和内部细节。需要隐藏底板时，在“调整对象 → 下方底板”中取消“显示这个素材”。
5. 切换“3D 实物”检查整体效果，也可调整预览板宽、板厚并保存截图。
6. 点击“导出分层”，选择所需图纸并打包下载。保留“可编辑工程数据”，以后可通过顶部“导入已保存板”继续编辑。

操作提示：3D 预览中拖动旋转、滚轮缩放、右键平移；点击正面／背面回到对应视角，“立体视角”恢复斜视。主预览与详细调整共用预览方式和板材尺寸。

> [!IMPORTANT]
> 导出文件为分层 PNG，不是 Gerber。制板前需在 PCB 工具中指定实际尺寸，核对线宽、间距与图层对齐，再生成制造文件。
> 3D 默认尺寸为 **59 × 118 × 1.6 mm**；修改预览尺寸只影响模型，分层 PNG 始终为 **590 × 1180 px**。

> [!NOTE]
> 导入含“可编辑工程数据”的 ZIP 可恢复素材并继续调参；仅含制造层和板形蒙版的旧 ZIP 只能恢复板面，不能还原缺失的原图与文字。
> 刷新页面后，上传图片需重新选择，或从已保存的工程 ZIP 恢复。

## 网页版说明

| 项目 | 处理方式 |
| --- | --- |
| 图片 | 在当前浏览器中处理，完整图、透明抠图与自定义 Logo 分别保存为独立输入。 |
| 偏好 | 角色库、裁剪偏好和 PCB 分色参数保存在当前浏览器的 `localStorage`，不同站点不会自动共享。 |
| 工程 | 通过 ZIP 下载与导入；保留工程数据后可携带原始素材、编辑参数和板材尺寸。 |
| 图纸 | 正反面统一使用 590 × 1180 像素坐标；正背面分别从各自面向观察者的方向显示。 |
| 3D | 按板形蒙版生成轮廓、孔槽和板厚，使用当前分层呈现材料；不生成元件或电气走线。 |

分层 PNG 中，**黑色表示该层有效图形，透明表示无图形**：

| 文件 | 用途 |
| --- | --- |
| `F/B.SilkS.png` | 丝印油墨区域。 |
| `F/B.Cu.png` | 保留铜的区域。 |
| `F/B.Mask.png` | 去除阻焊、开窗的区域。 |
| `板形蒙版.png` | 板体范围，透明部分表示板外或孔。 |
| `F/B.ENIG.png`、`F/B.HASL.png` 或 `F/B.OSP.png` | 彩色模式下的金属区域，由铜与开窗共同形成。 |
| `F/B.CoveredCu.png`、`F/B.Substrate.png` | 彩色模式下的阻焊下覆铜和裸基材区域，供检查与导入参考。 |

`F` 表示正面，`B` 表示背面。材料区域图用于检查，实际制造分层仍使用 `Cu`、`Mask`、`SilkS`。

## 本地运行与构建

需要 Node.js 20.19+ 或 22.12+。

```powershell
npm ci
npm run dev
```

开发页面：`http://127.0.0.1:3000/PCB-PassCard-Generator.html`。源码入口需要通过 Vite 启动，不能双击源码 HTML 直接运行。

检查与构建：

```powershell
npm run lint
npm run test:pcb
npm run build
npm run preview
```

构建产物位于 `dist/`，入口为 `PCB-PassCard-Generator.html`。部署时发布整个 `dist/`，保留入口 HTML 与 `PCB-PassCard-Generator_assets/` 的相对目录关系。构建只写入本仓库，不向其他项目复制文件。

<details>
<summary>开发说明与浏览器测试</summary>

- [预览组成与 PCB 分层处理入口](docs/preview-composition.md)：素材来源、覆盖顺序、独立处理和合成方式。
- 分色与绘图由 Worker 调度，只保留最新待处理预览；显式导出独立排队，始终使用完整精度。素材、明暗和平滑结果分别缓存，支持 OffscreenCanvas 时传递 ImageBitmap，否则传递后台生成的像素数据。
- PCB 3D 按需加载 Three.js，从制造层生成颜色、光泽和凹凸贴图，背面贴图按观察方向翻转。材质画布保持完整分辨率，模型在交互、尺寸或贴图变化时重绘，切回 2D 后释放相关 GPU 资源。
- 启动开发服务后，打开 `/tests/pcb-worker-smoke.html` 检查界面响应、连续请求合并和 PNG 一致性。
- 打开 `/tests/pcb-3d-texture-smoke.html` 检查贴图覆盖、方向、草稿／高清输入兼容及显存复用。
- 打开 `/tests/pcb-gpu-smoke.html` 检查 GPU 与 CPU 的分层和材质一致性、连续高清调整、资源复用、回退与导出。性能采样结果随设备、浏览器和图片变化，测试画布的 GPU 读取不属于正式预览流程。
- 测试页面不进入正式构建。旧亚克力预览、GIF 与 AR 源码保留作为迁移参考，当前界面使用 PCB 平面／3D 预览与分层导出。

</details>

## 技术与许可

- 使用 React、TypeScript 与 Canvas 构建界面和模板绘图，Web Worker／WebGL2 负责后台处理，Three.js 提供 PCB 3D 预览。
- 项目原创贡献及已获 MIT 授权的部分采用 [MIT License](LICENSE)；第三方代码、字体、角色数据、模板图片和商标遵循各自的许可与权利，具体见[第三方来源说明](THIRD_PARTY_NOTICES.md)。

## 感谢

- 感谢项目 [SusieGlitter/txz](https://github.com/SusieGlitter/txz) 提供通行证生成器的核心代码、角色数据与模板素材，包括渲染、裁剪、3D、GIF 和 AR 功能。
- 该仓库的代码与资源为本项目的功能迁移、独立化和后续开发提供了基础与参考。
- 分层模式及彩色识别思路参考 [PCB_lightgraph Portable](https://github.com/Ashlixy17/PCB_lightgraph_Portable/)，在本项目的独立素材与后台处理管线中实现。

### 如果觉得软件对你有帮助，求求你点个 Star 吧！(ﾉ>ω<)ﾉ

## 声明

本网站是一款通过明日方舟通行证模板生成PCB板图片的工具（以下简称“本工具”），**主要面向学习与个人创作**。

1. **素材版权由使用者负责**：本工具不会为输入图像做版权审查。若您使用他人的原创作品（插画、角色形象、图片等）进行制作，请确保已获得相应授权；因素材侵权产生的纠纷与责任由使用者自行承担，与作者及本工具无关。
2. **肖像与隐私**：请勿使用本工具处理涉及他人肖像、隐私或敏感内容的图像。
3. **商用免责**：若有商家／商贩使用本工具进行 PCB 周边产品的生产与销售，由此产生的产品质量、商业模式、版权纠纷及其他一切问题与后果，均与作者及本工具无关，作者不承担任何责任。
4. **按现状提供（AS-IS）**：本工具按现状提供，不附带任何明示或暗示的担保，作者不对其适用性、可靠性或特定用途作出任何保证。
5. 使用本工具即视为已阅读并同意以上内容。
