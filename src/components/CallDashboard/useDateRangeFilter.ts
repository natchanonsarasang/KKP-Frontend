import { useCallback, useMemo, useState } from "react";
import { format, subDays, subMonths, subYears, startOfDay, endOfDay } from "date-fns";
import { th } from "date-fns/locale";
import type { DateRange as DayPickerRange } from "react-day-picker";
import type { DateRangeType } from "./types";

// Owns the date-range selector state (preset + custom) and derives the
// label shown in the UI plus the start/end ISO bounds used by the queries.
export function useDateRangeFilter() {
  const [dateRange, setDateRange] = useState<DateRangeType>("today");
  const [customRange, setCustomRange] = useState<DayPickerRange | undefined>({
    from: new Date(),
    to: new Date(),
  });

  const dateRangeLabel = useMemo(() => {
    if (dateRange === "all") return "ทั้งหมด";
    if (customRange?.from) {
      const from = format(customRange.from, "d MMM yyyy", { locale: th });
      const to = customRange.to ? format(customRange.to, "d MMM yyyy", { locale: th }) : from;
      return from === to ? from : `${from} - ${to}`;
    }
    return "";
  }, [dateRange, customRange]);

  const handleDateRangeChange = (v: string) => {
    const range = v as DateRangeType;
    setDateRange(range);

    const now = new Date();
    if (range === "today") {
      setCustomRange({ from: now, to: now });
    } else if (range === "week") {
      setCustomRange({ from: subDays(now, 7), to: now });
    } else if (range === "month") {
      setCustomRange({ from: subMonths(now, 1), to: now });
    } else if (range === "year") {
      setCustomRange({ from: subYears(now, 1), to: now });
    } else if (range === "all") {
      setCustomRange(undefined);
    }
  };

  const getDateFilter = useCallback(() => {
    const now = new Date();
    switch (dateRange) {
      case "today": {
        return {
          start: startOfDay(now).toISOString(),
          end: endOfDay(now).toISOString(),
        };
      }
      case "week": {
        return {
          start: subDays(now, 7).toISOString(),
          end: now.toISOString(),
        };
      }
      case "month": {
        return {
          start: subMonths(now, 1).toISOString(),
          end: now.toISOString(),
        };
      }
      case "year": {
        return {
          start: subYears(now, 1).toISOString(),
          end: now.toISOString(),
        };
      }
      case "custom": {
        if (customRange?.from) {
          return {
            start: startOfDay(customRange.from).toISOString(),
            end: customRange.to ? endOfDay(customRange.to).toISOString() : endOfDay(customRange.from).toISOString(),
          };
        }
        return { start: undefined, end: undefined };
      }
      default:
        return { start: undefined, end: undefined };
    }
  }, [dateRange, customRange]);

  return {
    dateRange,
    setDateRange,
    customRange,
    setCustomRange,
    dateRangeLabel,
    handleDateRangeChange,
    getDateFilter,
  };
}
