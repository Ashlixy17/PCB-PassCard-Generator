# 第三方来源说明

## 通行证生成器核心实现

- 来源：[SusieGlitter/txz](https://github.com/SusieGlitter/txz)。
- 本次对照版本：`a05a27b6e419cf48417773ce355aa104b35dcf9e`，检查日期为 2026-10-14。
- 本库的角色数据、模板图片、模板渲染、裁剪、3D、GIF 和 AR 实现来自该项目；主要改动为界面样式、导出命名及独立仓库的资源与构建路径。
- txz 的 README 还注明，其 Python 源码来自“小红书／B站 @Y教主黄铜”，并提供[龙泡泡通行证生成器](https://lpptxzscq.com/)链接。此处保留这条上游来源记录。

截至上述版本，上游仓库没有 LICENSE／COPYING 文件，README 中也未声明软件许可证。本库保留的 MIT 文件不构成对上游代码和素材的额外授权；对外分发前需要确认相应授权。[GitHub 关于仓库许可证的说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)解释了未声明许可证时的默认情况。

## 迁入路径

本应用先在 [PCB_lightgraph_Portable](https://github.com/Ashlixy17/PCB_lightgraph_Portable) 中调整 UI，再独立为本库。LICENSE 中保留该项目已有的版权声明。

## 字体、角色素材和 npm 依赖

字体和角色素材随上游资源一并迁入，未在本次拆库中重新声明其授权。npm 依赖遵循各软件包自己的许可证，不能将本库的 MIT 文件视为对全部第三方文件的统一许可。
