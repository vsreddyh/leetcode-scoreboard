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

interface HistoryRow {
  username: string;
  date: string;
  total: number;
  count: number;
}

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
];

function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

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

export default function ScoreProgressChart() {
  // Fixed "today" per mount so the date axis never shifts mid-session.
  const [todayStr] = useState(istToday);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [fetchError, setFetchError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("1M");
  const [retry, setRetry] = useState(0);
  const { resolvedTheme } = useTheme();
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  // Tracks the last applied range so theme-only re-renders don't reset manual zoom.
  // Null sentinel: the first data paint always counts as a change, applying the
  // default range window (otherwise the chart would show ALL while 1M looks active).
  const prevRange = useRef<RangeKey | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/history", { cache: "no-store" });
        if (!res.ok) throw new Error(`history ${res.status}`);
        const data = await res.json();
        if (!cancelled) setHistory(data.history ?? []);
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
        /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
        typeof r.total === "number" &&
        Number.isFinite(r.total)
    );
    const users = [...new Set(rows.map((r) => r.username))].sort();
    const uIdx = new Map(users.map((u, i) => [u, i] as const));
    // Clamp the axis end at today, but never drop future-dated docs (clock skew /
    // bad sync bucket) — otherwise they'd vanish from cum and the chart end-value
    // would diverge from the leaderboard.
    let endStr = todayStr;
    let earliest = todayStr;
    for (const r of rows) {
      if (r.date < earliest) earliest = r.date;
      if (r.date > endStr) endStr = r.date;
    }
    const endMs = parseDay(endStr);
    const startMs = parseDay(earliest);
    const len = Math.max(1, Math.round((endMs - startMs) / 86400000) + 1);
    const dates = new Array<string>(len);
    for (let i = 0; i < len; i++) dates[i] = formatDay(startMs + i * 86400000);

    const idx = new Map<string, number>(dates.map((d, i) => [d, i]));
    const cum: number[][] = users.map(() => new Array<number>(len).fill(0));
    for (const r of rows) {
      const u = uIdx.get(r.username);
      const d = idx.get(r.date);
      if (u !== undefined && d !== undefined) cum[u][d] += r.total;
    }
    for (let u = 0; u < users.length; u++) {
      const a = cum[u];
      for (let i = 1; i < len; i++) a[i] += a[i - 1];
    }
    return { users, dates, cum };
  }, [history, todayStr]);

  // Chart instance lifecycle: init once, resize with container, dispose on unmount.
  useEffect(() => {
    const el = elRef.current;
    if (!el || loading || full.users.length === 0) return;
    const chart = echarts.init(el, null, { renderer: "canvas" });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [loading, full.users.length]);

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
    const span = days == null ? null : Math.max(2, days);
    const window =
      span == null
        ? {}
        : { startValue: full.dates[Math.max(0, last - span + 1)], endValue: full.dates[last] };
    const rangeChanged = prevRange.current !== range;
    prevRange.current = range;

    const option: ECOption = {
      color: PALETTE,
      backgroundColor: "transparent",
      animationDuration: 300,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        valueFormatter: (v) => (typeof v === "number" ? String(Math.round(v * 100) / 100) : String(v)),
      },
      legend: { type: "scroll", textStyle: { color: axisColor } },
      grid: { left: 48, right: 16, top: 36, bottom: 64 },
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
        scale: true,
        splitNumber: 4,
        axisLabel: {
          color: axisColor,
          formatter: (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)),
        },
        splitLine: { lineStyle: { color: splitColor, type: "dashed" } },
      },
      // Only (re)apply the range window when the range button changed — omitting
      // dataZoom otherwise leaves any manual zoom/pan untouched.
      ...(rangeChanged
        ? {
            dataZoom: [
              { type: "inside", xAxisIndex: 0, ...window },
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
        showSymbol: false,
        // Cumulative totals are step functions — no smoothing, or the curve
        // implies intermediate values that never existed.
        smooth: false,
        // Only downsample (Largest-Triangle-Three-Buckets) once the window is
        // big enough to matter; small windows render every point exactly.
        ...(full.dates.length > 500 ? { sampling: "lttb" as const } : {}),
        emphasis: { focus: "series" },
        lineStyle: { width: 2 },
      })),
    };
    chart.setOption(option, {
      replaceMerge: rangeChanged ? ["series", "xAxis", "dataZoom"] : ["series", "xAxis"],
    });
  }, [full, range, resolvedTheme]);

  if (loading) {
    return (
      <Card className="min-w-0">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-sm sm:text-base">Score Progress</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <Skeleton className="h-56 w-full" />
        </CardContent>
      </Card>
    );
  }

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
                onClick={() => setRange(r.key)}
              >
                {r.key}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground pt-1">
          Cumulative totals • scroll or pinch to zoom • drag to pan • use the slider below the
          chart for fine control
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
