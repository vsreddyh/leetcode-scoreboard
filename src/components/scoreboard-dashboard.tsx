"use client";

import { useCallback, useEffect, useState } from "react";
import { format, isToday, parseISO } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotifyToggle } from "@/components/notify-toggle";
import Link from "next/link";

interface Question {
  username: string;
  title: string;
  titleSlug: string;
  acRate: number | null;
  difficulty: string | null;
  score: number;
}

interface Total {
  username: string;
  total: number;
  count: number;
}

const diffColor: Record<string, string> = {
  Easy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  Medium: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Hard: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export default function ScoreboardDashboard() {
  // IST today string
  const istToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [selected, setSelected] = useState<Date | undefined>(() => parseISO(istToday));
  const [dateStr, setDateStr] = useState(() => istToday);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totals, setTotals] = useState<Total[]>([]);
  const [activeDates, setActiveDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayLoading, setDayLoading] = useState(false);

  // Fetch overall + active dates on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/overall");
        const data = await res.json();
        setTotals(data.totals ?? []);
        setActiveDates(data.activeDates ?? []);
      } catch {
        /* empty */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Fetch day detail when date changes
  const fetchDay = useCallback(async (d: string) => {
    setDayLoading(true);
    try {
      const res = await fetch(`/api/day/${d}`);
      const data = await res.json();
      setQuestions(data.questions ?? []);
    } catch {
      setQuestions([]);
    } finally {
      setDayLoading(false);
    }
  }, []);

  // Fetch day detail on mount and whenever the selected date changes
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setDayLoading(true);
      try {
        const res = await fetch(`/api/day/${dateStr}`);
        const data = await res.json();
        if (!cancelled) setQuestions(data.questions ?? []);
      } catch {
        if (!cancelled) setQuestions([]);
      } finally {
        if (!cancelled) setDayLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dateStr]);

  function onDayClick(day: Date) {
    setSelected(day);
    const ds = format(day, "yyyy-MM-dd");
    setDateStr(ds);
    fetchDay(ds);
  }

  // Group questions by user for the selected day
  const byUser = questions.reduce<Record<string, Question[]>>((acc, q) => {
    (acc[q.username] ??= []).push(q);
    return acc;
  }, {});

  // Day totals per user for selected date
  const dayTotals = Object.entries(byUser).map(([user, qs]) => ({
    user,
    count: qs.length,
    total: Math.round(qs.reduce((s, q) => s + q.score, 0) * 100) / 100,
  }));

  // Days with data for calendar highlighting
  const dataDays = activeDates.map((d) => parseISO(d));

  return (
    <div className="flex-1 w-full max-w-5xl mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight">Scoreboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Score = 100 − acceptance rate. Select a day to view details.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/admin">
            <Button variant="outline" size="sm" className="h-9 px-3">
              Admin
            </Button>
          </Link>
          <NotifyToggle />
          <ThemeToggle />
        </div>
      </div>

      <Separator className="my-4 sm:my-6" />

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Calendar sidebar */}
        <div className="w-full lg:w-auto flex justify-center lg:justify-start lg:sticky lg:top-4 self-start">
          <Card className="w-full max-w-[340px] sm:w-fit sm:max-w-none">
            <CardContent className="p-2 sm:p-3 flex justify-center">
              {loading ? (
                <Skeleton className="h-[280px] w-full sm:w-[250px]" />
              ) : (
                <Calendar
                  mode="single"
                  selected={selected}
                  onDayClick={onDayClick}
                  className="rounded-md max-w-full"
                  modifiers={{
                    hasData: dataDays,
                    today: parseISO(istToday),
                  }}
                  modifiersClassNames={{
                    hasData:
                      "bg-primary/10 font-semibold [&>button]:aria-selected:bg-primary",
                  }}
                  defaultMonth={selected}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Day detail + overall */}
        <div className="space-y-4 sm:space-y-6 min-w-0">
          {/* Day summary cards */}
          <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
            <h2 className="text-base sm:text-lg font-semibold">
              {dateStr === istToday ? "Today" : dateStr}
            </h2>
            {!isToday(selected ?? new Date()) && (
              <Button variant="ghost" size="sm" onClick={() => onDayClick(parseISO(istToday))}>
                Jump to today
              </Button>
            )}
          </div>

          {dayTotals.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
              {dayTotals.map((dt) => (
                <Card key={dt.user} className="min-w-0">
                  <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-6 sm:pb-2">
                    <CardTitle className="text-sm sm:text-base truncate" title={dt.user}>
                      {dt.user}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
                    <p className="text-lg sm:text-2xl font-bold tabular-nums">{dt.total}</p>
                    <p className="text-[11px] sm:text-xs text-muted-foreground">
                      {dt.count} problem{dt.count === 1 ? "" : "s"}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Questions solved */}
          <Card className="min-w-0">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-sm sm:text-base">
                Questions {dateStr === istToday ? "today" : `on ${dateStr}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {dayLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No problems solved {dateStr === istToday ? "today yet" : `on ${dateStr}`}.
                </p>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto -mx-1 px-1">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Problem</TableHead>
                          <TableHead>Difficulty</TableHead>
                          <TableHead className="text-right">AC Rate</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {questions.map((q) => (
                          <TableRow key={`${q.username}-${q.titleSlug}`}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {q.username}
                            </TableCell>
                            <TableCell className="whitespace-normal break-words min-w-[160px]">
                              <a
                                href={`https://leetcode.com/problems/${q.titleSlug}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline underline-offset-2 hover:text-primary/80"
                              >
                                {q.title}
                              </a>
                            </TableCell>
                            <TableCell>
                              {q.difficulty ? (
                                <Badge
                                  variant="secondary"
                                  className={diffColor[q.difficulty] ?? ""}
                                >
                                  {q.difficulty}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap tabular-nums">
                              {q.acRate != null ? `${q.acRate.toFixed(1)}%` : "—"}
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {q.score}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile cards */}
                  <ul className="md:hidden space-y-2">
                    {questions.map((q) => (
                      <li
                        key={`${q.username}-${q.titleSlug}`}
                        className="rounded-lg border bg-card p-3 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold truncate min-w-0">
                            {q.username}
                          </span>
                          <span className="text-sm font-bold tabular-nums shrink-0">
                            {q.score} pts
                          </span>
                        </div>
                        <a
                          href={`https://leetcode.com/problems/${q.titleSlug}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-sm text-primary underline underline-offset-2 break-words"
                        >
                          {q.title}
                        </a>
                        <div className="flex items-center gap-2 flex-wrap">
                          {q.difficulty ? (
                            <Badge
                              variant="secondary"
                              className={diffColor[q.difficulty] ?? ""}
                            >
                              {q.difficulty}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                          <span className="text-xs text-muted-foreground tabular-nums ml-auto">
                            AC {q.acRate != null ? `${q.acRate.toFixed(1)}%` : "—"}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Overall scoreboard */}
          <Card className="min-w-0">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-sm sm:text-base">Overall Leaderboard</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : totals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet. Add users and sync.</p>
              ) : (
                <div className="overflow-x-auto -mx-1 px-1">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead className="text-right">Total Score</TableHead>
                        <TableHead className="text-right">Problems</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {totals.map((t, i) => (
                        <TableRow key={t.username}>
                          <TableCell className="font-bold w-10 tabular-nums">{i + 1}</TableCell>
                          <TableCell className="font-medium whitespace-normal break-words min-w-[100px]">
                            {t.username}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums whitespace-nowrap">
                            {t.total}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground tabular-nums">
                            {t.count}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
