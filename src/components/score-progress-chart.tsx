"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { LineChart, type LineSeriesOption } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  type GridComponentOption,
  type TooltipComponentOption,
  type LegendComponentOption,
  type DataZoomComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { useTheme } from "next-themes";
import { SEASON_START, todayIST, isValidDayKey } from "@/lib/leetcode";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

type ECOption = echarts.ComposeOption<
  | LineSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | LegendComponentOption
  | DataZoomComponentOption
>;

import type { DailyRow } from "@/lib/scores";

type RangeKey = "1D" | "1W" | "1M" | "6M" | "1Y" | "ALL";

const RANGES: { key: RangeKey; days: number | null }[] = [
  { key: "1D", days: 1 },
  { key: "1W", days: 7 },
  { key: "1M", days: 30 },
  { key: "6M", days: 182 },
  { key: "1Y", days: 365 },
  { key: "ALL", days: null },
];

const PALETTE = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0891b2",
  "#65a30d",
  "#0d9488",
  "#c026d3",
  "#ea580c",
  "#4f46e5",
  "#be123c",
  "#15803d",
  "#a16207",
  "#0369a1",
];

function parseDay(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatDay(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Round to cents for display (tooltip + axis share this so they never disagree). */
function fmtScore(v: number): string {
  // + 0 normalizes -0 so totals never render as "-0.00".
  return (Math.round(v * 100) / 100 + 0).toFixed(2);
}

export default function ScoreProgressChart() {
  // Fixed "today" per mount so the date axis never shifts mid-session.
  const [todayStr] = useState(() => todayIST());
  const [history, setHistory] = useState<DailyRow[]>([]);
  const [fetchError, setFetchError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("1M");
  const [retry, setRetry] = useState(0);
  const { resolvedTheme } = useTheme();
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  // Last applied zoom key. Null sentinel: the first data paint always counts as a
  // change, applying the default range window (otherwise the chart would show ALL
  // while 1M looks active). Clicking a range button always bumps zoomNonce, so
  // re-clicking the active range snaps back to its labeled window.
  const prevZoomKey = useRef<string | null>(null);
  const [zoomNonce, setZoomNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/history", { cache: "no-store" });
        if (!res.ok) throw new Error(`history ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setHistory(Array.isArray(data.history) ? data.history : []);
          setFetchError(false);
        }
      } catch {
        if (!cancelled) {
          setHistory([]);
          setFetchError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retry]);

  /**
   * Full-resolution model in a single pass: calendar date axis
   * (earliest solve → today) + cumulative totals per user.
   * Rows with malformed dates are skipped so one bad doc can't break the axis.
   */
  const full = useMemo(() => {
    const rows = history.filter(
      (r) =>
        typeof r.username === "string" &&
        r.username.length > 0 &&
        isValidDayKey(r.date) &&
        typeof r.total === "number" &&
        Number.isFinite(r.total)
    );
    const users = [...new Set(rows.map((r) => r.username))].sort();
    const uIdx = new Map(users.map((u, i) => [u, i] as const));
    // Clamp both ends so one ancient/typo bucket can't materialize a huge axis:
    // sync keeps everything on/after SEASON_START. Out-of-range rows below are
    // folded into the edge buckets (never dropped) so cum still matches the
    // leaderboard exactly.
    const endStr = todayStr;
    let earliest = todayStr;
    for (const r of rows) {
      if (r.date < earliest) earliest = r.date;
    }
    if (earliest < SEASON_START) earliest = SEASON_START;
    // Degenerate case: every row future-dated (clock skew) would invert the axis
    // and drop all rows from idx — clamp so the axis is at worst a single today.
    if (earliest > todayStr) earliest = todayStr;
    const endMs = parseDay(endStr);
    const startMs = parseDay(earliest);
    const len = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
    const dates = new Array<string>(len);
    for (let i = 0; i < len; i++) dates[i] = formatDay(startMs + i * 86400000);

    const idx = new Map<string, number>(dates.map((d, i) => [d, i]));
    const cum: number[][] = users.map(() => new Array<number>(len).fill(0));
    for (const r of rows) {
      const u = uIdx.get(r.username);
      // Fold out-of-range rows into the edge buckets (clamped above) so no
      // points are ever silently dropped from the cumulative totals.
      const dd = r.date < SEASON_START ? SEASON_START : r.date > todayStr ? todayStr : r.date;
      const d = idx.get(dd);
      if (u !== undefined && d !== undefined) cum[u][d] += r.total;
    }
    for (let u = 0; u < users.length; u++) {
      const a = cum[u];
      for (let i = 1; i < len; i++) a[i] += a[i - 1];
    }
    return { users, dates, cum };
  }, [history, todayStr]);

  // Chart instance lifecycle: init once, resize with container, dispose on unmount.
  // Deps cover the whole model identity: any re-fetch that changes users OR the
  // axis range re-creates the instance, which resets the zoom key so the range
  // window is re-applied instead of pointing at stale data.
  useEffect(() => {
    const el = elRef.current;
    if (!el || loading || full.users.length === 0) return;
    // Reset the zoom key: a re-created instance (StrictMode double-effect,
    // retry changing the user count) must re-apply the range window.
    prevZoomKey.current = null;
    const chart = echarts.init(el, null, { renderer: "canvas" });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [loading, full]);

  // Data + range + theme → chart option. ECharts owns zoom/pan state internally;
  // the range window is only re-applied when the range button changes, so a
  // theme toggle never resets a manual zoom.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || full.users.length === 0) return;
    const dark = resolvedTheme === "dark";
    const axisColor = dark ? "#a1a1aa" : "#71717a";
    const splitColor = dark ? "#27272a" : "#e4e4e7";
    const last = full.dates.length - 1;
    const days = RANGES.find((r) => r.key === range)?.days ?? null;
    // 1D needs ≥2 points or the line is a single invisible dot (showSymbol: false).
    // Also clamp to the axis length: on a single-day dataset even ALL is 1 point.
    const span = days == null ? null : Math.min(full.dates.length, Math.max(2, days));
    const window =
      span == null
        ? {}
        : { startValue: full.dates[Math.max(0, last - span + 1)], endValue: full.dates[last] };
    const rangeChanged = (() => {
      const key = `${range}:${zoomNonce}`;
      const changed = prevZoomKey.current !== key;
      prevZoomKey.current = key;
      return changed;
    })();

    const option: ECOption = {
      color: PALETTE,
      backgroundColor: "transparent",
      animationDuration: 300,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        backgroundColor: dark ? "#09090b" : "#ffffff",
        borderColor: dark ? "#27272a" : "#e4e4e7",
        textStyle: { color: dark ? "#fafafa" : "#09090b" },
        valueFormatter: (v) => {
          const n = typeof v === "number" ? v : Number(v);
          return Number.isFinite(n) ? fmtScore(n) : String(v);
        },
      },
      legend: {
        type: "scroll",
        textStyle: { color: axisColor },
        pageIconColor: axisColor,
        pageTextStyle: { color: axisColor },
      },
      grid: { left: 48, right: 16, top: 36, bottom: 64, containLabel: true },
      xAxis: {
        type: "category",
        data: full.dates,
        boundaryGap: false,
        axisLabel: {
          color: axisColor,
          hideOverlap: true,
          formatter: (v: string) => v.slice(5).replace("-", "/"),
        },
        axisLine: { lineStyle: { color: splitColor } },
      },
      yAxis: {
        type: "value",
        // Anchor at zero: this is a cumulative chart, and a floating min would
        // exaggerate small gaps between lines.
        scale: false,
        splitNumber: 4,
        axisLabel: {
          color: axisColor,
          // Same cents rounding as the tooltip so axis and tooltip never disagree.
          formatter: (v: number | string) => {
            const n = Number(v);
            return Number.isFinite(n) ? fmtScore(n) : String(v);
          },
        },
        splitLine: { lineStyle: { color: splitColor, type: "dashed" } },
      },
      // Only (re)apply the range window when the range button changed — omitting
      // dataZoom otherwise leaves any manual zoom/pan untouched.
      ...(rangeChanged
        ? {
            dataZoom: [
              {
                type: "inside",
                xAxisIndex: 0,
                // Don't hijack page scroll: wheel over the chart scrolls the page;
                // zoom via pinch, drag-pan, or the slider below.
                zoomOnMouseWheel: false,
                moveOnMouseWheel: false,
                ...window,
              },
              {
                type: "slider",
                xAxisIndex: 0,
                height: 24,
                bottom: 8,
                borderColor: splitColor,
                textStyle: { color: axisColor },
                ...window,
              },
            ],
          }
        : {}),
      series: full.users.map((u, i) => ({
        name: u,
        type: "line",
        data: full.cum[i],
        // Dots on tiny axes (e.g. single-day dataset): otherwise a lone point
        // is invisible.
        showSymbol: full.dates.length <= 2,
        // Cumulative totals are step functions — no smoothing, or the curve
        // implies intermediate values that never existed.
        smooth: false,
        // Only downsample (Largest-Triangle-Three-Buckets) once the axis exceeds
        // a full season (~366 days); smaller windows render every point exactly.
        ...(full.dates.length > 366 ? { sampling: "lttb" as const } : {}),
        emphasis: { focus: "series" },
        lineStyle: { width: 2 },
      })),
    };
    chart.setOption(option, {
      replaceMerge: rangeChanged ? ["series", "xAxis", "dataZoom"] : ["series", "xAxis"],
    });
  }, [full, range, zoomNonce, resolvedTheme]);

  if (loading) {
    return (
      <Card className="min-w-0">
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2">
          <CardTitle className="text-sm sm:text-base">Score Progress</CardTitle>
          <p className="text-[11px] text-transparent pt-1 select-none" aria-hidden="true">
            Loading
          </p>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  // No chart, no zoom targets: keep the range group inert on error/empty states.
  const interactive = !fetchError && full.users.length > 0;

  return (
    <Card className="min-w-0">
      <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm sm:text-base">Score Progress</CardTitle>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Time period">
            {RANGES.map((r) => (
              <Button
                key={r.key}
                variant={range === r.key ? "default" : "ghost"}
                size="sm"
                className="h-7 px-2 text-xs"
                aria-pressed={range === r.key}
                disabled={!interactive || (r.days != null && r.days > full.dates.length)}
                title={
                  r.days != null && r.days > full.dates.length
                    ? "Not enough history yet for this range"
                    : undefined
                }
                onClick={() => {
                  // Always re-apply, even for the active range, so a click snaps
                  // back from any manual zoom/pan to the labeled window.
                  setRange(r.key);
                  setZoomNonce((n) => n + 1);
                }}
              >
                {r.key}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground pt-1">
          Cumulative totals • pinch or slider to zoom • drag to pan • re-click a range to
          reset
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        {fetchError ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load progress data.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFetchError(false);
                setLoading(true);
                setRetry((r) => r + 1);
              }}
            >
              Retry
            </Button>
          </div>
        ) : full.users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet. Add users and sync.</p>
        ) : (
          <div
            ref={elRef}
            className="w-full h-[300px]"
            role="img"
            aria-label={`Cumulative score progress per user, range ${range}`}
          />
        )}
      </CardContent>
    </Card>
  );
}
