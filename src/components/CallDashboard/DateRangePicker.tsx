import { format } from "date-fns";
import { th } from "date-fns/locale";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { DateRangeType } from "./types";

interface DateRangePickerProps {
  dateRange: DateRangeType;
  customRange: DayPickerRange | undefined;
  onPresetChange: (value: string) => void;
  onCustomRangeChange: (range: DayPickerRange | undefined) => void;
}

export function DateRangePicker({ dateRange, customRange, onPresetChange, onCustomRangeChange }: DateRangePickerProps) {
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn("justify-start text-left font-normal h-9 min-w-[240px]", !customRange && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {customRange?.from ? (
              customRange.to ? (
                <>
                  {format(customRange.from, "d MMM yyyy", { locale: th })} -{" "}
                  {format(customRange.to, "d MMM yyyy", { locale: th })}
                </>
              ) : (
                format(customRange.from, "d MMM yyyy", { locale: th })
              )
            ) : (
              <span>เลือกช่วงวันที่</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={customRange?.from || new Date()}
            selected={customRange}
            onSelect={onCustomRangeChange}
            numberOfMonths={2}
            locale={th}
          />
        </PopoverContent>
      </Popover>

      <Select value={dateRange === "custom" ? "" : dateRange} onValueChange={onPresetChange}>
        <SelectTrigger className="w-[140px] h-9 text-sm">
          <SelectValue placeholder="เลือกช่วงเวลา" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">วันนี้</SelectItem>
          <SelectItem value="week">7 วันที่ผ่านมา</SelectItem>
          <SelectItem value="month">30 วันที่ผ่านมา</SelectItem>
          <SelectItem value="year">1 ปีที่ผ่านมา</SelectItem>
          <SelectItem value="all">ทั้งหมด</SelectItem>
        </SelectContent>
      </Select>
    </>
  );
}
