/* 13周年庆数据看板 · 渲染层（js/main.js）
   版式与交互与 v2 单文件版完全一致；数据来自 js/data.js 装配的 BI 爬虫 JSON。
   以 <script type="module"> 引入：顶层 await 先取数，再按原流程一次性建板。 */
/* ══════════════════════════════════════════════════════════
       * ① 数据层：全部来自 BI 爬虫 JSON（js/data.js 装配，每 10 分钟更新）
       * ══════════════════════════════════════════════════════════ */
      const DATA = await loadDashboardData();
      const CAMPAIGN = DATA.campaign;
      const STORES = DATA.stores;
      const CHANNELS = DATA.channels;
      const STAFF = DATA.staff;

/* ══════════════════════════════════════════════════════════
       * ② 工具（沿用「进度水球」的几何与缓动套路）
       * ══════════════════════════════════════════════════════════ */
      const SVGNS = "http://www.w3.org/2000/svg";
      const $ = (id) => document.getElementById(id);
      /* 防呆（2026-10-14）：曾经因根目录还留着一份旧版页面（没有新加的元素），
         JS 取到 null 直接赋值 → 抛错 → 整个看板渲染中断变成空白页。
         凡写字到 DOM 一律走 setTxt / .? 判空，缺元素只跳过该处，不再拖垮整页。 */
      const setTxt = (id, txt) => {
        const el = $(id);
        if (el) el.textContent = txt;
      };
      /* 写 HTML 片段的空值安全版（判空同上，避免缺元素时整页崩） */
      const setHTML = (id, html) => {
        const el = $(id);
        if (el) el.innerHTML = html;
      };
      const ANIM = !/[?&]static=1/.test(location.search);
      if (!ANIM) document.documentElement.classList.add("noanim");
      /* 数据心跳：间隔与初始拍（调试参数） */
      const HB_MS = (() => {
        const m = /[?&]hbms=(\d+)/.exec(location.search);
        return m ? Math.max(1000, +m[1]) : 498000;
      })();
      const norm = (a) => ((a % 360) + 360) % 360;
      const easeOut = (t) => 1 - Math.pow(1 - t, 3);
      const lerp = (a, b, t) => a + (b - a) * t;
      const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
      /* 金额一律 2 位小数（2026-10-13 需求：与 BI 报表取出来的数据一致）。
         fmt2 输出带千分位的两位小数（21.35 / 8,888.00），fmtW 用于「万」口径、
         fmtY 用于「元」口径，只差单位后缀。 */
      const fmt2 = (v) =>
        (Number(v) || 0).toLocaleString("zh-CN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
      const fmtW = fmt2;
      const fmtY = fmt2;
      const fmtI = (v) => Math.round(v).toLocaleString("zh-CN");
      /* 金额自适应单位：≥1 万走「X.XX万」，不足 1 万直接显示「X,XXX元」
         （市场小组的「今日业绩」BI 里给的是元，小额时显示 0.00万 会看不出数） */
      const fmtMoney = (v) => (v >= 1e4 ? fmtW(v / 1e4) + "万" : fmtY(v) + "元");
      function polar(cx, cy, r, deg) {
        const a = (deg * Math.PI) / 180;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      }
      function arcPath(cx, cy, r, a0, a1) {
        const [x0, y0] = polar(cx, cy, r, a0);
        const [x1, y1] = polar(cx, cy, r, a1);
        const large = norm(a1 - a0) > 180 ? 1 : 0;
        return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
      }
      /* 方向感知弧线（水球组件原版）：dir=-1 时必须走逆时针短弧，
         否则左侧三段会画成 320°+ 的大弧叠满整圈（v2 首版踩过的坑） */
      function arcPathDir(r, a0, a1, dir) {
        const [x0, y0] = polar(H.CX, H.CY, r, a0);
        const [x1, y1] = polar(H.CX, H.CY, r, a1);
        const delta = dir > 0 ? norm(a1 - a0) : norm(a0 - a1); // 沿绘制方向的角距
        const large = delta > 180 ? 1 : 0;
        const sweep = dir > 0 ? 1 : 0;
        return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
      }
      const p2 = (n) => String(n).padStart(2, "0");
      /* 心跳刷新用的补间：tween(dur, fn) 逐帧回调，tweenNum 数字滚动 */
      function tween(dur, fn, done) {
        const t0 = performance.now();
        (function f(now) {
          const k = easeOut(clamp((now - t0) / dur, 0, 1));
          fn(k);
          if (k < 1) requestAnimationFrame(f);
          else done && done();
        })(t0);
      }
      function tweenNum(el, from, to, fmt, dur = 900) {
        tween(dur, (k) => (el.textContent = fmt(lerp(from, to, k))));
      }

      /* ══════════════════════════════════════════════════════════
       * ③ 舞台等比缩放
       * ══════════════════════════════════════════════════════════ */
      const stage = $("stage");
      let SCALE = 1;
      function syncStage() {
        SCALE = Math.min(innerWidth / 1920, innerHeight / 1080);
        stage.style.setProperty("--s", SCALE);
      }
      syncStage();
      addEventListener("resize", syncStage);

            /* ══════════════════════════════════════════════════════════
       * ④ 数据派生（真实 BI 数据，不再随机模拟；心跳=重新抓取 JSON）
       * ══════════════════════════════════════════════════════════ */
      const T = CAMPAIGN.today,
        D = CAMPAIGN.monthDays;
      /* 活动窗口的真实日期（data.js 由 BI「天数」列 + 今天反推）：X 轴 / tooltip / 标题都用它，
         活动跨月时页面自动跟着走，不再写死月份。 */
      const DAYS = CAMPAIGN.days || [];
      const mdAt = (i) => DAYS[i] || { m: CAMPAIGN.month, d: i + 1 };
      const dayLabel = (i) => `${mdAt(i).m}/${mdAt(i).d}`;
      const dayFull = (i) => `${mdAt(i).m}月${mdAt(i).d}日`;
      const campMonth = `${CAMPAIGN.year}年${CAMPAIGN.month}月`;
      $("subTitle").textContent = `13周年庆数据看板 · ${campMonth}`;
      /* heroTitle 元素已于 2026-10-15 按需求删除（标题改为只留顶部副标题），
         这里必须走判空安全的 setTxt —— 直接 $("heroTitle").textContent 会在
         元素缺失时抛错，把整个 module 渲染打断成白屏（历史上踩过一次）。 */
      setTxt("heroTitle", `${campMonth} · 门店业绩达成`);
      $("trendTag").textContent = `${dayFull(0)} – ${dayFull(D - 1)} · 万元`;
      const sumOf = (arr, fn) => arr.reduce((a, x) => a + fn(x), 0);
      const totalBase = DATA.totals.totalBase;
      const totalRev = DATA.totals.totalRev;
      const totalInitBase = DATA.totals.totalInitBase;
      const totalInit = DATA.totals.totalInit;
      /* SPRINT_K / sprintOf（冲刺目标 = 基础 × 1.18）已于 2026-10-16 停用：
         「业绩进度」面板的条形改为直接表示完成率，页面不再有冲刺目标口径。
         系数仍保留在 data.js 的 CONFIG.sprintK，需要时可恢复。 */
      const actualOf = (s) => s.actual;
      const initActualOf = (s) => s.initActual;
      const dailyByStore = DATA.daily.byId;
      const dailyAll = DATA.daily.all;

      const KPI = DATA.kpi;
      /* 当前生效的数据模型（首次 = 刚抓到的 JSON；5 分钟心跳后会整体替换） */
      let MODEL = DATA.model;
      /* 底部更新时间 = BI 爬虫写入 JSON 的 updated_at（7 张表里最新的一个） */
      const setFoot = (t) =>
        ($("footUpdated").textContent = "更新于 " + (t || "--") + " ·");
      setFoot(DATA.updatedAt);

/* ══════════════════════════════════════════════════════════
       * ⑤ KPI 行：环形 + 数字滚动 + 渠道 chip
       * ══════════════════════════════════════════════════════════ */
      function buildRing(svg, pct, color) {
        if (!svg) return () => {};
        const CX = 38,
          CY = 38,
          R = 29,
          ST = 7;
        svg.innerHTML = "";
        const mk = (tag, attrs) => {
          const el = document.createElementNS(SVGNS, tag);
          for (const k in attrs) el.setAttribute(k, attrs[k]);
          svg.appendChild(el);
          return el;
        };
        mk("path", {
          d: arcPath(CX, CY, R, 135, 405),
          fill: "none",
          stroke: "rgba(255,255,255,0.12)",
          "stroke-width": ST,
          "stroke-linecap": "round",
        });
        const prog = mk("path", {
          fill: "none",
          stroke: color,
          "stroke-width": ST,
          "stroke-linecap": "round",
          filter: "url(#tGlow)",
        });
        const dot = mk("circle", { r: 3, fill: "#fff" });
        const txt = mk("text", {
          x: CX,
          y: CY + 5,
          "text-anchor": "middle",
          class: "ring-txt",
        });
        return (p) => {
          if (p < 0.5) {
            prog.setAttribute("d", "");
            dot.setAttribute("r", 0);
          } else {
            prog.setAttribute(
              "d",
              arcPath(CX, CY, R, 135, 135 + (270 * p) / 100),
            );
            const [x, y] = polar(CX, CY, R, 135 + (270 * p) / 100);
            dot.setAttribute("cx", x.toFixed(2));
            dot.setAttribute("cy", y.toFixed(2));
            dot.setAttribute("r", 3);
          }
          txt.textContent = p.toFixed(2) + "%";
        };
      }
      const drawRT = buildRing($("rTime"), KPI.timePct, "#e8c25f");
      /* 「累计初诊」卡的初诊完成率圆环（#rInit）：2026-10-16 拆卡时一度移除，
         同日需求要求加回 —— 卡宽已从 194 放到 252，76px 圆环放得下。 */
      const drawRI = buildRing($("rInit"), KPI.initPct, "#e8c25f");
      /* 时间进度卡：大字位显示「第 X 天」，下一行小字「共 31 天」（2026-10-14 需求）
         2026-10-15：第/天用小字号、天数数字用大字号并加强发光，突出数字本身。 */
      const daysHTML = (n) =>
        `<i class="kd-t">第</i><b class="kd-n">${Math.round(n)}</b><i class="kd-t">天</i>`;
      setTxt("vDaysTotal", `共 ${D} 天`);
      /* 累计初诊卡：2026-10-16 起小字行只留「基础 X 人」，
         「客单 xxx 元」搬去独立的「平均单体」卡（见下面的 vAvgTicket）。 */
      setTxt("subInit", `基础 ${fmtI(totalInitBase)} 人`);
      /* 平均单体（2026-10-16 新增卡）= 六个店业绩之和 ÷ 六个店初诊之和 = KPI.avgTicket（元），
         与「累计初诊」完全同源（data.js 汇总）。 */
      setTxt("vAvgTicket", fmtY(KPI.avgTicket));

      /* ── 顶部 chip：两种口径
         channel：X人 · 目标 Y人 ／ 今日 N · 完成率 R%（条形 = 完成率）
         group  ：X人 · 总业绩 Y万 ／ 今日 N（条形恒为 0%，见下） */
      const chipLine1 = (c) =>
        c.kind === "group"
          ? `<b>${fmtI(c.cum)}</b>人 · <b>${fmtW(c.total)}</b>万`
          : `<b>${fmtI(c.cum)}</b>人 · 目标 <b>${fmtI(c.target)}</b>人`;
      /* 小组 chip 的小字行（2026-10-16 需求）：去掉「今日业绩 xxx 元/万」，只留「今日 N」。
         渠道 chip 保持「今日 N · 完成率 R%」不变。 */
      const chipLine2 = (c) =>
        c.kind === "group"
          ? `今日 <b style="font-size:14px">${fmtI(c.today)}</b>`
          : `今日 <b style="font-size:14px">${fmtI(c.today)}</b> · 完成率 ${c.rate.toFixed(2)}%`;
      /* 小组 chip 的条（2026-10-16 需求）：黄线填充改为 0%（原先恒为 100% 通长黄线）；
         渠道 chip 仍按完成率填充。小组本身没有可比的完成率口径，黄线会误导。 */
      const chipBarW = (c) =>
        c.kind === "group" ? 0 : Math.round(clamp(c.rate, 0, 100));
      const chipHTML = (c) => `<div class="chip chip-${c.kind}">
            <div class="chip-name"><span class="dot" style="background:${c.color}"></span>${c.name}</div>
            <div class="chip-val">${chipLine1(c)}</div>
            <div class="chip-bar"><i data-w="${chipBarW(c)}"></i></div>
            <div class="chip-val" style="line-height:18px">${chipLine2(c)}</div>
          </div>`;

      let chipRefs = [];
      function renderChips(m) {
        const cards = m.channelCards || [];
        chipRefs = cards.map((card) => {
          const box = $(card.target);
          if (!box) return [];
          box.innerHTML = card.items.map(chipHTML).join("");
          return [...box.children].map((el) => ({
            line1: el.querySelectorAll(".chip-val")[0],
            bar: el.querySelector(".chip-bar i"),
            line2: el.querySelectorAll(".chip-val")[1],
          }));
        });
      }
      renderChips(MODEL);

      /* ══ 「更多」明细弹窗（2026-10-14 需求）══
         网电卡 → 网电数据 + 老带新数据；市场卡 → 市场数据 + 市场各小组数据。
         表格渲染用 MODEL.tables（每次心跳随模型整体替换 → 打开时永远是最新值）。 */
      const fmtCell = (v) => {
        if (v === "" || v == null) return "—";
        const n = +v;
        return isNaN(n)
          ? String(v)
          : n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
      };
      /* ── 弹窗表格的显示加工（2026-10-15 用户要求）──
         ① 两字门店名（医院 / 合计）中间补一个全角空格「　」，与「神华店」等
            三字名等宽 —— 首字贴左、末字与三字名的末字对齐；
         ② 表头去掉 BI 的「_总和」后缀：今日到诊_总和 → 今日到诊；
         ③ 「完成率」列统一按百分比显示、保留 2 位小数。
            ⚠ 各表口径不统一：web / market 是 0.316 这种小数，而 referral 的
            门店行却是 51.32 这种百分数（合计行又回到 0.416），
            所以按数值大小自动判别，不能一律 ×100。 */
      const storeNameFix = (s) => (s.length === 2 ? `${s[0]}　${s[1]}` : s);
      const headText = (c) => c.replace(/_总和/g, "");
      const isRateCol = (c) => /完成率/.test(c);
      const fmtRate = (v) => {
        if (v === "" || v == null) return "—";
        const n = +v;
        return isNaN(n) ? String(v) : `${(n <= 1 ? n * 100 : n).toFixed(2)}%`;
      };
      const tableHTML = (raw) => {
        const cols = (raw && raw.columns) || [];
        const rows = (raw && raw.rows) || [];
        if (!cols.length || !rows.length) return `<p class="more-empty">暂无数据</p>`;
        const head = cols.map((c) => `<th>${headText(c)}</th>`).join("");
        const body = rows
          .map((r) => {
            const tds = cols
              .map((c, i) => {
                if (i === 0) {
                  const v0 = r[c];
                  const nm = v0 == null || v0 === "" ? "—" : String(v0).trim();
                  return `<td>${storeNameFix(nm)}</td>`;
                }
                return `<td class="num">${isRateCol(c) ? fmtRate(r[c]) : fmtCell(r[c])}</td>`;
              })
              .join("");
            return `<tr>${tds}</tr>`;
          })
          .join("");
        return `<table class="more-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
      };
      const moreMask = $("moreMask");
      const openMore = (title, secs) => {
        $("moreTitle").textContent = title;
        $("moreBody").innerHTML = secs
          .map(
            (s) =>
              `<div class="more-sec-title">${s.title}</div>` +
              tableHTML(MODEL.tables && MODEL.tables[s.key]),
          )
          .join("");
        moreMask.hidden = false;
      };
      const closeMore = () => {
        moreMask.hidden = true;
      };
      $("moreClose").addEventListener("click", closeMore);
      moreMask.addEventListener("click", (e) => {
        if (e.target === moreMask) closeMore(); // 点遮罩空白处关闭
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeMore();
      });
      $("moreWeb").addEventListener("click", () =>
        openMore("网电 / 老带新明细", [
          { title: "网电数据", key: "web" },
          { title: "老带新数据", key: "referral" },
        ]),
      );
      $("moreMkt").addEventListener("click", () =>
        openMore("市场 / 各小组明细", [
          { title: "市场数据", key: "market" },
          { title: "市场各小组数据", key: "groups" },
        ]),
      );
      function updateChips(m) {
        (m.channelCards || []).forEach((card, ci) => {
          card.items.forEach((c, i) => {
            const ref = chipRefs[ci] && chipRefs[ci][i];
            if (!ref) return;
            ref.line1.innerHTML = chipLine1(c);
            ref.line2.innerHTML = chipLine2(c);
            if (ref.bar) ref.bar.style.width = chipBarW(c) + "%";
          });
        });
      }

      /* ══════════════════════════════════════════════════════════
       * ⑥ 中央 Hero：移植「门店业绩水球看板」
       * ══════════════════════════════════════════════════════════ */
      const H = {
        CX: 450,
        CY: 320,
        R_RING: 233,
        R_BALL: 178,
        R_LABEL: 280,
        SEG_SPAN: 60,
        SEG_GAP: 2,
        STROKE: 30,
        VB_Y: 24,
        VB_W: 900,
        VB_H: 580,
      };
      /* 6 段：右上/右中/右下/左上/左中/左下（与 STORES 一一对应）
         mirror 模式：右侧顺时针涨、左侧逆时针涨，以垂直中轴严格镜像 */
      const SEGMENTS = [
        { slot: "right-top", start: 270, dir: 1 },
        { slot: "right-mid", start: 330, dir: 1 },
        { slot: "right-bottom", start: 30, dir: 1 },
        { slot: "left-top", start: 210, dir: -1 },
        { slot: "left-mid", start: 150, dir: -1 },
        { slot: "left-bottom", start: 90, dir: -1 },
      ];
      const trackRange = (seg) => ({
        a0: seg.start + H.SEG_GAP,
        a1: seg.start + H.SEG_SPAN - H.SEG_GAP,
      });
      function progressRange(seg, pct) {
        const t = trackRange(seg);
        const len = ((H.SEG_SPAN - 2 * H.SEG_GAP) * clamp(pct, 0, 100)) / 100;
        const a0 = seg.dir > 0 ? t.a0 : t.a1;
        return { a0, a1: a0 + seg.dir * len, dir: seg.dir };
      }

      const heroMod = $("heroMod");
      const gTracks = $("hTracks"),
        gProgress = $("hProgress"),
        gDots = $("hDots"),
        gHits = $("hHits");
      const progPaths = [],
        endDots = [],
        hitPaths = [],
        labels = [];
      const U = () => heroMod.clientWidth / H.VB_W; // 800/900 = 0.8889
      function syncUnit() {
        heroMod.style.setProperty("--u", U() + "px");
      }
      syncUnit();
      addEventListener("resize", syncUnit);

      SEGMENTS.slice(0, STORES.length).forEach((seg, i) => {
        const t = trackRange(seg),
          s = STORES[i];
        const mkP = (parent, attrs) => {
          const el = document.createElementNS(SVGNS, "path");
          for (const k in attrs) el.setAttribute(k, attrs[k]);
          parent.appendChild(el);
          return el;
        };
        mkP(gTracks, {
          d: arcPath(H.CX, H.CY, H.R_RING, t.a0, t.a1),
          stroke: "rgba(255,255,255,0.12)",
        });
        progPaths[i] = mkP(gProgress, { stroke: s.color });
        const c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("r", 0);
        c.setAttribute("fill", "#fff");
        c.setAttribute("filter", "url(#hGlow)");
        gDots.appendChild(c);
        endDots[i] = c;
        hitPaths[i] = mkP(gHits, {
          d: arcPath(H.CX, H.CY, H.R_RING, t.a0, t.a1),
        });
      });

      function drawProgress(i, pct) {
        if (pct < 0.5) {
          progPaths[i].setAttribute("d", "");
          endDots[i].setAttribute("r", 0);
          return;
        }
        const rg = progressRange(SEGMENTS[i], pct);
        progPaths[i].setAttribute(
          "d",
          arcPathDir(H.R_RING, rg.a0, rg.a1, rg.dir),
        );
        const [x, y] = polar(H.CX, H.CY, H.R_RING, rg.a1);
        endDots[i].setAttribute("cx", x.toFixed(2));
        endDots[i].setAttribute("cy", y.toFixed(2));
        endDots[i].setAttribute("r", (H.STROKE / 2) * 0.75);
      }

      /* 水球波浪 */
      const WL = 160,
        WAVE_W = H.R_BALL * 2 + WL * 2 + 120;
      const wave1 = $("hWave1"),
        wave2 = $("hWave2");
      function wavePath(level, amp) {
        const x0 = H.CX - WAVE_W / 2;
        let d = `M ${x0} ${level.toFixed(2)}`,
          x = x0;
        while (x < x0 + WAVE_W) {
          d +=
            ` Q ${x + WL * 0.25} ${level - amp}, ${x + WL * 0.5} ${level}` +
            ` Q ${x + WL * 0.75} ${level + amp}, ${x + WL} ${level}`;
          x += WL;
        }
        return (
          d +
          ` L ${x0 + WAVE_W} ${H.CY + H.R_BALL + 60} L ${x0} ${H.CY + H.R_BALL + 60} Z`
        );
      }
      function drawWaves(pct) {
        const lv = H.CY + H.R_BALL - (2 * H.R_BALL * clamp(pct, 0, 100)) / 100;
        wave1.setAttribute("d", wavePath(lv, 10));
        wave2.setAttribute("d", wavePath(lv + 9, 13));
      }

      /* 左右门店标签：y 由段中心角算出，与弧段严格对齐且左右镜像 */
      /* 今日数据行（2026-10-14 需求）：今日初诊/今日业绩，取 BI 门店表各店实时列。
         两项分两行显示（2026-10-14 需求二）。 */
      /* 两列对齐（2026-10-14 需求）：第一行「今日数据：X人」，第二行只有「Y万元」，
         数值统一右对齐成一列（label 占满剩余宽度把数值顶到右侧）。 */
      const todayHTML = (s) =>
        s.todayRev == null
          ? `<div class="t-line"><span class="t-lab">今日数据：</span><span class="t-val">—</span></div>
             <div class="t-line"><span class="t-lab"></span><span class="t-val">—</span></div>`
          : `<div class="t-line"><span class="t-lab">今日数据：</span><span class="t-val">${fmtI(s.todayInit)}人</span></div>
             <div class="t-line"><span class="t-lab"></span><span class="t-val">${fmt2(s.todayRev)}万元</span></div>`;
      STORES.forEach((s, i) => {
        const seg = SEGMENTS[i];
        const center = seg.start + H.SEG_SPAN / 2;
        const y = H.CY + H.R_LABEL * Math.sin((center * Math.PI) / 180);
        const side = seg.slot.startsWith("right") ? "right" : "left";
        const el = document.createElement("div");
        el.className = `store-label ${side}`;
        el.style.top = (((y - H.VB_Y) / H.VB_H) * 100).toFixed(3) + "%";
        el.innerHTML = `
          <span class="dot" style="background:${s.color};color:${s.color}"></span>
          <div class="info">
            <div class="name">${s.name}</div>
            <div class="pct">0%</div>
            <div class="bar"><i style="background:${s.color}"></i></div>
            <div class="today">${todayHTML(s)}</div>
          </div>`;
        heroMod.appendChild(el);
        labels[i] = el;
      });

      /* 主数字：宽度自动适配到「水球直径 × 73%」 */
      const hPct = $("hPct");
      const hSubVal = $("hSubVal");
      /* 水球下方数值行（2026-10-13 需求）：实收 / 基础目标，单位万元、2 位小数 */
      const heroSubText = (rev, base) => `${fmtW(rev)} / ${fmtW(base)} 万元`;
      let heroRev = totalRev,
        heroBase = totalBase;
      const TARGET_W = 0.73 * 2 * H.R_BALL; // 259.9 用户单位
      function fitHeroNumber(text) {
        hPct.textContent = text;
        let fs = 84;
        for (let i = 0; i < 3; i++) {
          hPct.style.fontSize = fs + "px";
          const w = hPct.getComputedTextLength();
          if (!w) break;
          fs = clamp((fs * TARGET_W) / w, 40, 120);
        }
        hPct.style.fontSize = fs.toFixed(2) + "px";
      }
      fitHeroNumber(KPI.revPct.toFixed(2) + "%");

      /* 弧段 hover tooltip */
      const arcTip = $("arcTip");
      function labelTopPx(seg) {
        const center = seg.start + H.SEG_SPAN / 2;
        const y = H.CY + (H.R_RING + 34) * Math.sin((center * Math.PI) / 180);
        const x = H.CX + (H.R_RING + 34) * Math.cos((center * Math.PI) / 180);
        return [x * U(), (y - H.VB_Y) * U()];
      }
      function tipHTML(s) {
        /* 2026-10-12 需求：弹窗精简为「剩余业绩 / 剩余日均业绩 / 剩余初诊 /
           剩余日均初诊 / 平均单体」—— 前四项是 BI 门店表原生列（data.js 直取），
           原 实收·基础 / 冲刺目标·完成 / 累计初诊·初诊完成率 三行已删除。 */
        const avgRow =
          s.avgTicket != null && s.avgTicket > 0
            ? `<div><span class="col">平均单体</span><b>${fmtY(s.avgTicket)}</b> 元</div>`
            : `<div><span class="col">平均单体</span><b>—</b></div>`;
        const remRev =
          s.remainRev != null
            ? `<div><span class="col">剩余业绩</span><b>${s.remainRev.toFixed(2)}</b> 万
              <span class="col">· 剩余日均</span><b>${
                s.remainRevDaily != null ? s.remainRevDaily.toFixed(2) : "—"
              }</b> 万</div>`
            : `<div><span class="col">剩余业绩</span><b>—</b></div>`;
        const remInit =
          s.remainInit != null
            ? `<div><span class="col">剩余初诊</span><b>${fmtI(s.remainInit)}</b> 人
              <span class="col">· 剩余日均</span><b>${
                s.remainInitDaily != null ? fmtI(s.remainInitDaily) : "—"
              }</b> 人</div>`
            : `<div><span class="col">剩余初诊</span><b>—</b></div>`;
        return `<div class="hd"><span class="dot" style="background:${s.color}"></span>${s.name}</div>
          ${remRev}
          ${remInit}
          ${avgRow}`;
      }
      SEGMENTS.slice(0, STORES.length).forEach((seg, i) => {
        hitPaths[i].style.cursor = "pointer";
        hitPaths[i].addEventListener("mouseenter", () => {
          heroMod.classList.add("focus");
          heroMod.classList.add("dim-others");
          progPaths.forEach((p, j) =>
            p.setAttribute("opacity", j === i ? 1 : 0.28),
          );
          endDots.forEach((d, j) =>
            d.setAttribute("opacity", j === i ? 1 : 0.28),
          );
          labels.forEach((l, j) => l.classList.toggle("on", j === i));
          arcTip.innerHTML = tipHTML(MODEL.stores[i]);
          const [x, y] = labelTopPx(seg);
          arcTip.style.display = "block";
          arcTip.style.left = clamp(x, 130, 670) + "px";
          arcTip.style.top = y - 10 + "px";
        });
        hitPaths[i].addEventListener("mouseleave", () => {
          heroMod.classList.remove("focus", "dim-others");
          progPaths.forEach((p) => p.setAttribute("opacity", 1));
          endDots.forEach((d) => d.setAttribute("opacity", 1));
          labels.forEach((l) => l.classList.remove("on"));
          arcTip.style.display = "none";
        });
      });

      /* ?hover=N 调试：模拟悬停第 N 段弧（截图核对 tooltip 用） */
      const hoverIdx = /[?&]hover=(\d)/.exec(location.search);
      if (hoverIdx)
        hitPaths[+hoverIdx[1]].dispatchEvent(new Event("mouseenter"));

      /* Hero 入场：弧长 / 水位 / 巨数同一进度驱动 */
      (function heroEnter() {
        if (!ANIM) {
          STORES.forEach((s, i) => {
            drawProgress(i, s.revPct);
            labels[i].querySelector(".pct").textContent =
              s.revPct.toFixed(2) + "%";
            labels[i].querySelector(".bar i").style.width =
              clamp(s.revPct, 0, 100) + "%";
          });
          drawWaves(KPI.revPct);
          hPct.textContent = KPI.revPct.toFixed(2) + "%";
          hSubVal.textContent = heroSubText(totalRev, totalBase);
          return;
        }
        const DUR = 1800,
          t0 = performance.now();
        (function frame(now) {
          const k = easeOut(clamp((now - t0) / DUR, 0, 1));
          STORES.forEach((s, i) => {
            drawProgress(i, s.revPct * k);
            labels[i].querySelector(".pct").textContent =
              (s.revPct * k).toFixed(2) + "%";
            labels[i].querySelector(".bar i").style.width =
              clamp(s.revPct * k, 0, 100) + "%";
          });
          drawWaves(KPI.revPct * k);
          hPct.textContent = (KPI.revPct * k).toFixed(2) + "%";
          hSubVal.textContent = heroSubText(totalRev * k, totalBase);
          if (k < 1) requestAnimationFrame(frame);
        })(t0);
      })();

      /* ══════════════════════════════════════════════════════════
       * ⑦ 左栏：门店达成 + 初诊进度（32px 行，6 行闭合）
       *    数据全部来自 BI 门店表：初诊到诊 / 初诊目标 / 初诊完成率
       *    （2026-09-29 前这里是"复诊到店率"，用的是 CONFIG 里手填的 revisit，
       *      BI 没有这个指标；现在换成 BI 原生的初诊三件套，不再依赖手填值。）
       * ══════════════════════════════════════════════════════════ */
      function renderRevRows(m) {
        /* 2026-10-16 需求：
           ① 行内小字不再带「万」（面板头已写明「单位：万元」）；
           ② 条形改为直接表示正常完成率（实收 ÷ 基础 = s.revPct），
              并删掉白色的基础目标刻度 —— 原先条形是对「冲刺目标（基础×1.18）」画、
              刻度恒停在 84.7%，与右侧的完成率百分比是两个口径，容易误读，已废弃。
              副作用修正：基础为 0 的门店（如三级医院）原先 0÷0 被钳成满条，
              现在按完成率 0.00% 显示为空条，与右侧百分比一致。 */
        $("rowsRev").innerHTML = m.stores
          .map(
            (s) => `<div class="sp-row">
              <div class="sp-l1">
                <span class="dot" style="background:${s.color}"></span>
                <span class="sp-name">${s.name}</span>
                <span class="sp-meta">实收 ${fmtW(s.actual)} / 基础 ${fmtW(s.targetBase)}</span>
              </div>
              <div class="sp-bar-wrap">
                <span class="sp-bar"><i data-w="${clamp(s.revPct, 0, 100).toFixed(1)}"></i></span>
              </div>
              <span class="sp-pct">${s.revPct.toFixed(2)}%</span>
            </div>`,
          )
          .join("");
      }
      renderRevRows(MODEL);
      /* 心跳：门店顺序固定 → 原地更新，条形走 CSS 过渡、百分比走数字滚动 */
      function updateRevRows(m, animate) {
        const rows = $("rowsRev").children;
        m.stores.forEach((s, i) => {
          const row = rows[i];
          row.querySelector(".sp-meta").textContent =
            `实收 ${fmtW(s.actual)} / 基础 ${fmtW(s.targetBase)}`;
          row.querySelector(".sp-bar i").style.width =
            clamp(s.revPct, 0, 100).toFixed(1) + "%";
          const pctEl = row.querySelector(".sp-pct");
          if (animate)
            tweenNum(
              pctEl,
              parseFloat(pctEl.textContent) || 0,
              s.revPct,
              (v) => v.toFixed(2) + "%",
              1100,
            );
          else pctEl.textContent = s.revPct.toFixed(2) + "%";
        });
      }

      /* setW=true：心跳重建后直接落位（入场时交给 entrance 统一铺开） */
      function renderRevisitRows(m, setW) {
        const list = [...m.stores].sort((a, b) => b.initPct - a.initPct);
        $("rowsRevisit").innerHTML = list
          .map((s) => {
            const done = fmtI(initActualOf(s)),
              goal = fmtI(s.initBase);
            return `<div class="sp-row">
              <div class="sp-l1">
                <span class="dot" style="background:${s.color}"></span>
                <span class="sp-name">${s.name}</span>
                <span class="sp-meta">初诊 ${done} 人 / 目标 ${goal} 人</span>
              </div>
              <div class="sp-bar-wrap">
                <span class="sp-bar"><i data-w="${clamp(s.initPct, 0, 100).toFixed(1)}"></i></span>
              </div>
              <span class="sp-pct">${s.initPct.toFixed(2)}%</span>
            </div>`;
          })
          .join("");
        if (setW)
          $("rowsRevisit")
            .querySelectorAll("i[data-w]")
            .forEach((el) => (el.style.width = el.dataset.w + "%"));
        $("tagRevisit").textContent =
          `均值 ${(sumOf(m.stores, (s) => s.initPct) / m.stores.length).toFixed(2)}% · 按率降序`;
      }
      renderRevisitRows(MODEL, false);

      /* ══════════════════════════════════════════════════════════
       * ⑧ 右栏：顾问 / 医生排行（28~30px 行，首屏 7 行，可滚轮下翻看全部）
       * ══════════════════════════════════════════════════════════ */
      function renderRank(containerId, items, setW) {
        const box = $(containerId);
        if (!box) return; // 判空：缺元素不拖垮整板
        const list = items || [];
        const max = list.length
          ? Math.max(...list.map((p) => p.amount))
          : 1; // 空列表时不要让 max 变成 -Infinity
        const colorOf = (p) =>
          (STORES.find((s) => s.name === p.store) || {}).color || "#d4af37";
        /* 心跳（约每 8 分钟）会整块重写 innerHTML，必须先把 scrollTop 存下再还原，
           否则用户正往下翻时会被无声弹回顶部。 */
        const keepTop = box.scrollTop;
        box.innerHTML = list
          .map(
            (p, i) => `<div class="rk-row has-store">
              <span class="rk-badge ${i < 3 ? "r" + (i + 1) : ""}">${i + 1}</span>
              <span class="rk-name">${p.name}</span>
              <span class="rk-store">${p.tag || ""}</span>
              <span class="rk-bar"><i data-w="${((p.amount / max) * 100).toFixed(1)}" style="--c:${colorOf(p)}"></i></span>
              <span class="rk-val">${fmtW(p.amount)}<small>万</small></span>
            </div>`,
          )
          .join("");
        box.scrollTop = keepTop;
        if (setW)
          box.querySelectorAll("i[data-w]").forEach((el) => (el.style.width = el.dataset.w + "%"));
      }
      /* 面板右上角标签：原为「TOP7 · 累计万元」，现按实际人数显示（2026-10-15） */
      const rankTag = (m) => {
        setTxt("tagConsult", `全部 ${m.staff.consultants.length} 人 · 累计万元`);
        setTxt("tagDoctor", `全部 ${m.staff.doctors.length} 人 · 累计万元`);
      };
      renderRank("rowsConsult", MODEL.staff.consultants, false);
      renderRank("rowsDoctor", MODEL.staff.doctors, false);
      rankTag(MODEL);

      /* ══════════════════════════════════════════════════════════
       * ⑨ 底部折线：尺寸由容器反算，杜绝溢出
       * ══════════════════════════════════════════════════════════ */
      const bodyBox = document.querySelector(".trend-body");
      const TW = bodyBox.clientWidth,
        TH = bodyBox.clientHeight;
      const PAD_L = 52,
        PAD_R = 18,
        PAD_T = 8,
        PAD_B = 24;
      const PLOT_W = TW - PAD_L - PAD_R,
        PLOT_H = TH - PAD_T - PAD_B; // 128
      const trendSvg = $("trendSvg");
      trendSvg.setAttribute("viewBox", `0 0 ${TW} ${TH}`);
      const xAt = (i) => PAD_L + (i * PLOT_W) / (D - 1);
      /* 纵轴量程：留 15% 余量并向上取 5 的倍数；下限 5 万 —— 活动刚开月、
         daily 还没抓到数据时窗口内全为 0，除以 0 会让整条曲线变成 NaN */
      let MAXV = Math.max(5, Math.ceil((Math.max(...dailyAll) * 1.15) / 5) * 5); // 心跳后可能重算升档
      const yAt = (v) => PAD_T + (1 - v / MAXV) * PLOT_H;

      function drawGrid() {
        let html = "";
        [0.25, 0.5, 0.75, 1].forEach((k) => {
          const y = yAt(MAXV * k).toFixed(1);
          html += `<line class="grid-ln" x1="${PAD_L}" y1="${y}" x2="${TW - PAD_R}" y2="${y}" />`;
          html += `<text class="axis-txt" x="${PAD_L - 8}" y="${+y + 5}" text-anchor="end">${Math.round(MAXV * k)}</text>`;
        });
        /* 刻度按活动日下标取（第 1/5/10/15/20/25/30 天），文字用真实日期 M/D */
        [0, 4, 9, 14, 19, 24, 29]
          .filter((i) => i < D)
          .forEach((i) => {
            html += `<text class="axis-txt" x="${xAt(i).toFixed(1)}" y="${TH - 6}" text-anchor="middle">${dayLabel(i)}</text>`;
          });
        html += `<text class="axis-txt" x="${PAD_L - 8}" y="${yAt(MAXV) + 5}" text-anchor="end">万</text>`;
        $("tGrid").innerHTML = html;
      }
      drawGrid();

      const SERIES = {
        all: { name: "全部门店", color: "#f0cf7a", data: dailyAll },
      };
      STORES.forEach(
        (s) =>
          (SERIES[s.id] = {
            name: s.name,
            color: s.color,
            data: dailyByStore[s.id],
          }),
      );
      Object.values(SERIES).forEach((se) => {
        se.y = se.data.map((v) => yAt(v));
        se.cum = se.data.reduce(
          (acc, v) => (acc.push((acc[acc.length - 1] || 0) + v), acc),
          [],
        );
      });

      const lineEl = $("lgLine"),
        areaEl = $("lgArea"),
        pulseEl = $("lgPulse"),
        endDotEl = $("lgEndDot");
      let curKey = "all";
      function pathsOf(y) {
        const pts = y.map((yy, i) => `${xAt(i).toFixed(1)},${yy.toFixed(1)}`);
        const dLine = "M " + pts.join(" L ");
        const base = (PAD_T + PLOT_H).toFixed(1);
        return {
          dLine,
          dArea:
            dLine + ` L ${xAt(T - 1).toFixed(1)},${base} L ${PAD_L},${base} Z`,
        };
      }
      function paint(key, yOverride, colorOverride) {
        const se = SERIES[key],
          y = yOverride || se.y,
          color = colorOverride || se.color;
        const { dLine, dArea } = pathsOf(y);
        lineEl.setAttribute("d", dLine);
        areaEl.setAttribute("d", dArea);
        lineEl.setAttribute("stroke", color);
        $("tAreaA").setAttribute("stop-color", color);
        pulseEl.setAttribute("cx", xAt(T - 1));
        pulseEl.setAttribute("cy", y[T - 1]);
        pulseEl.setAttribute("stroke", color);
        endDotEl.setAttribute("cx", xAt(T - 1));
        endDotEl.setAttribute("cy", y[T - 1]);
      }
      function mixColor(h0, h1, t) {
        const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
        const a = p(h0),
          b = p(h1);
        return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], t))).join(",")})`;
      }
      paint(curKey);

      function switchSeries(key) {
        if (key === curKey || !SERIES[key]) return;
        const fromY = SERIES[curKey].y.slice(),
          fromC = SERIES[curKey].color;
        const toY = SERIES[key].y,
          toC = SERIES[key].color;
        curKey = key;
        $("selLabel").textContent = SERIES[key].name;
        $("lgName").textContent = SERIES[key].name;
        document
          .querySelectorAll("#selMenu li")
          .forEach((li) => li.classList.toggle("cur", li.dataset.key === key));
        const t0 = performance.now(),
          DUR = 260;
        (function frame(now) {
          const k = easeOut(clamp((now - t0) / DUR, 0, 1));
          paint(
            key,
            fromY.map((v, i) => lerp(v, toY[i], k)),
            mixColor(fromC, toC, k),
          );
          if (k < 1) requestAnimationFrame(frame);
          else paint(key);
        })(t0);
      }

      (function initSelect() {
        const sel = $("sel"),
          menu = $("selMenu");
        menu.innerHTML =
          `<li class="all cur" data-key="all"><span class="dot"></span>全部门店</li>` +
          STORES.map(
            (s) =>
              `<li data-key="${s.id}"><span class="dot" style="background:${s.color}"></span>${s.name}</li>`,
          ).join("");
        $("selBtn").addEventListener("click", (e) => {
          e.stopPropagation();
          sel.classList.toggle("open");
        });
        menu.addEventListener("click", (e) => {
          const li = e.target.closest("li");
          if (!li) return;
          switchSeries(li.dataset.key);
          sel.classList.remove("open");
        });
        document.addEventListener("click", () => sel.classList.remove("open"));
        document.addEventListener(
          "keydown",
          (e) => e.key === "Escape" && sel.classList.remove("open"),
        );
      })();

      (function initHover() {
        const pad = $("hoverPad"),
          tip = $("tip"),
          hLn = $("hoverLn"),
          hDot = $("hoverDot");
        pad.setAttribute("x", PAD_L);
        pad.setAttribute("y", PAD_T);
        pad.setAttribute("width", PLOT_W);
        pad.setAttribute("height", PLOT_H);
        trendSvg.addEventListener("mousemove", (e) => {
          const r = trendSvg.getBoundingClientRect();
          const mx = (e.clientX - r.left) / SCALE;
          const i = clamp(
            Math.round((mx - PAD_L) / (PLOT_W / (D - 1))),
            0,
            T - 1,
          );
          const se = SERIES[curKey],
            x = xAt(i),
            y = se.y[i];
          hLn.style.display = hDot.style.display = "";
          hLn.setAttribute("x1", x);
          hLn.setAttribute("x2", x);
          hLn.setAttribute("y1", PAD_T);
          hLn.setAttribute("y2", PAD_T + PLOT_H);
          hDot.setAttribute("cx", x);
          hDot.setAttribute("cy", y);
          hDot.setAttribute("stroke", se.color);
          tip.style.display = "block";
          tip.innerHTML = `${dayFull(i)} · <b>${se.data[i].toFixed(2)}</b> 万<br>累计 <b>${se.cum[i].toFixed(2)}</b> 万 · ${se.name}`;
          const tw = tip.offsetWidth / SCALE;
          tip.style.left = x + (i > (D * 2) / 3 ? -tw - 16 : 16) + "px";
          tip.style.top = clamp(y - 30, 4, TH - 60) + "px";
        });
        trendSvg.addEventListener("mouseleave", () => {
          tip.style.display = "none";
          hLn.style.display = hDot.style.display = "none";
        });
      })();

      /* ══════════════════════════════════════════════════════════
       * ⑩ 入场编排 + KPI 数字滚动
       * ══════════════════════════════════════════════════════════ */
      (function entrance() {
        const setNumbers = (k) => {
          setHTML("vDays", daysHTML(T * k));
          setTxt("vInit", fmtI(totalInit * k));
          setTxt("vTodayInit", fmtI(DATA.kpi.todayInit * k));
          setTxt("vTodayRev", fmt2(DATA.kpi.todayRev * k));
          drawRT(KPI.timePct * k);
          drawRI(KPI.initPct * k);
        };
        document
          .querySelectorAll(".rv")
          .forEach((el) => el.classList.add("in"));
        if (!ANIM) {
          document
            .querySelectorAll("i[data-w]")
            .forEach((el) => (el.style.width = el.dataset.w + "%"));
          setNumbers(1);
          return;
        }
        const rvs = document.querySelectorAll(".rv");
        document
          .querySelectorAll(".rv")
          .forEach((el) => el.classList.remove("in"));
        rvs.forEach((el, i) =>
          setTimeout(() => el.classList.add("in"), 120 + i * 80),
        );
        setTimeout(
          () =>
            document
              .querySelectorAll("i[data-w]")
              .forEach((el) => (el.style.width = el.dataset.w + "%")),
          650,
        );
        const t0 = performance.now(),
          DUR = 1800;
        (function frame(now) {
          const k = easeOut(clamp((now - t0) / DUR, 0, 1));
          setNumbers(k);
          if (k < 1) requestAnimationFrame(frame);
        })(t0);
      })();

      /* ══════════════════════════════════════════════════════════
       * ⑪ 时钟
       * ══════════════════════════════════════════════════════════ */
      (function clock() {
        const WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        const p = (n) => String(n).padStart(2, "0");
        (function tick() {
          const d = new Date();
          $("clkTime").textContent =
            `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
          $("clkDate").textContent =
            `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${WD[d.getDay()]}`;
          setTimeout(tick, 1000);
        })();
      })();

      /* ══════════════════════════════════════════════════════════
       * ⑫ 数据心跳：每 5 分钟重新抓取 BI 数据并全量刷新（页面不重载）
       * ══════════════════════════════════════════════════════════ */
      const ENTRANCE_END = performance.now() + (ANIM ? 2600 : 0);
      let dispY = SERIES[curKey].y.slice(); // 折线当前显示的 y（用于插值起点）
      let curArc = STORES.map((s) => s.revPct); // 6 段弧当前完成率
      let heroCur = KPI.revPct; // 水球当前水位
      let ringCur = { time: KPI.timePct, init: KPI.initPct };
      const beatFade = (el) => {
        el.classList.remove("bfade");
        void el.offsetWidth;
        el.classList.add("bfade");
      };

      /* KPI 卡：天数/初诊数字 + 两只环同步补间（第 1 卡显示天数，无数字滚动） */
      function updateKPI(m, animate) {
        const setN = (id, to, fmt) => {
          const el = $(id);
          if (!el) return; // 页面里没这个元素就跳过，不拖垮整页
          if (!animate) {
            el.textContent = fmt(to);
            return;
          }
          const from =
            parseFloat((el.textContent + "").replace(/[^\d.-]/g, "")) || 0;
          tweenNum(el, from, to, fmt);
        };
        setHTML("vDays", daysHTML(T));
        setN("vInit", m.totalInit, fmtI);
        setN("vTodayInit", m.kpi.todayInit, fmtI);
        setN("vTodayRev", m.kpi.todayRev, fmt2);
        setN("vAvgTicket", m.kpi.avgTicket, fmtY); // 平均单体（2026-10-16 新增卡）
        $("subInit").textContent = `基础 ${fmtI(m.totalInitBase)} 人`;
        const to = {
          time: m.kpi.timePct,
          init: m.kpi.initPct,
        };
        if (!animate) {
          drawRT(to.time);
          drawRI(to.init);
        } else {
          const from = ringCur,
            t0 = performance.now(),
            DUR = 900;
          (function f(now) {
            const k = easeOut(clamp((now - t0) / DUR, 0, 1));
            drawRT(lerp(from.time, to.time, k));
            drawRI(lerp(from.init, to.init, k));
            if (k < 1) requestAnimationFrame(f);
          })(t0);
        }
        ringCur = to;
      }

      /* 中央 Hero：弧段生长 / 水位升降 / 主数字滚动 / 左右标签同步 */
      function updateHero(m, animate) {
        const target = m.kpi.revPct;
        fitHeroNumber(target.toFixed(2) + "%"); // 字号按终态适配，滚动中宽度稳定
        const fromArc = curArc.slice(),
          fromHero = heroCur,
          toRev = m.totalRev,
          toBase = m.totalBase,
          fromRev = heroRev,
          fromBase = heroBase;
        const apply = (k) => {
          m.stores.forEach((s, i) => {
            const p = lerp(fromArc[i], s.revPct, k);
            drawProgress(i, p);
            labels[i].querySelector(".pct").textContent = p.toFixed(2) + "%";
            labels[i].querySelector(".bar i").style.width =
              clamp(p, 0, 100) + "%";
            const tEl = labels[i].querySelector(".today");
            if (tEl) tEl.innerHTML = todayHTML(s); // 心跳时同步今日初诊/今日业绩
          });
          const hp = lerp(fromHero, target, k);
          drawWaves(hp);
          hPct.textContent = hp.toFixed(2) + "%";
          hSubVal.textContent = heroSubText(
            lerp(fromRev, toRev, k),
            lerp(fromBase, toBase, k),
          );
        };
        if (!animate) apply(1);
        else tween(950, apply);
        curArc = m.stores.map((s) => s.revPct);
        heroCur = target;
        heroRev = toRev;
        heroBase = toBase;
      }

      /* 底部折线：序列整体替换 + 260~700ms 插值；量程变档时重建网格 */
      function updateTrend(m, animate) {
        const newMax = Math.max(5, Math.ceil((Math.max(...m.daily.all) * 1.15) / 5) * 5);
        const rescaled = newMax !== MAXV;
        MAXV = newMax;
        SERIES.all.data = m.daily.all;
        m.stores.forEach((s) => (SERIES[s.id].data = m.daily.byId[s.id]));
        Object.values(SERIES).forEach((se) => {
          se.y = se.data.map((v) => yAt(v));
          se.cum = se.data.reduce(
            (acc, v) => (acc.push((acc[acc.length - 1] || 0) + v), acc),
            [],
          );
        });
        if (rescaled) drawGrid();
        const toY = SERIES[curKey].y,
          fromY = dispY;
        dispY = toY.slice();
        if (!animate) {
          paint(curKey);
          return;
        }
        const t0 = performance.now(),
          DUR = 700;
        (function f(now) {
          const k = easeOut(clamp((now - t0) / DUR, 0, 1));
          paint(
            curKey,
            fromY.map((v, i) => lerp(v, toY[i], k)),
          );
          if (k < 1) requestAnimationFrame(f);
          else paint(curKey);
        })(t0);
      }

      /* 一次心跳 = 全板原地刷新 */
      function applyModel(m, animate) {
        updateKPI(m, animate);
        updateChips(m);
        updateHero(m, animate);
        updateRevRows(m, animate);
        renderRevisitRows(m, true);
        beatFade($("rowsRevisit"));
        rankTag(m);
        renderRank("rowsConsult", m.staff.consultants, true);
        beatFade($("rowsConsult"));
        renderRank("rowsDoctor", m.staff.doctors, true);
        beatFade($("rowsDoctor"));
        updateTrend(m, animate);
      }


      /* 节拍器：每 HB_MS 拍一次，入场动画结束后才开拍 */
      const hbBox = $("hbBox"),
        hbText = $("hbText");
      let nextAt = Date.now() + HB_MS,
        flashUntil = 0,
        lastSync = "",
        hbT = 0;
      setInterval(() => {
        if (performance.now() < ENTRANCE_END) return;
        loadDashboardData() // 心跳：走 cache:"no-cache" 条件重验证，保证拿到 CI 刚更新的数据
          .then((fresh) => {
            if (fresh.campaign.today !== T) {
              location.reload(); // 跨天：整页重载，时间轴按新天数重排
              return;
            }
            MODEL = fresh.model;
            applyModel(MODEL, true);
            setFoot(fresh.updatedAt);
          })
          .catch((e) => console.warn("数据心跳取数失败,保留当前数据", e));
        nextAt = Date.now() + HB_MS;
        lastSync = new Date().toTimeString().slice(0, 8);
        flashUntil = Date.now() + 3200;
        hbBox.classList.remove("flash");
        void hbBox.offsetWidth;
        hbBox.classList.add("flash");
        clearTimeout(hbT);
        hbT = setTimeout(() => hbBox.classList.remove("flash"), 1200);
      }, HB_MS);

      /* 指示器文案：刷新后 3.2s 显示「已同步」，平时显示倒计时 */
      setInterval(() => {
        if (Date.now() < flashUntil) {
          hbText.textContent = `已同步数据 · ${lastSync}`;
          return;
        }
        const left = Math.max(0, nextAt - Date.now());
        hbText.textContent = ` 下次自动刷新时间 ${p2(Math.floor(left / 60000))}:${p2(Math.floor((left % 60000) / 1000))}`;
      }, 500);
