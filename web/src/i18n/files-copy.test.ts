import { describe, expect, it } from "vitest";

import { getFilesCopy } from "./files-copy";
import { getPairingCopy } from "./pairing-copy";
import { getWebhooksCopy } from "./webhooks-copy";
import { getChannelsCopy } from "./channels-copy";
import { getProfileBuilderCopy } from "./profile-builder-copy";
import { getModelsCopy } from "./models-copy";

describe("managed files copy", () => {
  it("returns Simplified Chinese for the managed dashboard default locale", () => {
    const copy = getFilesCopy("zh");

    expect(copy.upload).toBe("上传");
    expect(copy.createFolder).toBe("新建文件夹");
    expect(copy.deleteFolderDescription).toContain("全部内容");
  });
});

describe("managed profile builder copy", () => {
  it("localizes every step in the profile creation flow", () => {
    const copy = getProfileBuilderCopy("zh");

    expect(copy.newProfile).toBe("新建多Agent配置");
    expect(copy.steps.mcp).toBe("MCP 服务");
    expect(copy.createProfile).toBe("创建多Agent配置");
  });
});

describe("managed channels copy", () => {
  it("uses employee-facing platform names and Chinese states", () => {
    const copy = getChannelsCopy("zh");

    expect(copy.platforms.dingtalk.name).toBe("钉钉");
    expect(copy.platforms.wecom_callback.name).toBe("企业微信应用");
    expect(copy.state.disabled).toBe("未启用");
  });
});

describe("managed webhooks copy", () => {
  it("localizes the receiver and subscription workflow", () => {
    const copy = getWebhooksCopy("zh");

    expect(copy.receiverDisabled).toBe("Webhook 接收器未启用");
    expect(copy.newSubscription).toBe("新建订阅");
    expect(copy.restartGateway).toBe("重启网关");
  });
});

describe("managed pairing copy", () => {
  it("keeps access-control actions in Simplified Chinese", () => {
    const copy = getPairingCopy("zh");

    expect(copy.pendingRequests).toBe("待处理请求");
    expect(copy.revokeAccess).toBe("撤销访问权限");
  });
});

describe("managed models copy", () => {
  it("localizes model settings, assignment menus, and nested dialogs", () => {
    const copy = getModelsCopy("zh");

    expect(copy.modelSettings).toBe("模型设置");
    expect(copy.useAs).toBe("设为");
    expect(copy.auxiliaryTasks.title).toBe("辅助任务");
    expect(copy.moa.title).toBe("配置多Agent混合预设");
    expect(copy.tasks.vision.label).toBe("视觉分析");
  });
});
