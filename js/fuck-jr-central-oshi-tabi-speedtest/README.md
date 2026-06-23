# fuck-jr-central-oshi-tabi-speedtest 去他妈的JR东海/东日本 "推し旅" 测速

> 本项目修改自 [kiritoxkiriko/fuck-jr-central-oshi-tabi-speedtest](https://github.com/kiritoxkiriko/fuck-jr-central-oshi-tabi-speedtest)

## 简介
众所周知，JR 东海/东日本经常推出和热门 IP 联动的 "推し旅" 活动。
这些活动往往需要乘坐新干线进行测速来领取特典，比如 [JR東海×「BanG Dream! 10th ANNIVERSARY」](https://recommend.jr-central.co.jp/oshi-tabi/bang-dream-10th/)、
[ブルーアーカイブ × JR東海 推し旅 名古屋](https://oshi-tabi.voistock.com/2605bluearchive/)。
本脚本用来快速绕过这个测速。

<p align="center">
  <img src="https://oshi-tabi.voistock.com/view/event/2605bluearchive/assets/img/kv.jpg" width="500">
</p>

## 原理
活动页通过浏览器的 `navigator.geolocation` API 获取你的**速度**和**位置**，并校验位置是否落在一组预设的矩形区域（`area`）内。
原项目针对的 `recommend.jr-central.co.jp` 旧活动是在**前端**直接判定的，所以只要 hook `navigator.geolocation.watchPosition`，
让它返回一个**固定速度**和一个**范围内随机经纬度**即可绕过。
（`oshi-tabi.voistock.com` 的活动则把采样点上传到**服务端**判定，详见下方「服务端测速」一节；但数据源同样是 `navigator.geolocation`，所以 hook 的思路通用。）

不过 voistock 的 ブルアカ × 名古屋 活动除了速度，还会判定**方向**：
它会比较连续位置点相对目标车站（名古屋 `[35.17099309, 136.8815566]`）的运动方向，
入口 `名古屋行き` 要求逐步**靠近**名古屋（`towards`），`名古屋帰り` 要求逐步**远离**（`away`）。
旧脚本返回的“东京矩形内随机点”没有稳定路线，连续采样的方向来回跳变，会触发：

```
進行方向が逆（反対方向）です。正しい方向の新幹線で再度お試しください。
```

因此本脚本改为**沿东海道新干线真实途经点的折线轨迹模拟移动**：

- 内置东京→名古屋的途经点折线，按真实时间推进位置（`已行驶距离 = 经过秒数 × 速度`），
  保证上报的 `speed` 字段与相邻采样点算出的“距离/时间”速度自洽，且落在活动页要求的 `150–360 km/h` 区间内。
- 根据相邻点的方位角填入 `heading`（不再是 `null`）。
- 同时覆写 `watchPosition`、`getCurrentPosition`、`clearWatch`，覆盖页面可能用到的多种采样方式。
- 右下角提供方向选择悬浮面板（`名古屋行き` / `名古屋帰り`），切换即从对应起点重新出发；
  `towards` 时到名古屋距离单调递减，`away` 时单调递增。

可调参数集中在脚本顶部（`SPEED_KMH`、`SAMPLE_INTERVAL_MS`、途经点 `ROUTE_TO_NAGOYA`、`ENABLE_NIGHT_BYPASS` 等），
不同活动页如有差异可自行调整。

## 服务端测速与接口营业时间
`oshi-tabi.voistock.com` 上的 ブルアカ × 名古屋 活动（第 1、2 弾共用同一套 `scrt_measure.js`）的测速判定在**服务端**：
浏览器只负责用 `navigator.geolocation` 采集 GPS 点、成批 `POST` 到 `/api/measure/start`、`/api/measure/point(s)`，
最终由服务器返回通过/失败。
（这跟原项目针对的 `recommend.jr-central.co.jp` 旧活动不是同一套实现，后者据原项目描述为纯前端判定。）

好消息是 - 服务器仍然是**按你上传的 GPS 轨迹**判定的，并不需要真实乘车凭证或额外认证，
所以本脚本的轨迹模拟**同样有效**，方向选对即可通过。

需要注意的一个坑是 **接口营业时间**：测速 API 在**深夜会关闭**，此时请求会直接返回

```json
{ "status": "unavailable", "message": "このAPIは深夜の間はご利用いただけません。", "available_from": "05:55 JST" }
```

控制台对应 `[MeasureClient] Error: 503 error`。**这跟脚本无关**，是接口本身按时间关闭。处理方式：

- 正常情况下，**等日本时间 05:55 之后再测**即可。
- 夜间调试时，脚本顶部的 `ENABLE_NIGHT_BYPASS`（默认开启）会在 `document-start` 阶段写入
  `localStorage.devMode = '1'`，让页面启用其内置的夜间测试 token 以绕开营业时间限制。
  这只绕开“营业时间”，token 由 JR 维护、随时可能失效；不需要时把它设为 `false` 即可。
