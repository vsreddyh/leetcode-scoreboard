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

export default function Dashboard() {
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
    <div className="flex-1 px-4 py-6 sm:px-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Scoreboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Score = 100 − acceptance rate. Select a day to view details.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Link href="/admin">
            <Button variant="outline" size="sm">Admin</Button>
          </Link>
          <NotifyToggle />
          <ThemeToggle />
        </div>
      </div>

      <Separator className="my-6" />

      <div className="grid lg:grid-cols-[280px_1fr] gap-6">
        {/* Calendar sidebar */}
        <div className="flex justify-center lg:justify-start">
          <Card className="w-fit">
            <CardContent className="p-3">
              {loading ? (
                <Skeleton className="h-[280px] w-[250px]" />
              ) : (
                <Calendar
                  mode="single"
                  selected={selected}
                  onDayClick={onDayClick}
                  className="rounded-md"
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
        <div className="space-y-6">
          {/* Day summary cards */}
          <div className="flex flex-wrap gap-3 items-center">
            <h2 className="text-lg font-semibold">
              {dateStr === istToday ? "Today" : dateStr}
            </h2>
            {!isToday(selected ?? new Date()) && (
              <Button variant="ghost" size="sm" onClick={() => onDayClick(parseISO(istToday))}>
                Jump to today
              </Button>
            )}
          </div>

          {dayTotals.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {dayTotals.map((dt) => (
                <Card key={dt.user}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{dt.user}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{dt.total}</p>
                    <p className="text-xs text-muted-foreground">{dt.count} problems</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Questions solved today */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Questions {dateStr === istToday ? "today" : `on ${dateStr}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                <div className="overflow-x-auto">
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
                          <TableCell className="font-medium">{q.username}</TableCell>
                          <TableCell>
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
                          <TableCell className="text-right">
                            {q.acRate != null ? `${q.acRate.toFixed(1)}%` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {q.score}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Separator />

          {/* Overall scoreboard */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overall Leaderboard</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : totals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet. Add users and sync.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead className="text-right">Total Score</TableHead>
                        <TableHead className="text-right">Problems</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {totals.map((t, i) => (
                        <TableRow key={t.username}>
                          <TableCell className="font-bold w-8">{i + 1}</TableCell>
                          <TableCell className="font-medium">{t.username}</TableCell>
                          <TableCell className="text-right font-semibold">{t.total}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
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